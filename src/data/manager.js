import PQueue from 'p-queue';
import { governorRequestRender } from '../renderGovernor.js';
import { markDetectionSourcesChanged } from './detection.js';
import {
  cancelPendingRestoreIntent,
  isAbortError,
  lifecycleRejectedError,
  layerFeedState,
  paramsRejectedError,
} from './managerFeedState.js';
import { managerTogglePanelMixin } from './managerTogglePanel.js';
import { registrationMixin } from './managerRegistration.js';
import { updateMixin } from './managerUpdate.js';
import { paramsMixin } from './managerParams.js';
import { lifecycleQueriesMixin } from './managerLifecycleQueries.js';
import { delegatesMixin } from './managerDelegates.js';
import { subscriptionsMixin } from './managerSubscriptions.js';
import { RESTORE_CONCURRENCY, SUPERSEDED_VISIBILITY_INTENT } from './managerConstants.js';

// Re-exported for external consumers (gevActions.js, and every
// *.test.mjs that imports `layerFeedState` from './manager.js' rather than
// the new sibling directly) — see managerFeedState.js for the source of
// truth and the purity rationale for this split.
export { layerFeedState };

/**
 * DataLayerManager — Manages registration, toggling, and update loops
 * for real-time data overlays on the CesiumJS globe.
 */
export class DataLayerManager {
  constructor(viewer, { allowQaRegistration = false } = {}) {
    this.viewer = viewer;
    this.layers = new Map(); // id → { module, enabled, initialized, intervalId, lifecycleState, lifecycleUncertain }
    this._listeners = new Set();
    this._visibilityRequestListeners = new Set();
    this._beforeDestroyListeners = new Set();
    this._visibilityGuards = new Set();
    this._registrationsFinalized = false;
    this._registrationDispositions = null;
    this._allowQaRegistration = allowQaRegistration === true;
    this._qaLayerIds = new Set();
    // Shared bulk-restore concurrency gate — see RESTORE_CONCURRENCY above.
    // Scoped to fan-out call sites only (restoreEnabledLayerIds, layer-state
    // restore, Context-mode clear, militaryAwareness's dependency fan-outs);
    // ordinary single-layer toggle()/setEnabled() calls never go through it,
    // so normal UI responsiveness is unaffected.
    this._restoreQueue = new PQueue({ concurrency: RESTORE_CONCURRENCY });
  }

  /**
   * Run `task` through the shared bulk-restore concurrency gate so no more
   * than RESTORE_CONCURRENCY layer lifecycles start at once across every
   * bulk fan-out source (page-load restore, Context-mode restore/exit,
   * Contacts dependency auto-enable). `task` should wrap only the "wait for
   * the lifecycle work to actually run" step — never the synchronous intent
   * reservation itself, or a later explicit toggle could not supersede a
   * still-queued restore entry.
   * @param {() => Promise<*>} task
   * @returns {Promise<*>}
   */
  runThroughRestoreQueue(task) {
    return this._restoreQueue.add(task);
  }

  

  

  

  

  

  

  

  

  get registrationsFinalized() {
    return this._registrationsFinalized;
  }

  

  

  

  

  

  

  

  toggle(layerId, { origin = 'programmatic', notificationToken = null } = {}) {
    const entry = this.layers.get(layerId);
    if (!entry || entry.destroying) return Promise.resolve(false);
    // A relative user action still needs the same revocable authority as an
    // absolute request. Invert the effective (latest-intent) state now, then
    // let the absolute-intent lane serialize and cancel obsolete lifecycle
    // work. This also makes two rapid toggles deterministically mean ON, OFF.
    return this._setEnabledWithIntent(layerId, !this.isEffectivelyEnabled(layerId), {
      origin,
      notificationToken,
      notifyWillChangeBeforeEffective: true,
    }).promise;
  }

  _enqueueToggle(entry, operation) {
    const next = entry.toggleChain
      .catch(() => {})
      .then(operation);
    entry.toggleChain = next;
    return next;
  }

  _setLifecycleTransition(entry, requestedChange, lifecycleState) {
    entry.lifecycleState = lifecycleState;
    this._syncModuleLifecyclePresentation(entry);
    this._refreshTogglePanel();
    this._notifyListeners({
      ...requestedChange,
      type: 'visibility-transition',
      lifecycleState,
      settledEnabled: entry.enabled,
    });
  }

  _settleLifecycle(entry) {
    entry.lifecycleState = entry.enabled ? 'enabled' : 'disabled';
    this._syncModuleLifecyclePresentation(entry);
  }

  _syncModuleLifecyclePresentation(entry) {
    // A still-unresolved lazy entry has no module yet during the brief
    // window between _setLifecycleTransition's synchronous 'enabling' call
    // (fired before _doToggle's enable/disable branch split, ahead of the
    // _ensureModuleResolved await inside the enable branch) and actual
    // resolution — safe to skip presentation sync for that narrow window.
    if (!entry.module || typeof entry.module.setLifecyclePresentation !== 'function') return;
    try {
      entry.module.setLifecyclePresentation({
        lifecycleState: entry.lifecycleState,
        enabled: entry.enabled,
        uncertain: entry.lifecycleUncertain,
      });
    } catch (error) {
      console.warn(`[Data] ${entry.module.id} lifecycle presentation error:`, error);
    }
  }

  _visibilityCancellationMetadata(entry, intentEpoch, signal, phase, resourceAbort = false) {
    const hasSuccessor = Number.isInteger(intentEpoch) && entry.visibilityIntentEpoch > intentEpoch;
    const metadata = {
      ...(Number.isInteger(intentEpoch) ? { intentEpoch } : {}),
      phase,
      cancellationReason: resourceAbort
        ? 'resource-abort'
        : (hasSuccessor || signal?.reason === SUPERSEDED_VISIBILITY_INTENT
          ? 'superseded'
          : 'caller-abort'),
      ...(hasSuccessor ? {
        successorIntentEpoch: entry.visibilityIntentEpoch,
        successorEnabled: entry.visibilityIntentEnabled,
        successorOrigin: entry.visibilityIntentOrigin,
      } : {}),
    };
    const record = entry.visibilityIntentRecords.get(intentEpoch);
    if (record) Object.assign(record, metadata);
    return metadata;
  }

  _setVisibilityIntentPhase(entry, intentEpoch, phase) {
    if (!Number.isInteger(intentEpoch)) return;
    const record = entry.visibilityIntentRecords.get(intentEpoch);
    if (record) record.phase = phase;
  }

  async _doToggle(entry, layerId, origin, {
    signal = null,
    targetEnabled = !entry.enabled,
    notificationToken = null,
    intentEpoch = null,
    suppressWillChangeNotification = false,
    beforeEnableParams = null,
  } = {}) {
    const desiredState = Boolean(targetEnabled);
    const recordVisibilityFailure = (phase, error) => {
      if (!Number.isInteger(intentEpoch)) return;
      entry.visibilityIntentFailures.set(intentEpoch, {
        phase,
        error: error || lifecycleRejectedError(layerId, phase),
      });
    };
    const isSuperseded = () => (
      intentEpoch !== null && intentEpoch !== entry.visibilityIntentEpoch
    );
    const settleLifecycle = () => {
      if (!isSuperseded()) {
        entry.pendingVisibilityAdoptionEpoch = 0;
        this._settleLifecycle(entry);
        // setLifecyclePresentation() is synchronous and may notify a
        // subscriber that immediately issues a newer absolute request. Re-read
        // the epoch after that callback boundary before treating settlement as
        // owned by this transaction.
        if (!isSuperseded()) return true;
      }
      // Cleanup belongs to the obsolete transaction, so retain the actual
      // conservative state but keep presentation transitional/hidden. The
      // latest queued absolute request will reconcile or adopt it and alone
      // publish settled visibility under its own origin.
      entry.lifecycleState = entry.visibilityIntentEnabled ? 'enabling' : 'disabling';
      entry.pendingVisibilityAdoptionEpoch = entry.visibilityIntentEpoch;
      this._syncModuleLifecyclePresentation(entry);
      return false;
    };
    const requestedChange = {
      type: 'visibility-will-change',
      layerId,
      enabled: desiredState,
      origin,
      ...(Number.isInteger(intentEpoch) ? { intentEpoch } : {}),
      ...(notificationToken ? { notificationToken } : {}),
    };
    if (signal?.aborted) return false;
    if (!suppressWillChangeNotification) this._notifyListeners(requestedChange);
    const blockReason = await this._visibilityBlockReason(requestedChange);
    if (signal?.aborted) {
      this._notifyListeners({
        ...requestedChange,
        type: 'visibility-cancelled',
        ...this._visibilityCancellationMetadata(entry, intentEpoch, signal, 'guard'),
      });
      return false;
    }
    if (blockReason) {
      this._refreshTogglePanel();
      this._notifyListeners({
        ...requestedChange,
        type: 'visibility-blocked',
        reason: blockReason,
      });
      return false;
    }
    this._setLifecycleTransition(
      entry,
      requestedChange,
      desiredState ? 'enabling' : 'disabling',
    );
    if (!desiredState) {
      // Disable
      this._invalidateRefresh(layerId, entry, 'layer-disabled');
      const finishCancelledDisable = async (phase = 'disable', resourceAbort = false) => {
        // The module may already have completed its disable work, so compensate
        // inside this serialized manager transaction. Restore ON only after a
        // successful enable; otherwise remain truthfully OFF and let the next
        // setEnabled(true) perform real lifecycle work.
        let compensated = false;
        let compensationError = null;
        try {
          compensated = await entry.module.enable(this.viewer) !== false;
          if (!compensated) {
            compensationError = lifecycleRejectedError(layerId, 'cancel-disable-compensation');
          }
        } catch (error) {
          compensationError = error;
          console.warn(`[Data] ${layerId} cancelled-disable cleanup error:`, error);
        }
        let cleanupConfirmed = false;
        if (!compensated) {
          try {
            cleanupConfirmed = await entry.module.disable(this.viewer) !== false;
          } catch (error) {
            console.warn(`[Data] ${layerId} cancelled-disable final cleanup error:`, error);
          }
        }
        // A failed enable may have partially activated the module. Only record
        // OFF when a subsequent disable positively confirms cleanup; otherwise
        // retain ON as the conservative authoritative state.
        entry.enabled = compensated || !cleanupConfirmed;
        entry.lifecycleUncertain = !compensated && !cleanupConfirmed;
        settleLifecycle();
        if (!entry.enabled && entry.intervalId) {
          clearInterval(entry.intervalId);
          entry.intervalId = null;
        }
        this._refreshTogglePanel();
        if (!compensated) {
          recordVisibilityFailure(
            'cancel-disable-compensation',
            compensationError || lifecycleRejectedError(layerId, 'cancel-disable-compensation'),
          );
        }
        this._notifyListeners({
          ...requestedChange,
          type: compensated ? 'visibility-cancelled' : 'visibility-failed',
          ...(compensated
            ? this._visibilityCancellationMetadata(entry, intentEpoch, signal, phase, resourceAbort)
            : {}),
          ...(compensated ? {} : {
            phase: 'cancel-disable-compensation',
            error: compensationError,
          }),
        });
        return false;
      };
      try {
        const disabled = await entry.module.disable(this.viewer, { signal });
        if (disabled === false) throw lifecycleRejectedError(layerId, 'disable');
      } catch (e) {
        if (signal?.aborted || isAbortError(e)) {
          return finishCancelledDisable('disable', isAbortError(e) && !signal?.aborted);
        }
        // Fail closed: the module may still be polling or rendering, so keep
        // the manager's authoritative state enabled and preserve its interval.
        entry.enabled = true;
        entry.lifecycleUncertain = true;
        settleLifecycle();
        console.warn(`[Data] ${layerId} disable error:`, e);
        recordVisibilityFailure('disable', e);
        this._refreshTogglePanel();
        this._notifyListeners({
          ...requestedChange,
          type: 'visibility-failed',
          phase: 'disable',
          error: e,
        });
        return false;
      }
      if (signal?.aborted) return finishCancelledDisable('disable');
      if (entry.intervalId) {
        clearInterval(entry.intervalId);
        entry.intervalId = null;
      }
      entry.enabled = false;
      entry.lifecycleUncertain = false;
      if (!settleLifecycle() || signal?.aborted) return finishCancelledDisable('settle');
    } else {
      // Enable
      if (entry.lazy && !entry.module) {
        // Resolve the dynamic import before any lifecycle work. This is the
        // load-bearing wiring for registerLazy(): without it entry.module
        // stays null forever and entry.module.init() below throws. Runs
        // before cancelEnable/finishFailedEnable are defined below (and
        // before the signal's abort listener is registered at the bottom
        // of this branch) since neither is needed for a resolve-phase
        // failure — nothing has been initialized yet, so there is no
        // module to clean up.
        this._setVisibilityIntentPhase(entry, intentEpoch, 'resolve');
        try {
          await this._ensureModuleResolved(entry);
        } catch (e) {
          entry.enabled = false;
          entry.lifecycleUncertain = false;
          settleLifecycle();
          console.warn(`[Data] ${layerId} resolve error:`, e);
          recordVisibilityFailure('resolve', e);
          this._refreshTogglePanel();
          this._notifyListeners({
            ...requestedChange,
            type: 'visibility-failed',
            phase: 'resolve',
            error: e,
          });
          return false;
        }
        if (signal?.aborted) {
          entry.enabled = false;
          entry.lifecycleUncertain = false;
          settleLifecycle();
          this._refreshTogglePanel();
          this._notifyListeners({
            ...requestedChange,
            type: 'visibility-cancelled',
            ...this._visibilityCancellationMetadata(entry, intentEpoch, signal, 'resolve'),
          });
          return false;
        }
      }
      let abortCleanup = null;
      const cancelEnable = () => {
        if (entry.intervalId) {
          clearInterval(entry.intervalId);
          entry.intervalId = null;
        }
        // Disable immediately so modules with their own AbortController (Radio)
        // cancel pending update work at the same turn boundary. A second
        // disable after the current lifecycle await settles closes the race
        // where an asynchronous enable finishes after this callback.
        try {
          abortCleanup = Promise.resolve(entry.module.disable(this.viewer)).catch((error) => {
            console.warn(`[Data] ${layerId} cancelled-enable cleanup error:`, error);
            return false;
          });
        } catch (error) {
          console.warn(`[Data] ${layerId} cancelled-enable cleanup error:`, error);
          abortCleanup = Promise.resolve(false);
        }
      };
      const finishCancelledEnable = async (phase, resourceAbort = false) => {
        // A resource-local AbortError settles this transaction without
        // aborting the caller's signal. Release that signal's listener now so
        // a later abort cannot revoke a successful retry.
        signal?.removeEventListener('abort', cancelEnable);
        if (entry.intervalId) {
          clearInterval(entry.intervalId);
          entry.intervalId = null;
        }
        await abortCleanup;
        let cleanupConfirmed = false;
        try { cleanupConfirmed = await entry.module.disable(this.viewer) !== false; } catch (error) {
          console.warn(`[Data] ${layerId} cancelled-enable final cleanup error:`, error);
        }
        entry.enabled = !cleanupConfirmed;
        entry.lifecycleUncertain = !cleanupConfirmed;
        settleLifecycle();
        this._refreshTogglePanel();
        if (!cleanupConfirmed) {
          recordVisibilityFailure(
            'cancel-enable-cleanup',
            lifecycleRejectedError(layerId, 'cancel-enable-cleanup'),
          );
        }
        this._notifyListeners({
          ...requestedChange,
          type: cleanupConfirmed ? 'visibility-cancelled' : 'visibility-failed',
          ...(cleanupConfirmed
            ? this._visibilityCancellationMetadata(entry, intentEpoch, signal, phase, resourceAbort)
            : {}),
          ...(cleanupConfirmed ? {} : { phase: 'cancel-enable-cleanup' }),
        });
        return false;
      };
      const finishFailedEnable = async (phase, error) => {
        if (entry.intervalId) {
          clearInterval(entry.intervalId);
          entry.intervalId = null;
        }
        let cleanupConfirmed = false;
        try { cleanupConfirmed = await entry.module.disable(this.viewer) !== false; } catch (cleanupError) {
          console.warn(`[Data] ${layerId} failed-enable cleanup error:`, cleanupError);
        }
        entry.enabled = !cleanupConfirmed;
        entry.lifecycleUncertain = !cleanupConfirmed;
        settleLifecycle();
        console.warn(`[Data] ${layerId} ${phase} error:`, error);
        recordVisibilityFailure(phase, error);
        this._refreshTogglePanel();
        this._notifyListeners({
          ...requestedChange,
          type: 'visibility-failed',
          phase,
          error,
        });
        signal?.removeEventListener('abort', cancelEnable);
        return false;
      };
      signal?.addEventListener('abort', cancelEnable, { once: true });
      if (!entry.initialized) {
        this._setVisibilityIntentPhase(entry, intentEpoch, 'init');
        try {
          const initialized = await entry.module.init(this.viewer, { signal });
          if (initialized === false) throw lifecycleRejectedError(layerId, 'init');
          entry.initialized = true;
        } catch (e) {
          if (signal?.aborted || isAbortError(e)) {
            return finishCancelledEnable('init', isAbortError(e) && !signal?.aborted);
          }
          return finishFailedEnable('init', e);
        }
      }
      if (signal?.aborted) return finishCancelledEnable('init');
      if (beforeEnableParams) {
        this._setVisibilityIntentPhase(entry, intentEpoch, 'params');
        const paramsResult = this._applyLayerParamsIntent(
          layerId,
          beforeEnableParams.params,
          {
            origin: beforeEnableParams.origin,
            paramsIntentEpoch: beforeEnableParams.paramsIntentEpoch,
          },
        );
        beforeEnableParams.result = paramsResult;
        if (!paramsResult.succeeded) {
          if (signal?.aborted || paramsResult.cancellationReason) {
            return finishCancelledEnable('params');
          }
          return finishFailedEnable('params', paramsResult.error || paramsRejectedError(layerId));
        }
      }
      if (signal?.aborted) return finishCancelledEnable('params');
      entry.lifecycleUncertain = false;
      this._setVisibilityIntentPhase(entry, intentEpoch, 'enable');
      try {
        const enabled = await entry.module.enable(this.viewer, { signal });
        if (enabled === false) throw lifecycleRejectedError(layerId, 'enable');
      } catch (e) {
        if (signal?.aborted || isAbortError(e)) {
          return finishCancelledEnable('enable', isAbortError(e) && !signal?.aborted);
        }
        return finishFailedEnable('enable', e);
      }
      if (signal?.aborted) return finishCancelledEnable('enable');

      // First update immediately
      this._setVisibilityIntentPhase(entry, intentEpoch, 'update');
      try {
        const updated = await entry.module.update(this.viewer, { signal });
        if (updated === false) throw lifecycleRejectedError(layerId, 'update');
      } catch (e) {
        if (signal?.aborted || isAbortError(e)) {
          return finishCancelledEnable('update', isAbortError(e) && !signal?.aborted);
        }
        return finishFailedEnable('update', e);
      }
      if (signal?.aborted) return finishCancelledEnable('update');
      entry.managerRefreshError = null;

      entry.enabled = true;
      entry.lifecycleUncertain = false;
      this._setVisibilityIntentPhase(entry, intentEpoch, 'settle');
      if (!settleLifecycle() || signal?.aborted) return finishCancelledEnable('settle');

      // Always clear any stale interval before assigning a new one, so we never
      // orphan a running timer and end up double-polling.
      if (entry.intervalId) {
        clearInterval(entry.intervalId);
        entry.intervalId = null;
      }

      // Manager-owned periodic refresh work has one normalized loading/error
      // contract. Camera-driven layers may keep updateInterval=0 and opt into
      // a slower data fetch with refreshInterval.
      this._armUpdateLoop(layerId, entry);
      signal?.removeEventListener('abort', cancelEnable);
    }

    this._refreshTogglePanel();
    governorRequestRender('layer-visibility');
    // Same reason as the poll tick: a layer appearing or disappearing changes
    // the detectable set wholesale, and the solve behind it has to be re-run.
    markDetectionSourcesChanged('layer-visibility');
    this._notifyListeners({
      type: 'visibility',
      layerId,
      enabled: entry.enabled,
      origin,
      ...(Number.isInteger(intentEpoch) ? { intentEpoch } : {}),
      ...(notificationToken ? { notificationToken } : {}),
    });
    return true;
  }

  /**
   * Ensure a layer is in the requested enabled/disabled state.
   * Deterministic helper for scripted scene playback.
   */
  setEnabled(layerId, shouldEnable, {
    origin = 'programmatic',
    signal = null,
    notificationToken = null,
    // Optional `(task) => Promise` wrapper bounding this call's actual
    // lifecycle work via the shared cross-layer concurrency gate — see
    // runThroughRestoreQueue()/RESTORE_CONCURRENCY. Only bulk fan-out
    // callers pass this; an ordinary single-layer toggle omits it and runs
    // unthrottled, so normal UI responsiveness is unaffected.
    restoreThrottle = null,
  } = {}) {
    return this._setEnabledWithIntent(layerId, shouldEnable, {
      origin,
      signal,
      notificationToken,
      restoreThrottle,
    }).promise;
  }

  /**
   * Internal absolute-visibility request with an exact intent handle.
   * The ordinary setEnabled() promise remains the public control contract.
   */
  _setEnabledWithIntent(layerId, shouldEnable, {
    origin = 'programmatic',
    signal = null,
    notificationToken = null,
    notifyWillChangeBeforeEffective = false,
    beforeEnableParams = null,
    // Optional `(task) => Promise` wrapper run around the actual lifecycle
    // work (the _doToggle call that invokes module.init/enable/update) —
    // used by bulk fan-out callers (restoreEnabledLayerIds, layer-state
    // restore, Context-mode clear, militaryAwareness dependency auto-enable)
    // to bound cross-layer concurrency. Epoch reservation above stays
    // synchronous regardless, so a later explicit toggle can still supersede
    // a still-queued restore entry.
    restoreThrottle = null,
  } = {}) {
    const entry = this.layers.get(layerId);
    if (!entry) return { intentEpoch: null, promise: Promise.resolve() };
    const desiredState = Boolean(shouldEnable);
    if (entry.destroying) {
      return { intentEpoch: null, promise: Promise.resolve(desiredState === false) };
    }
    cancelPendingRestoreIntent(entry, origin, 'explicit-visibility');
    const intentEpoch = ++entry.visibilityIntentEpoch;
    entry.visibilityIntentEnabled = desiredState;
    entry.visibilityIntentOrigin = origin;
    let resolveIntentRecord;
    const settled = new Promise((resolve) => { resolveIntentRecord = resolve; });
    const intentRecord = {
      intentEpoch,
      enabled: desiredState,
      origin,
      phase: 'queued',
      settled,
      resolve: resolveIntentRecord,
    };
    entry.visibilityIntentRecords.set(intentEpoch, intentRecord);
    for (const [recordEpoch, record] of entry.visibilityIntentRecords) {
      if (entry.visibilityIntentRecords.size <= 16) break;
      if (recordEpoch !== intentEpoch && record.completed) entry.visibilityIntentRecords.delete(recordEpoch);
    }
    // Relative toggle historically exposes its will-change edge while the
    // settled/effective snapshot is still the pre-click state. Preserve that
    // Context capture boundary, but reserve the epoch first so a re-entrant
    // listener can still supersede this request authoritatively.
    if (notifyWillChangeBeforeEffective) {
      this._notifyListeners({
        type: 'visibility-will-change',
        layerId,
        enabled: desiredState,
        origin,
        intentEpoch,
        ...(notificationToken ? { notificationToken } : {}),
      });
    }
    // Effective visibility must follow the NEWEST absolute intent from the
    // synchronous moment it is requested — the superseded transaction's
    // cleanup updates lifecycleState later, and Context capture can run in
    // between. Cleared by this request's own queue turn when it finishes.
    if (entry.visibilityIntentEpoch === intentEpoch) {
      entry.latestQueuedAbsoluteIntent = { intentEpoch, enabled: desiredState };
    }
    this._notifyVisibilityRequest({
      type: 'visibility-requested',
      layerId,
      enabled: desiredState,
      origin,
      intentEpoch,
      ...(notificationToken ? { notificationToken } : {}),
    });
    // Advance absolute intent before aborting so the obsolete transaction's
    // cleanup can defer settlement to this exact latest epoch. Supersede even
    // a same-target request: its newer origin may carry explicit user intent
    // that must own the eventual persistence-bearing visibility event.
    entry.activeVisibilityIntent?.controller.abort(SUPERSEDED_VISIBILITY_INTENT);
    // The idempotency check belongs inside the same per-layer queue as toggle.
    // Checking before enqueueing lets two simultaneous setEnabled(true) calls
    // both observe OFF and accidentally perform enable-then-disable (M6).
    const releaseQueuedIntent = () => {
      if (entry.latestQueuedAbsoluteIntent?.intentEpoch === intentEpoch) {
        entry.latestQueuedAbsoluteIntent = null;
      }
    };
    const runIntentTurn = async () => {
      const requestedChange = {
        type: 'visibility-will-change',
        layerId,
        enabled: desiredState,
        origin,
        intentEpoch,
        ...(notificationToken ? { notificationToken } : {}),
      };
      if (intentEpoch !== entry.visibilityIntentEpoch) {
        this._notifyListeners({
          ...requestedChange,
          type: 'visibility-cancelled',
          ...this._visibilityCancellationMetadata(entry, intentEpoch, null, 'queued'),
        });
        return false;
      }
      if (signal?.aborted) {
        if (entry.pendingVisibilityAdoptionEpoch === intentEpoch) {
          entry.pendingVisibilityAdoptionEpoch = 0;
          this._settleLifecycle(entry);
          this._refreshTogglePanel();
        }
        // Every accepted absolute request has one authoritative terminal
        // outcome. Even when it is aborted before its queue turn and no
        // adoption is pending, publish cancellation and populate the exact
        // intent record used by waiters.
        this._notifyListeners({
          ...requestedChange,
          type: 'visibility-cancelled',
          ...this._visibilityCancellationMetadata(entry, intentEpoch, signal, 'queued'),
        });
        return false;
      }
      if (
        entry.pendingVisibilityAdoptionEpoch === intentEpoch
        && entry.enabled === desiredState
        && !entry.lifecycleUncertain
      ) {
        // Adoption publishes a successful settled visibility, so it must pass
        // the same guards a fresh transition would — a guard installed after
        // the superseded transaction started (e.g. an exclusive Context mode)
        // must be able to veto the adopted state, not just future requests.
        const adoptionBlockReason = await this._visibilityBlockReason(requestedChange);
        if (intentEpoch !== entry.visibilityIntentEpoch) {
          // The guard is an async boundary. A newer intent can arrive while it
          // is pending, so this adoption needs the same exact terminal envelope
          // as every other superseded phase. Context follows these successor
          // fields instead of guessing from mutable manager state.
          if (entry.pendingVisibilityAdoptionEpoch === intentEpoch) {
            entry.pendingVisibilityAdoptionEpoch = entry.visibilityIntentEpoch;
          }
          entry.lifecycleState = entry.visibilityIntentEnabled ? 'enabling' : 'disabling';
          this._syncModuleLifecyclePresentation(entry);
          this._refreshTogglePanel();
          this._notifyListeners({
            ...requestedChange,
            type: 'visibility-cancelled',
            ...this._visibilityCancellationMetadata(entry, intentEpoch, null, 'adoption'),
          });
          return false;
        }
        if (signal?.aborted) {
          if (entry.pendingVisibilityAdoptionEpoch === intentEpoch) {
            entry.pendingVisibilityAdoptionEpoch = 0;
            this._settleLifecycle(entry);
            this._refreshTogglePanel();
            this._notifyListeners({
              ...requestedChange,
              type: 'visibility-cancelled',
              ...this._visibilityCancellationMetadata(entry, intentEpoch, signal, 'adoption'),
            });
          }
          return false;
        }
        if (adoptionBlockReason) {
          entry.pendingVisibilityAdoptionEpoch = 0;
          this._refreshTogglePanel();
          if (entry.enabled === desiredState) {
            // The guard forbids the very state the superseded transaction's
            // cleanup left behind. Reconcile through the ordinary lifecycle to
            // the guard-respecting opposite — but the CALLER's request stays
            // unfulfilled either way. Ordering matters: the compensation
            // registers as the active intent AND takes over the queued-intent
            // record BEFORE the blocked event is announced, so a listener that
            // re-enters setEnabled() during the callback has a live intent to
            // abort and observes the reconciliation target as effective
            // visibility, not the refused request.
            const compensationController = new AbortController();
            const compensationIntent = {
              intentEpoch,
              enabled: !desiredState,
              controller: compensationController,
            };
            entry.activeVisibilityIntent = compensationIntent;
            entry.latestQueuedAbsoluteIntent = { intentEpoch, enabled: !desiredState };
            this._notifyListeners({
              ...requestedChange,
              type: 'visibility-blocked',
              reason: adoptionBlockReason,
            });
            // The callback may have superseded this turn. The newest intent
            // owns reconciliation now — defer exactly like an obsolete
            // transaction instead of installing an already-doomed compensation.
            if (
              intentEpoch !== entry.visibilityIntentEpoch
              || compensationController.signal.aborted
            ) {
              if (entry.activeVisibilityIntent === compensationIntent) {
                entry.activeVisibilityIntent = null;
              }
              entry.lifecycleState = entry.visibilityIntentEnabled ? 'enabling' : 'disabling';
              entry.pendingVisibilityAdoptionEpoch = entry.visibilityIntentEpoch;
              this._syncModuleLifecyclePresentation(entry);
              return false;
            }
            try {
              await this._doToggle(entry, layerId, origin, {
                signal: compensationController.signal,
                targetEnabled: !desiredState,
                notificationToken,
                intentEpoch,
              });
            } finally {
              if (entry.activeVisibilityIntent === compensationIntent) {
                entry.activeVisibilityIntent = null;
              }
            }
            return false;
          }
          this._notifyListeners({
            ...requestedChange,
            type: 'visibility-blocked',
            reason: adoptionBlockReason,
          });
          this._settleLifecycle(entry);
          return false;
        }
        entry.pendingVisibilityAdoptionEpoch = 0;
        this._settleLifecycle(entry);
        if (intentEpoch !== entry.visibilityIntentEpoch) {
          entry.lifecycleState = entry.visibilityIntentEnabled ? 'enabling' : 'disabling';
          entry.pendingVisibilityAdoptionEpoch = entry.visibilityIntentEpoch;
          this._syncModuleLifecyclePresentation(entry);
          return false;
        }
        this._refreshTogglePanel();
        this._notifyListeners({
          type: 'visibility',
          layerId,
          enabled: desiredState,
          origin,
          intentEpoch,
          ...(notificationToken ? { notificationToken } : {}),
        });
        return true;
      }
      if (entry.enabled === desiredState && !entry.lifecycleUncertain) {
        // Idempotent exit — but an aborted predecessor (e.g. a compensation
        // cancelled before its first transition) may have left a stale
        // transitional presentation. State and intent agree here, so settle
        // the presentation rather than orphaning ENABLING/DISABLING forever.
        // Publish the accepted absolute intent even when lifecycle work is a
        // no-op: a newer explicit origin can own Context/persistence behavior
        // without redundantly re-enabling the module.
        if (entry.lifecycleState === 'enabling' || entry.lifecycleState === 'disabling') {
          this._settleLifecycle(entry);
        }
        this._refreshTogglePanel();
        this._notifyListeners({
          type: 'visibility',
          layerId,
          enabled: desiredState,
          origin,
          intentEpoch,
          ...(notificationToken ? { notificationToken } : {}),
        });
        return true;
      }

      entry.pendingVisibilityAdoptionEpoch = 0;
      const controller = new AbortController();
      const forwardCallerAbort = () => controller.abort(signal?.reason);
      signal?.addEventListener('abort', forwardCallerAbort, { once: true });
      const activeIntent = { intentEpoch, enabled: desiredState, controller };
      entry.activeVisibilityIntent = activeIntent;
      try {
        // The actual expensive lifecycle work (module.init/enable/update, via
        // _doToggle) is what bulk fan-out callers need bounded, not "the wait
        // for it to finish" — this task is scheduled the instant it's called,
        // so wrapping only a later await does nothing. restoreThrottle (when
        // supplied) is the shared cross-layer concurrency gate; entry.active
        // VisibilityIntent is already set above, so a competing explicit
        // toggle on this same layer can still supersede this request (via
        // controller.abort() below) while it sits queued for a throttle slot
        // — _doToggle's own signal.aborted check at its top then produces the
        // normal graceful cancellation notification once dequeued, with no
        // real module work performed.
        const doToggleTask = () => this._doToggle(entry, layerId, origin, {
          signal: controller.signal,
          targetEnabled: desiredState,
          notificationToken,
          intentEpoch,
          suppressWillChangeNotification: notifyWillChangeBeforeEffective,
          beforeEnableParams,
        });
        return await (restoreThrottle ? restoreThrottle(doToggleTask) : doToggleTask());
      } finally {
        signal?.removeEventListener('abort', forwardCallerAbort);
        if (entry.activeVisibilityIntent === activeIntent) {
          entry.activeVisibilityIntent = null;
        }
      }
    };
    const promise = this._enqueueToggle(entry, async () => {
      try {
        return await runIntentTurn();
      } finally {
        // This turn no longer owns queued-intent effective visibility —
        // either it settled, or a newer epoch superseded it (that epoch's
        // own record already replaced this one).
        releaseQueuedIntent();
      }
    });
    promise.then((result) => {
      const failure = entry.visibilityIntentFailures.get(intentEpoch) || null;
      entry.visibilityIntentFailures.delete(intentEpoch);
      intentRecord.completed = true;
      intentRecord.result = result;
      intentRecord.error = failure?.error || null;
      intentRecord.settledEnabled = entry.enabled;
      intentRecord.uncertain = entry.lifecycleUncertain;
      intentRecord.resolve({
        intentEpoch,
        enabled: desiredState,
        origin,
        phase: failure?.phase || intentRecord.phase,
        result,
        ...(failure?.error ? { error: failure.error } : {}),
        settledEnabled: entry.enabled,
        uncertain: entry.lifecycleUncertain,
        succeeded: result !== false && entry.enabled === desiredState && !entry.lifecycleUncertain,
        cancellationReason: intentRecord.cancellationReason || null,
        successorIntentEpoch: intentRecord.successorIntentEpoch ?? null,
        successorEnabled: intentRecord.successorEnabled ?? null,
        successorOrigin: intentRecord.successorOrigin ?? null,
      });
    }, (error) => {
      entry.visibilityIntentFailures.delete(intentEpoch);
      intentRecord.completed = true;
      intentRecord.error = error;
      intentRecord.resolve({
        intentEpoch,
        enabled: desiredState,
        origin,
        phase: intentRecord.phase,
        result: false,
        error,
        settledEnabled: entry.enabled,
        uncertain: entry.lifecycleUncertain,
        succeeded: false,
        cancellationReason: intentRecord.cancellationReason || null,
        successorIntentEpoch: intentRecord.successorIntentEpoch ?? null,
        successorEnabled: intentRecord.successorEnabled ?? null,
        successorOrigin: intentRecord.successorOrigin ?? null,
      });
    });
    return { intentEpoch, promise };
  }

  /** Wait for one exact absolute visibility intent to complete. */
  async _waitForVisibilityIntent(layerId, intentEpoch) {
    const record = this.layers.get(layerId)?.visibilityIntentRecords?.get(intentEpoch);
    return record ? record.settled : null;
  }

  /**
   * Follow one restore request through any explicit superseding intent chain.
   * The newest named successor must reach a terminal state before restore can
   * judge the layer; an obsolete caller boolean is never sufficient.
   */
  async _waitForAuthoritativeVisibilityIntent(layerId, intentEpoch) {
    const entry = this.layers.get(layerId);
    if (!entry || !Number.isInteger(intentEpoch)) return null;
    let epoch = intentEpoch;
    let outcome = null;
    while (Number.isInteger(epoch)) {
      outcome = await this._waitForVisibilityIntent(layerId, epoch);
      if (!outcome) return null;
      const newerEpoch = entry.visibilityIntentEpoch > epoch
        ? entry.visibilityIntentEpoch
        : outcome.successorIntentEpoch;
      if (!Number.isInteger(newerEpoch) || newerEpoch <= epoch) break;
      if (outcome.cancellationReason !== 'superseded') return null;
      epoch = newerEpoch;
    }
    return outcome;
  }

  /**
   * The layer's effective visibility target: settled state, unless awaited
   * lifecycle work (or a superseded transaction awaiting adoption) is moving
   * it — an ENABLING layer is effectively ON and a DISABLING layer is
   * effectively OFF, regardless of which side has settled.
   */
  _effectiveEnabled(entry) {
    // Newest-intent-wins: an absolute request owns effective visibility from
    // the synchronous moment it is made, even while a superseded transaction
    // has not yet updated lifecycleState.
    if (
      entry.clearVisibilityReservation
      && entry.visibilityIntentEpoch === entry.clearVisibilityReservation.intentEpoch
    ) return false;
    if (entry.latestQueuedAbsoluteIntent) return entry.latestQueuedAbsoluteIntent.enabled;
    if (entry.lifecycleState === 'enabling') return true;
    if (entry.lifecycleState === 'disabling') return false;
    return entry.enabled;
  }

  /**
   * Whether a layer is effectively enabled, counting in-flight transitions as
   * their target state. Context capture/isolation must use THIS (not the
   * settled `isEnabled()`) so a layer mid-activation is isolated and
   * snapshotted as ON, and a layer honoring a user's in-flight OFF is not
   * snapshotted (and later restored) as ON.
   * @param {string} layerId Registered layer identifier.
   * @returns {boolean}
   */
  isEffectivelyEnabled(layerId) {
    const entry = this.layers.get(layerId);
    return entry ? this._effectiveEnabled(entry) : false;
  }

  /**
   * Snapshot the exact set of registered layers the user currently intends
   * enabled, counting in-flight transitions as their target state.
   * @returns {Set<string>} A detached set safe for later restoration.
   */
  getEnabledLayerIds() {
    return new Set(
      [...this.layers]
        .filter(([, entry]) => this._effectiveEnabled(entry))
        .map(([layerId]) => layerId),
    );
  }

  

  

  

  

  

  

  

  

  

  

  

  

  

  

  

  

  

  

  

  

  

  

  

  

  

  

  

  

  

  

  

  

  

  

  

  

  

  

  

  

  

  

  

  

  

  // Toggle-panel DOM rendering (buildTogglePanel/_renderToggles/
  // _rowControlsFor/_syncRowControls/_refreshTogglePanel/_buildMetaText/
  // _syncToggleButton/_formatCount/_timeAgo) lives in managerTogglePanel.js
  // as of the split-program merge — see managerTogglePanelMixin below.
  // feat/lazy-layers-splash-crash-fix's staticMeta.hasRowControls gating
  // (avoids force-resolving a not-yet-loaded lazy layer just to size a row)
  // was ported into that file's _renderToggles rather than reintroduced
  // here.
}

// Method groups live in manager*.js mixins; attached once at module load.
Object.assign(DataLayerManager.prototype, registrationMixin, updateMixin, paramsMixin, lifecycleQueriesMixin, delegatesMixin, subscriptionsMixin);

// Toggle-panel DOM rendering (build/refresh/row-controls/button-state) —
// see managerTogglePanel.js for the extraction rationale. Explicitly NOT
// the toggle/lifecycle-transition state machine above, which stays here
// (Wave 3 item #34 in the split plan — CLAUDE.md's own flagged
// highest-risk region).
Object.assign(DataLayerManager.prototype, managerTogglePanelMixin);
