/**
 * @module cctv
 *
 * CCTV camera data layer for EagleEye View.
 *
 * Architecture:
 * - Camera catalog: built from seed definitions (CAMERA_SEEDS) merged with live
 *   sources fetched from the backend (/api/cctv/sources). Each camera record
 *   holds a base pose, a calibration offset, computed intrinsics/extrinsics,
 *   and an anchor position on the globe.
 *
 * - Coverage geometry (v2): a true pitched frustum pyramid per camera — 4
 *   corner rays from the mount to the far-plane corners plus the closed
 *   far-plane rectangle (5 polylines), rendered as Cesium entities with
 *   neighbor-limited visibility. All geometry is pure pose math
 *   (computeFrustumGeometry) — zero steady-state scene queries.
 *
 * - Monitor plane (v2): the live frame renders on a plane entity capping the
 *   far end of the frustum ("monitor at the end of the cone"), oriented
 *   perpendicular to the view axis (static — never billboarded). Image feeds
 *   alternate two offscreen canvases so the texture re-uploads only on a
 *   fresh reference (<=1Hz) — see refreshProjectionTextures' docstring.
 *   Video feeds instead bind the plane material ONCE, at creation, to an
 *   internal proxy <video> fed by canvas.captureStream() (2026-09-28 fix,
 *   see createProjectionProxyVideo) — this lets Cesium's own native
 *   HTMLVideoElement texture path (an in-place copyFrom, no GPU
 *   destroy/recreate) drive every frame update, instead of the
 *   canvas-reference-swap trick image feeds use, whose every swap is a full
 *   GPU texture destroy+recreate (confirmed against Cesium's own source)
 *   and was still a visible flicker on live video even throttled to ~12fps.
 *   The plane NEVER binds to the raw upstream HTMLVideoElement directly,
 *   under either approach: only the fixed-size projection canvas (drawn
 *   onto via ctx.drawImage, see drawProjectionFrame) ever receives real HLS
 *   frames, and the proxy video's source is that canvas's OWN
 *   captureStream, not the upstream — see createProjectionProxyVideo's
 *   docstring for why this keeps the plane structurally immune to the
 *   mid-stream decoded-size changes and hls.js MediaSource resets that made
 *   a direct HTMLVideoElement binding unsafe in the first place (2026-09-22:
 *   Cesium's Material.js unconditionally calls texture.copyFrom() on a
 *   video-backed uniform every tick with no size check, which threw
 *   glCopySubTextureCHROMIUM GL errors on either failure mode). One live
 *   plane at a time. On activation a single scene.pickFromRay obstruction
 *   probe (§9.1 — the ONLY raycast in the subsystem) clamps the plane's
 *   range short of the first tile hit so the end cap never clips into
 *   buildings.
 *
 * - Ambient card tier (2026-07-29 design): the LOD-selected nearby static
 *   cameras (cctvLod.js — zoom-scaled 16/24/32 budget, eviction grace)
 *   additionally get a screen-space thumbnail card (cctvCards.js) showing
 *   their latest paced static frame. Reselection is camera.moveEnd-driven
 *   (never per frame); frame fetches go through a global 1-per-second gate;
 *   camera icons stay visible at every zoom (cards annotate, never replace).
 *   The active camera keeps the monitor plane and is excluded from the card
 *   ring by default. An opt-in presentation option can also publish its
 *   protected thumbnail without changing the ambient quota.
 *
 * - Health sync: periodic fetch of /api/cctv/health to update per-camera
 *   source status shown in the UI.
 *
 * - Auto-hop: timed camera cycling with view-context awareness (snaps to
 *   nearest camera when the viewer pans to a new region).
 *
 * All mutable state is module-scoped. The exported `cctvLayer` object
 * implements the standard layer interface (init/enable/disable/update/destroy)
 * plus CCTV-specific methods (selectCamera, cycleCamera, focusNearest, etc.).
 */

import { LAYER_METADATA } from './layerMetadata.js';
import { registerPickOwner, unregisterPickOwner } from './pickRegistry.js';
import { GIZMO_ID_PREFIX } from './cctvGizmo.js';
import { onFocusTargetAppear } from './focusDeemphasis.js';
import { CCTV_OVERLAY_SOURCE_ID } from './cctvCards.js';
import { restoreSpriteOrder } from './spriteOrder.js';
import { releaseContinuousRender } from '../renderGovernor.js';
import { CCTV_ACTIVATION_RESULT } from '../cctvFocusRequest.js';
import { CCTV_FOCUS_RESULT } from './cctvFocusResult.js';
import { pickDefaultCameraId } from './cctvDefaultCamera.js';
import { cctvCycleIndex, focusCamera, maybeAutoHop, setActiveCamera } from './cctvActivation.js';
import { refreshAmbientCards, setCctvCardPresentationOptions, startCardFrameLoop, teardownAmbientCards } from './cctvAmbientCards.js';
import { normalizeCalibration } from './cctvCalibrationStore.js';
import { DEFAULT_UPDATE_INTERVAL_MS } from './cctvConstants.js';
import { activeCctvOcclusionPlanes, getActiveRecord, hideCctvVisuals, nearestCameraIdToViewer, refreshCoverageStyles } from './cctvCoverage.js';
import { enqueueGeometryRefresh, startGeometryLoadQueue, stopGeometryLoadQueue } from './cctvGeometryQueue.js';
import { isGroundResolved, projectionTilesReady } from './cctvGround.js';
import { destroyCctvLayer, initCctvLayer, setCctvLayerParams } from './cctvLayerLifecycle.js';
import { refreshProjectionImage } from './cctvProjectionFrames.js';
import { ensureProjectionRuntime, getActiveProjectionMirrorStream, startProjectionLoop, stopProjectionLoop } from './cctvProjectionRuntime.js';
import { notifyListeners, syncHealthState, uiState } from './cctvPublicState.js';
import { S } from './cctvState.js';

export { _extractPickedCameraIdForTest, bindCctvWorldClickGesture, cctvCycleIndex, cctvEmptyClickDeselects, cctvRecordNeedsActivation, clearProbeClampOnDeactivation, deactivateActiveCamera, focusCctvRecord, maybeAutoHop, setActiveCamera } from './cctvActivation.js';
export { _pushAmbientCardEntriesForTest, _setCctvOverlayHostForTest, setCctvCardPresentationOptions } from './cctvAmbientCards.js';
export { calibrationPatchMovesAnchor, deriveCalBadge, normalizeCoverageMode, readCalibrationStoreV2, writeCalibrationStoreV2 } from './cctvCalibrationStore.js';
export { _buildCatalogFromSourcesForTest, _isVideoFeedTypeForTest, _normalizeFeedTypeForTest, mergeSeedAndSourceCatalogs } from './cctvCatalog.js';
export { CCTV_CALIBRATION_STORAGE_KEY_V1, CCTV_CALIBRATION_STORAGE_KEY_V2, CCTV_PROJECTION_OVERLAY_SOURCE_ID, CCTV_PROJECTION_OVERLAY_SOURCE_OPTIONS, FRUSTUM_GROUND_CLEARANCE_M, WIREFRAME_ZFIGHT_LIFT_M } from './cctvConstants.js';
export { _setCctvCoverageStateForTest, applyCctvFocusDeemphasis, hideCctvRecordVisuals, materializeCctvActiveCoverageEntities, materializeCctvCoverageEntities, materializeCctvVisibleCoverageEntities, refreshCoverageStyles } from './cctvCoverage.js';
export { _frustumCartesiansForTest, activationProbeClampRange, computeFrustumGeometry } from './cctvGeometry.js';
export { cctvGeometryDrainPacing, createGeometryProgressNotifier, prioritizeActiveCctvGeometryRecord, processCctvGeometryDrainBatch, processCctvGeometryQueueBatch, processGeometryBatch } from './cctvGeometryQueue.js';
export { surfaceRegimeKey } from './cctvGround.js';
export { frameSignatureFromPixels } from './cctvProjectionFrames.js';
export { _createCctvProjectionPlaneForTest, _createProjectionProxyVideoForTest, _destroyProjectionRuntimeForTest, _drawProjectionFrameForTest, _refreshProjectionTexturesForTest, _updateCctvProjectionPlaneForTest, createCctvProjectionOverlayEntry } from './cctvProjectionPlane.js';
export { _getPublicCameraStateForTest } from './cctvPublicState.js';
// CCTV_FOCUS_RESULT now lives in cctvFocusResult.js (lazy-loading refactor,
// plan §3.6) so gevActions.js can import the constant without pulling in
// this whole module; re-exported here so this file's own internal call
// sites are unaffected.
export { CCTV_FOCUS_RESULT };

// ---------------------------------------------------------------------------
// Exported layer object — standard layer interface + CCTV-specific methods
// ---------------------------------------------------------------------------

/**
 * CCTV data layer implementing the standard layer interface.
 * Manages camera catalog, coverage visualization, the far-cap projection
 * plane, health sync, calibration, and auto-hop.
 */
const cctvLayer = {
  ...LAYER_METADATA.cctv,
  updateInterval: DEFAULT_UPDATE_INTERVAL_MS,

  /**
   * Initializes the CCTV layer: loads camera sources, builds the catalog,
   * restores calibration from localStorage, creates billboards, sets up click
   * handling, and performs initial health sync. Coverage entities stay lazy.
   * @param {Cesium.Viewer} viewer - The Cesium viewer instance.
   */
  init: initCctvLayer,

  /**
   * Enables the layer: shows entities, starts the projection loop, and kicks
   * the staggered geometry-load queue. Heavy work (per-camera ground
   * sampling) is deferred/batched so the frame budget never collapses at
   * enable time.
   */
  enable() {
    S._enabled = true;
    S._lastUpdate = Date.now();
    // Pick-ownership (H2): camera billboards use the camera id directly;
    // coverage polyline entities use `cctv-<cameraId>-<role>` entity ids.
    registerPickOwner('cctv', (pickedId) => {
      if (S._recordById.has(pickedId)) return true;
      if (typeof pickedId === 'string' && pickedId.startsWith(GIZMO_ID_PREFIX)) return true;
      const coverage = /^cctv-(.+)-(?:ray-tl|ray-tr|ray-br|ray-bl|cap|plane|plane-label)$/.exec(pickedId);
      return Boolean(coverage && S._recordById.has(coverage[1]));
    });
    if (!S._activeCameraId && S._records.length) {
      S._activeCameraId = pickDefaultCameraId(S._records);
      S._defaultCameraPending = true;
      S._autoHopSuspended = false;
    }
    const activeRecord = getActiveRecord();
    if (activeRecord) {
      ensureProjectionRuntime(activeRecord);
      refreshProjectionImage(activeRecord, true);
    }
    startGeometryLoadQueue();
    refreshCoverageStyles();
    startProjectionLoop();
    // The projection loop self-stops when idle; a focus target appearing
    // (user starts tracking a contact) is the one edge it can't see while
    // stopped, so re-arm on it. Removed on disable.
    S._removeFocusAppearListener?.();
    S._removeFocusAppearListener = onFocusTargetAppear(() => startProjectionLoop());
    // Ambient card tier: shared host source + policy-gated frame pacer + the
    // initial selection pass (moveEnd drives every later reselection).
    S._cctvOverlayHost.setVisible(CCTV_OVERLAY_SOURCE_ID, true);
    startCardFrameLoop();
    refreshAmbientCards();
    notifyListeners();
    restoreSpriteOrder(S._viewer);
  },

  /** Disables the layer: hides entities, stops the projection loop and load queue. */
  disable() {
    S._enabled = false;
    unregisterPickOwner('cctv');
    // ADJUST mode does not survive a layer toggle — predictable re-entry.
    S._calibrationMode = false;
    releaseContinuousRender('cctv-adjust');
    S._gizmo?.setEnabled(false);
    S._removeFocusAppearListener?.();
    S._removeFocusAppearListener = null;
    stopProjectionLoop();
    stopGeometryLoadQueue();
    // Ambient cards tear down COMPLETELY on disable (owner design point 6):
    // source entries, pacer timer, in-flight handlers, and caches.
    teardownAmbientCards();
    hideCctvVisuals();
    notifyListeners();
  },

  /**
   * Periodic update tick: syncs health state and runs auto-hop logic. Ground
   * geometry is NOT resampled here — v2 grounds each camera once via the
   * staggered load queue (see startGeometryLoadQueue/updateRecordGeometry)
   * and never resamples on a timer. The ONE exception is a one-shot
   * completion pass: the enable-time drain can run while 3D tiles are still
   * streaming (each such pass keeps the fabricated catalog height and leaves
   * the record `!groundResolved`), so the FIRST tick that sees
   * projectionTilesReady() re-enqueues those records once — each then takes
   * its single real sample and freezes (design §4). Guarded by a boolean
   * latch (`_tilesReadyReenqueued`), NOT a timer loop: after it fires, no
   * tick ever samples anything again.
   */
  async update() {
    if (!S._enabled) return;
    const now = Date.now();
    S._lastUpdate = now;
    if (!S._tilesReadyReenqueued && projectionTilesReady()) {
      S._tilesReadyReenqueued = true;
      // Per-regime resolution (Task 5): only records unresolved for the
      // CURRENT surface regime need the completion pass. On globe stacks
      // projectionTilesReady() is false while a (hidden) Google tileset
      // exists, so this latch effectively fires for the google-3d regime —
      // terrain-globe records resolve from the prior in their drain pass.
      const unresolved = S._records.filter((record) => !isGroundResolved(record));
      if (unresolved.length) enqueueGeometryRefresh(unresolved);
    }
    await syncHealthState();
    maybeAutoHop(now);
    notifyListeners();
  },

  /**
   * Tears down the layer: destroys click handler, projection loop, coverage
   * entities, billboards, and clears all runtime state and subscribers.
   * @param {Cesium.Viewer} [viewer] - Viewer instance (falls back to stored ref).
   */
  destroy: destroyCctvLayer,

  /**
   * Applies runtime parameter changes: coverage/projection toggles, auto-hop
   * settings, camera selection, and calibration patches/resets.
   * @param {Object} [params={}] - Parameter object.
   * @param {boolean} [params.showCoverage] - Back-compat coverage toggle (true→'on', false→'off').
   * @param {'off'|'on'|'viewshed'} [params.coverageMode] - Full coverage-mode API.
   * @param {boolean} [params.showProjection] - Toggle projection overlay visibility.
   * @param {boolean} [params.autoHop] - Enable/disable auto-hop.
   * @param {number} [params.autoHopSec] - Auto-hop interval in seconds.
   * @param {string} [params.selectedCameraId] - Camera ID to activate.
   * @param {Object} [params.calibration] - Calibration config: `patch` edits
   *   the live pose (save-gated — no persistence), `save` persists the current
   *   calibration as manual, `reset` restores the base prior.
   * @param {boolean} [params.calibrationMode] - Toggle the ADJUST gizmo.
   * @param {boolean} [params.focusSelected] - Fly to the active camera.
   * @param {number} [params.focusDurationSec] - Fly-to duration.
   */
  setParams: setCctvLayerParams,

  /**
   * Returns the current runtime parameters including toggle states,
   * active camera, and calibration values.
   * @returns {Object}
   */
  getParams() {
    const active = getActiveRecord();
    return {
      showCoverage: S._coverageMode !== 'off',
      coverageMode: S._coverageMode,
      showProjection: S._showProjection,
      calibrationMode: S._calibrationMode,
      autoHop: S._autoHop,
      autoHopSec: S._autoHopSec,
      selectedCameraId: active?.camera.id || null,
      calibration: active?.camera ? {
        cameraId: active.camera.id,
        values: { ...normalizeCalibration(active.camera.calibration) },
      } : null,
    };
  },

  /**
   * Occlusion geometry for the Universal Detection Overlay (`detection.js`):
   * at most one entry (the active camera's monitor plane, only while it's
   * actually showing) — see `activeCctvOcclusionPlanes` for why one plane
   * is the architectural ceiling. Called once per detection paint frame;
   * pure geometry read, no scene query.
   * @returns {Array<Object>} See `activeCctvOcclusionPlanes`'s return shape.
   */
  getOcclusionPlanes() {
    if (!S._enabled) return [];
    return activeCctvOcclusionPlanes();
  },

  /**
   * Returns a sampled list of camera positions for the detection overlay system.
   * @param {Object} [options={}]
   * @param {number} [options.maxCount] - Maximum number of objects to return.
   * @param {number} [options.seed] - Offset seed for deterministic stride sampling.
   * @returns {{ position: Cesium.Cartesian3, id: string, type: string }[]}
   */
  getDetectableObjects(options = {}) {
    if (!S._enabled || S._records.length === 0) return [];
    const maxCount = Number.isFinite(options.maxCount)
      ? Math.max(1, Math.floor(options.maxCount))
      : S._records.length;
    const seed = Number.isFinite(options.seed) ? Math.floor(options.seed) : 0;
    const stride = Math.max(1, Math.ceil(S._records.length / maxCount));
    const start = seed % stride;

    const objects = [];
    for (let i = start; i < S._records.length; i += stride) {
      const camera = S._records[i].camera;
      objects.push({
        position: S._records[i].position,
        sourceId: camera.id,
        id: `CAM-${camera.id}`,
        type: 'CAM',
      });
      if (objects.length >= maxCount) break;
    }
    return objects;
  },

  /**
   * Returns basic layer statistics, including initial-load progress while
   * the staggered geometry queue is draining.
   * @returns {{ count: number, lastUpdate: number|null, error: string|null, loading: boolean, loadingLoaded: number, loadingTotal: number }}
   */
  getStats() {
    return {
      count: S._count,
      lastUpdate: S._lastUpdate,
      error: S._lastError,
      loading: S._geoLoading,
      loadingLoaded: Math.min(S._geoLoadDone, S._geoLoadTotal),
      loadingTotal: S._geoLoadTotal,
    };
  },

  /**
   * Registers a callback that receives the full UI state on every change.
   * The callback is invoked immediately with the current state.
   * @param {Function} callback - Listener function receiving the UI state object.
   * @returns {Function} Unsubscribe function.
   */
  subscribe(callback) {
    if (typeof callback !== 'function') return () => {};
    S._listeners.add(callback);
    callback(uiState());
    return () => {
      S._listeners.delete(callback);
    };
  },

  /**
   * Returns the current UI state snapshot without subscribing.
   * @returns {Object}
   */
  getUIState() {
    return uiState();
  },

  /**
   * Opts the active camera into or out of protected thumbnail publication.
   * The default is false: the monitor plane remains the sole active-camera
   * representation while ambient and hover-pinned cards continue unchanged.
   * @param {Object} [options]
   * @param {boolean} [options.activeCameraCardEnabled=false]
   * @returns {{activeCameraCardEnabled:boolean}}
   */
  setCardPresentationOptions(options = {}) {
    return setCctvCardPresentationOptions(options);
  },

  /**
   * Returns a live MediaStream mirroring a video/HLS camera's monitor-plane
   * frames, for the 2D panel's <video> preview. Null for image-feed cameras
   * (they use the existing frameUrl/<img> path) or if the camera has no
   * active projection runtime yet.
   * @param {string} cameraId
   * @returns {MediaStream|null}
   */
  getProjectionMirrorStream(cameraId) {
    return getActiveProjectionMirrorStream(cameraId);
  },

  /**
   * Selects a camera by ID and optionally flies to it.
   * @param {string} cameraId - Camera ID to select.
   * @param {Object} [options={}]
   * @param {boolean} [options.focus] - If true, fly the viewer to the camera.
   * @param {number} [options.durationSec] - Fly-to duration in seconds.
   * @returns {boolean} True if the camera was found and selected.
   */
  selectCamera(cameraId, options = {}) {
    const result = setActiveCamera(cameraId);
    if (result === CCTV_ACTIVATION_RESULT.NOT_FOUND) return false;
    if (options.focus) {
      focusCamera(cameraId, options.durationSec || 1.8);
    }
    return true;
  },

  /**
   * Flies the viewer to a specific camera.
   * @param {string} cameraId - Camera ID to focus on.
   * @param {number} [durationSec=2.2] - Flight duration in seconds.
   * @returns {'focused'|'no-active-camera'|'tracking-holds-view'|'cockpit-active'} Focus result.
   */
  focusCamera(cameraId, durationSec = 2.2) {
    return focusCamera(cameraId, durationSec);
  },

  /**
   * Cycles the active camera forward or backward by `step` positions in the catalog.
   * @param {number} [step=1] - Number of positions to advance (negative to go back).
   * @param {Object} [options={}]
   * @param {boolean} [options.focus] - If true, fly to the new camera.
   * @param {number} [options.durationSec] - Fly-to duration in seconds.
   * @returns {string|null} The newly active camera ID, or null if catalog is empty.
   */
  cycleCamera(step = 1, options = {}) {
    if (!S._records.length) return null;
    const current = getActiveRecord();
    const nextIdx = cctvCycleIndex(
      S._records.findIndex((record) => record === current),
      step,
      S._records.length,
    );
    const nextId = S._records[nextIdx].camera.id;
    setActiveCamera(nextId);
    if (options.focus) {
      focusCamera(nextId, options.durationSec || 1.8);
    }
    return nextId;
  },

  /**
   * Selects and flies to the camera nearest the current viewer position.
   * @param {Object} [options={}]
   * @param {boolean} [options.focus=true] Whether to fly after selection.
   * @param {number} [options.durationSec] - Fly-to duration in seconds.
   * @returns {string|null} The nearest camera ID, or null if none found.
   */
  focusNearest(options = {}) {
    const nearest = nearestCameraIdToViewer();
    if (!nearest) return null;
    setActiveCamera(nearest);
    if (options.focus !== false) {
      focusCamera(nearest, options.durationSec || 1.8);
    }
    return nearest;
  },

  /**
   * True while the active camera is only the catalog default (nothing was
   * ever selected), i.e. the first enable should fly to it.
   * @returns {boolean}
   */
  isDefaultCameraPending() {
    return S._defaultCameraPending === true && !!S._activeCameraId;
  },

  /**
   * Activates the catalog default camera (live Denpasar camera, see
   * `pickDefaultCameraId`) without moving the view; the caller flies.
   * @returns {string|null} Activated camera ID, or null when no default is pending.
   */
  activateDefaultCamera() {
    if (!this.isDefaultCameraPending()) return null;
    const id = S._activeCameraId;
    return setActiveCamera(id) === CCTV_ACTIVATION_RESULT.NOT_FOUND ? null : id;
  },
};

export default cctvLayer;
