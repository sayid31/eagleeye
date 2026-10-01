// DataLayerManager periodic update loop, manual refresh and tracking-target resolution.
import { governorRequestRender } from '../renderGovernor.js';
import { isAbortError, lifecycleRejectedError, refreshFailureFromStats } from './managerFeedState.js';
import { markDetectionSourcesChanged } from './detection.js';

export const updateMixin = {
_invalidateRefresh(layerId, entry, reason = 'invalidated') {
    const wasRefreshing = entry.refreshing;
    const refreshEpoch = entry.refreshEpoch;
    entry.refreshEpoch += 1;
    entry.refreshing = false;
    if (wasRefreshing) {
      this._refreshTogglePanel();
      this._notifyListeners({
        type: 'refresh-cancelled',
        layerId,
        enabled: entry.enabled,
        refreshEpoch,
        reason,
      });
    }
  },

async _runPeriodicUpdate(layerId, entry, { signal = null } = {}) {
    if (
      !entry.enabled
      || entry.lifecycleState !== 'enabled'
      || entry.destroying
      || entry.refreshing
      || signal?.aborted
    ) return false;
    const refreshEpoch = ++entry.refreshEpoch;
    entry.refreshing = true;
    this._refreshTogglePanel();
    this._notifyListeners({
      type: 'refresh-transition',
      layerId,
      enabled: true,
      refreshEpoch,
    });

    let result;
    let failure = null;
    try {
      result = await entry.module.update(this.viewer, { signal });
      // Poll-tick entity refreshes don't auto-render in idle mode. Fires on
      // any non-throwing update — a rejected/partial refresh may still have
      // mutated scene state. (perf wave 2; moved into _runPeriodicUpdate
      // when main normalized the update loop behind _armUpdateLoop)
      governorRequestRender(`layer-tick:${layerId}`);
      // A poll tick can REPLACE what a layer exposes as detectable. Detection
      // pulls that set per paint but re-solves on a private throttle, so the one
      // frame requested above could be spent on a paint that declines to
      // re-solve — leaving the previous contact labelled and the new one not,
      // with nothing left to ask for another frame. (perf wave 2 follow-up)
      markDetectionSourcesChanged(`layer-tick:${layerId}`);
      if (result === false) failure = lifecycleRejectedError(layerId, 'refresh');
      if (!failure) failure = refreshFailureFromStats(this._moduleStats(entry), entry.module.name || layerId);
    } catch (error) {
      failure = error;
    }

    if (signal?.aborted) {
      if (
        this.layers.get(layerId) === entry
        && !entry.destroying
        && entry.enabled
        && entry.refreshEpoch === refreshEpoch
      ) {
        entry.refreshing = false;
        entry.managerRefreshError = null;
        this._refreshTogglePanel();
        this._notifyListeners({
          type: 'refresh-cancelled',
          layerId,
          enabled: true,
          refreshEpoch,
        });
      }
      return false;
    }

    if (
      this.layers.get(layerId) !== entry
      || entry.destroying
      || !entry.enabled
      || entry.refreshEpoch !== refreshEpoch
    ) {
      return false;
    }

    entry.refreshing = false;
    entry.managerRefreshError = failure ? String(failure.message || failure) : null;
    this._refreshTogglePanel();
    if (failure) {
      console.warn(`[Data] ${layerId} refresh error:`, failure);
      this._notifyListeners({
        type: 'refresh-failed',
        layerId,
        enabled: true,
        refreshEpoch,
        phase: 'refresh',
        error: failure,
      });
      return false;
    }
    this._notifyListeners({
      type: 'refresh',
      layerId,
      enabled: true,
      refreshEpoch,
    });
    return result !== false;
  },

/**
   * Request one fresh update for an already-enabled layer. If the periodic
   * loop currently owns a refresh, wait for it to settle and then run a new
   * update so viewport-dependent callers do not reuse work started for the
   * prior camera location.
   * @param {string} layerId Registered layer id.
   * @param {object} [options] Refresh authority.
   * @param {AbortSignal|null} [options.signal] Caller cancellation authority.
   * @returns {Promise<boolean>} True only when the requested fresh update settles successfully.
   */
  async refreshLayer(layerId, { signal = null } = {}) {
    const entry = this.layers.get(layerId);
    if (
      !entry
      || !entry.enabled
      || entry.lifecycleState !== 'enabled'
      || entry.destroying
      || signal?.aborted
    ) return false;

    if (entry.refreshing) {
      const settled = await new Promise((resolve) => {
        let done = false;
        const finish = (value) => {
          if (done) return;
          done = true;
          unsubscribe();
          signal?.removeEventListener?.('abort', onAbort);
          resolve(value);
        };
        const onAbort = () => finish(false);
        const unsubscribe = this.subscribe((change) => {
          if (
            change?.layerId === layerId
            && ['refresh', 'refresh-failed', 'refresh-cancelled'].includes(change.type)
          ) {
            finish(true);
          }
        });
        signal?.addEventListener?.('abort', onAbort, { once: true });
        queueMicrotask(() => {
          if (!entry.refreshing) finish(true);
        });
      });
      if (
        !settled
        || signal?.aborted
        || this.layers.get(layerId) !== entry
        || !entry.enabled
        || entry.lifecycleState !== 'enabled'
        || entry.destroying
      ) return false;
    }

    return this._runPeriodicUpdate(layerId, entry, { signal });
  },

/**
   * Refresh one enabled tracked layer at the destination, then let that layer
   * decide whether the requested ID was present in an authoritative snapshot.
   * Lifecycle success alone is deliberately insufficient for this decision.
   */
  async resolveLayerTrackingTarget(layerId, targetId, {
    signal = null,
    origin = 'share-restore',
  } = {}) {
    const entry = this.layers.get(layerId);
    const base = {
      layerId,
      targetId,
      origin,
      refreshSucceeded: false,
    };
    if (!entry || !entry.enabled || entry.destroying) {
      return { ...base, status: 'unavailable', reason: 'layer-unavailable' };
    }
    // No separate _ensureModuleResolved call needed here: entry.enabled can
    // only become true via _doToggle's enable branch, which now resolves a
    // lazy module before any lifecycle work runs — so entry.module is
    // guaranteed non-null whenever entry.enabled is true.
    if (typeof entry.module?.resolveTrackingRestoreTarget !== 'function') {
      return { ...base, status: 'unsupported', reason: 'tracking-restore-unsupported' };
    }
    if (signal?.aborted) {
      return { ...base, status: 'cancelled', reason: String(signal.reason || 'aborted') };
    }

    const refreshSucceeded = await this.refreshLayer(layerId, { signal });
    if (signal?.aborted) {
      return {
        ...base,
        refreshSucceeded,
        status: 'cancelled',
        reason: String(signal.reason || 'aborted'),
      };
    }
    if (this.layers.get(layerId) !== entry || entry.destroying || !entry.enabled) {
      return {
        ...base,
        refreshSucceeded,
        status: 'destroyed',
        reason: 'layer-destroyed',
      };
    }

    try {
      const resolution = await entry.module.resolveTrackingRestoreTarget(targetId, {
        signal,
        origin,
        refreshSucceeded,
      });
      if (signal?.aborted) {
        return {
          ...base,
          refreshSucceeded,
          status: 'cancelled',
          reason: String(signal.reason || 'aborted'),
        };
      }
      const status = [
        'found', 'missing', 'source-unavailable', 'cancelled', 'superseded', 'destroyed',
      ].includes(resolution?.status)
        ? resolution.status
        : 'source-unavailable';
      return { ...base, refreshSucceeded, ...resolution, status };
    } catch (error) {
      if (signal?.aborted || isAbortError(error)) {
        return {
          ...base,
          refreshSucceeded,
          status: 'cancelled',
          reason: String(signal?.reason || error?.message || 'aborted'),
          errorClass: 'AbortError',
        };
      }
      return {
        ...base,
        refreshSucceeded,
        status: 'source-unavailable',
        reason: String(error?.message || error),
        errorClass: error?.name || 'Error',
      };
    }
  },

_armUpdateLoop(layerId, entry) {
    const configuredRefreshInterval = Number(entry.module.refreshInterval);
    const updateInterval = Number(entry.module.updateInterval);
    const refreshInterval = configuredRefreshInterval > 0
      ? configuredRefreshInterval
      : (updateInterval > 0 ? updateInterval : 0);
    if (refreshInterval > 0) {
      entry.intervalId = setInterval(() => {
        void this._runPeriodicUpdate(layerId, entry);
      }, refreshInterval);
    } else if (updateInterval === 0) {
      entry.intervalId = setInterval(() => {
        if (!entry.enabled) return;
        this._refreshTogglePanel();
      }, entry.module.statsRefreshInterval || 1000);
    }
  },
};

