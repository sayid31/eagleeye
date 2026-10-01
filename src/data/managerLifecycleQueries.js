// DataLayerManager layer teardown and lifecycle state queries.
import { SUPERSEDED_VISIBILITY_INTENT } from './managerConstants.js';
import { lifecycleRejectedError } from './managerFeedState.js';

export const lifecycleQueriesMixin = {
/**
   * Destroy a single layer — calls its destroy() method if it has one,
   * then removes it from the manager. This is the proper cleanup path
   * that was previously missing.
   */
  async destroyLayer(layerId) {
    const entry = this.layers.get(layerId);
    if (!entry || entry.destroying) return false;
    entry.destroying = true;
    this._invalidateRefresh(layerId, entry, 'layer-destroyed');
    // Teardown becomes authoritative before the first await. Advancing the
    // intent epoch and aborting active work prevents a pending enable/update
    // from publishing a settled ON while the layer is being destroyed. The
    // synthetic successor metadata also lets Context restore rather than adopt.
    const teardownIntentEpoch = ++entry.visibilityIntentEpoch;
    entry.visibilityIntentEnabled = false;
    entry.visibilityIntentOrigin = 'teardown';
    entry.latestQueuedAbsoluteIntent = { intentEpoch: teardownIntentEpoch, enabled: false };
    entry.clearVisibilityReservation = null;
    entry.activeVisibilityIntent?.controller.abort(SUPERSEDED_VISIBILITY_INTENT);
    entry.paramsIntentEpoch += 1;
    entry.paramsIntentOrigin = 'teardown';
    await entry.toggleChain.catch(() => {});
    // Let focused UI modes restore their exact pre-session state before any
    // dependency is irreversibly removed. The intent revocation above makes
    // this callback safe to run before the old queue drains.
    for (const callback of this._beforeDestroyListeners) {
      try {
        await callback({ type: 'before-destroy', layerId });
      } catch (error) {
        console.warn('[Data] before-destroy listener error:', error);
      }
    }
    await entry.toggleChain.catch(() => {});
    if (this.layers.get(layerId) !== entry) return false;
    entry.latestQueuedAbsoluteIntent = null;
    if (entry.enabled) {
      try {
        const disabled = await entry.module.disable(this.viewer);
        if (disabled === false) throw lifecycleRejectedError(layerId, 'destroy-disable');
      } catch (e) {
        console.warn(`[Data] ${layerId} disable error:`, e);
        entry.destroying = false;
        entry.visibilityIntentEnabled = entry.enabled;
        this._settleLifecycle(entry);
        this._refreshTogglePanel();
        return false;
      }
      if (entry.intervalId) {
        clearInterval(entry.intervalId);
        entry.intervalId = null;
      }
      entry.enabled = false;
    }
    if (typeof entry.module.destroy === 'function') {
      try {
        const destroyed = await entry.module.destroy(this.viewer);
        if (destroyed === false) throw lifecycleRejectedError(layerId, 'destroy');
      } catch (e) {
        console.warn(`[Data] ${layerId} destroy error:`, e);
        entry.destroying = false;
        entry.visibilityIntentEnabled = entry.enabled;
        this._settleLifecycle(entry);
        this._refreshTogglePanel();
        return false;
      }
    }
    this.layers.delete(layerId);
    this._qaLayerIds.delete(layerId);
    return true;
  },

/**
   * Destroy all layers and clear the manager.
   * Should be called when the viewer is being torn down.
   */
  async destroyAll() {
    for (const layerId of [...this.layers.keys()]) {
      await this.destroyLayer(layerId);
    }
  },

isEnabled(layerId) {
    const entry = this.layers.get(layerId);
    return entry ? entry.enabled : false;
  },

/** Return authoritative settled visibility and the current lifecycle phase. */
  getLayerLifecycleState(layerId) {
    const entry = this.layers.get(layerId);
    if (!entry) return null;
    return Object.freeze({
      enabled: entry.enabled,
      lifecycleState: entry.lifecycleState,
      uncertain: entry.lifecycleUncertain,
    });
  },

getAll() {
    const result = [];
    for (const [id, entry] of this.layers) {
      // Reads entry.staticMeta (registration-time metadata), not
      // entry.module — uniform for both eager and not-yet-resolved lazy
      // layers, so listing layers never force-resolves a lazy module just
      // to name it (plan §3.7).
      const meta = entry.staticMeta;
      result.push({
        id,
        name: meta.name,
        icon: meta.icon,
        source: meta.source,
        showInTogglePanel: meta.showInTogglePanel,
        enabled: entry.enabled,
        lifecycleState: entry.lifecycleState,
        lifecycleUncertain: entry.lifecycleUncertain,
        stats: this._normalizedStats(entry),
      });
    }
    return result;
  },
};

