// Large cctvLayer methods (init/setParams/destroy) moved out of cctv.js as plain functions; the layer object still references them.

import * as Cesium from 'cesium';
import { registerSpriteCollection, restoreSpriteOrder } from './spriteOrder.js';
import { cameraHue, viewshedColors } from './cctvViewshed.js';
import { activateCctvCameraFromWorldClick } from '../cctvFocusRequest.js';
import { resolvePickId, unregisterPickOwner } from './pickRegistry.js';
import { CCTV_OVERLAY_SOURCE_ID } from './cctvCards.js';
import { holdContinuousRender, releaseContinuousRender } from '../renderGovernor.js';
import { bindCctvWorldClickGesture, cctvEmptyClickDeselects, clearRuntimeState, deactivateActiveCamera, ensureGizmo, extractPickedCameraId, focusCamera, setActiveCamera } from './cctvActivation.js';
import { handleHoverMove, refreshAmbientCards, teardownAmbientCards } from './cctvAmbientCards.js';
import { applyCalibrationPatch, isDefaultCalibration, loadCalibrationStore, normalizeCalibration, normalizeCoverageMode, saveCalibrationStore } from './cctvCalibrationStore.js';
import { buildCatalogFromSources, loadCameraSources, mergeSeedAndSourceCatalogs, seedCatalog } from './cctvCatalog.js';
import { CAMERA_ICON, DEFAULT_CAMERA_CALIBRATION, GROUND_PRIOR_INIT_WAIT_MS, IDLE_CAMERA_COLOR, MAX_AUTO_HOP_SEC, MIN_AUTO_HOP_SEC } from './cctvConstants.js';
import { destroyCoverageEntities, getActiveRecord, refreshCoverageStyles } from './cctvCoverage.js';
import { ensureCameraPose } from './cctvGeometry.js';
import { stopGeometryLoadQueue } from './cctvGeometryQueue.js';
import { applyLateGroundPriors, currentSurfaceRegime, handleMapStackChanged, refreshHorizonCulling, resolveCommittedGroundAnchor, resolveGroundPriors } from './cctvGround.js';
import { clamp } from './cctvMath.js';
import { refreshProjectionImage } from './cctvProjectionFrames.js';
import { ensureProjectionRuntime, startProjectionLoop, stopProjectionLoop } from './cctvProjectionRuntime.js';
import { notifyListeners, syncHealthState } from './cctvPublicState.js';
import { S } from './cctvState.js';

export async function initCctvLayer(viewer) {
    S._viewer = viewer;
    clearRuntimeState();
    S._enabled = false;
    S._activeCameraId = null;
    S._autoHopSuspended = false;
    S._lastHopAt = 0;
    S._lastViewContext = '';
    S._calibrationById = loadCalibrationStore();

    S._billboards = new Cesium.BillboardCollection();
    S._viewer.scene.primitives.add(S._billboards);
    registerSpriteCollection('cctv', S._billboards);

    const sources = await loadCameraSources();
    const catalogFromSources = buildCatalogFromSources(sources);
    // Seeds always merge in alongside live sources (mergeSeedAndSourceCatalogs)
    // rather than only being used when live sources are entirely empty — see
    // that function's doc comment for the bug this replaces.
    const catalog = mergeSeedAndSourceCatalogs(catalogFromSources, seedCatalog());

    // Viewshed color identity (design §3a): golden-angle hue over the
    // id-SORTED catalog index — deterministic across sessions for a stable
    // catalog, maximally separated for neighboring cameras.
    const hueIndexById = new Map(
      catalog.map((camera) => camera.id).sort().map((id, index) => [id, index])
    );

    for (const camera of catalog) {
      const savedEntry = S._calibrationById.get(camera.id);
      if (savedEntry) {
        camera.calibration = normalizeCalibration(savedEntry.values);
        camera.calSource = savedEntry.source;
      }
      ensureCameraPose(camera);
    }

    // Task 5 (height-datum fix): batch ALL camera coords through the Re:Earth
    // ellipsoidal ground-prior resolver (network-cached — NOT a scene query;
    // the catalog's orthometric groundElevationM feeds the geoid fallback
    // chain). Bounded wait: a warm proxy cache resolves in milliseconds, so
    // records are normally built WITH their prior (correct first paint in
    // every regime); a cold/slow upstream loses the race and the batch
    // applies post-hoc via applyLateGroundPriors instead of hanging init.
    const priorsPromise = resolveGroundPriors(catalog);
    const priors = await Promise.race([
      priorsPromise,
      new Promise((resolve) => setTimeout(() => resolve(null), GROUND_PRIOR_INIT_WAIT_MS)),
    ]);

    for (let i = 0; i < catalog.length; i++) {
      const camera = catalog[i];
      // Ellipsoidal ground prior (or null while the batch is still in
      // flight). Geometry falls back to the catalog value only until the
      // batch lands.
      const groundPrior = priors?.[i] || null;
      // Cheap first-pass altitude from the ellipsoidal prior (catalog value
      // only as the pre-prior fallback) — the staggered geometry queue
      // refines with sampled tile heights after enable so the init path
      // never raycasts the scene once per camera.
      const priorGround = Number.isFinite(groundPrior?.ellipsoid)
        ? groundPrior.ellipsoid
        : (Number(camera.groundElevationM) || 0);
      camera.absoluteHeightM = priorGround + camera.mountHeightM;
      const position = Cesium.Cartesian3.fromDegrees(camera.lon, camera.lat, camera.absoluteHeightM);
      const billboard = S._billboards.add({
        id: camera.id,
        image: CAMERA_ICON,
        position,
        color: IDLE_CAMERA_COLOR,
        width: 24,
        height: 24,
        // Field-test fix (2026-07-06): always-on-top. The old finite value
        // (1800 m) re-engaged the depth test at far zoom, where the COARSE
        // far-LOD Google-3D mesh sits above the true ground and swallowed
        // ground-anchored icons ("submerged" pills over SF). Far-side-of-globe
        // icons are handled by refreshHorizonCulling() (the flights-layer
        // EllipsoidalOccluder pattern), not by the depth test.
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
        scaleByDistance: new Cesium.NearFarScalar(350, 1.25, 4_000_000, 0.42),
      });

      const record = {
        camera,
        position,
        billboard,
        coverageEntities: [],
        projection: null,
        // Task 5 (height-datum fix): regime-aware ground resolution state.
        //   groundPrior     — { ellipsoid, source } from the Re:Earth batch
        //     (null until a late batch lands). The prior applies in EVERY
        //     regime and is the terrain-globe resolution outright.
        //   groundResolved  — PER-REGIME one-shot latch (regime key →
        //     boolean): true once this record's resolution completed for that
        //     regime; such records are excluded from the completion pass so
        //     their geometry freezes. Re-armed only on a genuine pose change,
        //     explicit user select/move, or a surface-regime change — never
        //     on the 10s timer.
        //   groundSamples   — PER-REGIME resolved ground (regime key →
        //     metres): the accepted one-shot scene sample in google-3d, the
        //     mirrored prior in terrain-globe. Kept across re-arms as the
        //     "has ever resolved" memory for the B9c mid-stream guard.
        //   frustumPositions — cached Cartesians for pure recomputes (so
        //     plane placement never re-derives geometry it already has).
        groundPrior,
        groundResolved: {},
        groundSamples: {},
        frustumGeometry: null,
        frustumPositions: null,
        // §9.1 activation obstruction probe result: effective-range clamp so
        // the far-cap plane never clips into the tiles. Null = unclamped.
        // Reset + re-probed on every activation; cleared when the user takes
        // the range slider (slider overrides the clamp).
        probeClampRangeM: null,
        // Viewshed (design §3a/§3b): per-camera color identity + the volume
        // primitive handle (exists only in viewshed mode for the visible set).
        viewshedColors: viewshedColors(cameraHue(hueIndexById.get(camera.id) ?? 0)),
        viewshedPrimitive: null,
        viewshedActiveTint: false,
      };
      S._records.push(record);
      S._recordById.set(camera.id, record);
    }

    S._count = S._records.length;
    if (S._records.length > 0) {
      // Projection runtime + first frame fetch are deferred to enable() so
      // initializing the catalog stays render-cheap.
      S._activeCameraId = S._records[0].camera.id;
    }

    // Task 5: if the prior batch lost init's bounded race, apply it post-hoc
    // when it lands (pure recomputes — applyLateGroundPriors guards against
    // a torn-down/re-inited catalog).
    if (!priors) {
      const initRecords = S._records.slice();
      priorsPromise.then((late) => {
        if (late) applyLateGroundPriors(initRecords, late);
      }).catch(() => {});
    }

    // Task 5: track the surface regime the initial geometry was computed for
    // and listen for map-stack changes (main.js re-dispatches
    // MapStackController.onChange as this CustomEvent). The handler compares
    // regimes itself, so 'switching'/'error' emissions and same-regime stack
    // swaps (bing→osm) no-op.
    S._lastAppliedRegime = currentSurfaceRegime();
    if (!S._mapStackListener && typeof window !== 'undefined') {
      S._mapStackListener = () => handleMapStackChanged();
      window.addEventListener('gev:map-stack-changed', S._mapStackListener);
    }

    // Field-test fix (2026-07-06): horizon-cull on camera settle (pairs with
    // the billboards' always-on-top depth setting) + one initial pass so the
    // first paint is already culled.
    if (!S._horizonCullListener) {
      // Ambient cards piggyback the same settle event: moveEnd-driven
      // reselection only, never per frame (refreshAmbientCards no-ops while
      // the layer is disabled).
      S._horizonCullListener = () => {
        S._cameraMoving = false;
        refreshHorizonCulling();
        refreshAmbientCards();
      };
      S._viewer.camera.moveEnd.addEventListener(S._horizonCullListener);
    }
    if (!S._moveStartListener) {
      // Item B: hover picking pauses while the camera is in motion.
      S._moveStartListener = () => {
        S._cameraMoving = true;
      };
      S._viewer.camera.moveStart.addEventListener(S._moveStartListener);
    }
    refreshHorizonCulling();

    S._clickHandler = new Cesium.ScreenSpaceEventHandler(S._viewer.scene.canvas);
    bindCctvWorldClickGesture(S._clickHandler, (click) => {
      if (!S._enabled) return;
      const picked = S._viewer.scene.pick(click.position);
      const cameraId = extractPickedCameraId(picked);
      if (cameraId) {
        activateCctvCameraFromWorldClick(cameraId, setActiveCamera);
        return;
      }
      // Any identified scene object owns this click even if its layer does not
      // register a shared pick predicate. This keeps selectable siblings ahead
      // of an overlapping CCTV card while ID-less globe/terrain/tile surfaces
      // remain eligible for true empty-space deselection.
      const pickedId = resolvePickId(picked);
      if (pickedId !== null) return;
      // Item A (owner round 2): the scene pick found no camera — try the
      // painted ambient cards. The cards canvas is pointer-events:none (this
      // handler owns the events), so a click landing on a card's rect selects
      // its camera exactly like a click on the icon. Cesium click positions
      // and the recorded rects are both CSS px — direct comparison.
      const cardId = S._cctvOverlayHost.hitTest(
        click.position.x,
        click.position.y,
        { sourceId: CCTV_OVERLAY_SOURCE_ID },
      )?.entryId;
      if (cardId && S._recordById.has(cardId)) {
        activateCctvCameraFromWorldClick(cardId, setActiveCamera);
        return;
      }
      if (cctvEmptyClickDeselects(picked, {
        activeCameraId: S._activeCameraId,
        calibrationMode: S._calibrationMode,
      })) {
        deactivateActiveCamera();
      }
    }, {
      // Item B: hover summons a card on a cardless camera icon. The gesture
      // classifier owns MOUSE_MOVE too, so chain hover work through its seam
      // instead of replacing the travel accumulator's handler.
      onMouseMove: (movement) => handleHoverMove(movement?.endPosition),
    });

    await syncHealthState(true);
    refreshCoverageStyles();
    notifyListeners();
    restoreSpriteOrder(S._viewer);
    console.log('[Data:CCTV] Initialized with', S._count, 'cameras');
  }

export function destroyCctvLayer(viewer) {
    unregisterPickOwner('cctv');
    if (S._mapStackListener && typeof window !== 'undefined') {
      window.removeEventListener('gev:map-stack-changed', S._mapStackListener);
      S._mapStackListener = null;
    }
    const teardownViewer = viewer || S._viewer;
    if (S._horizonCullListener && teardownViewer?.camera?.moveEnd) {
      teardownViewer.camera.moveEnd.removeEventListener(S._horizonCullListener);
      S._horizonCullListener = null;
    }
    if (S._moveStartListener && teardownViewer?.camera?.moveStart) {
      teardownViewer.camera.moveStart.removeEventListener(S._moveStartListener);
      S._moveStartListener = null;
    }
    if (S._gizmo) {
      S._gizmo.destroy();
      S._gizmo = null;
    }
    S._calibrationMode = false;
    releaseContinuousRender('cctv-adjust');
    if (S._clickHandler) {
      S._clickHandler.destroy();
      S._clickHandler = null;
    }
    if (teardownViewer?.scene?.screenSpaceCameraController) {
      teardownViewer.scene.screenSpaceCameraController.enableInputs = true;
    }
    stopProjectionLoop();
    stopGeometryLoadQueue();
    teardownAmbientCards();
    destroyCoverageEntities();
    if (S._billboards && teardownViewer) {
      teardownViewer.scene.primitives.remove(S._billboards);
      S._billboards = null;
    }
    clearRuntimeState();
    S._viewer = null;
    S._enabled = false;
    S._activeCameraId = null;
    S._autoHopSuspended = false;
    // Clear existing subscribers rather than replacing the Set —
    // replacing would silently orphan any unsubscribe() closures
    S._listeners.clear();
  }

export function setCctvLayerParams(params = {}) {
    if (typeof params.showCoverage === 'boolean') {
      S._coverageMode = normalizeCoverageMode(params.showCoverage, S._coverageMode);
    }
    if (typeof params.coverageMode === 'string') {
      S._coverageMode = normalizeCoverageMode(params.coverageMode, S._coverageMode);
    }
    if (typeof params.showProjection === 'boolean') {
      S._showProjection = params.showProjection;
      if (S._showProjection) {
        const active = getActiveRecord();
        if (active) ensureProjectionRuntime(active);
        startProjectionLoop();
      }
    }
    if (typeof params.autoHop === 'boolean') {
      S._autoHop = params.autoHop;
      if (params.autoHop) S._autoHopSuspended = false;
    }
    if (typeof params.autoHopSec === 'number' && Number.isFinite(params.autoHopSec)) {
      S._autoHopSec = clamp(Math.round(params.autoHopSec), MIN_AUTO_HOP_SEC, MAX_AUTO_HOP_SEC);
    }
    if (typeof params.selectedCameraId === 'string' && S._recordById.has(params.selectedCameraId)) {
      setActiveCamera(params.selectedCameraId);
    }
    if (params.calibration && typeof params.calibration === 'object') {
      const calibrationCfg = params.calibration;
      const targetCameraId = typeof calibrationCfg.cameraId === 'string' && calibrationCfg.cameraId
        ? calibrationCfg.cameraId
        : S._activeCameraId;
      const targetRecord = targetCameraId ? S._recordById.get(targetCameraId) : null;
      if (targetRecord) {
        if (calibrationCfg.reset) {
          // RESET: back to the base prior, delete the persisted entry, clear
          // the dirty flag (semantics unchanged from v2).
          targetRecord.camera.calibration = normalizeCalibration(DEFAULT_CAMERA_CALIBRATION);
          targetRecord.camera.calSource = null;
          targetRecord.calDirty = false;
          ensureCameraPose(targetRecord.camera);
          S._calibrationById.delete(targetCameraId);
          saveCalibrationStore();
          // Reset returns to the base lat/lon, so resolve that anchor once.
          resolveCommittedGroundAnchor(targetRecord);
          refreshProjectionImage(targetRecord, true);
        }
        if (calibrationCfg.patch && typeof calibrationCfg.patch === 'object') {
          // Save-gated persistence (design §3e): a patch edits the LIVE pose
          // only. The store — and the CALIBRATED badge's `calSource` — move
          // exclusively on the explicit `save` action below. (§9.1 range-slider
          // clamp override + B9b re-ground live inside applyCalibrationPatch.)
          applyCalibrationPatch(targetRecord, calibrationCfg.patch);
        }
        if (calibrationCfg.save) {
          // SAVE CAL: persist the current in-memory calibration with manual
          // provenance. Saving an all-default calibration clears the entry
          // (a no-op calibration is not a calibration).
          if (isDefaultCalibration(targetRecord.camera.calibration)) {
            targetRecord.camera.calSource = null;
            S._calibrationById.delete(targetCameraId);
          } else {
            targetRecord.camera.calSource = 'manual';
            S._calibrationById.set(targetCameraId, {
              values: { ...targetRecord.camera.calibration },
              source: 'manual',
              savedAt: Date.now(),
            });
          }
          targetRecord.calDirty = false;
          saveCalibrationStore();
        }
      }
    }
    if (typeof params.calibrationMode === 'boolean') {
      S._calibrationMode = params.calibrationMode;
      if (S._calibrationMode) {
        ensureGizmo();
        S._gizmo?.setEnabled(true);
        // ADJUST mode: gizmo drags mutate entity geometry from pointer events,
        // which don't trigger renders in requestRenderMode. (perf wave 2)
        holdContinuousRender('cctv-adjust');
      } else {
        releaseContinuousRender('cctv-adjust');
        S._gizmo?.setEnabled(false);
      }
    }
    if (params.focusSelected && S._activeCameraId) {
      focusCamera(S._activeCameraId, Number(params.focusDurationSec) || 1.8);
    }
    refreshCoverageStyles();
    notifyListeners();
  }
