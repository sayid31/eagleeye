/**
 * @module data/rocketOrbitMath
 * Pure orbital/replay-path math extracted from rocketLaunches.js: mission
 * timeline duration estimates, replay-speed normalization, reconstructed
 * ascent/orbit geometry, and the mission-path builder that stitches an
 * ascent onto its selected orbit. None of these functions touch the Cesium
 * viewer, DOM, or module-level layer state — everything here is safe to
 * unit-test in isolation.
 */
import * as Cesium from 'cesium';

const REPLAY_ASCENT_FALLBACK_SEC = 12;
const REPLAY_ASCENT_MIN_SEC = 8;
const REPLAY_ASCENT_MAX_SEC = 36;
export const REPLAY_SPEED_MIN = 0.25;
export const REPLAY_SPEED_MAX = 4;
const REPLAY_SPEED_STEP = 0.25;
const EARTH_ROTATION_RAD_PER_SEC = Cesium.Math.TWO_PI / 86164.0905;
const PROJECTED_ASCENT_ROTATION_SEC = 600;

const _pathDistanceCache = new WeakMap();

/**
 * Derive the disclosed orbit-insertion offset from a launch's timeline, in
 * seconds since liftoff. Prefers explicit deployment/separation events, then
 * second-engine-cutoff, then the latest disclosed event as a fallback.
 * @param {object} launch Normalized launch record.
 * @returns {number|null} Offset in seconds, or null if no timeline data.
 */
export function orbitInsertionOffsetSeconds(launch) {
  const events = (launch.timeline || []).filter((event) => Number.isFinite(event.offsetSeconds) && event.offsetSeconds >= 0);
  if (!events.length) return null;
  const deployment = events.filter((event) => /deploy|payload separation|spacecraft separation|orbit insertion|injection/i.test(event.name));
  if (deployment.length) return Math.max(...deployment.map((event) => event.offsetSeconds));
  const engineCutoff = events.filter((event) => /seco|second engine cutoff/i.test(event.name));
  if (engineCutoff.length) return Math.max(...engineCutoff.map((event) => event.offsetSeconds));
  return Math.max(...events.map((event) => event.offsetSeconds));
}

/**
 * Estimate an orbital period from a sampled orbit path's mean radius.
 * @param {Cesium.Cartesian3[]} orbitPath Orbit sample points.
 * @returns {number} Estimated period in seconds (falls back to 5400s / LEO).
 */
export function estimatedOrbitPeriodSeconds(orbitPath) {
  if (!orbitPath?.length) return 5400;
  const meanRadius = orbitPath.reduce((total, point) => total + Cesium.Cartesian3.magnitude(point), 0) / orbitPath.length;
  return 2 * Math.PI * Math.sqrt((meanRadius ** 3) / 3.986004418e14);
}

/**
 * Derive a compressed but mission-specific ascent replay duration.
 * Launch Library timelines are authoritative when they expose insertion,
 * SECO, or separation timing. Sparse records fall back to the reconstructed
 * path length and a conservative ascent velocity estimate.
 * @param {object} launch Normalized launch record.
 * @param {Cesium.Cartesian3[]} ascentPath Reconstructed or supplied ascent.
 * @returns {number} Replay duration in seconds.
 */
export function replayAscentDurationSeconds(launch, ascentPath = []) {
  const disclosedSeconds = orbitInsertionOffsetSeconds(launch);
  let realAscentSeconds = disclosedSeconds > 0 ? disclosedSeconds : null;
  if (!realAscentSeconds && ascentPath.length > 1) {
    const pathLength = ascentPath.slice(1).reduce(
      (total, point, index) => total + Cesium.Cartesian3.distance(ascentPath[index], point),
      0,
    );
    realAscentSeconds = Math.max(180, pathLength / 9000);
  }
  if (!realAscentSeconds) realAscentSeconds = REPLAY_ASCENT_FALLBACK_SEC * 50;
  return Cesium.Math.clamp(
    REPLAY_ASCENT_FALLBACK_SEC * (realAscentSeconds / 600),
    REPLAY_ASCENT_MIN_SEC,
    REPLAY_ASCENT_MAX_SEC,
  );
}

/**
 * Clamp and snap a replay speed multiplier to the supported slider range.
 * @param {number|string} value Requested playback multiplier.
 * @returns {number} Supported multiplier between 0.25x and 4x.
 */
export function normalizeReplaySpeed(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 1;
  const clamped = Cesium.Math.clamp(numeric, REPLAY_SPEED_MIN, REPLAY_SPEED_MAX);
  return Math.round(clamped / REPLAY_SPEED_STEP) * REPLAY_SPEED_STEP;
}

/**
 * Preserve replay elapsed time when resuming after a pause.
 * @param {number} startedAt Original replay start epoch in milliseconds.
 * @param {number} pausedAt Pause epoch in milliseconds.
 * @param {number} resumedAt Resume epoch in milliseconds.
 * @returns {number} Shifted start epoch.
 */
export function replayStartAfterPause(startedAt, pausedAt, resumedAt) {
  if (![startedAt, pausedAt, resumedAt].every(Number.isFinite)) return startedAt;
  return startedAt + Math.max(0, resumedAt - pausedAt);
}

/**
 * Resolve the current replay phase (ascent/orbit), progress, and countdown
 * state from a wall-clock epoch and the mission's timing parameters.
 * @returns {object} Replay phase state.
 */
export function replayState(
  launch,
  startedAt,
  ascentDurationSec,
  orbitDurationSec,
  orbitPeriodSec,
  speed = 1,
  nowMs = Date.now(),
  preCountdownDurationSec = 0,
  loop = true,
) {
  const animationDurationSec = ascentDurationSec + orbitDurationSec;
  const realSecondsSinceStart = (nowMs - startedAt) / 1000;
  const preCountdownDuration = Math.max(0, Number(preCountdownDurationSec) || 0);
  const preCountdownActive = preCountdownDuration > 0
    && realSecondsSinceStart < -preCountdownDuration;
  const countdownActive = realSecondsSinceStart < 0 && !preCountdownActive;
  const countdownSeconds = countdownActive ? Math.ceil(-realSecondsSinceStart) : 0;
  const elapsedSinceStart = Math.max(0, realSecondsSinceStart * normalizeReplaySpeed(speed));
  const elapsed = loop
    ? elapsedSinceStart % animationDurationSec
    : Math.min(elapsedSinceStart, Math.max(0, animationDurationSec - 1e-6));
  const insertionOffsetSec = orbitInsertionOffsetSeconds(launch);
  const ascending = elapsed < ascentDurationSec;
  const phaseProgress = ascending
    ? elapsed / ascentDurationSec
    : (elapsed - ascentDurationSec) / orbitDurationSec;
  const missionOffsetSec = insertionOffsetSec === null
    ? null
    : ascending
      ? phaseProgress * insertionOffsetSec
      : insertionOffsetSec + phaseProgress * orbitPeriodSec;
  const launchEpoch = Date.parse(launch.launchTime);
  const eventTime = Number.isFinite(launchEpoch) && missionOffsetSec !== null
    ? new Date(launchEpoch + missionOffsetSec * 1000)
    : null;
  return {
    ascending,
    phaseProgress,
    eventTime,
    elapsedSinceStart,
    countdownActive,
    preCountdownActive,
    countdownSeconds,
  };
}

export function approximateOrbitPath(launch) {
  if (!launch.orbit?.name || !Number.isFinite(launch.lat) || !Number.isFinite(launch.lon)) return null;
  const orbitName = launch.orbit.name.toLowerCase();
  const altitude = orbitName.includes('geostationary') || orbitName.includes('transfer') ? 35786000
    : orbitName.includes('medium') ? 20200000 : 550000;
  const radius = Cesium.Ellipsoid.WGS84.maximumRadius + altitude;
  const longitude = Cesium.Math.toRadians(launch.lon);
  const latitude = Cesium.Math.toRadians(launch.lat);
  const up = new Cesium.Cartesian3(
    Math.cos(latitude) * Math.cos(longitude),
    Math.cos(latitude) * Math.sin(longitude),
    Math.sin(latitude),
  );
  const east = new Cesium.Cartesian3(
    -Math.sin(longitude),
    Math.cos(longitude),
    0,
  );
  const north = new Cesium.Cartesian3(
    -Math.sin(latitude) * Math.cos(longitude),
    -Math.sin(latitude) * Math.sin(longitude),
    Math.cos(latitude),
  );
  const isPolar = orbitName.includes('polar') || orbitName.includes('sun');
  const isWesternNorthAmerica = launch.lat > 20 && launch.lat < 60
    && launch.lon > -140 && launch.lon < -105;
  const launchAzimuthDeg = isPolar
    ? (launch.lat >= 0 ? 180 : 0)
    : isWesternNorthAmerica ? 190 : 90;
  const launchAzimuth = Cesium.Math.toRadians(launchAzimuthDeg);
  const forward = Cesium.Cartesian3.normalize(
    Cesium.Cartesian3.add(
      Cesium.Cartesian3.multiplyByScalar(north, Math.cos(launchAzimuth), new Cesium.Cartesian3()),
      Cesium.Cartesian3.multiplyByScalar(east, Math.sin(launchAzimuth), new Cesium.Cartesian3()),
      new Cesium.Cartesian3(),
    ),
    new Cesium.Cartesian3(),
  );
  // A reconstructed orbit is an estimate, not a claim that the vehicle was
  // inserted directly above the pad. Offset the orbital plane downrange by a
  // small launch-to-insertion arc so a top-down view does not draw the entire
  // orbit on top of the launch site. The ascent still joins this ring at its
  // propagated insertion reference.
  const insertionArc = Cesium.Math.toRadians(isPolar ? 8 : 12);
  const orbitAnchor = Cesium.Cartesian3.normalize(
    Cesium.Cartesian3.add(
      Cesium.Cartesian3.multiplyByScalar(up, Math.cos(insertionArc), new Cesium.Cartesian3()),
      Cesium.Cartesian3.multiplyByScalar(forward, Math.sin(insertionArc), new Cesium.Cartesian3()),
      new Cesium.Cartesian3(),
    ),
    new Cesium.Cartesian3(),
  );
  const planeNormal = Cesium.Cartesian3.normalize(
    Cesium.Cartesian3.cross(orbitAnchor, forward, new Cesium.Cartesian3()),
    new Cesium.Cartesian3(),
  );
  const crossTrack = Cesium.Cartesian3.normalize(
    Cesium.Cartesian3.cross(planeNormal, orbitAnchor, new Cesium.Cartesian3()),
    new Cesium.Cartesian3(),
  );
  return Array.from({ length: 97 }, (_, index) => {
    const angle = (index / 96) * Math.PI * 2;
    return new Cesium.Cartesian3(
      radius * (Math.cos(angle) * orbitAnchor.x + Math.sin(angle) * crossTrack.x),
      radius * (Math.cos(angle) * orbitAnchor.y + Math.sin(angle) * crossTrack.y),
      radius * (Math.cos(angle) * orbitAnchor.z + Math.sin(angle) * crossTrack.z),
    );
  });
}

/**
 * Sample a world-space position along a polyline path at a normalized
 * progress fraction, memoizing per-path cumulative distances so repeated
 * calls against the same path (a per-frame replay tick) stay O(log n).
 * @param {Cesium.Cartesian3[]} path Ordered path vertices.
 * @param {number} progress Normalized progress in [0, 1].
 * @param {Cesium.Cartesian3} [result] Optional scratch result.
 * @returns {Cesium.Cartesian3|undefined}
 */
export function samplePath(path, progress, result) {
  if (!path?.length) return undefined;
  // Degenerate returns clone into `result` when provided — handing back a
  // path vertex would let an in-place caller mutate the path geometry.
  if (path.length === 1) return result ? Cesium.Cartesian3.clone(path[0], result) : path[0];
  let distances = _pathDistanceCache.get(path);
  if (!distances) {
    distances = new Float64Array(path.length);
    for (let index = 1; index < path.length; index++) {
      distances[index] = distances[index - 1]
        + Cesium.Cartesian3.distance(path[index - 1], path[index]);
    }
    _pathDistanceCache.set(path, distances);
  }
  const totalDistance = distances.at(-1);
  if (!(totalDistance > 0)) return result ? Cesium.Cartesian3.clone(path[0], result) : path[0];
  const targetDistance = Cesium.Math.clamp(progress, 0, 1) * totalDistance;
  let low = 1;
  let high = distances.length - 1;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (distances[middle] < targetDistance) low = middle + 1;
    else high = middle;
  }
  const index = Math.max(0, low - 1);
  const segmentDistance = distances[index + 1] - distances[index];
  const segmentProgress = segmentDistance > 0
    ? (targetDistance - distances[index]) / segmentDistance
    : 0;
  return Cesium.Cartesian3.lerp(
    path[index],
    path[index + 1],
    segmentProgress,
    result || new Cesium.Cartesian3(),
  );
}

/**
 * Resolve a continuously advancing orbit fraction from a wall-clock epoch.
 * Fractional seconds prevent the selected satellite marker from jumping at
 * each second boundary and forcing a one-frame photoreal globe LOD pulse.
 * @param {number} nowMs Wall-clock epoch in milliseconds.
 * @param {number} periodSec Orbital period in seconds.
 * @returns {number} Normalized progress in the range [0, 1).
 */
export function orbitProgressAtTime(nowMs, periodSec) {
  const period = Math.max(1, Number(periodSec) || 1);
  return Cesium.Math.mod((Number(nowMs) || 0) / 1000, period) / period;
}

/**
 * Construct one continuous estimated climb from the pad to orbit insertion.
 * Horizontal movement begins much more slowly than altitude gain, preserving
 * the near-vertical launch appearance without a hard corner at 120 km.
 * @param {Cesium.Cartesian3} launchPosition Launch-pad position.
 * @param {Cesium.Cartesian3} insertionPosition Orbit insertion position.
 * @param {number} [samples] Number of curve intervals.
 * @returns {Cesium.Cartesian3[]}
 */
export function reconstructedAscentPath(launchPosition, insertionPosition, samples = 512) {
  const ellipsoid = Cesium.Ellipsoid.WGS84;
  const origin = ellipsoid.cartesianToCartographic(launchPosition);
  const insertion = ellipsoid.cartesianToCartographic(insertionPosition);
  if (!origin || !insertion) return [launchPosition, insertionPosition];
  const geodesic = new Cesium.EllipsoidGeodesic(
    new Cesium.Cartographic(origin.longitude, origin.latitude),
    new Cesium.Cartographic(insertion.longitude, insertion.latitude),
    ellipsoid,
  );
  return Array.from({ length: samples + 1 }, (_, index) => {
    const progress = index / samples;
    if (index === 0) return launchPosition;
    if (index === samples) return insertionPosition;
    const horizontalProgress = progress ** 4;
    const cartographic = geodesic.interpolateUsingFraction(
      horizontalProgress,
      new Cesium.Cartographic(),
    );
    // Approximate the inertial eastward lead accumulated during a ten-minute
    // ascent. The p³ envelope keeps liftoff nearly vertical, peaks during the
    // upper climb, and returns to the fixed insertion endpoint.
    const rotationalLead = EARTH_ROTATION_RAD_PER_SEC
      * PROJECTED_ASCENT_ROTATION_SEC
      * Math.sin(Math.PI * progress ** 3);
    cartographic.longitude = Cesium.Math.negativePiToPi(
      cartographic.longitude + rotationalLead,
    );
    cartographic.height = Cesium.Math.lerp(
      Math.max(0, origin.height),
      Math.max(0, insertion.height),
      Math.sin(progress * Cesium.Math.PI_OVER_TWO),
    );
    return ellipsoid.cartographicToCartesian(cartographic);
  });
}

function nearestOrbitIndex(orbitPath, referencePosition) {
  if (!orbitPath?.length || !referencePosition) return 0;
  const referenceDirection = Cesium.Cartesian3.normalize(referencePosition, new Cesium.Cartesian3());
  let bestIndex = 0;
  let bestDot = -Number.MAX_VALUE;
  orbitPath.forEach((candidate, index) => {
    const direction = Cesium.Cartesian3.normalize(candidate, new Cesium.Cartesian3());
    const dot = Cesium.Cartesian3.dot(referenceDirection, direction);
    if (dot > bestDot) {
      bestDot = dot;
      bestIndex = index;
    }
  });
  return bestIndex;
}

function orbitPathFromInsertion(orbitPath, insertionIndex) {
  if (!orbitPath?.length) return [];
  const first = orbitPath[0];
  const last = orbitPath.at(-1);
  const isClosed = orbitPath.length > 2 && Cesium.Cartesian3.distance(first, last) < 1000;
  const core = isClosed ? orbitPath.slice(0, -1) : orbitPath.slice();
  if (!core.length) return orbitPath.slice();
  const index = Cesium.Math.mod(insertionIndex, core.length);
  const rotated = [...core.slice(index), ...core.slice(0, index)];
  rotated.push(rotated[0]);
  return rotated;
}

/**
 * Geodesic-interpolate one surface-safe segment between two positions,
 * easing the height blend so it never dips beneath the local terrain arc.
 * @param {Cesium.Cartesian3} startPosition Segment start.
 * @param {Cesium.Cartesian3} endPosition Segment end.
 * @returns {Cesium.Cartesian3[]}
 */
export function surfaceSafeSegment(startPosition, endPosition) {
  const ellipsoid = Cesium.Ellipsoid.WGS84;
  const start = ellipsoid.cartesianToCartographic(startPosition);
  const end = ellipsoid.cartesianToCartographic(endPosition);
  if (!start || !end) return [startPosition, endPosition];
  const geodesic = new Cesium.EllipsoidGeodesic(
    new Cesium.Cartographic(start.longitude, start.latitude),
    new Cesium.Cartographic(end.longitude, end.latitude),
    ellipsoid,
  );
  // Replay advances in real time across this path. Keep the geometry
  // surface-safe, but give the animated marker and chase camera enough
  // samples that they do not visibly pause at long segment boundaries.
  const steps = Cesium.Math.clamp(Math.ceil(geodesic.surfaceDistance / 75000), 2, 256);
  const positions = [];
  for (let index = 0; index <= steps; index++) {
    const fraction = index / steps;
    const eased = fraction * fraction * (3 - 2 * fraction);
    const cartographic = geodesic.interpolateUsingFraction(fraction, new Cesium.Cartographic());
    cartographic.height = Cesium.Math.lerp(start.height, end.height, eased);
    positions.push(ellipsoid.cartographicToCartesian(cartographic));
  }
  positions[0] = startPosition;
  positions[positions.length - 1] = endPosition;
  return positions;
}

/**
 * Chain surfaceSafeSegment across a full control-point polyline.
 * @param {Cesium.Cartesian3[]} controlPositions Ordered control points.
 * @returns {Cesium.Cartesian3[]}
 */
export function surfaceSafePath(controlPositions) {
  if (!controlPositions?.length) return [];
  if (controlPositions.length === 1) return controlPositions.slice();
  const path = [];
  for (let index = 0; index < controlPositions.length - 1; index++) {
    const segment = surfaceSafeSegment(controlPositions[index], controlPositions[index + 1]);
    path.push(...(index === 0 ? segment : segment.slice(1)));
  }
  return path;
}

function blendAscentIntoOrbitTangent(ascentPath, orbitPath, insertionIndex) {
  if (!ascentPath?.length || ascentPath.length < 4 || !orbitPath?.length) return ascentPath;
  const ellipsoid = Cesium.Ellipsoid.WGS84;
  const transferEnd = orbitPath[insertionIndex];
  const nextOrbit = orbitPath[(insertionIndex + 1) % orbitPath.length];
  const orbitTangent = Cesium.Cartesian3.normalize(
    Cesium.Cartesian3.subtract(nextOrbit, transferEnd, new Cesium.Cartesian3()),
    new Cesium.Cartesian3(),
  );
  if (Cesium.Cartesian3.equalsEpsilon(orbitTangent, Cesium.Cartesian3.ZERO, 1e-8)) return ascentPath;

  // Replace a substantial final section with one cubic Bézier transition.
  // Matching both endpoint tangents avoids the short corrective hook produced
  // by locally pulling only the last few ascent samples toward the orbit.
  const blendCount = Math.min(52, ascentPath.length - 2);
  const blendStart = ascentPath.length - 1 - blendCount;
  const start = ascentPath[blendStart];
  const previous = ascentPath[Math.max(0, blendStart - 1)];
  const altitudeEnvelope = ascentPath.slice(blendStart).map((position) => Math.max(
    0,
    ellipsoid.cartesianToCartographic(position)?.height || 0,
  ));
  const ascentTangent = Cesium.Cartesian3.normalize(
    Cesium.Cartesian3.subtract(start, previous, new Cesium.Cartesian3()),
    new Cesium.Cartesian3(),
  );
  const chordLength = Math.max(Cesium.Cartesian3.distance(start, transferEnd), 1000);
  const handleLength = chordLength * 0.28;
  const controlA = Cesium.Cartesian3.add(
    start,
    Cesium.Cartesian3.multiplyByScalar(ascentTangent, handleLength, new Cesium.Cartesian3()),
    new Cesium.Cartesian3(),
  );
  const controlB = Cesium.Cartesian3.add(
    transferEnd,
    Cesium.Cartesian3.multiplyByScalar(orbitTangent, -handleLength, new Cesium.Cartesian3()),
    new Cesium.Cartesian3(),
  );
  for (let index = 0; index <= blendCount; index++) {
    const progress = index / blendCount;
    const inverse = 1 - progress;
    const point = new Cesium.Cartesian3();
    Cesium.Cartesian3.multiplyByScalar(start, inverse ** 3, point);
    Cesium.Cartesian3.add(
      point,
      Cesium.Cartesian3.multiplyByScalar(controlA, 3 * inverse ** 2 * progress, new Cesium.Cartesian3()),
      point,
    );
    Cesium.Cartesian3.add(
      point,
      Cesium.Cartesian3.multiplyByScalar(controlB, 3 * inverse * progress ** 2, new Cesium.Cartesian3()),
      point,
    );
    Cesium.Cartesian3.add(
      point,
      Cesium.Cartesian3.multiplyByScalar(transferEnd, progress ** 3, new Cesium.Cartesian3()),
      point,
    );
    // A Cartesian Bézier is a chord in world space and can pass through the
    // ellipsoid when its orbit-tangent handle is long. Preserve the original
    // climb's smooth altitude envelope while retaining the Bézier's horizontal
    // curvature and tangent-aligned insertion.
    const cartographic = ellipsoid.cartesianToCartographic(point);
    const minimumHeight = altitudeEnvelope[index] ?? 0;
    if (cartographic && cartographic.height < minimumHeight) {
      cartographic.height = minimumHeight;
      ascentPath[blendStart + index] = ellipsoid.cartographicToCartesian(cartographic);
    } else {
      ascentPath[blendStart + index] = point;
    }
  }
  ascentPath[ascentPath.length - 1] = transferEnd;
  return ascentPath;
}

/**
 * Build a globe-safe ascent ending at the nearest point on the selected orbit.
 * The returned orbit is rotated to begin at that same insertion point so the
 * animated marker cannot jump between ascent and orbital phases.
 * @param {Cesium.Cartesian3} launchPosition Launch-site position.
 * @param {Cesium.Cartesian3[]} trajectoryPositions Optional upstream stage fixes.
 * @param {Cesium.Cartesian3[]} orbitPath Selected satellite or estimated orbit.
 * @param {Cesium.Cartesian3|null} [insertionReference] Propagated or estimated insertion position.
 * @returns {{ascentPath: Cesium.Cartesian3[], animatedOrbitPath: Cesium.Cartesian3[], insertionIndex: number}}
 */
export function buildMissionPaths(
  launchPosition,
  trajectoryPositions,
  orbitPath,
  insertionReference = null,
) {
  const suppliedTrajectory = trajectoryPositions || [];
  const controls = [launchPosition, ...suppliedTrajectory];
  const insertionIndex = nearestOrbitIndex(
    orbitPath,
    insertionReference || controls.at(-1),
  );
  const transferEnd = orbitPath[insertionIndex];
  const ascentPath = suppliedTrajectory.length
    ? surfaceSafePath([...controls, transferEnd])
    : reconstructedAscentPath(launchPosition, transferEnd);
  blendAscentIntoOrbitTangent(ascentPath, orbitPath, insertionIndex);
  return {
    ascentPath,
    animatedOrbitPath: orbitPathFromInsertion(orbitPath, insertionIndex),
    insertionIndex,
  };
}
