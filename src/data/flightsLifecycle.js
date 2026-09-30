// Moved out of flights.js (flightsLifecycle).

import { clearFocusTarget } from './focusDeemphasis.js';
import * as Cesium from 'cesium';
import { registerSpriteCollection, restoreSpriteOrder, restoreSpriteOrderOnEnable } from './spriteOrder.js';
import { onMilitaryLayerActiveChange } from './militaryRegistry.js';
import { holdContinuousRender, releaseContinuousRender } from '../renderGovernor.js';
import { ensureGeoidReady } from './geoid.js';
import { registerPickOwner, unregisterPickOwner } from './pickRegistry.js';
import { _abortActiveUpdates } from './flightsApi.js';
import { _installClickHandler, _onKeyDown } from './flightsClick.js';
import { _applyCockpitState, _setCockpitContactMode } from './flightsCockpit.js';
import { PLANE_MODEL_URL, _groundSnap } from './flightsConstants.js';
import { _releaseModels } from './flightsFleetModels.js';
import { _fleetTick } from './flightsFleetTick.js';
import { _enrichment } from './flightsInstances.js';
import { S, _displayCourse, _displayFloorState, _focusEvidenceIds, _modelGen, _modelPending } from './flightsState.js';
import { _resetTrackedSelectionState, _updateTrackedModel } from './flightsTrackedModel.js';
import { _cancelPendingTrackingRestore, _clearTracking, _onMilitaryActiveChange } from './flightsTracking.js';
import { _destroyTrail } from './flightsTrail.js';

export function initFlightsLayer(viewer) {
    clearFocusTarget('flights');
    _focusEvidenceIds.clear();
    S._viewer = viewer;
    S._billboardCollection = new Cesium.BillboardCollection();
    viewer.scene.primitives.add(S._billboardCollection);
    registerSpriteCollection('flights', S._billboardCollection);
    S._modelCollection = new Cesium.PrimitiveCollection();
    viewer.scene.primitives.add(S._modelCollection);
    // Warm the glTF cache so the tracked plane's model instantiates instantly when first needed
    // (keeps the retained instance referenced; never rendered). Captured against this epoch so a
    // destroy/re-init mid-load doesn't flip the flag for a torn-down lifecycle.
    if (!S._preloadModel) {
      const epoch = S._modelEpoch;
      Cesium.Model.fromGltfAsync({ url: PLANE_MODEL_URL, asynchronous: false })
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
    S._lastSource = 'OpenSky Network';
    S._lastCoverage = 'worldwide upstream snapshot';
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
    // Fresh session — full bucket, anchor re-seeded on the first sweep.
    _enrichment.resetAmbientBudget();

    _installClickHandler(viewer);

    // React to Military-layer toggles IMMEDIATELY (suppress/restore sweep)
    // instead of waiting out the 30 s poll (M2).
    if (!S._milActiveChangeUnsub) {
      S._milActiveChangeUnsub = onMilitaryLayerActiveChange(_onMilitaryActiveChange);
    }

    restoreSpriteOrder(viewer);

    console.log('[Data:Flights] Initialized with billboard icons');
  }

export function enableFlightsLayer(viewer) {
    if (S._billboardCollection) S._billboardCollection.show = true;
    holdContinuousRender('flights'); // per-frame animator (perf wave 2)
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
    registerPickOwner('flights', (pickedId) => S._billboards.has(pickedId));
    // Force a fresh rotation pass on the first tick after re-enable
    S._lastCamPoseSig = '';
    if (!S._preRenderRemove && viewer?.scene) {
      S._preRenderRemove = viewer.scene.preRender.addEventListener(_fleetTick);
    }
    if (!S._trackedModelPreUpdateRemove && viewer?.scene) {
      S._trackedModelPreUpdateRemove = viewer.scene.preUpdate.addEventListener(_updateTrackedModel);
    }
    if (!S._moveEndRemove && viewer?.camera) {
      // Arrival polish (field test 2026-07-03: "planes look weird when you first
      // come to them"): when a camera move SETTLES (voice fly-to, fast pan
      // release), force a full rotation pass on the very next frame. The
      // pose-signature gate alone can eat the settle — the final easing frames
      // of a flight land inside one quantization bucket (10 m / 0.06°), leaving
      // every icon wearing its last mid-flight rotation for up to
      // ROTATION_REFRESH_MS. Zeroing the tick throttle too means the pass runs
      // on the next preRender, not up to FLEET_DR_INTERVAL_MS later. Cost: one
      // extra rotation pass per completed camera gesture — nothing per-frame.
      S._moveEndRemove = viewer.camera.moveEnd.addEventListener(() => {
        S._lastCamPoseSig = '';
        S._lastFleetTickMs = 0;
      });
    }
    restoreSpriteOrderOnEnable('flights', viewer);
  }

export function disableFlightsLayer(viewer) {
    _abortActiveUpdates();
    _cancelPendingTrackingRestore();
    if (S._billboardCollection) S._billboardCollection.show = false;
    releaseContinuousRender('flights');
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
    unregisterPickOwner('flights');
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

export function destroyFlightsLayer(viewer) {
    _abortActiveUpdates();
    releaseContinuousRender('flights'); // direct-destroy path (perf wave 2 fix)
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
    if (S._milActiveChangeUnsub) {
      S._milActiveChangeUnsub();
      S._milActiveChangeUnsub = null;
    }
    document.removeEventListener('keydown', _onKeyDown);
    if (S._cockpitModeListener) {
      window.removeEventListener('gev:cockpit-mode-changed', S._cockpitModeListener);
      S._cockpitModeListener = null;
    }
    unregisterPickOwner('flights');
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
    _displayFloorState.clear();
    _enrichment.clear();
    S._missingPolls.clear();
    _focusEvidenceIds.clear();
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
      source: S._lastSource,
      coverage: S._lastCoverage,
    };
    _resetTrackedSelectionState(); // next lifecycle re-evaluates against the ENTER ceiling
    S._viewer = null;
  }
