// DataLayerManager layer params, restore/adopt flows and bulk clear.
import { cancelPendingRestoreIntent, cloneLayerParams, paramsRejectedError } from './managerFeedState.js';
import { governorRequestRender } from '../renderGovernor.js';

export const paramsMixin = {
/**
   * Turn off every layer whose latest authoritative intent is currently ON.
   * Reverse registration order lets dependents settle their teardown before
   * an earlier-registered dependency receives its final OFF intent. Each layer
   * keeps its normal latest-intent manager authority, so a newer direct request
   * can supersede this batch without being overwritten by a retry loop.
   *
   * @param {object} [options] Clear transition options.
   * @param {string} [options.origin='user'] Visibility-event origin.
   * @param {symbol|null} [options.notificationToken] Shared notification owner.
   * @returns {Promise<{targetIds:string[],items:object[],clearedIds:string[],notClearedIds:string[]}>}
   */
  async clearSelectedLayers({ origin = 'user', notificationToken = null } = {}) {
    const clearBatchId = Symbol('clear-selected-layers');
    const targets = [...this.layers]
      .filter(([, entry]) => this._effectiveEnabled(entry))
      .map(([layerId, entry]) => ({
        layerId,
        intentEpoch: entry.visibilityIntentEpoch,
      }))
      .reverse();
    // Reserve the whole batch before the first awaited OFF. This makes Clear
    // All's global OFF authority observable synchronously while preserving
    // reverse-order lifecycle teardown. Any later absolute intent advances
    // the epoch and therefore owns that layer instead.
    for (const { layerId, intentEpoch } of targets) {
      const entry = this.layers.get(layerId);
      if (entry) entry.clearVisibilityReservation = { clearBatchId, intentEpoch };
    }
    const targetIds = targets.map(({ layerId }) => layerId);
    const attempts = new Map();
    try {
      for (const { layerId, intentEpoch } of targets) {
        const entry = this.layers.get(layerId);
        const superseded = entry && entry.visibilityIntentEpoch !== intentEpoch;
        if (superseded) {
          attempts.set(layerId, { superseded: true });
          continue;
        }
        try {
          const clearIntentEpoch = entry.visibilityIntentEpoch + 1;
          const result = await this.setEnabled(layerId, false, {
            origin,
            ...(notificationToken ? { notificationToken } : {}),
          });
          attempts.set(layerId, {
            result,
            superseded: entry.visibilityIntentEpoch !== clearIntentEpoch,
          });
        } catch (error) {
          attempts.set(layerId, { error });
        }
      }
    } finally {
      for (const { layerId } of targets) {
        const entry = this.layers.get(layerId);
        if (entry?.clearVisibilityReservation?.clearBatchId === clearBatchId) {
          entry.clearVisibilityReservation = null;
        }
      }
    }
    const items = targetIds.map((id) => {
      const state = this.getLayerLifecycleState(id) || {
        enabled: false,
        lifecycleState: 'missing',
        uncertain: true,
      };
      const attempt = attempts.get(id) || {};
      const cleared = !state.enabled && state.lifecycleState === 'disabled' && !state.uncertain;
      return {
        id,
        requested: false,
        cleared,
        result: attempt.result,
        error: attempt.error || null,
        superseded: attempt.superseded === true,
        ...state,
      };
    });
    return {
      targetIds,
      items,
      clearedIds: items.filter((item) => item.cleared).map((item) => item.id),
      notClearedIds: items.filter((item) => !item.cleared).map((item) => item.id),
    };
  },

/**
   * Restore the exact enabled set captured before a focused mode took over.
   * Each transition uses the normal serialized lifecycle and visibility event
   * path so subscribers observe the same state changes as direct operations.
   *
   * @param {Iterable<string>} enabledLayerIds Exact target enabled layer ids.
   * @param {object} [options] Restore notification options.
   * @param {string} [options.origin='programmatic'] Visibility event origin.
   * @param {symbol|null} [options.notificationToken] Opaque caller token used
   * to correlate one transition's user-facing failure notification.
   * @param {Iterable<string>} [options.excludeLayerIds] Layers owned by an
   * in-flight transition that must not enqueue behind themselves.
   * @param {AbortSignal|null} [options.signal] Caller cancellation authority.
   * @returns {Promise<void>} Resolves after every registered layer settles.
   */
  async restoreEnabledLayerIds(
    enabledLayerIds,
    {
      origin = 'programmatic',
      excludeLayerIds = [],
      notificationToken = null,
      signal = null,
    } = {},
  ) {
    const target = new Set(enabledLayerIds || []);
    const excluded = new Set(excludeLayerIds || []);
    const layerIds = [...this.layers.keys()].filter((layerId) => {
      if (excluded.has(layerId)) return false;
      const entry = this.layers.get(layerId);
      // Pre-destroy restoration cannot enqueue onto the layer whose teardown
      // already owns OFF. That terminal teardown satisfies an OFF snapshot;
      // an impossible ON target remains visible to the failure checks below.
      return !(entry?.destroying && !target.has(layerId));
    });
    const transitionOptions = {
      origin,
      ...(notificationToken ? { notificationToken } : {}),
      ...(signal ? { signal } : {}),
    };
    // Epoch reservation is synchronous and stays OUTSIDE the queue (so a
    // later explicit toggle can still instantly supersede a still-queued
    // restore entry) — restoreThrottle gates the actual lifecycle work
    // (runIntentTurn, which is what calls into module.init/enable/update)
    // via the shared cross-layer concurrency gate. Gating only "the wait"
    // does NOT work: entry.toggleChain already schedules runIntentTurn as
    // a microtask the instant _setEnabledWithIntent is called, independent
    // of when anyone awaits its outcome — confirmed by an empirical
    // concurrency probe during implementation (all N layers ran init()
    // concurrently despite the wait-side gate).
    const handles = layerIds.map((layerId) => this._setEnabledWithIntent(
      layerId,
      target.has(layerId),
      { ...transitionOptions, restoreThrottle: (task) => this.runThroughRestoreQueue(task) },
    ));
    const results = await Promise.allSettled(handles.map((handle, index) => (
      this._waitForAuthoritativeVisibilityIntent(layerIds[index], handle.intentEpoch)
    )));
    const failedLayerIds = results.flatMap((result, index) => {
      if (result.status === 'rejected') return [layerIds[index]];
      const outcome = result.value;
      const layerId = layerIds[index];
      const state = this.getLayerLifecycleState(layerId);
      const desiredState = target.has(layerId);
      const failed = !outcome
        || outcome.error
        || !state
        || state.enabled !== desiredState
        || state.lifecycleState !== (desiredState ? 'enabled' : 'disabled')
        || state.uncertain
        || this.layers.get(layerId)?.latestQueuedAbsoluteIntent;
      return failed ? [layerId] : [];
    });
    if (failedLayerIds.length === 0) return;
    const failedIndex = layerIds.indexOf(failedLayerIds[0]);
    const failed = results[failedIndex];
    const error = failed.status === 'rejected'
      ? failed.reason
      : new Error(`Failed to restore layer "${layerIds[failedIndex]}" visibility`);
    error.failedLayerIds = [...new Set([
      ...(Array.isArray(error.failedLayerIds) ? error.failedLayerIds : []),
      ...failedLayerIds,
    ])];
    throw error;
  },

/**
   * Wait until lifecycle work already queued for one layer has settled.
   * Callers use this outside manager listeners before scheduling reconciliation.
   * @param {string} layerId Layer identifier.
   * @returns {Promise<void>} Resolves after the captured queue settles.
   */
  async waitForLayerSettled(layerId) {
    const entry = this.layers.get(layerId);
    if (!entry) return;
    await entry.toggleChain.catch(() => {});
  },

_reserveLayerParamsIntent(layerId, params, origin = 'programmatic') {
    const entry = this.layers.get(layerId);
    if (!entry || entry.destroying) return null;
    // A still-unresolved lazy entry's setParams support is unknown until it
    // resolves — allow the reservation through so params can queue as
    // entry.pendingParams (see _applyLayerParamsIntent) instead of forcing
    // a load just to check. A resolved (eager or already-loaded-lazy) entry
    // keeps the original upfront rejection when it genuinely has no setter.
    if (entry.module && typeof entry.module.setParams !== 'function') return null;
    cancelPendingRestoreIntent(entry, origin, 'explicit-params');
    const paramsIntentEpoch = ++entry.paramsIntentEpoch;
    entry.paramsIntentOrigin = origin;
    this._notifyListeners({
      type: 'params-requested',
      layerId,
      params: cloneLayerParams(params || {}),
      origin,
      paramsIntentEpoch,
    });
    return paramsIntentEpoch;
  },

_applyLayerParamsIntent(layerId, params, {
    origin = 'programmatic',
    paramsIntentEpoch = null,
  } = {}) {
    const entry = this.layers.get(layerId);
    if (!entry) {
      return { succeeded: false, error: paramsRejectedError(layerId), params: null };
    }
    if (entry.lazy && !entry.module) {
      // Do not force-resolve the module just to apply params — boot-time
      // restore iterates every registered layer regardless of whether the
      // user ever enables it, so naive resolution here would defeat lazy-
      // loading entirely (plan §3.2). Queue as pendingParams; replayed via
      // entry.module.setParams() the moment _ensureModuleResolved resolves,
      // or applied normally by the enable path if this call is part of an
      // enable transition (beforeEnableParams, handled separately).
      if (!Number.isInteger(paramsIntentEpoch) || entry.paramsIntentEpoch !== paramsIntentEpoch) {
        const result = { succeeded: false, cancellationReason: 'superseded', params: null };
        this._notifyListeners({
          type: 'params-cancelled',
          layerId,
          origin,
          paramsIntentEpoch,
          cancellationReason: result.cancellationReason,
          successorParamsIntentEpoch: entry.paramsIntentEpoch,
          successorOrigin: entry.paramsIntentOrigin,
        });
        return result;
      }
      entry.pendingParams = { ...(entry.pendingParams || {}), ...(params || {}) };
      return { succeeded: true, deferred: true, params: cloneLayerParams(entry.pendingParams), paramsIntentEpoch };
    }
    if (!entry.module || typeof entry.module.setParams !== 'function') {
      return { succeeded: false, error: paramsRejectedError(layerId), params: null };
    }
    if (!Number.isInteger(paramsIntentEpoch) || entry.paramsIntentEpoch !== paramsIntentEpoch) {
      const result = { succeeded: false, cancellationReason: 'superseded', params: null };
      this._notifyListeners({
        type: 'params-cancelled',
        layerId,
        origin,
        paramsIntentEpoch,
        cancellationReason: result.cancellationReason,
        successorParamsIntentEpoch: entry.paramsIntentEpoch,
        successorOrigin: entry.paramsIntentOrigin,
      });
      return result;
    }
    try {
      const accepted = entry.module.setParams(params || {}, { origin, paramsIntentEpoch });
      if (accepted === false) throw paramsRejectedError(layerId);
      if (entry.paramsIntentEpoch !== paramsIntentEpoch) {
        const result = { succeeded: false, cancellationReason: 'superseded', params: null };
        this._notifyListeners({
          type: 'params-cancelled',
          layerId,
          origin,
          paramsIntentEpoch,
          cancellationReason: result.cancellationReason,
          successorParamsIntentEpoch: entry.paramsIntentEpoch,
          successorOrigin: entry.paramsIntentOrigin,
        });
        return result;
      }
      const appliedParams = this.getLayerParams(layerId) || cloneLayerParams(params || {});
      this._refreshTogglePanel();
      governorRequestRender(`layer-params:${layerId}`);
      this._notifyListeners({
        type: 'params',
        layerId,
        params: appliedParams,
        requestedParams: cloneLayerParams(params || {}),
        origin,
        paramsIntentEpoch,
      });
      return { succeeded: true, params: appliedParams, paramsIntentEpoch };
    } catch (error) {
      console.warn(`[Data] ${layerId} setParams error:`, error);
      this._notifyListeners({
        type: 'params-failed',
        layerId,
        params: cloneLayerParams(params || {}),
        origin,
        paramsIntentEpoch,
        error,
      });
      return { succeeded: false, error, params: null, paramsIntentEpoch };
    }
  },

/** Apply runtime parameters through an origin-bearing intent lane. */
  setLayerParams(layerId, params, { origin = 'programmatic' } = {}) {
    const paramsIntentEpoch = this._reserveLayerParamsIntent(layerId, params, origin);
    if (!Number.isInteger(paramsIntentEpoch)) return false;
    return this._applyLayerParamsIntent(layerId, params, { origin, paramsIntentEpoch }).succeeded;
  },

/** Cancel a module-owned pending restore without creating a parameter intent. */
  cancelPendingLayerRestore(layerId, {
    origin = 'programmatic',
    reason = 'cancelled',
  } = {}) {
    const entry = this.layers.get(layerId);
    const cancel = entry?.module?.cancelPendingRestore
      || entry?.module?.cancelPendingTrackingRestore;
    if (typeof cancel !== 'function') return false;
    try {
      cancel.call(entry.module, { origin, reason });
      return true;
    } catch (error) {
      console.warn(`[Data] ${layerId} pending restore cancellation error:`, error);
      return false;
    }
  },

/** Publish parameters already applied by a layer's direct interaction. */
  adoptLayerParams(layerId, params, { origin = 'programmatic' } = {}) {
    const requestedParams = cloneLayerParams(params || {});
    const paramsIntentEpoch = this._reserveLayerParamsIntent(layerId, requestedParams, origin);
    if (!Number.isInteger(paramsIntentEpoch)) return false;
    const appliedParams = this.getLayerParams(layerId);
    const matches = appliedParams && Object.entries(requestedParams)
      .every(([key, value]) => Object.is(appliedParams[key], value));
    if (!matches) {
      const error = paramsRejectedError(layerId);
      this._notifyListeners({
        type: 'params-failed', layerId, params: requestedParams, origin, paramsIntentEpoch, error,
      });
      return false;
    }
    this._refreshTogglePanel();
    governorRequestRender(`layer-params:${layerId}`);
    this._notifyListeners({
      type: 'params', layerId, params: appliedParams, requestedParams, origin, paramsIntentEpoch,
    });
    return true;
  },

/**
   * Publish an explicit owner adoption of an already-settled layer visibility.
   * This is used when a direct selection promotes a Context-owned dependency
   * into durable user state without redundantly re-running its lifecycle.
   */
  adoptLayerVisibility(
    layerId,
    enabled,
    { origin = 'programmatic', adoptedFromSelection = false } = {},
  ) {
    const entry = this.layers.get(layerId);
    const desiredState = Boolean(enabled);
    if (!entry || entry.enabled !== desiredState || entry.lifecycleUncertain) return false;
    cancelPendingRestoreIntent(entry, origin, 'superseded-by-explicit-visibility-adoption');
    this._refreshTogglePanel();
    this._notifyListeners({
      type: 'visibility',
      layerId,
      enabled: desiredState,
      origin,
      intentEpoch: entry.visibilityIntentEpoch,
      adopted: true,
      adoptedFromSelection: Boolean(adoptedFromSelection),
    });
    return true;
  },

/**
   * Restore one finalized-registry layer independently. Parameters apply after
   * init and before enable, with a terminal envelope that never writes local
   * persistence.
   */
  async restoreLayerState(layerId, { enabled = false, params = null } = {}, {
    origin = 'programmatic',
    signal = null,
    // Optional `(task) => Promise` wrapper bounding this call's actual
    // lifecycle work (module.init/enable/update) via the shared cross-layer
    // concurrency gate — see RESTORE_CONCURRENCY. Passed by bulk fan-out
    // callers (LayerStateCoordinator._restoreSelectedState); a single-layer
    // explicit restore call omits it and runs unthrottled.
    restoreThrottle = null,
  } = {}) {
    if (!this._registrationsFinalized) throw new Error('Layer restore requires finalized registrations');
    const entry = this.layers.get(layerId);
    const targetEnabled = Boolean(enabled);
    if (!entry) {
      return {
        layerId,
        targetEnabled,
        origin,
        phase: 'missing',
        settledEnabled: false,
        lifecycleState: 'missing',
        lifecycleUncertain: false,
        appliedOptions: {},
        errorClass: 'UnknownLayer',
        persistenceWrite: false,
        succeeded: false,
      };
    }

    const requestedParams = params && typeof params === 'object' && Object.keys(params).length
      ? cloneLayerParams(params)
      : null;
    let paramsEnvelope = null;
    let beforeEnableParams = null;
    if (requestedParams) {
      const paramsIntentEpoch = this._reserveLayerParamsIntent(layerId, requestedParams, origin);
      if (Number.isInteger(paramsIntentEpoch)) {
        if (targetEnabled && !entry.enabled) {
          beforeEnableParams = { params: requestedParams, origin, paramsIntentEpoch, result: null };
        } else {
          paramsEnvelope = this._applyLayerParamsIntent(layerId, requestedParams, {
            origin,
            paramsIntentEpoch,
          });
        }
      } else {
        paramsEnvelope = { succeeded: false, error: paramsRejectedError(layerId) };
      }
    }

    const handle = this._setEnabledWithIntent(layerId, targetEnabled, {
      origin,
      signal,
      beforeEnableParams,
      restoreThrottle,
    });
    const requestedVisibility = await this._waitForVisibilityIntent(layerId, handle.intentEpoch);
    const authoritativeVisibility = requestedVisibility?.cancellationReason === 'superseded'
      ? await this._waitForAuthoritativeVisibilityIntent(layerId, handle.intentEpoch)
      : requestedVisibility;
    paramsEnvelope = paramsEnvelope || beforeEnableParams?.result;
    const state = this.getLayerLifecycleState(layerId);
    const paramsSucceeded = !requestedParams || paramsEnvelope?.succeeded === true;
    const visibilitySucceeded = authoritativeVisibility?.succeeded === true
      && state?.enabled === targetEnabled
      && state?.uncertain === false;
    const error = paramsEnvelope?.error || authoritativeVisibility?.error
      || requestedVisibility?.error || null;
    return {
      layerId,
      targetEnabled,
      origin,
      phase: requestedVisibility?.phase || (signal?.aborted ? 'reserved' : 'unknown'),
      completionPhase: authoritativeVisibility?.phase || null,
      settledEnabled: Boolean(state?.enabled),
      lifecycleState: state?.lifecycleState || 'missing',
      lifecycleUncertain: Boolean(state?.uncertain),
      appliedOptions: paramsSucceeded && requestedParams ? requestedParams : {},
      intentEpoch: handle.intentEpoch,
      authoritativeIntentEpoch: authoritativeVisibility?.intentEpoch ?? handle.intentEpoch,
      authoritativeEnabled: authoritativeVisibility?.enabled ?? null,
      authoritativeOrigin: authoritativeVisibility?.origin ?? null,
      paramsIntentEpoch: paramsEnvelope?.paramsIntentEpoch ?? beforeEnableParams?.paramsIntentEpoch ?? null,
      cancellationReason: requestedVisibility?.cancellationReason
        || paramsEnvelope?.cancellationReason || null,
      successorIntentEpoch: requestedVisibility?.successorIntentEpoch ?? null,
      successorEnabled: requestedVisibility?.successorEnabled ?? null,
      successorOrigin: requestedVisibility?.successorOrigin ?? null,
      errorClass: error?.name || (signal?.aborted ? 'AbortError' : null),
      ...(error ? { error: String(error.message || error) } : {}),
      persistenceWrite: false,
      succeeded: paramsSucceeded && visibilitySucceeded,
    };
  },

/**
   * Read runtime parameters from a layer if it exposes `getParams()`.
   */
  getLayerParams(layerId) {
    const entry = this.layers.get(layerId);
    if (!entry || !entry.module || typeof entry.module.getParams !== 'function') return null;
    try {
      const params = entry.module.getParams();
      if (!params || typeof params !== 'object') return null;
      return cloneLayerParams(params);
    } catch (error) {
      console.warn(`[Data] ${layerId} getParams error:`, error);
      return null;
    }
  },
};

