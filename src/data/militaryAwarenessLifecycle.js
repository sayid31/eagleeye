// Moved out of militaryAwareness.js (militaryAwarenessLifecycle).

import { awarenessClearIsEviction, awarenessClearMatchesSubject, contextTargetFlyToAllowed } from './militaryAwarenessPredicates.js';
import { releaseContinuousRender } from '../renderGovernor.js';
import { AWARENESS_RADIUS_M } from './militaryAwarenessEngine.js';
import flightsLayer from './flights.js';
import militaryFlightsLayer from './militaryFlights.js';
import aisLiveVesselsLayer from './aisLiveVessels.js';
import { state } from './militaryAwarenessConstants.js';
import { activateOperationalContext, attachRuntimeListeners, detachRuntimeListeners, releaseAircraftTracking, releaseOwnedDependencies } from './militaryAwarenessDependencies.js';
import { navigationState, subjectKey } from './militaryAwarenessNavigation.js';
import { clearVisual } from './militaryAwarenessOverlay.js';
import { ensurePanel, hidePanel, startAwarenessPageRotation, stopAwarenessPageRotation } from './militaryAwarenessPanel.js';
import { buildAwarenessContextSnapshot } from './militaryAwarenessSources.js';
import { clearAwarenessSubject, markSubjectEvicted, selectSubject, subjectFromContext } from './militaryAwarenessSubject.js';

export function initAwarenessLayer(viewer) {
    detachRuntimeListeners();
    state.viewer = viewer;
    state.subjectListener = (event) => {
      if (!state.enabled) return;
      selectSubject(event.detail);
    };
    state.contextListener = (event) => {
      if (!state.enabled) return;
      const subject = subjectFromContext(event.detail);
      if (!subject) return;
      if (contextTargetFlyToAllowed(subject.layerId)) releaseAircraftTracking();
      selectSubject(subject);
    };
    state.clearListener = (event) => {
      if (!state.enabled || state.pendingSelectionKey) return;
      if (!awarenessClearMatchesSubject(state.subject, event.detail)) return;
      // An eviction keeps the subject so the readout can hold last-known
      // values; only a deliberate clear tears the selection down.
      if (awarenessClearIsEviction(event.detail)) {
        markSubjectEvicted();
        return;
      }
      clearAwarenessSubject();
    };
    state.subjectClearListener = (event) => {
      if (!state.enabled) return;
      const cleared = event.detail;
      if (state.pendingSelectionKey) return;
      if (
        awarenessClearMatchesSubject(state.subject, cleared)
        && String(state.subject?.id) === String(cleared?.id)
      ) {
        if (awarenessClearIsEviction(cleared)) {
          // Deliberately does NOT set autoFocusAttempted: the subject survives,
          // so the entry fallback has nothing to replace and the settlement
          // guard below stays scoped to real deselects.
          markSubjectEvicted();
          return;
        }
        // A deliberate clear during dependency settlement must win over the
        // entry fallback; otherwise Contacts can silently select a replacement.
        state.autoFocusAttempted = true;
        clearAwarenessSubject();
      }
    };
  }

export function enableAwarenessLayer() {
    state.enabled = true;
    // NO unconditional continuous-render hold here. Contacts animates per frame
    // only while the VIEW is moving (the direction arrows are screen-projected);
    // parked, it is a throttled readout with nothing to animate. The hold is
    // taken and released per frame by syncAwarenessRenderHold().
    attachRuntimeListeners();
    startAwarenessPageRotation();
    state.autoFocusAttempted = false;
    state.autoFocusRetryPending = false;
    ensurePanel();
    hidePanel();
    if (!state.passive) return activateOperationalContext();
    return true;
  }

export function disableAwarenessLayer() {
    state.enabled = false;
    releaseContinuousRender('military-awareness');
    detachRuntimeListeners();
    stopAwarenessPageRotation();
    state.cohortPages.clear();
    const releaseActivationId = ++state.activationId;
    state.autoFocusAttempted = false;
    state.autoFocusRetryPending = false;
    state.subject = null;
    state.results = null;
    state.lastSubjectRefreshMs = 0;
    state.lastEvaluatedPosition = null;
    state.sourceRevision = '';
    state.navigationHistory = [];
    state.navigationVisited.clear();
    state.navigationIndex = -1;
    state.suppressedHistoryKey = null;
    state.pendingSelectionKey = null;
    clearVisual();
    hidePanel();
    // The manager must not publish this coordinator as settled OFF while its
    // owned dependency releases are still issuing newer absolute intents.
    // Context mode handoffs restore the pre-entry snapshot only after this
    // promise resolves, preventing those releases from superseding restore.
    state.passive = true;
    return releaseOwnedDependencies(releaseActivationId);
  }

export function getAwarenessContextSnapshot() {
    if (!state.enabled || !state.subject) return null;
    if (!state.results) {
      return buildAwarenessContextSnapshot({
        subject: { ...state.subject },
        evaluatedAt: null,
        radiusM: AWARENESS_RADIUS_M,
        cohorts: [],
      }, navigationState(), {
        subjectPresent: !state.subjectMissing,
      });
    }
    return buildAwarenessContextSnapshot(state.results, navigationState(), {
      subjectPresent: !state.subjectMissing,
    });
  }

export function releaseAwarenessCameraOwnership({ preserveVesselSelection = false, origin = 'programmatic' } = {}) {
    ++state.activationId;
    state.autoFocusAttempted = true;
    state.autoFocusRetryPending = false;

    const preservedSelectionKey = subjectKey(state.subject) || 'camera-release';
    state.pendingSelectionKey = preservedSelectionKey;
    try {
      flightsLayer.stopTracking?.({ origin });
      militaryFlightsLayer.stopTracking?.({ origin });
      if (!preserveVesselSelection) aisLiveVesselsLayer.clearSelection?.();
    } finally {
      if (state.pendingSelectionKey === preservedSelectionKey) {
        state.pendingSelectionKey = null;
      }
    }
    return Boolean(state.subject);
  }
