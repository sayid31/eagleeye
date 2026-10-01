// Frustum/pose geometry and per-record geometry application moved out of cctv.js.

import * as Cesium from 'cesium';
import { cachedGroundFloor, warmGroundFloor } from './groundFloor.js';
import { sampleMeshFloorCells } from './meshFloorSampler.js';
import { normalizeCalibration } from './cctvCalibrationStore.js';
import { DEFAULT_CAMERA_CALIBRATION, FRUSTUM_GROUND_CLEARANCE_M, PROBE_CLEARANCE_M, PROBE_MIN_RANGE_M, PROJECTION_VERT_ASPECT, WIREFRAME_ZFIGHT_LIFT_M } from './cctvConstants.js';
import { rebuildViewshedVolume } from './cctvCoverage.js';
import { currentSurfaceRegime, groundAltFor, groundPriorAltFor, projectionTilesReady } from './cctvGround.js';
import { clamp, normalizeHeading, offsetDegrees, safeNumber, toRad } from './cctvMath.js';
import { updatePlanePlacement } from './cctvProjectionPlane.js';
import { S } from './cctvState.js';

/**
 * Initializes or recomputes a camera's derived pose fields from its base pose
 * and calibration offsets. Also sets intrinsics, extrinsics, and anchor.
 *
 * On first call for a camera, captures the raw values as `basePose`.
 * Subsequent calls re-derive lat/lon/heading/pitch/fov/range by applying
 * calibration deltas to the frozen base pose.
 *
 * Note: the old score-based quality system (`confidenceFromScore`, seeded
 * `camera.quality.score`) is retired — panel trust signal is now the 3-state
 * CAL badge (`deriveCalBadge`, driven by `calSource`/`poseSource`), not a
 * fabricated confidence score.
 *
 * @param {Object} camera - Mutable camera record.
 */
export function ensureCameraPose(camera) {
  if (!camera) return;
  if (!camera.basePose) {
    camera.basePose = {
      lat: safeNumber(camera.lat, 0),
      lon: safeNumber(camera.lon, 0),
      headingDeg: normalizeHeading(safeNumber(camera.headingDeg, 0)),
      pitchDeg: clamp(safeNumber(camera.pitchDeg, -17), -70, 10),
      fovDeg: clamp(safeNumber(camera.fovDeg, 74), 20, 130),
      rangeM: clamp(safeNumber(camera.rangeM, 700), 120, 5000),
      mountHeightM: clamp(safeNumber(camera.mountHeightM, 24), 2, 240),
    };
  }

  const nextCalibration = normalizeCalibration(camera.calibration || DEFAULT_CAMERA_CALIBRATION);
  camera.calibration = nextCalibration;

  const base = camera.basePose;
  const offsets = offsetDegrees(base.lat, nextCalibration.offsetNorthM, nextCalibration.offsetEastM);
  camera.lat = base.lat + offsets.latOffset;
  camera.lon = base.lon + offsets.lonOffset;
  camera.headingDeg = normalizeHeading(base.headingDeg + nextCalibration.headingDeg);
  camera.pitchDeg = clamp(base.pitchDeg + nextCalibration.pitchDeg, -70, 10);
  camera.fovDeg = clamp(base.fovDeg + nextCalibration.fovDeg, 20, 130);
  camera.rangeM = clamp(base.rangeM * nextCalibration.rangeScale, 120, 5000);
  camera.mountHeightM = clamp(base.mountHeightM + nextCalibration.heightM, 2, 240);

  camera.intrinsics = {
    fovDeg: camera.fovDeg,
    principalPoint: [0.5, 0.5],
  };
  camera.extrinsics = {
    headingDeg: camera.headingDeg,
    pitchDeg: camera.pitchDeg,
    rollDeg: 0,
    heightM: camera.mountHeightM,
  };
  camera.anchor = {
    lat: camera.lat,
    lon: camera.lon,
    elevM: safeNumber(camera.groundElevationM, 0),
    targetLatLon: camera.anchor?.targetLatLon || null,
  };
}

/**
 * Projects a point along a bearing from a given lat/lon by a distance.
 * Uses the spherical-earth direct geodesic formula (R = 6371 km).
 * @param {number} latDeg - Origin latitude (degrees).
 * @param {number} lonDeg - Origin longitude (degrees).
 * @param {number} bearingDeg - Azimuth from north (degrees).
 * @param {number} distanceM - Distance in metres.
 * @returns {{ lat: number, lon: number }} Destination in degrees.
 */
function projectPoint(latDeg, lonDeg, bearingDeg, distanceM) {
  const angular = distanceM / 6371000;
  const bearing = toRad(bearingDeg);
  const lat1 = toRad(latDeg);
  const lon1 = toRad(lonDeg);

  const sinLat2 = Math.sin(lat1) * Math.cos(angular)
    + Math.cos(lat1) * Math.sin(angular) * Math.cos(bearing);
  const lat2 = Math.asin(sinLat2);

  const y = Math.sin(bearing) * Math.sin(angular) * Math.cos(lat1);
  const x = Math.cos(angular) - Math.sin(lat1) * sinLat2;
  const lon2 = lon1 + Math.atan2(y, x);

  return {
    lat: Cesium.Math.toDegrees(lat2),
    lon: Cesium.Math.toDegrees(lon2),
  };
}

/**
 * V2 core geometry (design §2a): computes the pitched frustum pyramid — mount
 * point, far-cap (monitor plane) center, and the 4 far-plane corners — purely
 * from the calibrated pose + a caller-supplied ground altitude. ZERO scene
 * queries: ground sampling happens in the caller (one-shot snap), and the
 * obstruction probe passes its clamp in as `rangeOverrideM`.
 *
 * Math (spherical small-angle offsets; sub-centimetre at ≤2.2 km ranges):
 *   mountAlt  = groundAltM + mountHeightM
 *   capCenter = projectPoint(heading, R·cos(pitch)) @ alt mountAlt + R·sin(pitch)
 *   halfW     = R·tan(hFov/2)
 *   vFov      = 2·atan(tan(hFov/2) / (16/9))   → halfH = R·tan(vFov/2)
 *   upOffset  = cos(pitch)·halfH vertical + (−sin(pitch))·halfH along heading
 *   corners   = (capCenter ∓ halfW toward heading∓90°) ± upOffset
 * The cap CENTER altitude clamps to ≥ groundAltM + 2 m (§6 risk: fabricated
 * pitch must never bury the plane's anchor); corners derive rigidly from the
 * clamped center so the wireframe rays always terminate on the plane's
 * corners — the bottom pair may dip below ground (tiles occlude it).
 *
 * @param {Object} camera - Pose: lat, lon, headingDeg, pitchDeg, fovDeg,
 *   rangeM, mountHeightM.
 * @param {number} groundAltM - Ground altitude at the mount (metres).
 * @param {number|null} [rangeOverrideM=null] - Obstruction-probe clamp: caps the
 *   effective range (never lengthens it).
 * @returns {{ rangeM: number, vFovDeg: number, halfW: number, halfH: number,
 *   mount: {lat:number,lon:number,alt:number},
 *   capCenter: {lat:number,lon:number,alt:number},
 *   corners: { tl: Object, tr: Object, br: Object, bl: Object },
 *   topCenter: {lat:number,lon:number,alt:number}, groundAltM: number }}
 */
export function computeFrustumGeometry(camera, groundAltM, rangeOverrideM = null) {
  const ground = safeNumber(groundAltM, 0);
  const poseRange = Math.max(1, safeNumber(camera.rangeM, 700));
  const override = safeNumber(rangeOverrideM, NaN);
  const R = Number.isFinite(override) && override > 0 ? Math.min(poseRange, override) : poseRange;
  const pitch = toRad(clamp(safeNumber(camera.pitchDeg, -17), -89, 89));
  const hFov = toRad(clamp(safeNumber(camera.fovDeg, 74), 8, 160));
  const heading = safeNumber(camera.headingDeg, 0);
  const mountAlt = ground + safeNumber(camera.mountHeightM, 24);

  const horiz = R * Math.cos(pitch);
  const vert = R * Math.sin(pitch);
  const capLL = projectPoint(camera.lat, camera.lon, heading, horiz);
  const capAlt = mountAlt + vert;

  const halfW = R * Math.tan(hFov / 2);
  const vFovRad = 2 * Math.atan(Math.tan(hFov / 2) / PROJECTION_VERT_ASPECT);
  const halfH = R * Math.tan(vFovRad / 2);

  // In-plane "up" of the pitched cap, decomposed into a vertical part and a
  // horizontal part along the heading (pitch < 0 tilts the cap's top forward).
  const upVert = Math.cos(pitch) * halfH;
  const upHoriz = -Math.sin(pitch) * halfH;

  const capL = projectPoint(capLL.lat, capLL.lon, heading - 90, halfW);
  const capR = projectPoint(capLL.lat, capLL.lon, heading + 90, halfW);
  // Ground clamp (§6 risk): lift the CAP CENTER once so a fabricated pitch
  // never buries the plane's anchor — then derive the corners RIGIDLY from the
  // lifted center. Clamping each corner independently flattened the wireframe
  // into a ground-hugging fan while the rigid plane kept its height (owner
  // field test 2026-07-04): the corner rays must always terminate exactly on
  // the monitor plane's corners. The bottom pair may dip below ground; the 3D
  // tiles occlude that portion, exactly as they do for the plane itself.
  const minAlt = ground + FRUSTUM_GROUND_CLEARANCE_M;
  const capAltClamped = Math.max(minAlt, capAlt);
  const corner = (base, sign) => {
    const ll = projectPoint(base.lat, base.lon, heading, sign * upHoriz);
    return { lat: ll.lat, lon: ll.lon, alt: capAltClamped + sign * upVert };
  };

  const topCenter = corner(capLL, 1);
  return {
    rangeM: R,
    vFovDeg: Cesium.Math.toDegrees(vFovRad),
    halfW,
    halfH,
    mount: { lat: camera.lat, lon: camera.lon, alt: mountAlt },
    capCenter: { lat: capLL.lat, lon: capLL.lon, alt: capAltClamped },
    corners: {
      tl: corner(capL, 1),
      tr: corner(capR, 1),
      br: corner(capR, -1),
      bl: corner(capL, -1),
    },
    topCenter,
    groundAltM: ground,
  };
}

/**
 * Resolves the obstruction probe's effective-range clamp just short of a hit,
 * with the field-derived 12 m floor used by the original H6 monitor.
 * @param {number} rangeM Nominal camera range.
 * @param {number} hitDistanceM Distance to the first obstruction.
 * @returns {number|null} Clamp range, or null when the hit does not shorten it.
 */
export function activationProbeClampRange(rangeM, hitDistanceM) {
  const nominalRange = Number(rangeM);
  const hitDistance = Number(hitDistanceM);
  if (!Number.isFinite(nominalRange) || nominalRange <= 0) return null;
  if (!Number.isFinite(hitDistance) || hitDistance <= 0 || hitDistance >= nominalRange) return null;
  return Math.max(PROBE_MIN_RANGE_M, hitDistance - PROBE_CLEARANCE_M);
}

/**
 * Nudges a Cartesian3 a small constant distance along the local ellipsoid
 * surface normal at that point — enough to separate a near-coincident line
 * from terrain/3D-tile depth without a visually perceptible position shift.
 * @param {Cesium.Cartesian3} position - Point to lift.
 * @param {number} liftM - Distance in metres.
 * @returns {Cesium.Cartesian3} A new, lifted Cartesian3.
 */
function liftAlongSurfaceNormal(position, liftM) {
  const normal = Cesium.Ellipsoid.WGS84.geodeticSurfaceNormal(position, new Cesium.Cartesian3());
  const offset = Cesium.Cartesian3.multiplyByScalar(normal, liftM, new Cesium.Cartesian3());
  return Cesium.Cartesian3.add(position, offset, new Cesium.Cartesian3());
}

/**
 * Converts a computeFrustumGeometry result into the Cartesian3 positions the
 * entities consume. Fresh objects per call (geometry updates are rare —
 * slider/save/activation — and entities must never share scratch objects).
 * `tl`/`tr`/`br`/`bl`/`mount` carry a small WIREFRAME_ZFIGHT_LIFT_M surface-
 * normal lift (z-fighting guard, see constant doc) — this also lifts the
 * viewshed fill volume, which shares these same corners by design.
 * `capCenter` stays unlifted since the monitor plane must weld to the true
 * geometry the geometric coincidence tests assert against.
 * @param {Object} geometry - Result of computeFrustumGeometry.
 * @returns {{ mount: Cesium.Cartesian3, capCenter: Cesium.Cartesian3,
 *   tl: Cesium.Cartesian3, tr: Cesium.Cartesian3, br: Cesium.Cartesian3,
 *   bl: Cesium.Cartesian3, label: Cesium.Cartesian3 }}
 */
export function frustumCartesians(geometry) {
  const at = (p) => Cesium.Cartesian3.fromDegrees(p.lon, p.lat, p.alt);
  const atLifted = (p) => liftAlongSurfaceNormal(at(p), WIREFRAME_ZFIGHT_LIFT_M);
  return {
    mount: atLifted(geometry.mount),
    capCenter: at(geometry.capCenter),
    tl: atLifted(geometry.corners.tl),
    tr: atLifted(geometry.corners.tr),
    br: atLifted(geometry.corners.br),
    bl: atLifted(geometry.corners.bl),
    label: Cesium.Cartesian3.fromDegrees(
      geometry.topCenter.lon,
      geometry.topCenter.lat,
      geometry.topCenter.alt + 1.2
    ),
  };
}

/**
 * Test seam for frustumCartesians (private — entity-position wiring has no
 * other exported entry point). Exercises the WIREFRAME_ZFIGHT_LIFT_M lift.
 * @param {Object} geometry - Result of computeFrustumGeometry.
 * @returns {Object} Same shape as frustumCartesians.
 */
export function _frustumCartesiansForTest(geometry) {
  return frustumCartesians(geometry);
}

/**
 * Unit ECEF direction of the frustum view axis (heading/pitch) at a position.
 * Used by the plane orientation and the activation obstruction probe — both
 * need the UNCLAMPED axis, so it comes from the pose, not from clamped points.
 * @param {Object} camera - Camera pose (headingDeg, pitchDeg).
 * @param {Cesium.Cartesian3} atPos - ECEF position defining the local ENU frame.
 * @returns {{ dir: Cesium.Cartesian3, up: Cesium.Cartesian3 }} View axis + the
 *   frame's in-plane "up" (both unit, mutually perpendicular).
 */
export function frustumFrameEcef(camera, atPos) {
  const h = toRad(camera.headingDeg);
  const p = toRad(camera.pitchDeg);
  const enu = Cesium.Transforms.eastNorthUpToFixedFrame(atPos);
  const rot = Cesium.Matrix4.getMatrix3(enu, new Cesium.Matrix3());
  // ENU components: view axis + the perpendicular "up" of the pitched cap.
  const dirEnu = new Cesium.Cartesian3(
    Math.sin(h) * Math.cos(p),
    Math.cos(h) * Math.cos(p),
    Math.sin(p)
  );
  const upEnu = new Cesium.Cartesian3(
    -Math.sin(p) * Math.sin(h),
    -Math.sin(p) * Math.cos(h),
    Math.cos(p)
  );
  return {
    dir: Cesium.Matrix3.multiplyByVector(rot, dirEnu, new Cesium.Cartesian3()),
    up: Cesium.Matrix3.multiplyByVector(rot, upEnu, new Cesium.Cartesian3()),
  };
}

/**
 * Orientation quaternion for the monitor plane entity: local +Z is the plane
 * normal, pointing BACK along the view axis toward the mount so the textured
 * front face reads correctly from the natural viewpoint (focusCamera flies the
 * viewer to look along the camera heading). Local +X = viewer-right, +Y =
 * frame-up, so the 16:9 texture maps upright and unmirrored. Static geometry —
 * computed only on slider/save/activation, never per frame (§2b).
 * @param {Object} camera - Camera pose.
 * @param {Cesium.Cartesian3} capCenterPos - Plane center in ECEF.
 * @returns {Cesium.Quaternion}
 */
export function planeOrientationFor(camera, capCenterPos) {
  const frame = frustumFrameEcef(camera, capCenterPos);
  const right = Cesium.Cartesian3.cross(frame.dir, frame.up, new Cesium.Cartesian3());
  const normal = Cesium.Cartesian3.negate(frame.dir, new Cesium.Cartesian3());
  const m = new Cesium.Matrix3(
    right.x, frame.up.x, normal.x,
    right.y, frame.up.y, normal.y,
    right.z, frame.up.z, normal.z
  );
  return Cesium.Quaternion.fromRotationMatrix(m);
}

/**
 * Recomputes the pure frustum geometry from the camera pose + the given ground
 * altitude and writes it into the scene: billboard position, the 5 wireframe
 * polylines (4 corner rays + closed far-plane rectangle), and the monitor
 * plane placement. This is the ONLY place v2 geometry is written — called on
 * slider input / save / activation / the one-shot ground snap, never per frame.
 * @param {Object} record - Camera record.
 * @param {number} groundAltM - Ground altitude at the mount (metres).
 */
export function applyFrustumGeometry(record, groundAltM) {
  const geometry = computeFrustumGeometry(record.camera, groundAltM, record.probeClampRangeM);
  const positions = frustumCartesians(geometry);
  record.frustumGeometry = geometry;
  record.frustumPositions = positions;
  record.position = positions.mount;
  record.camera.absoluteHeightM = geometry.mount.alt;
  if (record.billboard) {
    record.billboard.position = positions.mount;
  }
  if (record.coverageEntities?.length >= 5) {
    record.coverageEntities[0].polyline.positions = [positions.mount, positions.tl];
    record.coverageEntities[1].polyline.positions = [positions.mount, positions.tr];
    record.coverageEntities[2].polyline.positions = [positions.mount, positions.br];
    record.coverageEntities[3].polyline.positions = [positions.mount, positions.bl];
    record.coverageEntities[4].polyline.positions = [
      positions.tl, positions.tr, positions.br, positions.bl, positions.tl,
    ];
  }
  // A live viewshed volume tracks its wireframe: rebuild from the SAME fresh
  // positions (weld invariant). Only records currently showing a volume pay
  // this (6 triangles, synchronous — trivial even during slider/gizmo drags).
  // Tint derives from the live active id, not the cached viewshedActiveTint —
  // during an activation switch this runs BEFORE refreshCoverageStyles, and
  // the cache is stale for exactly that window.
  if (record.viewshedPrimitive) {
    rebuildViewshedVolume(record, record.camera.id === S._activeCameraId);
  }
  updatePlanePlacement(record);
  // Gizmo handles track the pose they manipulate: refresh when the ACTIVE
  // camera's geometry rewrites (incl. during its own drag).
  if (S._gizmo?.isEnabled() && record.camera.id === S._activeCameraId) {
    S._gizmo.refresh();
  }
}

/**
 * Refreshes a record's frustum geometry with a regime-aware, ONE-SHOT ground
 * resolution (Task 5, spec §2). Per regime:
 *
 *  - `terrain-globe` (any globe stack): `cachedGroundFloor` returns its DEM
 *    floor because mesh floors are regime-disabled. The exact Re:Earth prior
 *    remains the immediate fallback while that coarse cell warms.
 *  - `google-3d` (photoreal): the shared mesh-floor sampler may refine the
 *    DEM cell once, subject to its existing tiles-ready, distance,
 *    camera-height, and acceptance gates. Geometry reads only
 *    `cachedGroundFloor`, never a CCTV-owned point sample.
 *
 * v2 samples ONLY the mount — the far cap hangs in the air off mountAlt. No
 * timer, no deadband: this function is called only from the staggered
 * geometry queue (the enable-time drain + update()'s one-shot tiles-ready
 * completion re-enqueue), from explicit pose-edit call sites, and from the
 * map-stack regime-change handler.
 * @param {Object} record - Camera record.
 * @param {Object} [options={}]
 * @param {boolean} [options.sampleGround=true] - When false, skip shared
 *   mesh-floor refinement and use the cached/prior ground instead.
 */
export function updateRecordGeometry(record, options = {}) {
  const sampleGround = options.sampleGround !== false;
  const regime = currentSurfaceRegime();
  const point = { lat: record.camera.lat, lon: record.camera.lon };
  warmGroundFloor([point]);

  if (regime === 'terrain-globe') {
    const cachedFloor = cachedGroundFloor(point.lat, point.lon);
    const ground = Number.isFinite(cachedFloor) ? cachedFloor : groundPriorAltFor(record);
    record.groundSamples['terrain-globe'] = ground;
    record.groundResolved['terrain-globe'] = true;
    applyFrustumGeometry(record, ground);
    return;
  }

  // Photoreal regime. Sampling is delegated to the shared coarse-cell
  // sampler. It remains event-driven, one-shot per cell, and keeps its
  // existing acceptance window; CCTV adds no rooftop rejection policy.
  if (sampleGround && projectionTilesReady()) {
    record.groundMeshSampleRequestCount = (record.groundMeshSampleRequestCount || 0) + 1;
    const viewerCarto = S._viewer?.camera?.positionCartographic;
    const excludeObjects = [...(record.coverageEntities || [])];
    if (record.billboard) excludeObjects.push(record.billboard);
    if (record.projection?.planeEntity) excludeObjects.push(record.projection.planeEntity);
    sampleMeshFloorCells(S._viewer?.scene, [point], {
      excludeObjects: excludeObjects.filter(Boolean),
      viewerLat: viewerCarto ? Cesium.Math.toDegrees(viewerCarto.latitude) : undefined,
      viewerLon: viewerCarto ? Cesium.Math.toDegrees(viewerCarto.longitude) : undefined,
    });
  }

  const cachedFloor = cachedGroundFloor(point.lat, point.lon);
  const ground = Number.isFinite(cachedFloor)
    ? cachedFloor
    : groundAltFor(record, 'google-3d');
  applyFrustumGeometry(record, ground);

  record.groundResolved['google-3d'] = Number.isFinite(cachedFloor);
  if (Number.isFinite(cachedFloor)) {
    record.groundSamples['google-3d'] = ground;
  }
}
