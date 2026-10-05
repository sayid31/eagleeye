// Camera activation/deactivation, click gesture, focus and auto-hop.

import { createCalibrationGizmo } from './cctvGizmo.js';
import * as Cesium from 'cesium';
import { bindTrackingClickGesture, isTrackingClickGesture } from './trackingClickGesture.js';
import { CCTV_ACTIVATION_RESULT } from '../cctvFocusRequest.js';
import { resolvePickId } from './pickRegistry.js';
import { CCTV_FOCUS_RESULT } from './cctvFocusResult.js';
import { clearHoverCard, refreshAmbientCards, teardownAmbientCards } from './cctvAmbientCards.js';
import { applyCalibrationPatch, normalizeCalibration } from './cctvCalibrationStore.js';
import { currentViewContext } from './cctvCatalog.js';
import { ensureActiveCoverageEntities, getActiveRecord, nearestCameraIdToViewer, refreshCoverageStyles } from './cctvCoverage.js';
import { activationProbeClampRange, applyFrustumGeometry, frustumFrameEcef, updateRecordGeometry } from './cctvGeometry.js';
import { stopGeometryLoadQueue } from './cctvGeometryQueue.js';
import { groundAltFor, rearmGroundResolution, resolveCommittedGroundAnchor } from './cctvGround.js';
import { toRad } from './cctvMath.js';
import { refreshProjectionImage } from './cctvProjectionFrames.js';
import { clearProjectionOverlay } from './cctvProjectionPlane.js';
import { ensureProjectionRuntime, startProjectionLoop } from './cctvProjectionRuntime.js';
import { notifyListeners } from './cctvPublicState.js';
import { S } from './cctvState.js';

/**
 * Lazily creates the calibration gizmo controller. The gizmo sees the layer
 * only through these callbacks: it attaches to the active record while the
 * layer is enabled AND ADJUST mode is on, funnels drags through
 * applyCalibrationPatch (transient), and runs the commit tail on release.
 */
export function ensureGizmo() {
  if (S._gizmo || !S._viewer) return;
  // Both patch callbacks receive the gizmo's PINNED drag record — never
  // re-resolve the active camera here: a mid-drag voice select or auto-hop
  // would route the captured offsets onto a camera with a different basePose.
  const liveRecord = (record) => (
    record && S._recordById.get(record.camera?.id) === record ? record : null
  );
  S._gizmo = createCalibrationGizmo({
    viewer: S._viewer,
    getActiveRecord: () => (S._enabled && S._calibrationMode ? getActiveRecord() : null),
    applyPatch: (patch, draggedRecord) => {
      const record = S._enabled && S._calibrationMode ? liveRecord(draggedRecord) : null;
      if (record) applyCalibrationPatch(record, patch, { transient: true });
    },
    endPatch: (draggedRecord) => {
      const record = liveRecord(draggedRecord);
      if (!record) return;
      if (record.calibrationAnchorDirty) {
        record.calibrationAnchorDirty = false;
        resolveCommittedGroundAnchor(record);
      } else {
        applyFrustumGeometry(record, groundAltFor(record));
      }
      refreshProjectionImage(record, true);
      refreshCoverageStyles();
      notifyListeners();
    },
  });
}

/**
 * §9.1 activation obstruction probe (LOCKED owner decision): on camera
 * ACTIVATION only, fire ONE scene.pickFromRay along the frustum axis
 * (mount → cap-center direction). If it hits the tiles closer than the pose
 * range, clamp the plane's effective range just short of the first hit so the
 * "big and dramatic" true end cap never clips into downtown buildings.
 *
 * This is the ONLY raycast in the whole CCTV subsystem — once per activation,
 * never per-frame (the zero-raycast invariant applies to steady state). The
 * per-camera range slider overrides the clamp: a user-set rangeScale skips the
 * probe entirely. Probe failure/miss keeps the unclamped range.
 * @param {Object} record - Camera record being activated.
 */
function runActivationObstructionProbe(record) {
  record.probeClampRangeM = null;
  const scene = S._viewer?.scene;
  if (!scene || typeof scene.pickFromRay !== 'function') return;
  const camera = record.camera;
  const rangeScale = normalizeCalibration(camera.calibration).rangeScale;
  if (Math.abs(rangeScale - 1) > 0.0001) return; // slider overrides the clamp
  try {
    const mountAlt = groundAltFor(record) + camera.mountHeightM;
    const mountPos = Cesium.Cartesian3.fromDegrees(camera.lon, camera.lat, mountAlt);
    const { dir } = frustumFrameEcef(camera, mountPos);
    // Exclude everything the layer itself draws so the probe can only hit the
    // world (3D tiles), not our own billboards/polylines/planes.
    const exclude = [S._billboards, ...S._coverageEntities];
    for (const runtime of S._projectionEntities) {
      if (runtime?.planeEntity) exclude.push(runtime.planeEntity);
    }
    const hit = scene.pickFromRay(new Cesium.Ray(mountPos, dir), exclude);
    if (!hit?.position) return;
    const dist = Cesium.Cartesian3.distance(mountPos, hit.position);
    record.probeClampRangeM = activationProbeClampRange(camera.rangeM, dist);
  } catch {
    // probe failure → keep the unclamped range
  }
}

/**
 * Clears a deactivated camera's temporary obstruction clamp and rewrites its
 * geometry through the normal single-range path.
 * @param {Object|null} record Camera runtime record being deactivated.
 * @param {(record: Object) => void} rewriteGeometry Nominal geometry rewrite.
 * @returns {boolean} Whether a clamp was cleared.
 */
export function clearProbeClampOnDeactivation(record, rewriteGeometry) {
  if (!record || !Number.isFinite(record.probeClampRangeM)) return false;
  record.probeClampRangeM = null;
  rewriteGeometry?.(record);
  return true;
}

/**
 * Reports whether selecting a record must run the full activation path.
 * Disable re-arms the still-active record so its obstruction probe runs again
 * on its next real activation after the temporary clamp is cleared.
 * @param {string} cameraId Requested camera ID.
 * @param {string|null} activeCameraId Current active camera ID.
 * @param {Object|null} record Requested camera runtime record.
 * @returns {boolean} Whether activation work must run.
 */
export function cctvRecordNeedsActivation(cameraId, activeCameraId, record) {
  return cameraId !== activeCameraId || record?.activationDone !== true;
}

/**
 * Bind CCTV activation to clean taps while preserving the layer's hover-move
 * callback on the shared Cesium handler. Drag-like and long-press gestures do
 * not reach camera activation or focus dispatch.
 * @param {Cesium.ScreenSpaceEventHandler|Object} handler - Input handler.
 * @param {(click: Object) => void} onClick - Accepted CCTV click callback.
 * @param {Object} [options] - Gesture test seams and optional onMouseMove hook.
 * @returns {void}
 */
export function bindCctvWorldClickGesture(handler, onClick, options = {}) {
  bindTrackingClickGesture(handler, (click, gesture) => {
    if (!isTrackingClickGesture(gesture)) return;
    onClick(click);
  }, options);
}

/**
 * Sets the active camera by ID, initializes its projection runtime, refreshes
 * its frame, and updates styles.
 * @param {string} cameraId - ID of the camera to activate.
 * @returns {'activated'|'unchanged'|'not-found'} Discriminated activation result.
 */
export function setActiveCamera(cameraId) {
  if (!cameraId || !S._recordById.has(cameraId)) return CCTV_ACTIVATION_RESULT.NOT_FOUND;
  const record = S._recordById.get(cameraId);
  const previousActiveRecord = getActiveRecord();
  // Re-selecting the already-active camera is a no-op: re-running the
  // activation path re-probes and rewrites the plane entity's geometry, and
  // that async primitive rebuild visibly flashes the monitor plane (owner
  // field test 2026-07-04 — every click ON the plane picks its own camera).
  // `activationDone` distinguishes a real activation from the enable()-time
  // default `_activeCameraId` assignment, which never ran this path.
  if (!cctvRecordNeedsActivation(cameraId, S._activeCameraId, record)) {
    return CCTV_ACTIVATION_RESULT.UNCHANGED;
  }
  S._activeCameraId = cameraId;
  S._defaultCameraPending = false;
  S._autoHopSuspended = false;
  // A real activation creates projection work — wake the self-stopping loop.
  startProjectionLoop();
  if (previousActiveRecord && previousActiveRecord !== record) {
    clearProbeClampOnDeactivation(previousActiveRecord, (previous) => {
      applyFrustumGeometry(previous, groundAltFor(previous));
    });
  }
  // The clicked camera leaves the ambient quota immediately (never graced).
  // Shipped behavior publishes no card for it because the monitor plane is
  // now the active representation; the opt-in protected-card path republishes
  // it synchronously through refreshAmbientCards() below.
  S._cardIds.delete(cameraId);
  S._cardGraceState.delete(cameraId);
  // Activating the hovered camera consumes the transient pin; the active
  // monitor plane replaces it from this moment.
  if (S._hoverCardId === cameraId) clearHoverCard();
  // If the record's geometry refinement is still queued, jump it to the front
  // so the newly active camera resolves before idle neighbors.
  const queueIdx = S._geoQueue.indexOf(record);
  if (queueIdx > 0) {
    S._geoQueue.splice(queueIdx, 1);
    S._geoQueue.unshift(record);
  }
  // §9.1: one obstruction probe per activation, BEFORE the geometry pass so
  // the range clamp lands in the same rewrite. A FIRST-EVER activation (no
  // real ground sample yet) probes from the catalog-prior altitude — if that
  // prior is off, the clamp is measured from a shifted origin, but a
  // re-activation after the one-shot snap lands re-probes from real ground,
  // so it self-corrects.
  runActivationObstructionProbe(record);
  // Coverage is activation-lazy even while the mode is OFF: the active
  // camera's projection representation must be ready without materializing
  // any idle neighbor. The following geometry rewrite welds these entities to
  // the current sampled positions.
  ensureActiveCoverageEntities(record);
  ensureProjectionRuntime(record);
  refreshProjectionImage(record, true);
  // FIX B9b: an explicit user (re)select re-arms one real ground sample for the
  // newly-active camera, then freezes. Idle neighbors keep their resolved state.
  // FIX B9c: if tiles are ready this real pass applies + re-resolves
  // immediately; if tiles are still streaming, updateRecordGeometry's fallback
  // guard recomputes purely from the cached real ground (the pose + the probe
  // clamp above still land — no scene queries) and the record stays unresolved
  // until update()'s one-shot tiles-ready completion pass re-grounds it.
  rearmGroundResolution(record);
  updateRecordGeometry(record);
  record.activationDone = true;
  refreshCoverageStyles();
  // The newly active camera leaves the ambient ring (its monitor plane takes
  // over); the freed slot re-fills on this same pass.
  refreshAmbientCards();
  // ADJUST mode follows the active camera.
  S._gizmo?.refresh();
  notifyListeners();
  return CCTV_ACTIVATION_RESULT.ACTIVATED;
}

/**
 * Clears the active CCTV camera in place without moving the viewer or
 * disabling the layer. The normal selection-refresh path releases the active
 * projection, emphasis, and probe state while ambient cards remain available.
 * @returns {boolean} True when a camera was deactivated.
 */
export function deactivateActiveCamera() {
  const record = S._activeCameraId ? S._recordById.get(S._activeCameraId) : null;
  if (!record) return false;
  S._activeCameraId = null;
  S._defaultCameraPending = false;
  S._autoHopSuspended = true;
  record.activationDone = false;
  clearProbeClampOnDeactivation(record, (previous) => {
    applyFrustumGeometry(previous, groundAltFor(previous));
  });
  refreshCoverageStyles();
  refreshAmbientCards();
  S._gizmo?.refresh();
  notifyListeners();
  return true;
}

/**
 * True only for a clean click that is empty from CCTV's perspective: an
 * active camera exists, ADJUST does not own the pointer, and the scene pick
 * carries no canonical object ID. Any identified scene object is non-empty,
 * including selectable siblings that do not participate in the pick registry.
 * @param {Object|null} picked - `scene.pick()` result.
 * @param {Object} [context]
 * @param {string|null} [context.activeCameraId]
 * @param {boolean} [context.calibrationMode]
 * @returns {boolean}
 */
export function cctvEmptyClickDeselects(picked, {
  activeCameraId = null,
  calibrationMode = false,
} = {}) {
  if (!activeCameraId || calibrationMode) return false;
  return resolvePickId(picked) === null;
}

/**
 * Extracts a camera ID from a Cesium pick result by checking billboard IDs,
 * primitive IDs, and entity cctvCameraId properties.
 * @param {Object|null} picked - Result from scene.pick().
 * @returns {string|null} Camera ID, or null if the pick is not a CCTV entity.
 */
export function extractPickedCameraId(picked) {
  if (!picked) return null;

  const entity = picked.id?.properties ? picked.id : picked.primitive?.id?.properties ? picked.primitive.id : null;
  const maybeProp = entity?.properties?.cctvCameraId;
  if (maybeProp) {
    const value = typeof maybeProp.getValue === 'function'
      ? maybeProp.getValue(Cesium.JulianDate.now())
      : maybeProp;
    const record = typeof value === 'string' ? S._recordById.get(value) : null;
    const ownsCoverageEntity = Boolean(record?.coverageEntities?.includes(entity));
    const ownsProjectionEntity = record?.projection?.planeEntity === entity
      || S._projectionEntities.some((runtime) => (
        runtime?.cameraId === value && runtime.planeEntity === entity
      ));
    if (record && (ownsCoverageEntity || ownsProjectionEntity)) return value;
  }

  // Camera billboard IDs are intentionally the upstream camera ID, so a
  // sibling may legitimately use the same string. A bare ID match is not
  // ownership proof: require this layer's billboard collection or the exact
  // billboard stored on the record.
  const directId = typeof picked.id === 'string'
    ? picked.id
    : typeof picked.primitive?.id === 'string' ? picked.primitive.id : null;
  const record = directId === null ? null : S._recordById.get(directId);
  if (!record) return null;
  return picked.primitive === S._billboards || picked.primitive === record.billboard
    ? directId
    : null;
}

/** Test-only seam for the CCTV ownership proof used by the world-click route. */
export function _extractPickedCameraIdForTest(picked) {
  return extractPickedCameraId(picked);
}

/** Resets all module-scoped runtime state to initial values. */
export function clearRuntimeState() {
  stopGeometryLoadQueue();
  // Idempotent — also covers a re-init without a prior destroy().
  teardownAmbientCards();
  clearProjectionOverlay();
  S._records = [];
  S._recordById = new Map();
  S._healthById = new Map();
  S._count = 0;
  S._lastUpdate = null;
  S._lastHealthSyncAt = 0;
  S._lastError = null;
  S._lastFocusStyleAt = 0;
  S._activeFocusStyleCount = 0;
  // FIX ①/③: the discovered tileset handle is scene-scoped — drop it so a fresh
  // init re-discovers against the current scene primitives.
  S._activeTileset = null;
  // Task 5: the applied-regime tracker is record-set-scoped — a fresh init
  // recomputes it against the then-current scene.
  S._lastAppliedRegime = null;
}

/**
 * Flies the Cesium viewer camera to frame the specified CCTV camera,
 * looking along its heading from above.
 * @param {Cesium.Viewer|null} viewer Cesium viewer that owns the camera.
 * @param {Object|null} record CCTV camera runtime record.
 * @param {number} [duration=2.2] - Flight duration in seconds.
 * @returns {'focused'|'no-active-camera'|'tracking-holds-view'|'cockpit-active'} Focus result.
 */
export function focusCctvRecord(viewer, record, duration = 2.2) {
  if (!viewer || !record) return CCTV_FOCUS_RESULT.NO_ACTIVE_CAMERA;
  if (typeof document !== 'undefined'
    && document.body?.classList.contains('cockpit-mode')) {
    console.debug('[Data:CCTV] focus ignored while cockpit owns the camera');
    return CCTV_FOCUS_RESULT.COCKPIT_ACTIVE;
  }
  if (viewer.trackedEntity) {
    console.debug('[Data:CCTV] focus ignored while a tracked entity owns the camera');
    return CCTV_FOCUS_RESULT.TRACKING_HOLDS_VIEW;
  }
  const { camera } = record;
  const range = Math.max(280, camera.rangeM * 1.18);
  viewer.camera.flyToBoundingSphere(
    new Cesium.BoundingSphere(record.position, Math.max(40, camera.rangeM * 0.36)),
    {
      offset: new Cesium.HeadingPitchRange(
        toRad(camera.headingDeg),
        toRad(-22),
        range
      ),
      duration: Math.max(0.2, duration || 0),
      easingFunction: Cesium.EasingFunction.CUBIC_IN_OUT,
    }
  );
  return CCTV_FOCUS_RESULT.FOCUSED;
}

export function focusCamera(cameraId, duration = 2.2) {
  return focusCctvRecord(S._viewer, S._recordById.get(cameraId), duration);
}

/**
 * Advances to the next camera if auto-hop is enabled and the hop interval
 * has elapsed. If the viewer has panned to a new region since the last hop,
 * snaps to the nearest camera instead of cycling sequentially.
 * @param {number} nowMs - Current timestamp in milliseconds.
 */
export function maybeAutoHop(nowMs) {
  if (!S._autoHop || S._autoHopSuspended || !S._enabled || S._records.length < 2) return;
  if (nowMs - S._lastHopAt < S._autoHopSec * 1000) return;

  const viewKey = currentViewContext();
  const viewChanged = viewKey !== S._lastViewContext;
  S._lastViewContext = viewKey;

  if (viewChanged) {
    const nearest = nearestCameraIdToViewer();
    if (nearest && nearest !== S._activeCameraId) {
      // Use setActiveCamera so the full activation path runs (obstruction
      // probe, projection runtime, geometry rewrite) — previously bypassed
      // with a bare assignment
      setActiveCamera(nearest);
      S._lastHopAt = nowMs;
      return;
    }
  }

  const nextIdx = cctvCycleIndex(
    S._records.findIndex((record) => record.camera.id === S._activeCameraId),
    1,
    S._records.length,
  );
  setActiveCamera(S._records[nextIdx].camera.id);
  S._lastHopAt = nowMs;
}

/**
 * Resolves a catalog cycle target, including the explicit no-selection state.
 * NEXT from null selects the first record; PREV selects the last.
 * @param {number} currentIdx
 * @param {number} step
 * @param {number} count
 * @returns {number}
 */
export function cctvCycleIndex(currentIdx, step, count) {
  const total = Number.isFinite(count) ? Math.floor(count) : 0;
  if (total <= 0) return -1;
  const delta = Number.isFinite(step) ? Math.trunc(step) : 1;
  if (!Number.isFinite(currentIdx) || currentIdx < 0) {
    return delta < 0 ? total - 1 : 0;
  }
  return (((Math.floor(currentIdx) + delta) % total) + total) % total;
}
