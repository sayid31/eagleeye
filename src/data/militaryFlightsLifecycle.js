// Moved out of militaryFlights.js (militaryFlightsLifecycle).

import { clearFocusTarget } from './focusDeemphasis.js';
import * as Cesium from 'cesium';
import { registerSpriteCollection, restoreSpriteOrder } from './spriteOrder.js';
import { holdContinuousRender, releaseContinuousRender } from '../renderGovernor.js';
import { ensureGeoidReady } from './geoid.js';
import { registerPickOwner, unregisterPickOwner } from './pickRegistry.js';
import { setMilitaryLayerActive } from './militaryRegistry.js';
import { _abortActiveUpdates } from './militaryFlightsApi.js';
import { _installClickHandler, _onKeyDown } from './militaryFlightsClick.js';
import { _applyCockpitState, _setCockpitContactMode } from './militaryFlightsCockpit.js';
import { JET_MODEL_URL, _groundSnap } from './militaryFlightsConstants.js';
import { _releaseModels } from './militaryFlightsFleetModels.js';
import { _fleetTick } from './militaryFlightsFleetTick.js';
import { S, _displayCourse, _modelGen, _modelPending } from './militaryFlightsState.js';
import { _resetTrackedSelectionState, _updateTrackedModel } from './militaryFlightsTrackedModel.js';
import { _cancelPendingTrackingRestore, _clearTracking } from './militaryFlightsTracking.js';
import { _destroyTrail } from './militaryFlightsTrail.js';

export function initMilitaryFlightsLayer(viewer) {
    clearFocusTarget('militaryFlights');
    S._viewer = viewer;
    S._billboardCollection = new Cesium.BillboardCollection();
    viewer.scene.primitives.add(S._billboardCollection);
    registerSpriteCollection('military', S._billboardCollection);
    S._modelCollection = new Cesium.PrimitiveCollection();
    viewer.scene.primitives.add(S._modelCollection);
    // Warm the glTF cache so the tracked plane's model instantiates instantly when first needed
    // (keeps the retained instance referenced; never rendered). Captured against this epoch so a
    // destroy/re-init mid-load doesn't flip the flag for a torn-down lifecycle.
    if (!S._preloadModel) {
      const epoch = S._modelEpoch;
      Cesium.Model.fromGltfAsync({ url: JET_MODEL_URL, asynchronous: false })
        .then((m) => {
          if (epoch === S._modelEpoch) { S._preloadModel = m; S._planeModelLoaded = true; }
          else { try { m.destroy(); } catch { /* gone */ } }
        })
        .catch(() => { /* tracked plane just stays a billboard a beat longer */ });
    }
    S._billboards = new Map();
    S._detectionObjects = new Map();
    S._flightData = new Map();
    S._positionHistory = new Map();
    _displayCourse.clear();
    _groundSnap.clear();
    S._count = 0;
    S._lastUpdate = null;
    S._backoff = false;
    S._retryAt = 0;
    S._lastError = null;
    S._lastStatus = null;
    S._trackedIcao = null;
    _resetTrackedSelectionState();
    S._trackedEntity = null;
    S._cockpitSubjectId = null;
    S._cockpitContactMode = document.body.classList.contains('cockpit-mode');
    S._cockpitNearContacts = new Set();
    if (!S._cockpitModeListener) {
      S._cockpitModeListener = (event) => _applyCockpitState(event?.detail);
      window.addEventListener('gev:cockpit-mode-changed', S._cockpitModeListener);
    }

    _installClickHandler(viewer);

    restoreSpriteOrder(viewer);

    console.log('[Data:Military] Initialized with billboard icons');
  }

export function enableMilitaryFlightsLayer(viewer) {
    if (S._billboardCollection) S._billboardCollection.show = true;
    holdContinuousRender('military'); // per-frame animator (perf wave 2)
    if (S._modelCollection) S._modelCollection.show = true;
    _setCockpitContactMode(document.body.classList.contains('cockpit-mode'));
    // Height-datum fix: warm the geoid grid once per layer-enable. The poll loop
    // only reads geoidHeight() synchronously after this resolves (guarded by
    // _geoidReady) — never awaited per-aircraft, never blocking a poll tick.
    if (!S._geoidReady) {
      ensureGeoidReady()
        .then(() => { S._geoidReady = true; })
        .catch(() => { /* geoid grid failed to load — baro path stays un-geoid-corrected until retried */ });
    }
    _installClickHandler(viewer);
    registerPickOwner('military', (pickedId) => S._billboards.has(pickedId));
    // The flights layer suppresses its military duplicates while we render them
    setMilitaryLayerActive(true);
    // Force a fresh rotation pass on the first tick after re-enable
    S._lastCamPoseSig = '';
    if (!S._preRenderRemove && viewer?.scene) {
      S._preRenderRemove = viewer.scene.preRender.addEventListener(_fleetTick);
    }
    if (!S._trackedModelPreUpdateRemove && viewer?.scene) {
      S._trackedModelPreUpdateRemove = viewer.scene.preUpdate.addEventListener(_updateTrackedModel);
    }
    if (!S._moveEndRemove && viewer?.camera) {
      // Arrival polish (mirror of flights.js — see the comment there): a settled
      // camera move forces a full rotation pass on the very next frame, because
      // the pose-signature gate can eat the settle (final easing frames land
      // inside one quantization bucket) and leave stale noses for up to
      // ROTATION_REFRESH_MS. One extra pass per gesture — nothing per-frame.
      S._moveEndRemove = viewer.camera.moveEnd.addEventListener(() => {
        S._lastCamPoseSig = '';
        S._lastFleetTickMs = 0;
      });
    }
    restoreSpriteOrder(viewer);
  }

export function disableMilitaryFlightsLayer(viewer) {
    _abortActiveUpdates();
    _cancelPendingTrackingRestore();
    if (S._billboardCollection) S._billboardCollection.show = false;
    releaseContinuousRender('military');
    _releaseModels();
    if (S._modelCollection) S._modelCollection.show = false;
    _clearTracking();
    _destroyTrail();
    // Remove click handler + keydown listener while disabled to avoid
    // intercepting input when the layer is off
    if (S._clickHandler) {
      S._clickHandler.destroy();
      S._clickHandler = null;
    }
    if (S._trackedEntityChangedRemove) {
      S._trackedEntityChangedRemove();
      S._trackedEntityChangedRemove = null;
    }
    document.removeEventListener('keydown', _onKeyDown);
    unregisterPickOwner('military');
    // Flights layer takes over rendering known-military aircraft (amber)
    setMilitaryLayerActive(false);
    if (S._preRenderRemove) {
      S._preRenderRemove();
      S._preRenderRemove = null;
    }
    if (S._trackedModelPreUpdateRemove) {
      S._trackedModelPreUpdateRemove();
      S._trackedModelPreUpdateRemove = null;
    }
    if (S._moveEndRemove) {
      S._moveEndRemove();
      S._moveEndRemove = null;
    }
  }

export function destroyMilitaryFlightsLayer(viewer) {
    _abortActiveUpdates();
    releaseContinuousRender('military'); // direct-destroy path (perf wave 2 fix)
    _clearTracking();
    _destroyTrail();
    _cancelPendingTrackingRestore();
    if (S._clickHandler) {
      S._clickHandler.destroy();
      S._clickHandler = null;
    }
    if (S._trackedEntityChangedRemove) {
      S._trackedEntityChangedRemove();
      S._trackedEntityChangedRemove = null;
    }
    document.removeEventListener('keydown', _onKeyDown);
    if (S._cockpitModeListener) {
      window.removeEventListener('gev:cockpit-mode-changed', S._cockpitModeListener);
      S._cockpitModeListener = null;
    }
    unregisterPickOwner('military');
    if (S._preRenderRemove) {
      S._preRenderRemove();
      S._preRenderRemove = null;
    }
    if (S._trackedModelPreUpdateRemove) {
      S._trackedModelPreUpdateRemove();
      S._trackedModelPreUpdateRemove = null;
    }
    if (S._moveEndRemove) {
      S._moveEndRemove();
      S._moveEndRemove = null;
    }
    _releaseModels();
    if (S._billboardCollection) {
      viewer.scene.primitives.remove(S._billboardCollection);
      S._billboardCollection = null;
    }
    if (S._modelCollection) {
      viewer.scene.primitives.remove(S._modelCollection); // removing destroys it + its models
      S._modelCollection = null;
    }
    S._modelEpoch += 1; // invalidate any in-flight load from this lifecycle (settles post-destroy)
    _modelPending.clear();
    _modelGen.clear();
    if (S._preloadModel) { try { S._preloadModel.destroy(); } catch { /* gone */ } S._preloadModel = null; }
    S._planeModelLoaded = false;
    S._billboards.clear();
    S._detectionObjects.clear();
    S._flightData.clear();
    S._positionHistory.clear();
    _displayCourse.clear();
    _groundSnap.clear();
    S._missingPolls.clear();
    S._count = 0;
    S._lastUpdate = null;
    S._cockpitContactMode = false;
    S._cockpitNearContacts = new Set();
    S._cockpitSubjectId = null;
    S._trackingRefreshEpoch += 1;
    S._lastTrackingRefreshOutcome = {
      epoch: S._trackingRefreshEpoch,
      status: 'destroyed',
      ids: new Set(),
      source: 'adsb.lol',
    };
    _resetTrackedSelectionState(); // next lifecycle re-evaluates against the ENTER ceiling
    S._viewer = null;
  }
