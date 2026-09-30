// Coverage wireframes/viewshed volumes, visibility set and focus de-emphasis styling.

import { advanceSpriteFocus, focusAlphaNeedsWrite, focusNowMs, focusPassIsNeeded, getFocusTarget } from './focusDeemphasis.js';
import * as Cesium from 'cesium';
import { createFrustumVolumePrimitive } from './cctvViewshed.js';
import { normalizeCoverageMode } from './cctvCalibrationStore.js';
import { ACTIVE_CAMERA_COLOR, ACTIVE_COVERAGE_CENTER, ACTIVE_COVERAGE_CENTER_DEPTHFAIL, ACTIVE_COVERAGE_EDGE, ACTIVE_COVERAGE_EDGE_DEPTHFAIL, COVERAGE_NEIGHBOR_LIMIT, COVERAGE_NEIGHBOR_RADIUS_KM, IDLE_CAMERA_COLOR, IDLE_COVERAGE_CENTER_MUTED, IDLE_COVERAGE_COLOR, IDLE_COVERAGE_EDGE_MUTED } from './cctvConstants.js';
import { computeFrustumGeometry, frustumCartesians, frustumFrameEcef } from './cctvGeometry.js';
import { groundPriorAltFor } from './cctvGround.js';
import { haversineKm } from './cctvMath.js';
import { clearProjectionOverlay, setPlaneVisible } from './cctvProjectionPlane.js';
import { destroyProjectionRuntime, ensureProjectionRuntime, pauseInactiveProjectionFeeds } from './cctvProjectionRuntime.js';
import { S, _scratchFocusScreen } from './cctvState.js';

/**
 * Focus modulation rides the layer's existing animation loop; no additional
 * scene listener is installed. Only camera-icon alpha changes here — coverage
 * geometry and monitor-plane styling retain their established cadence.
 */
export function refreshCctvFocusStyles(nowMs) {
  nowMs = focusNowMs(nowMs);
  const target = getFocusTarget();
  if (!S._enabled || !S._viewer || !focusPassIsNeeded(target, S._activeFocusStyleCount)) return;
  if (nowMs - S._lastFocusStyleAt < 80) return;
  S._lastFocusStyleAt = nowMs;
  const scene = S._viewer.scene;
  const camera = S._viewer.camera;
  const result = applyCctvFocusDeemphasis({
    records: S._records,
    target,
    previousActiveCount: S._activeFocusStyleCount,
    nowMs,
    screenPositionFor: (position) => (
      Cesium.SceneTransforms.worldToWindowCoordinates(scene, position, _scratchFocusScreen)
    ),
    cameraDistanceFor: (position) => Cesium.Cartesian3.distance(camera.positionWC, position),
    baseColorFor: (record) => (
      record.camera.id === S._activeCameraId ? ACTIVE_CAMERA_COLOR : IDLE_CAMERA_COLOR
    ),
  });
  S._activeFocusStyleCount = result.activeCount;
}

/**
 * Apply the gated CCTV focus pass through the production color path.
 * @param {object} input
 * @returns {{writes:number,transitioning:boolean,activeCount:number,ran:boolean}}
 */
export function applyCctvFocusDeemphasis({
  records,
  target,
  previousActiveCount = 0,
  nowMs,
  screenPositionFor,
  cameraDistanceFor,
  baseColorFor,
  params,
}) {
  if (!focusPassIsNeeded(target, previousActiveCount)) {
    return { writes: 0, transitioning: false, activeCount: 0, ran: false };
  }
  let writes = 0;
  let transitioning = false;
  let activeCount = 0;
  for (const record of records || []) {
    const bb = record.billboard;
    if (!bb) continue;
    const position = bb.position;
    // CCTV never publishes a tracked focus target, so every icon is ambient.
    const focus = advanceSpriteFocus(bb, {
      // Keep hidden icons in the state/release pass so the active count cannot
      // drop while a stale dim alpha remains waiting to reappear.
      screenPosition: bb.show === false || !position ? null : screenPositionFor(position),
      cameraDistance: position ? cameraDistanceFor(position) : Number.NaN,
      nowMs,
      target,
      params,
      spriteHalfWidthPx: (bb.width || 24) * (bb.scale || 1) * 0.5,
      spriteHalfHeightPx: (bb.height || 24) * (bb.scale || 1) * 0.5,
    });
    transitioning ||= focus.transitioning;
    if (focus.active) activeCount += 1;
    const base = baseColorFor(record);
    const alpha = base.alpha * focus.factor;
    if (focusAlphaNeedsWrite(bb.color?.alpha, alpha, params)) {
      // Order-independent narrow amendment to always-visible icons: CCTV
      // contacts retain a non-zero floor while yielding near the tracked target.
      bb.color = base.withAlpha(alpha);
      writes += 1;
    }
  }
  return { writes, transitioning, activeCount, ran: true };
}

/**
 * Returns the camera record for the currently active camera. A stale ID falls
 * back to the first record, but an intentional null remains an honest
 * deselected state.
 * @returns {Object|null} Active camera record, or null when none is active.
 */
export function getActiveRecord() {
  if (!S._activeCameraId) return null;
  if (S._recordById.has(S._activeCameraId)) {
    return S._recordById.get(S._activeCameraId);
  }
  // Sync _activeCameraId when falling back to first record to prevent ID mismatch
  const fallback = S._records[0] || null;
  if (fallback && fallback.camera?.id) {
    S._activeCameraId = fallback.camera.id;
  }
  return fallback;
}

/**
 * Occlusion geometry for whichever CCTV monitor plane is currently showing
 * in the 3D scene — backs `cctvLayer.getOcclusionPlanes()`, the Universal
 * Detection Overlay's per-frame screen-space masking
 * (`detectionPlaneOcclusion.js` — traffic/aircraft/vessel labels whose
 * on-screen position overlaps the plane's projected screen rectangle don't
 * paint, regardless of 3D depth). Only the active camera's plane can ever
 * be showing at once (refreshCoverageStyles' §2c one-plane-at-a-time
 * invariant), so this returns at most one entry — as an array so the
 * caller needs no none-vs-one special-casing.
 *
 * Pure read of already-cached geometry (`frustumGeometry`/`frustumPositions`,
 * rebuilt only on slider/save/activation, §2b) — no scene query, so the
 * zero-raycast-in-steady-state invariant documented on
 * `runActivationObstructionProbe` stays intact.
 * @returns {Array<{center: Cesium.Cartesian3, normal: Cesium.Cartesian3,
 *   right: Cesium.Cartesian3, up: Cesium.Cartesian3, halfWidth: number,
 *   halfHeight: number}>}
 */
export function activeCctvOcclusionPlanes() {
  const record = getActiveRecord();
  const runtime = record?.projection;
  if (!runtime?.planeEntity?.show) return [];
  const geometry = record.frustumGeometry;
  const positions = record.frustumPositions;
  if (!geometry || !positions) return [];
  const frame = frustumFrameEcef(record.camera, positions.capCenter);
  return [{
    center: positions.capCenter,
    normal: Cesium.Cartesian3.negate(frame.dir, new Cesium.Cartesian3()),
    right: Cesium.Cartesian3.cross(frame.dir, frame.up, new Cesium.Cartesian3()),
    up: frame.up,
    halfWidth: geometry.halfW,
    halfHeight: geometry.halfH,
  }];
}

/**
 * Determines which camera coverage overlays should be visible based on
 * proximity to the active camera. Limits visibility to
 * COVERAGE_NEIGHBOR_LIMIT cameras within COVERAGE_NEIGHBOR_RADIUS_KM.
 * @param {Object|null} activeRecord - The active camera record.
 * @returns {Set<string>} Set of visible camera IDs.
 */
function buildCoverageVisibleSet(activeRecord) {
  if (!S._records.length) return new Set();
  // Coverage emphasis is relative to a selected camera. Without one, do not
  // invent an arbitrary catalog-order cohort.
  if (!activeRecord) return new Set();

  const ranked = S._records.map((record) => {
    if (record === activeRecord) {
      return { record, distKm: -1 };
    }
    return {
      record,
      distKm: haversineKm(
        activeRecord.camera.lat,
        activeRecord.camera.lon,
        record.camera.lat,
        record.camera.lon
      ),
    };
  });

  ranked.sort((a, b) => a.distKm - b.distKm);

  const primary = ranked.filter((entry) => entry.distKm <= COVERAGE_NEIGHBOR_RADIUS_KM || entry.distKm === -1);
  const fallback = ranked;
  const chosen = (primary.length >= COVERAGE_NEIGHBOR_LIMIT ? primary : fallback)
    .slice(0, COVERAGE_NEIGHBOR_LIMIT)
    .map((entry) => entry.record.camera.id);
  return new Set(chosen);
}

/**
 * Removes (and destroys) a record's viewshed volume primitive, if any.
 * @param {Object} record - Camera record.
 */
function destroyViewshedVolume(record) {
  if (!record) return;
  if (record.viewshedPrimitive && S._viewer) {
    S._viewer.scene.primitives.remove(record.viewshedPrimitive);
  }
  record.viewshedPrimitive = null;
}

/**
 * (Re)builds a record's translucent viewshed volume from its CURRENT
 * frustumPositions — the same 5 Cartesians the wireframe draws, so the volume
 * is welded to the cone by construction. Called only where the wireframe
 * already rewrites (style refresh on mode/visible-set/active changes,
 * applyFrustumGeometry on pose edits) — no new update cadence, zero scene
 * queries (viewshed design §3b).
 * @param {Object} record - Camera record.
 * @param {boolean} isActive - Active camera gets the brighter fill.
 */
export function rebuildViewshedVolume(record, isActive) {
  destroyViewshedVolume(record);
  if (!S._viewer || !record?.frustumPositions || !record.viewshedColors) return;
  const color = isActive ? record.viewshedColors.fillActive : record.viewshedColors.fill;
  const primitive = createFrustumVolumePrimitive(record.frustumPositions, color);
  // QA tag: the harness counts viewshed volumes by this marker.
  primitive._gevViewshed = record.camera.id;
  record.viewshedPrimitive = S._viewer.scene.primitives.add(primitive);
  record.viewshedActiveTint = !!isActive;
}

/**
 * Hides every per-record CCTV visual without recomputing coverage membership or
 * styles. Disabling makes every visibility branch false, so a direct sweep is
 * sufficient; live viewshed primitives still require explicit destruction.
 *
 * @param {Object[]} records CCTV runtime records.
 * @param {(record: Object) => void} destroyVolume Viewshed teardown callback.
 * @param {string|null} [activeCameraId=null] Active camera whose activation probe must be re-armed.
 */
export function hideCctvRecordVisuals(records, destroyVolume, activeCameraId = null) {
  for (const record of Array.isArray(records) ? records : []) {
    if (record) {
      record.probeClampRangeM = null;
      if (record.camera?.id === activeCameraId) record.activationDone = false;
    }
    for (const entity of record?.coverageEntities || []) entity.show = false;
    if (record?.viewshedPrimitive) destroyVolume?.(record);
    if (record?.projection?.planeEntity) record.projection.planeEntity.show = false;
  }
}

export function hideCctvVisuals() {
  hideCctvRecordVisuals(S._records, destroyViewshedVolume, S._activeCameraId);
  clearProjectionOverlay();
  if (S._billboards) S._billboards.show = false;
  pauseInactiveProjectionFeeds(null);
}

/** Applies coverage visibility/style state and lazily builds eligible sets. */
export function refreshCoverageStyles() {
  const activeRecord = getActiveRecord();
  ensureActiveCoverageEntities(activeRecord);
  const activeId = activeRecord?.camera.id || null;
  const coverageVisible = buildCoverageVisibleSet(activeRecord);
  const coverageOn = S._coverageMode !== 'off';
  const viewshedOn = S._coverageMode === 'viewshed';
  if (coverageOn) {
    ensureVisibleCoverageEntities(S._records, coverageVisible);
  }
  for (const record of S._records) {
    const isActive = record.camera.id === activeId;
    if (record.billboard) {
      record.billboard.color = isActive ? ACTIVE_CAMERA_COLOR : IDLE_CAMERA_COLOR;
      record.billboard.scale = isActive ? 1.25 : 1.0;
      // disableDepthTestDistance stays POSITIVE_INFINITY for every billboard
      // (set at creation) — see the field-test far-zoom submerge fix there.
    }

    if (S._enabled && S._showProjection && isActive) {
      ensureProjectionRuntime(record);
    }
    // One live plane in the world at a time (§2c): only the active camera's
    // far cap carries the monitor plane; idle neighbors get the faint
    // wireframe only.
    const planeShowing = !!(S._enabled && S._showProjection && isActive);

    const inVisibleSet = coverageVisible.has(record.camera.id);
    for (const entity of record.coverageEntities || []) {
      // The frustum wireframe is part of the projection representation —
      // force it on for the active camera and let it read through geometry
      // via depthFailMaterial (polylines have no disableDepthTestDistance).
      entity.show = !!(S._enabled && ((coverageOn && inVisibleSet) || planeShowing));
      if (!entity.polyline) continue;
      // Viewshed mode swaps the cyan/green scheme for the camera's own hue so
      // adjacent cones read as distinct coverage claims (design §3b); the
      // active camera keeps its width/alpha emphasis in both schemes.
      const hue = viewshedOn ? record.viewshedColors : null;
      if (entity._coverageRole === 'cap') {
        entity.polyline.material = hue
          ? (isActive ? hue.lineActive : hue.line)
          : (isActive ? ACTIVE_COVERAGE_CENTER : IDLE_COVERAGE_CENTER_MUTED);
        entity.polyline.width = isActive ? 2.2 : 1.0;
        entity.polyline.depthFailMaterial = planeShowing
          ? (hue ? hue.line.withAlpha(0.26) : ACTIVE_COVERAGE_CENTER_DEPTHFAIL)
          : undefined;
      } else {
        entity.polyline.material = hue
          ? (isActive ? hue.lineActive : hue.line.withAlpha(0.6))
          : (isActive ? ACTIVE_COVERAGE_EDGE : IDLE_COVERAGE_EDGE_MUTED);
        entity.polyline.width = isActive ? 1.8 : 0.9;
        entity.polyline.depthFailMaterial = planeShowing
          ? (hue ? hue.line.withAlpha(0.18) : ACTIVE_COVERAGE_EDGE_DEPTHFAIL)
          : undefined;
      }
    }

    // Viewshed volume lifecycle: exists iff enabled + viewshed mode + in the
    // visible set. Rebuild on active-tint flips (rare); otherwise leave the
    // primitive alone so idle refreshes never churn geometry.
    //
    // Excluded when the active camera's monitor plane is showing: the fill
    // volume is welded to the exact same far-cap corners as the plane
    // (frustumVolumeGeometryData / createProjectionPlane share one frustum
    // geometry source), so its cull-disabled, translucent faces render
    // coincident with the plane's live video texture — stacking up to a
    // near-opaque hue-colored block that hides the feed entirely (owner
    // report 2026-09-14: Bandung "Buahbatu" camera showed solid red with
    // Viewshed ON instead of live video; that camera's golden-angle hue
    // happens to land near 0deg/red). The wireframe (still hue-tinted above)
    // already carries the coverage-color identity without occluding the
    // plane, so only the fill is skipped — not the whole viewshed presence.
    const wantVolume = !!(
      S._enabled && viewshedOn && inVisibleSet && record.frustumPositions
      && !(isActive && planeShowing)
    );
    if (wantVolume) {
      if (!record.viewshedPrimitive || record.viewshedActiveTint !== isActive) {
        rebuildViewshedVolume(record, isActive);
      }
    } else if (record.viewshedPrimitive) {
      destroyViewshedVolume(record);
    }

    if (record.projection) {
      setPlaneVisible(record.projection, planeShowing);
    }
  }

  if (S._billboards) S._billboards.show = !!S._enabled;
  pauseInactiveProjectionFeeds(activeId);
}

/**
 * Finds the camera closest to the Cesium viewer's current position.
 * @returns {string|null} Camera ID of the nearest camera, or null.
 */
export function nearestCameraIdToViewer() {
  const carto = S._viewer?.camera?.positionCartographic;
  if (!carto || !S._records.length) return null;
  const lat = Cesium.Math.toDegrees(carto.latitude);
  const lon = Cesium.Math.toDegrees(carto.longitude);

  let best = null;
  for (const record of S._records) {
    const distKm = haversineKm(lat, lon, record.camera.lat, record.camera.lon);
    if (!best || distKm < best.distKm) {
      best = { id: record.camera.id, distKm };
    }
  }
  return best?.id || null;
}

/**
 * Counts how many other cameras have overlapping coverage with the target.
 * Overlap is approximated by comparing inter-camera distance against the
 * combined range of both cameras (scaled by 0.92).
 * @param {Object} targetRecord - Camera record to check.
 * @returns {number} Number of overlapping neighbors.
 */
export function coverageNeighborCount(targetRecord) {
  if (!targetRecord) return 0;
  let count = 0;
  for (const record of S._records) {
    if (record === targetRecord) continue;
    const dKm = haversineKm(
      targetRecord.camera.lat,
      targetRecord.camera.lon,
      record.camera.lat,
      record.camera.lon
    );
    const overlapKm = (targetRecord.camera.rangeM + record.camera.rangeM) / 1000 * 0.92;
    if (dKm <= overlapKm) count++;
  }
  return count;
}

/**
 * Creates the five Cesium polyline entities that visualize a camera's pitched
 * frustum: 4 corner rays (mount → far-plane corner) + the closed far-plane
 * rectangle. Entity ids stay in the `cctv-<id>-<role>` scheme (pick-owner
 * regex depends on it): roles ray-tl / ray-tr / ray-br / ray-bl / cap.
 * @param {Object} record - Camera record.
 * @returns {Cesium.Entity[]} Array of five coverage entities.
 */
function buildCoverageEntities(record) {
  const { camera } = record;
  // Prefer the record's already-refined geometry. Lazy creation commonly
  // happens after the staggered ground pass; recomputing from the catalog
  // prior here would regress the camera to its pre-sampled datum.
  let geometry = record.frustumGeometry;
  let positions = record.frustumPositions;
  if (!geometry || !positions) {
    geometry = computeFrustumGeometry(
      camera,
      groundPriorAltFor(record),
      record.probeClampRangeM
    );
    positions = frustumCartesians(geometry);
    record.frustumGeometry = geometry;
    record.frustumPositions = positions;
    record.position = positions.mount;
  }

  const addPolyline = (role, linePositions) => S._viewer.entities.add({
    id: `cctv-${camera.id}-${role}`,
    properties: { cctvCameraId: camera.id },
    polyline: {
      positions: linePositions,
      width: 1.2,
      material: IDLE_COVERAGE_COLOR,
    },
  });

  const entities = [
    addPolyline('ray-tl', [positions.mount, positions.tl]),
    addPolyline('ray-tr', [positions.mount, positions.tr]),
    addPolyline('ray-br', [positions.mount, positions.br]),
    addPolyline('ray-bl', [positions.mount, positions.bl]),
    addPolyline('cap', [positions.tl, positions.tr, positions.br, positions.bl, positions.tl]),
  ];

  entities[0]._coverageRole = 'edge';
  entities[1]._coverageRole = 'edge';
  entities[2]._coverageRole = 'edge';
  entities[3]._coverageRole = 'edge';
  entities[4]._coverageRole = 'cap';
  return entities;
}

/**
 * Materializes coverage entities for eligible records exactly once.
 * The helper is dependency-injected so unit tests can prove the enable policy
 * without constructing Cesium entities.
 *
 * @param {Object[]} records CCTV runtime records.
 * @param {(record: Object) => boolean} [isEligible] Eligibility predicate.
 * @param {(record: Object) => Object[]} buildEntities Coverage builder.
 * @returns {Object[]} Newly created entities across all eligible records.
 */
export function materializeCctvCoverageEntities(
  records,
  isEligible = () => true,
  buildEntities,
) {
  const created = [];
  if (typeof buildEntities !== 'function') return created;
  for (const record of Array.isArray(records) ? records : []) {
    if (!record || record.coverageEntities?.length || !isEligible(record)) continue;
    const entities = buildEntities(record);
    record.coverageEntities = Array.isArray(entities) ? entities.filter(Boolean) : [];
    created.push(...record.coverageEntities);
  }
  return created;
}

/** Materializes one active camera's coverage set. */
export function materializeCctvActiveCoverageEntities(record, buildEntities) {
  return materializeCctvCoverageEntities([record], () => true, buildEntities);
}

/** Materializes only records in the current coverage-visible ID set. */
export function materializeCctvVisibleCoverageEntities(records, visibleIds, buildEntities) {
  const eligibleIds = visibleIds instanceof Set ? visibleIds : new Set(visibleIds || []);
  return materializeCctvCoverageEntities(
    records,
    (record) => eligibleIds.has(record.camera?.id),
    buildEntities,
  );
}

/** Registers newly built coverage entities with the layer-global collection. */
function registerCoverageEntities(created) {
  S._coverageEntities.push(...created);
  return created;
}

export function ensureActiveCoverageEntities(record) {
  return registerCoverageEntities(
    materializeCctvActiveCoverageEntities(record, buildCoverageEntities),
  );
}

function ensureVisibleCoverageEntities(records, visibleIds) {
  return registerCoverageEntities(
    materializeCctvVisibleCoverageEntities(records, visibleIds, buildCoverageEntities),
  );
}

/**
 * Removes all coverage entities and projection runtimes from the scene.
 */
export function destroyCoverageEntities() {
  if (!S._viewer) return;
  for (const entity of S._coverageEntities) {
    S._viewer.entities.remove(entity);
  }
  S._coverageEntities = [];

  for (const record of S._records) {
    destroyViewshedVolume(record);
  }

  for (const runtime of S._projectionEntities) {
    destroyProjectionRuntime(runtime);
  }
  S._projectionEntities = [];
}

/**
 * Primes the minimum module state needed to exercise the production coverage
 * refresh path in unit tests.
 * @param {Object} [options={}] Test state values.
 * @param {Object|null} [options.viewer] Viewer-like entity owner.
 * @param {Object[]} [options.records] Seeded CCTV records.
 * @param {string|null} [options.activeCameraId] Active record id.
 * @param {boolean} [options.enabled=true] Layer enabled state.
 * @param {'off'|'on'|'viewshed'} [options.coverageMode='on'] Coverage mode.
 * @param {boolean} [options.showProjection=false] Projection visibility.
 * @returns {void}
 */
export function _setCctvCoverageStateForTest({
  viewer = null,
  records = [],
  activeCameraId = null,
  enabled = true,
  coverageMode = 'on',
  showProjection = false,
} = {}) {
  S._viewer = viewer;
  S._records = Array.isArray(records) ? records : [];
  S._recordById = new Map(
    S._records
      .filter((record) => record?.camera?.id)
      .map((record) => [record.camera.id, record]),
  );
  S._coverageEntities = [];
  S._projectionEntities = [];
  S._billboards = null;
  S._activeCameraId = activeCameraId;
  S._autoHopSuspended = false;
  S._enabled = !!enabled;
  S._coverageMode = normalizeCoverageMode(coverageMode, 'on');
  S._showProjection = !!showProjection;
}
