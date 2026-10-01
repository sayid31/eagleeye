import { aircraftClassMatchesFilter, awarenessClearIsEviction, awarenessClearMatchesSubject, awarenessRefreshDecision, awarenessRefreshIntervalMs, awarenessRefreshRequired, awarenessResultsAreLive, canNavigateAwarenessNext, contextTargetFlyToAllowed, findCompatibleHistoryIndex, historySubjectSnapshot, isFlightLayer } from './militaryAwarenessPredicates.js';
import { LAYER_METADATA } from './layerMetadata.js';
import { state } from './militaryAwarenessConstants.js';
import { activateOperationalContext, detachRuntimeListeners } from './militaryAwarenessDependencies.js';
import { disableAwarenessLayer, enableAwarenessLayer, getAwarenessContextSnapshot, initAwarenessLayer, releaseAwarenessCameraOwnership } from './militaryAwarenessLifecycle.js';
import { focusCurrentSubject, navigateHistory, requestFocus } from './militaryAwarenessNavigation.js';
import { refreshSelectedSubject } from './militaryAwarenessSubject.js';

export { AWARENESS_QUERY_LIMIT } from './militaryAwarenessConstants.js';
export { _getAwarenessNavigationStateForTest } from './militaryAwarenessNavigation.js';
export { buildAwarenessContextSnapshot, collectAircraftProximityWindow, contactsWindowFromSnapshot, summarizeInstallationViewport } from './militaryAwarenessSources.js';
export { awarenessNeedsContinuousRender } from './militaryAwarenessSubject.js';

export {
  aircraftClassMatchesFilter,
  awarenessClearIsEviction,
  awarenessClearMatchesSubject,
  awarenessRefreshDecision,
  awarenessRefreshIntervalMs,
  awarenessRefreshRequired,
  awarenessResultsAreLive,
  canNavigateAwarenessNext,
  contextTargetFlyToAllowed,
  findCompatibleHistoryIndex,
  historySubjectSnapshot,
  isFlightLayer,
};

const militaryAwarenessLayer = {
  ...LAYER_METADATA['military-awareness'],
  updateInterval: 0,
  statsRefreshInterval: 1000,
  attachDataManager(dataManager) { state.dataManager = dataManager; },
  setParams(params = {}) {
    if (typeof params.passive !== 'boolean') return;
    const wasPassive = state.passive;
    state.passive = params.passive;
    if (state.enabled && wasPassive && !state.passive) activateOperationalContext();
  },
  /** @returns {{ passive: boolean }} Current runtime parameters. */
  getParams() {
    return { passive: state.passive };
  },
  init: initAwarenessLayer,
  enable: enableAwarenessLayer,
  disable: disableAwarenessLayer,
  update() {
    refreshSelectedSubject();
    return Promise.resolve();
  },
  destroy() {
    this.disable();
    detachRuntimeListeners();
    state.panel?.removeEventListener('click', state.panelClickListener);
    state.panelClickListener = null;
    if (state.panelOwned) state.panel?.remove();
    else if (state.panel) state.panel.replaceChildren();
    state.panel = null;
    state.panelOwned = false;
    state.directionRoot?.remove();
    state.directionRoot = null;
    state.compassRing = null;
    state.compassLabels = [];
    state.compassHeading = null;
    state.directionMarkers = [];
    state.panelMarkup = '';
    state.subjectListener = null;
    state.contextListener = null;
    state.clearListener = null;
    state.subjectClearListener = null;
    state.viewer = null;
    state.dataManager = null;
  },
  getStats() {
    return { count: state.results ? 1 : 0, lastUpdate: state.results?.evaluatedAt || null, stale: false, error: null, status: state.enabled ? 'ready' : 'idle' };
  },
  /** Return the latest read-only context result for compact HUD consumers. */
  getContextSnapshot: getAwarenessContextSnapshot,
  /**
   * Release Contact-owned camera tracking without discarding the selected
   * subject. Reset-to-globe uses this route so the normal Context FOCUS action
   * can explicitly return to the same contact, while delayed activation work
   * cannot silently reclaim the camera after the reset.
   * @returns {boolean} Whether a Contact subject remains selected.
   */
  releaseCameraOwnership: releaseAwarenessCameraOwnership,
  navigatePrevious(options = {}) { return navigateHistory(-1, options); },
  focusCurrent(options = {}) { return focusCurrentSubject(options); },
  navigateNext(options = {}) { return navigateHistory(1, options); },
  /** Select a context target through its owning layer's established tracker. */
  focusTarget(layerId, id, options = {}) { return requestFocus(layerId, id, false, options); },
};

export default militaryAwarenessLayer;
