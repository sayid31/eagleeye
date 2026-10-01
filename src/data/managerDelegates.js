// DataLayerManager thin delegates to per-layer methods (tracking, focus, context, detection).

export const delegatesMixin = {
// ---------------------------------------------------------------------
  // Cross-layer facade (lazy-loading refactor, plan §3.1).
  //
  // ui.js / gevActions.js / the CCTV+Radio panel mixins currently reach
  // directly into imported layer-module objects (and, in a few spots,
  // straight into `this.layers.get(id)?.module`) — a standing violation of
  // this project's own "layer logic never reaches into ui.js internals"
  // rule, and the reason every layer module is an unavoidable eager import
  // today. These methods are the single point every external caller is
  // being migrated to go through instead, in later, separately-verified
  // steps (see plan §3.8 steps 3-4).
  //
  // Added here BEHAVIOR-NEUTRAL and ADDITIVE ONLY: nothing calls these yet,
  // existing direct-module call sites are untouched. Every method looks up
  // the entry and returns a documented safe default if the entry/module/
  // method is missing (a layer that hasn't lazy-resolved yet must never
  // throw just because something asked about it), and catches
  // synchronously-thrown errors the same way `_rowControlsFor` already does
  // elsewhere in this file.
  // ---------------------------------------------------------------------

  /**
   * Generic layer-method dispatcher underlying every named facade method
   * below. Returns `fallback` (default `undefined`) when the layer or the
   * method is missing; never throws.
   * @param {string} layerId
   * @param {string} methodName
   * @param {Array} [args]
   * @param {{fallback?: *}} [options]
   */
  _callLayerMethod(layerId, methodName, args = [], { fallback = undefined } = {}) {
    const entry = this.layers.get(layerId);
    const module = entry?.module;
    if (!module || typeof module[methodName] !== 'function') return fallback;
    try {
      return module[methodName](...args);
    } catch (error) {
      console.warn(`[Data] ${layerId}.${methodName} error:`, error);
      return fallback;
    }
  },

/** Public escape hatch for one-off calls not worth individually naming. */
  callLayerMethod(layerId, methodName, ...args) {
    if (typeof methodName !== 'string') return undefined;
    return this._callLayerMethod(layerId, methodName, args);
  },

/**
   * Capability probe for callers that need to decide WHETHER to call a
   * layer method before actually calling it (e.g. gating on `trackById`
   * support) without reaching into `entry.module` directly. Mirrors
   * `_callLayerMethod`'s presence check but never invokes the method, so
   * it's safe to call on an unresolved lazy layer without forcing it to
   * load — returns false rather than resolving the module.
   */
  layerHasMethod(layerId, methodName) {
    const entry = this.layers.get(layerId);
    return typeof entry?.module?.[methodName] === 'function';
  },

getTrackedInfo(layerId) {
    return this._callLayerMethod(layerId, 'getTrackedInfo', [], { fallback: null }) || null;
  },

stopTracking(layerId, opts) {
    return this._callLayerMethod(layerId, 'stopTracking', opts !== undefined ? [opts] : []);
  },

/**
   * Distinct from this file's PRIVATE `cancelPendingLayerRestore` helper
   * (module-internal bookkeeping) and the PUBLIC `cancelPendingLayerRestore`
   * method below (per-layer restore-intent cancellation) — this wraps a
   * layer module's own `cancelPendingTrackingRestore()` method, called by
   * ui.js when a tracked-entity handoff needs to abandon an in-flight
   * source-side restore. Do not merge these three.
   */
  cancelPendingTrackingRestore(layerId, opts) {
    return this._callLayerMethod(layerId, 'cancelPendingTrackingRestore', opts !== undefined ? [opts] : []);
  },

refocusTrackedById(layerId, targetId) {
    return this._callLayerMethod(layerId, 'refocusTrackedById', [targetId], { fallback: false });
  },

clearSelection(layerId) {
    return this._callLayerMethod(layerId, 'clearSelection');
  },

releaseCameraOwnership(layerId, opts) {
    return this._callLayerMethod(layerId, 'releaseCameraOwnership', opts !== undefined ? [opts] : []);
  },

/** Implicitly layerId='military-awareness' — it's a coordinator ui.js calls far more than any peer layer. */
  getContextSnapshot() {
    return this._callLayerMethod('military-awareness', 'getContextSnapshot', [], { fallback: null }) || null;
  },

navigateNext(opts) {
    return this._callLayerMethod('military-awareness', 'navigateNext', opts !== undefined ? [opts] : []);
  },

focusTarget(...args) {
    return this._callLayerMethod('military-awareness', 'focusTarget', args);
  },

beginWorldJump(layerId) {
    return this._callLayerMethod(layerId, 'beginWorldJump');
  },

endWorldJump(layerId) {
    return this._callLayerMethod(layerId, 'endWorldJump');
  },

searchNearby(layerId) {
    return this._callLayerMethod(layerId, 'searchNearby');
  },

/** Raw getStats() passthrough — unlike getAll()'s per-row stats, NOT normalized. */
  getLayerStatsRaw(layerId) {
    return this._callLayerMethod(layerId, 'getStats', [], { fallback: null }) || null;
  },

focusCamera(layerId, cameraId, durationSec) {
    const args = durationSec !== undefined ? [cameraId, durationSec] : [cameraId];
    return this._callLayerMethod(layerId, 'focusCamera', args);
  },

/**
   * Subscribe to a layer's own change stream. If the layer hasn't
   * lazy-resolved yet, the callback is queued on the entry and flushed once
   * the module resolves (see `_ensureModuleResolved`) instead of being
   * silently dropped — always-visible surfaces (CCTV sync chip, radio
   * cockpit mini-player) depend on this firing regardless of whether the
   * user ever opened the layer's own panel.
   * @returns {() => void} Unsubscribe function, safe to call any time.
   */
  subscribeLayer(layerId, callback) {
    if (typeof callback !== 'function') return () => {};
    const entry = this.layers.get(layerId);
    if (!entry) return () => {};
    if (entry.module && typeof entry.module.subscribe === 'function') {
      return entry.module.subscribe(callback);
    }
    entry.pendingSubscribers = entry.pendingSubscribers || new Set();
    entry.pendingSubscribers.add(callback);
    return () => {
      entry.pendingSubscribers?.delete(callback);
      entry.resolvedSubscriberUnsubs?.get(callback)?.();
      entry.resolvedSubscriberUnsubs?.delete(callback);
    };
  },

getLayerUIState(layerId) {
    return this._callLayerMethod(layerId, 'getUIState', [], { fallback: null }) || null;
  },

endTuning(layerId) {
    return this._callLayerMethod(layerId, 'endTuning');
  },

getDetectableObjects(layerId, opts) {
    return this._callLayerMethod(
      layerId,
      'getDetectableObjects',
      opts !== undefined ? [opts] : [],
      { fallback: null },
    );
  },

/**
   * Static display name for a layer row — reads registration-time metadata,
   * never touches/resolves the module just to name it. Falls back to the
   * module's own `name` (pre-lazy-loading layers, or already-resolved ones)
   * and finally to the raw id.
   */
  getLayerDisplayName(layerId) {
    const entry = this.layers.get(layerId);
    return entry?.staticMeta?.name || entry?.module?.name || layerId;
  },
};

