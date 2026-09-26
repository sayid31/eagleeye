/**
 * `DataLayerManager` feed-state helpers — extracted from `manager.js` (Wave 1
 * split #17) because every function here takes its inputs as explicit
 * parameters and never closes over `DataLayerManager` instance state
 * (`this.layers`, `this._listeners`, etc.). That's the same purity bar used
 * for every other Wave 1 extraction in this program (see
 * `militaryAwarenessPredicates.js`, `satelliteTleLookup.js`,
 * `radioTunerMath.js` for the precedent).
 *
 * `layerFeedState` in particular is CLAUDE.md's own cited canonical example
 * of "layer logic never reaches into ui.js internals directly; it exposes
 * getStats()/state that the UI reads" — this file is the honest home for
 * that normalization logic, not `manager.js`'s toggle/lifecycle machinery.
 *
 * `cancelPendingRestoreIntent` below is the former module-level free
 * function named `cancelPendingLayerRestore` in `manager.js`. It's renamed
 * on the move: `manager.js` also has a *class method* of the exact same
 * name (`DataLayerManager.prototype.cancelPendingLayerRestore`, a distinct,
 * differently-shaped public API that takes a `layerId` string and resolves
 * the layer entry itself) — keeping both alive under an identical bare name
 * in two different files was confusing pre-existing debt this split
 * surfaces rather than creates; renaming the moved one removes the
 * ambiguity for any future reader without touching the class method's
 * public signature at all.
 */

/** Deep-clone a plain JSON-shaped params object/array; primitives pass through. */
export function cloneLayerParams(value) {
  if (Array.isArray(value)) return value.map(cloneLayerParams);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, nested]) => [key, cloneLayerParams(nested)]),
    );
  }
  return value;
}

/** Feed-state → toggle-panel button label. */
export const FEED_STATE_LABELS = Object.freeze({
  nominal: 'ON',
  loading: 'LOADING',
  degraded: 'DEGRADED',
  stale: 'STALE',
  fallback: 'FALLBACK',
  unavailable: 'UNAVAILABLE',
});

export function isAbortError(error) {
  return error?.name === 'AbortError';
}

export function lifecycleRejectedError(layerId, phase) {
  const error = new Error(`[Data] ${layerId} ${phase} rejected the lifecycle transition`);
  error.name = 'LifecycleRejectedError';
  return error;
}

export function paramsRejectedError(layerId) {
  const error = new Error(`[Data] ${layerId} rejected layer parameters`);
  error.name = 'LayerParamsRejectedError';
  return error;
}

export function isExplicitLayerIntentOrigin(origin) {
  return origin === 'user' || origin === 'voice' || origin === 'tool';
}

/**
 * Cancel a layer module's own pending restore, but only for an explicit
 * (user/voice/tool) intent origin — a programmatic intent should never
 * cancel a restore the module is quietly running on its own behalf.
 * Renamed from `manager.js`'s former module-level `cancelPendingLayerRestore`
 * free function; see file header for why.
 * @param {object} entry Registered layer entry (`{ module, ... }`).
 * @param {string} origin Intent origin ('user'|'voice'|'tool'|'programmatic'|...).
 * @param {string} reason Cancellation reason passed through to the module.
 * @returns {void}
 */
export function cancelPendingRestoreIntent(entry, origin, reason) {
  if (!isExplicitLayerIntentOrigin(origin)) return;
  try {
    (entry.module?.cancelPendingRestore || entry.module?.cancelPendingTrackingRestore)?.({ origin, reason });
  } catch (error) {
    console.warn(`[Data] ${entry.module?.id || 'layer'} pending restore cancellation error:`, error);
  }
}

export function refreshFailureFromStats(stats, label) {
  const specific = stats?.error || stats?.lastError;
  if (specific) return specific instanceof Error ? specific : new Error(String(specific));
  if (stats?.unavailable === true || stats?.available === false) {
    return new Error(`${label} refresh unavailable`);
  }
  return null;
}

/**
 * Normalize heterogeneous layer stats into one honest control-chip state.
 * @param {object|null} stats Layer getStats() result.
 * @returns {'nominal'|'loading'|'degraded'|'stale'|'fallback'|'unavailable'} Feed state.
 */
export function layerFeedState(stats = {}) {
  const state = stats || {};
  const status = typeof state.status === 'string' ? state.status.toLowerCase() : '';
  const source = `${state.source || ''} ${state.coverage || ''}`;
  const hasExplicitFallback = typeof state.fallback === 'boolean';
  const hasPriorData = Number(state.count) > 0 || Boolean(state.lastUpdate);
  const presentedError = state.error || state.lastError || state.managerRefreshError;
  if (['unavailable', 'offline', 'down', 'error'].includes(status)) return 'unavailable';
  if (
    (presentedError || state.unavailable === true || state.available === false)
    && !hasPriorData
    && !['zoom-in', 'empty', 'idle'].includes(status)
  ) {
    return 'unavailable';
  }
  if (state.loading) return 'loading';
  // Guidance states ask the user to act (zoom in, run a search) — normal
  // operation, not feed faults. One honesty carve-out: layers keep their
  // rendered records through the guidance state, so a genuinely stale cache
  // still reads STALE; a guidance prompt alone never reads DEGRADED.
  if (['zoom-in', 'empty', 'idle'].includes(status)) {
    return state.stale ? 'stale' : 'nominal';
  }
  if (
    state.fallback === true
    || status === 'fallback'
    || state.mode === 'sim'
    || /\bfallback\b/i.test(source)
    || (!hasExplicitFallback && /\badsb\.lol\b/i.test(source))
  ) {
    return 'fallback';
  }
  if (state.stale || status === 'stale') return 'stale';
  if (
    state.degraded
    || presentedError
    || state.unavailable === true
    || state.available === false
  ) return 'degraded';
  return 'nominal';
}
