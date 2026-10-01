// Moved out of aisLiveVessels.js (aisLiveVesselsLifecycle).

import { VESSEL_OVERLAY_SOURCE_ID } from './vesselLabels.js';
import { restoreSpriteOrder, restoreSpriteOrderOnEnable } from './spriteOrder.js';
import { ensureGeoidReady } from './geoid.js';
import { registerPickOwner, unregisterPickOwner } from './pickRegistry.js';
import { releaseContinuousRender } from '../renderGovernor.js';
import { AIS_FIRST_CONNECT_LABEL, state } from './aisLiveVesselsConstants.js';
import { clearVesselInspection, installInteraction, removeVesselInteraction } from './aisLiveVesselsInteraction.js';
import { ensureCollections, installRuntime } from './aisLiveVesselsRecords.js';
import { resetState } from './aisLiveVesselsReset.js';
import { aisRetryInSec, beginAisSession, invalidateAisSession, loadLivePositions } from './aisLiveVesselsSession.js';
import { S } from './aisLiveVesselsState.js';
import { destroySelectedVesselTrail, refloorVesselRecords } from './aisLiveVesselsTrail.js';
import { setVisible, syncAisRenderHold } from './aisLiveVesselsVisibility.js';

export function initAisLayer(viewer) {
    state.viewer = viewer;
    ensureCollections(viewer);
    S._vesselOverlayHost.setVisible(VESSEL_OVERLAY_SOURCE_ID, false);
    installInteraction(viewer);
    installRuntime(viewer);
    restoreSpriteOrder(viewer);
  }

export function enableAisLayer(viewer) {
    const wasEnabled = state.enabled;
    state.enabled = true;
    if (!wasEnabled) beginAisSession();
    // Conditional render hold (perf wave 3): held only while a vessel is
    // focused/mid-transition, not for the layer's whole enabled lifetime —
    // see syncAisRenderHold(). Sync once immediately so a layer enabled with
    // something already focused doesn't wait a tick to hold.
    syncAisRenderHold();
    const activeViewer = viewer || state.viewer;
    ensureCollections(activeViewer);
    installInteraction(activeViewer);
    setVisible(true);
    // Height-datum fix: warm the geoid grid once per layer-enable, never
    // blocking a poll. The first refresh may land pre-resolve (N = 0), and
    // the next is up to 60 s out — so re-floor in place on resolve. A load
    // failure leaves N = 0 forever, which is safe: sprites are depth-test-
    // free, so vessels stay visible either way.
    if (!S._geoidReady) {
      ensureGeoidReady()
        .then(() => {
          S._geoidReady = true;
          refloorVesselRecords();
        })
        .catch(() => { /* grid failed to load — anchors stay at ellipsoid 0 */ });
    }
    // Pick-ownership (H2): vessel picks carry the record OBJECT as their id;
    // the registry resolver reduces it to the record's mmsi (a string key).
    registerPickOwner('ais-live-vessels', (pickedId) => state.vesselMap.has(pickedId));
    restoreSpriteOrderOnEnable('ais', activeViewer);
    return loadLivePositions(activeViewer);
  }

export function disableAisLayer() {
    state.enabled = false;
    invalidateAisSession();
    releaseContinuousRender('ais-vessels'); // hard backstop — updateVisibility() stops running once disabled
    unregisterPickOwner('ais-live-vessels');
    setVisible(false);
    S._vesselOverlayHost.clearSource(VESSEL_OVERLAY_SOURCE_ID);
    clearVesselInspection();
    destroySelectedVesselTrail();
    removeVesselInteraction();
    if (state.abort) {
      state.abort.abort();
      state.abort = null;
    }
    state.loading = false;
    state.loadingLabel = '';
  }

export function updateAisLayer(viewer) {
    if (!state.enabled) return Promise.resolve();
    return loadLivePositions(viewer || state.viewer);
  }

export function destroyAisLayer(viewer) {
    invalidateAisSession();
    releaseContinuousRender('ais-vessels'); // direct-destroy path (perf wave 2 fix)
    if (state.abort) state.abort.abort();
    unregisterPickOwner('ais-live-vessels');
    clearVesselInspection();
    destroySelectedVesselTrail();
    if (state.billboardCollection && viewer) {
      viewer.scene.primitives.remove(state.billboardCollection);
    }
    S._vesselOverlayHost.clearSource(VESSEL_OVERLAY_SOURCE_ID);
    S._vesselOverlayHost.setVisible(VESSEL_OVERLAY_SOURCE_ID, false);
    removeVesselInteraction();
    if (state.preRenderRemover) {
      state.preRenderRemover();
    }
    resetState();
  }

export function getAisStats() {
    const waitingForFirstPosition = state.firstConnectPhase === 'loading';
    return {
      count: state.count,
      lastUpdate: state.lastUpdate,
      loading: state.loading || waitingForFirstPosition,
      loadingLabel: waitingForFirstPosition
        ? AIS_FIRST_CONNECT_LABEL
        : state.loadingLabel,
      error: state.error,
      stale: state.stale,
      status: state.firstConnectPhase === 'unavailable' ? 'unavailable' : undefined,
      transportStatus: state.transportStatus,
      lastMessageAt: state.lastMessageAt,
      rawRowCount: state.rawRowCount,
      acceptedRowCount: state.acceptedRowCount,
      // Same chip affordance the flights layer uses: when the server is
      // backing off, say how long until the next attempt instead of leaving
      // the user to guess whether anything is still happening.
      retryInSec: aisRetryInSec(),
    };
  }
