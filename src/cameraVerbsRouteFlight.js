/**
 * fly_route's dolly state machine — `createRouteFlight`/`advanceRouteFlight`
 * and every helper they close over (arc-length geometry, corridor floor
 * warm/acquire, the mesh-probe fallback). Split out of `cameraVerbs.js`
 * (Wave 3 item #33 of the file-split program; see
 * docs/superpowers/specs/2026-07-23-camera-verbs-fly-route-spec.md).
 *
 * This operates on the `state` object `createRouteFlight` returns, passed
 * explicitly into every function here — never on `cameraVerbs.js`'s
 * module-level `_active`/`_viewer`. The scratch Cesium objects below are a
 * per-frame allocation pool, reused every call the same way `cameraVerbs.js`
 * itself reuses its own; they hold no state ACROSS flights. `cameraVerbs.js`
 * keeps the tick loop, the `_active` motion slot, and `flyRoute` (which
 * builds a flight via `createRouteFlight` and then owns applying its frames
 * to the live viewer) — everything here is testable with no viewer at all.
 *
 * Every export here is re-exported from `./cameraVerbs.js` so that module
 * stays the one import surface for external callers/tests.
 */

import * as Cesium from 'cesium';
import {
  approachValue,
  ROUTE_BANK_MAX_DEG,
  ROUTE_CAMERA_HEIGHT_M,
  ROUTE_MIN_CLEARANCE_M,
  ROUTE_PITCH_DEG,
  routeAltitudeOffsetM,
  routeBankTargetDeg,
  routeEyeHeightM,
  routeFloorHoldM,
  routeRampFraction,
  routeSpeedProfile,
} from './cameraVerbsMath.js';

/** MEAN ground speed by speed word. The trapezoid profile below eases in and
 *  out around this mean, so a route still takes totalM / ROUTE_M_S seconds.
 *  Exported: `cameraVerbs.js`'s `flyRoute` validates/looks up the speed word
 *  against this same table, so it stays the single source of truth. */
export const ROUTE_M_S = { slow: 20, normal: 40, fast: 90 };

/** Seconds of travel the gaze leads the camera by (≈260 m at normal — the
 *  shipped constant — but coherent at slow and fast too). */
const ROUTE_LOOKAHEAD_S = 6.5;
const ROUTE_LOOKAHEAD_MIN_M = 120;
const ROUTE_LOOKAHEAD_MAX_M = 600;
/** 1/s — exponential smoothing rate for the dolly's gaze direction. */
const ROUTE_DIR_SMOOTH_RATE = 1.6;
/** Seconds of path (centred on the camera) the turn is measured over. The
 *  measure is a triangular pulse peaking exactly at the corner, so the bank
 *  rolls in before the turn and rolls out after it. */
const ROUTE_BANK_WINDOW_S = 4;
/** Two cascaded first-order filters — C¹ roll entry/exit, no snap at the edges
 *  of the turn pulse. */
const ROUTE_BANK_LEAD_RATE = 2.2;
const ROUTE_BANK_SETTLE_RATE = 1.6;
/** 1/s — how fast the ALTITUDE follows the roll. Deliberately slower than the
 *  roll itself: the wings roll through a corner in a few seconds, but the swell
 *  that lifts the eye over it wants to be a long, shallow arc. */
const ROUTE_LIFT_TRACK_RATE = 0.5;
/** 1/s — the altitude shaping is filtered on its way to the camera so rolling
 *  out of a turn sinks the eye gently instead of dropping it. */
const ROUTE_ALT_SMOOTH_RATE = 0.9;
/** Below this |cos| the two chords are antipodal and the cross product's sign
 *  is a floating-point coin toss — an exact U-turn must not flip the bank
 *  direction frame to frame, so the degenerate case is branched explicitly. */
const ANTIPODAL_EPS = 1e-6;
/** Metres of corridor warmed when a flight starts, and the rolling window
 *  warmed ahead of the camera afterwards. Cells are the house 0.001° (~111 m)
 *  coarse cells, deduped by the warm batch, which also skips already-warm ones
 *  and queues (never drops) contending callers. */
const ROUTE_WARM_START_M = 4000;
const ROUTE_WARM_AHEAD_M = 3000;
const ROUTE_WARM_MAX_CELLS = 96;
/** Seconds between rolling corridor warms during a flight. */
const ROUTE_WARM_INTERVAL_S = 2;
/** Metres of arc between corridor samples (~half a coarse cell, so no cell the
 *  route crosses for more than ~55 m of ground is skipped). */
const ROUTE_WARM_STEP_M = 55;
/** Ceiling on the conservative floor seed used while the corridor is COLD.
 *  Above this the camera's own altitude stops being a useful proxy for the
 *  ground under it (a globe-scale view would park the dolly in orbit). */
const ROUTE_UNKNOWN_FLOOR_CAP_M = 5000;
/** Corridor cells the floor acquisition looks at, and therefore the HARD cap
 *  on sampleHeight calls a whole route may make: the mesh probe is latched to
 *  fire once per flight, so this is a per-route budget, not a per-frame one. */
const ROUTE_MESH_PROBE_CELLS = 8;
/** Seconds the dolly ARMS — camera untouched — waiting for real floor data
 *  before it starts moving. The corridor warm is fire-and-forget, so without
 *  this the first frame RACES it and can render underground. Matches the house
 *  one-shot floor deadline (FLOOR_RESOLVE_DEADLINE_MS), and is the same
 *  arm-then-act shape a chained orbit uses while its flight settles. */
const ROUTE_ARM_S = 1.2;
/** m/s — cap on how fast the eye may DESCEND. Climbs are never limited (they
 *  are the safety direction). Ordinary terrain following runs a few m/s, so
 *  this only bites when a hold is released onto late-arriving floor data — most
 *  visibly when the mesh probe seeded the floor from a downtown ROOFTOP and the
 *  real DEM later corrects it ~90 m downward. Held at the same bound as the
 *  altitude shaping so that correction reads as one more swell rather than as a
 *  sink of its own. Lagging HIGH is the safe direction, so a genuinely steep
 *  downhill simply floats a little wider of the ground. */
const ROUTE_MAX_DESCENT_MPS = 10;

/* ── Route dolly geometry ────────────────────────────────────────────────── */

const _arcA = new Cesium.Cartesian3();
const _arcB = new Cesium.Cartesian3();
const _chordVertical = new Cesium.Cartesian3();
const _turnCross = new Cesium.Cartesian3();
const _framePos = new Cesium.Cartesian3();
const _frameAheadPos = new Cesium.Cartesian3();
const _frameUp = new Cesium.Cartesian3();
const _frameIn = new Cesium.Cartesian3();
const _frameOut = new Cesium.Cartesian3();
const _frameGaze = new Cesium.Cartesian3();
const _frameRight = new Cesium.Cartesian3();
const _frameLevelUp = new Cesium.Cartesian3();
const _frameDir = new Cesium.Cartesian3();
const _frameEye = new Cesium.Cartesian3();
const _frameBankedUp = new Cesium.Cartesian3();
const _frameCarto = new Cesium.Cartographic();
const _frameAheadCarto = new Cesium.Cartographic();
const _bankQuat = new Cesium.Quaternion();
const _bankMatrix = new Cesium.Matrix3();
const _headingQuat = new Cesium.Quaternion();
const _headingMatrix = new Cesium.Matrix3();
const _warmPos = new Cesium.Cartesian3();
const _warmCarto = new Cesium.Cartographic();
const _probeCarto = new Cesium.Cartographic();

/** Point at arc length `s` along the polyline (binary search — queries jump
 *  backwards for the inbound chord, so a forward cursor would not do). */
function arcPoint(state, s, result) {
  const { pts, cumM } = state;
  const clamped = Math.min(state.totalM, Math.max(0, s));
  let lo = 0;
  let hi = cumM.length - 2;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (cumM[mid] <= clamped) lo = mid; else hi = mid - 1;
  }
  const segLen = cumM[lo + 1] - cumM[lo];
  const t = segLen > 1e-6 ? Math.min(1, Math.max(0, (clamped - cumM[lo]) / segLen)) : 0;
  return Cesium.Cartesian3.lerp(pts[lo], pts[lo + 1], t, result);
}

/** Unit horizontal direction from arc `sA` to arc `sB`, or null when degenerate. */
function horizontalChord(state, sA, sB, up, result) {
  const a = arcPoint(state, sA, _arcA);
  const b = arcPoint(state, sB, _arcB);
  Cesium.Cartesian3.subtract(b, a, result);
  const vertical = Cesium.Cartesian3.multiplyByScalar(
    up, Cesium.Cartesian3.dot(result, up), _chordVertical,
  );
  Cesium.Cartesian3.subtract(result, vertical, result);
  const len = Cesium.Cartesian3.magnitude(result);
  if (!(len > 1e-3)) return null;
  return Cesium.Cartesian3.divideByScalar(result, len, result);
}

/**
 * Signed angle from `a` to `b` about `up`; positive = turning RIGHT.
 *
 * At exactly 180° the cross product is zero and its sign is decided by
 * floating-point signed zeros, so an out-and-back route would flip the bank
 * direction frame to frame. A U-turn is resolved as a RIGHT turn, always —
 * arbitrary, but deterministic, which is the property that matters.
 * @param {Cesium.Cartesian3} a Unit horizontal direction turned FROM.
 * @param {Cesium.Cartesian3} b Unit horizontal direction turned TO.
 * @param {Cesium.Cartesian3} up Local up, the axis the turn is measured about.
 * @returns {number} Radians, + = right.
 */
export function signedTurnRad(a, b, up) {
  const cross = Cesium.Cartesian3.cross(a, b, _turnCross);
  const sinLeft = Cesium.Cartesian3.dot(cross, up);
  const cosTurn = Cesium.Cartesian3.dot(a, b);
  if (cosTurn <= -1 + ANTIPODAL_EPS && Math.abs(sinLeft) < ANTIPODAL_EPS) return Math.PI;
  return -Math.atan2(sinLeft, cosTurn);
}

/**
 * Coarse floor cells along a stretch of the route, in travel order.
 * Deduped to the house 0.001° grid and capped, so one flight can never issue an
 * unbounded warm batch.
 * @param {Object} state Route flight state (needs pts/cumM/totalM).
 * @param {number} fromM Arc length to start collecting at.
 * @param {number} spanM Metres of arc to cover.
 * @param {number} [maxCells] Cap on the returned cells.
 * @returns {Array<{lat: number, lon: number}>} Cells to warm.
 */
export function routeCorridorCells(state, fromM, spanM, maxCells = ROUTE_WARM_MAX_CELLS) {
  const out = [];
  if (!(state?.totalM > 0) || !(spanM > 0) || !(maxCells > 0)) return out;
  const start = Math.max(0, Math.min(state.totalM, fromM));
  const end = Math.max(0, Math.min(state.totalM, fromM + spanM));
  const seen = new Set();
  for (let s = start; s <= end + 1e-6 && out.length < maxCells; s += ROUTE_WARM_STEP_M) {
    const point = arcPoint(state, s, _warmPos);
    const carto = Cesium.Cartographic.fromCartesian(point, Cesium.Ellipsoid.WGS84, _warmCarto);
    const lat = Number(Cesium.Math.toDegrees(carto.latitude).toFixed(3));
    const lon = Number(Cesium.Math.toDegrees(carto.longitude).toFixed(3));
    const key = `${lat},${lon}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ lat, lon });
  }
  return out;
}

/** Fire-and-forget warm of a corridor stretch; never throws into the caller. */
function warmRouteCorridor(state, fromM, spanM) {
  if (typeof state?.warmFn !== 'function') return 0;
  const cells = routeCorridorCells(state, fromM, spanM);
  if (!cells.length) return 0;
  try {
    state.warmFn(cells);
  } catch {
    return 0; // best effort — a cold cell holds the last known floor
  }
  state.warmedCells += cells.length;
  return cells.length;
}

/**
 * The floor to hold while the corridor is still cold.
 *
 * Cold is missing data, not flat ground, and the route's own vertices carry
 * height 0 — so the previous fallback flew a Rocky Mountain route at 260 m
 * above the ELLIPSOID. The camera's current position is, by construction,
 * above the ground the user is looking at, so its height minus the cruise AGL
 * is a floor we can defend. It is capped, because at globe scale the camera's
 * altitude stops saying anything about the ground under it.
 * @param {number} pathHeightM The route vertices' own height.
 * @param {number} cameraHeightM Camera height at flight start, if known.
 * @returns {number} A floor to hold until real terrain arrives.
 */
export function routeColdSeedFloorM(pathHeightM, cameraHeightM) {
  const base = Number.isFinite(pathHeightM) ? pathHeightM : 0;
  if (!Number.isFinite(cameraHeightM)) return base;
  const implied = cameraHeightM - ROUTE_CAMERA_HEIGHT_M;
  return Math.max(base, Math.min(base + ROUTE_UNKNOWN_FLOOR_CAP_M, implied));
}

/**
 * Adopt the corridor's floor, from the cache or — failing that — from the
 * rendered mesh directly.
 *
 * Runs at construction and again on every ARMING frame, because the corridor
 * warm is fire-and-forget and this is how the dolly notices it landed. The
 * per-frame part is cache READS (a Map lookup per cell); the mesh probe is
 * latched to fire at most ONCE per flight, so a whole route costs at most
 * ROUTE_MESH_PROBE_CELLS sampleHeight calls however long it arms.
 *
 * A partially warm corridor is NOT resolved. One cached cell says nothing
 * about the ground under the other seven, and treating it as an answer let the
 * dolly descend to 460 m over a 1,600 m surface. Every cell must be accounted
 * for — by the cache, or by a probe that actually reached it.
 *
 * The probe is the answer to "what if the DEM never arrives at all", and it
 * closes the hole in the case where the hole is observable: clipping requires
 * terrain to BE rendered, and what is rendered is what sampleHeight reads. It
 * reads the rendered surface at the CURRENT level of detail — rooftops and
 * primitives included — which is a better estimate than nothing but is not a
 * guaranteed upper bound. The per-frame raw-sample clamp remains the backstop.
 * @param {Object} state Route flight state.
 * @param {boolean} takeWhole Adopt the value outright (pre-departure) rather
 * than easing onto it — a mid-flight arrival must never snap the eye.
 * @returns {boolean} Whether the corridor's floor is now RESOLVED.
 */
function acquireCorridorFloor(state, takeWhole) {
  const cells = routeCorridorCells(state, state.traveled, ROUTE_WARM_START_M, ROUTE_MESH_PROBE_CELLS);
  if (!cells.length) return false;
  const known = [];
  const cold = [];
  if (typeof state.floorFn === 'function') {
    for (const cell of cells) {
      let floor = Number.NaN;
      try {
        floor = state.floorFn(cell.lat, cell.lon);
      } catch { /* a hostile read is the same as a cold one */ }
      if (Number.isFinite(floor)) known.push(floor); else cold.push(cell);
    }
  } else {
    cold.push(...cells);
  }

  // The probe fires once, for exactly the cells the cache could not answer.
  if (cold.length && !state.meshProbeSpent && typeof state.probeFn === 'function') {
    state.meshProbeSpent = true; // latched whatever it returns — one per flight
    try {
      const probe = state.probeFn(cold) || {};
      if (Number.isFinite(probe.heightM)) {
        state.meshProbeFloorM = probe.heightM;
        state.floorFromMeshProbe = true;
        // Only a probe that reached EVERY cold cell resolves the corridor.
        state.meshProbeCoveredCold = probe.sampled >= cold.length;
      }
    } catch { /* tiles not streamed, or a scene mid-teardown */ }
  }
  if (Number.isFinite(state.meshProbeFloorM)) known.push(state.meshProbeFloorM);
  if (!known.length) return false;

  const floor = Math.max(...known);
  // A partial answer still RAISES the held floor — knowing something is better
  // than the seed — but it does not resolve the corridor, so the safe hold and
  // the arm stay in force.
  state.floorM = takeWhole || !Number.isFinite(state.floorM)
    ? floor
    : Math.max(state.floorM, floor);
  if (cold.length && !state.meshProbeCoveredCold) return false;
  state.floorKnown = true;
  return true;
}

/**
 * Highest rendered surface across a handful of corridor cells, with the number
 * of cells that actually answered — a cell whose tiles are not streamed yet
 * contributes nothing, and the caller must not mistake silence for flat ground.
 * @param {Cesium.Scene|undefined} scene The live scene.
 * @param {Array<{lat: number, lon: number}>} cells Cells to probe.
 * @returns {{heightM: number, sampled: number, requested: number}} The reading.
 */
export function probeMeshFloorM(scene, cells) {
  const requested = Array.isArray(cells) ? cells.length : 0;
  const empty = { heightM: Number.NaN, sampled: 0, requested };
  if (!scene || typeof scene.sampleHeight !== 'function' || !requested) return empty;
  let heightM = Number.NaN;
  let sampled = 0;
  for (const cell of cells) {
    try {
      const carto = Cesium.Cartographic.fromDegrees(cell.lon, cell.lat, 0, _probeCarto);
      const height = scene.sampleHeight(carto);
      if (!Number.isFinite(height)) continue;
      sampled += 1;
      heightM = Number.isFinite(heightM) ? Math.max(heightM, height) : height;
    } catch { /* tiles not ready for this cell */ }
  }
  return { heightM, sampled, requested };
}

/**
 * Build the state for one cinematic route flight.
 * @param {Object} options
 * @param {Cesium.Cartesian3[]} options.pts Route vertices.
 * @param {number[]} options.cumM Cumulative arc length per vertex.
 * @param {string} [options.speed] slow | normal | fast.
 * @param {Function|null} [options.floorFn] (latDeg, lonDeg) => floor metres.
 * @param {Function|null} [options.warmFn] (cells) => void — corridor floor warm.
 * @param {Function|null} [options.probeFn] (cells) => {heightM, sampled} —
 * synchronous rendered-mesh probe, fired at most ONCE per flight and only for
 * the cells the cached floor could not answer.
 * @param {number} [options.cameraHeightM] Camera height at start, for the cold seed.
 * @param {boolean} [options.reducedMotion] Flatten bank + altitude shaping.
 * @returns {Object} Motion state for advanceRouteFlight().
 */
export function createRouteFlight({
  pts, cumM, speed = 'normal', floorFn = null, warmFn = null, probeFn = null,
  cameraHeightM = Number.NaN, reducedMotion = false,
}) {
  const totalM = cumM[cumM.length - 1];
  const cruiseMps = ROUTE_M_S[speed] || ROUTE_M_S.normal;
  // The 0.5 s floor keeps a degenerate route from being an instant teleport (it
  // also divides the profile). It is the one case where the speed word is not
  // the mean: routes under 10 m (slow) / 20 m (normal) / 45 m (fast) fly slower
  // than asked. Those are shorter than the camera is tall — nothing to see.
  const durationS = Math.max(0.5, totalM / cruiseMps);
  const pathHeightM = Cesium.Cartographic.fromCartesian(
    pts[0], Cesium.Ellipsoid.WGS84, _warmCarto,
  ).height;
  const state = {
    kind: 'route',
    mode: 'continuous',
    direction: 'forward',
    speed,
    pts,
    cumM,
    totalM,
    durationS,
    ramp: routeRampFraction(durationS),
    u: 0,
    traveled: 0,
    floorFn,
    warmFn,
    probeFn,
    reducedMotion,
    floorM: Number.NaN,
    floorKnown: false,
    coldSeedFloorM: routeColdSeedFloorM(pathHeightM, cameraHeightM),
    // The one altitude we can defend without terrain data: the camera is
    // already there, and the user is already looking at the world from it. It
    // is a NON-DESCENT guarantee, not a clearance guarantee — nothing can
    // promise clearance over ground that was never measured.
    safeHoldHeightM: Number.isFinite(cameraHeightM) ? cameraHeightM : Number.NaN,
    coldFrames: 0,
    floorFromMeshProbe: false,
    meshProbeSpent: false,
    meshProbeFloorM: Number.NaN,
    meshProbeCoveredCold: false,
    armS: 0,
    armed: false,
    departed: false,
    appliedHeightM: Number.NaN,
    warmedCells: 0,
    warmDueS: ROUTE_WARM_INTERVAL_S,
    offsetM: Number.NaN,
    bankLeadDeg: 0,
    bankDeg: 0,
    appliedBankDeg: 0,
    liftBankDeg: 0,
    headingDir: null,
    groundSpeedMps: 0,
  };
  // Warm the head of the corridor before the first frame renders, then check
  // whether anything is warm ALREADY (contact traffic, or a second run over the
  // same route) — that flight needs no arming and no hold at all.
  warmRouteCorridor(state, 0, ROUTE_WARM_START_M);
  acquireCorridorFloor(state, true);
  return state;
}

/**
 * Advance one dolly frame. Returns the camera pose to apply; the caller owns
 * the viewer (so this stays testable without one).
 * @param {Object} state From createRouteFlight().
 * @param {number} dt Seconds elapsed.
 * @returns {{finished: boolean, eye: Cesium.Cartesian3, direction: Cesium.Cartesian3,
 *  up: Cesium.Cartesian3, bankDeg: number, heightM: number, aglM: number,
 *  groundSpeedMps: number, progress: number}} The frame.
 */
export function advanceRouteFlight(state, dt) {
  const step = Math.min(0.25, Math.max(0, Number.isFinite(dt) ? dt : 0));

  // ARMING. The corridor warm is fire-and-forget, so the alternative to waiting
  // is racing it — and losing that race means rendering the first frames at an
  // altitude derived from nothing. While armed the camera is not touched at
  // all: no teleport onto the route, no descent. The wait is covered by the
  // model speaking its confirmation, and a warm cache skips it entirely.
  const canAnswer = typeof state.floorFn === 'function' || typeof state.probeFn === 'function';
  if (canAnswer && !state.floorKnown && !state.departed && state.armS < ROUTE_ARM_S) {
    state.armS += step;
    if (!acquireCorridorFloor(state, true)) {
      return { arming: true, finished: false, progress: 0, bankDeg: 0 };
    }
  }
  state.departed = true;

  state.u = Math.min(1, (state.u || 0) + (step / state.durationS));
  const profile = routeSpeedProfile(state.u, state.ramp);
  const traveled = state.totalM * profile.distance;
  state.traveled = traveled;
  const cruiseMps = state.totalM / (state.durationS * (1 - state.ramp));
  state.groundSpeedMps = cruiseMps * profile.speed;

  const pos = arcPoint(state, traveled, _framePos);
  const carto = Cesium.Cartographic.fromCartesian(pos, Cesium.Ellipsoid.WGS84, _frameCarto);
  const up = Cesium.Ellipsoid.WGS84.geodeticSurfaceNormalCartographic(carto, _frameUp);

  // Planned turn: compare where we came from with where we are going, over a
  // window centred on the camera. Peaks AT the corner, tapers either side.
  const halfWindowM = Math.max(20, (ROUTE_BANK_WINDOW_S * cruiseMps) / 2);
  const inbound = horizontalChord(state, traveled - halfWindowM, traveled, up, _frameIn);
  const outbound = horizontalChord(state, traveled, traveled + halfWindowM, up, _frameOut);
  const turnRateDegS = (inbound && outbound)
    ? Cesium.Math.toDegrees(signedTurnRad(inbound, outbound, up)) / ROUTE_BANK_WINDOW_S
    : 0;
  const bankTarget = routeBankTargetDeg(turnRateDegS, state.reducedMotion);
  state.bankLeadDeg = approachValue(state.bankLeadDeg, bankTarget, ROUTE_BANK_LEAD_RATE, step);
  state.bankDeg = approachValue(state.bankDeg, state.bankLeadDeg, ROUTE_BANK_SETTLE_RATE, step);
  // Wings level for takeoff and landing. The speed profile is already a
  // smoothstep envelope that is 1 across the cruise and exactly 0 at both ends,
  // so reusing it unwinds the roll as the dolly slows — and guarantees the LAST
  // applied frame is level, with no snap to get there.
  const appliedBankDeg = state.bankDeg * profile.speed;

  // Gaze leads along the arc, then eases toward the new heading so corners
  // swing like a crane shot instead of a whip pan.
  const lookaheadM = Math.min(
    ROUTE_LOOKAHEAD_MAX_M,
    Math.max(ROUTE_LOOKAHEAD_MIN_M, ROUTE_LOOKAHEAD_S * cruiseMps),
  );
  const gaze = horizontalChord(state, traveled, traveled + lookaheadM, up, _frameGaze)
    || outbound || inbound;
  if (gaze && !state.headingDir) state.headingDir = Cesium.Cartesian3.clone(gaze);
  else if (gaze) {
    // Rotate the heading TOWARD the gaze about the local up, rather than
    // lerping the two vectors. A Cartesian lerp cannot cross an antipodal pair
    // (a U-turn): below t=0.5 the blend still points backwards, and no
    // per-frame t ever reaches 0.5, so the camera stayed reversed for the whole
    // return leg. An angle always crosses.
    const k = 1 - Math.exp(-ROUTE_DIR_SMOOTH_RATE * step);
    const turnToGaze = signedTurnRad(state.headingDir, gaze, up);
    // signedTurnRad is + for a RIGHT turn; a positive rotation about up is a
    // LEFT turn, so the step is negated.
    const rotation = Cesium.Matrix3.fromQuaternion(
      Cesium.Quaternion.fromAxisAngle(up, -turnToGaze * k, _headingQuat), _headingMatrix,
    );
    const turned = Cesium.Matrix3.multiplyByVector(rotation, state.headingDir, _frameDir);
    const vertical = Cesium.Cartesian3.multiplyByScalar(
      up, Cesium.Cartesian3.dot(turned, up), _chordVertical,
    );
    Cesium.Cartesian3.subtract(turned, vertical, turned);
    if (Cesium.Cartesian3.magnitude(turned) > 1e-6) {
      Cesium.Cartesian3.normalize(turned, state.headingDir);
    }
  }
  // A path with no horizontal extent (identical lat/lon, differing heights)
  // has no azimuth to fly: point east so the frame stays orthonormal.
  if (!state.headingDir) {
    const east = Cesium.Cartesian3.fromElements(-pos.y, pos.x, 0, _frameGaze);
    state.headingDir = Cesium.Cartesian3.magnitude(east) > 1e-6
      ? Cesium.Cartesian3.normalize(east, new Cesium.Cartesian3())
      : Cesium.Cartesian3.fromElements(1, 0, 0, new Cesium.Cartesian3());
  }
  const heading = state.headingDir;

  // Locked pitch: heading gives the azimuth, the pitch never wanders.
  const pitch = Cesium.Math.toRadians(ROUTE_PITCH_DEG);
  const direction = Cesium.Cartesian3.normalize(
    Cesium.Cartesian3.add(
      Cesium.Cartesian3.multiplyByScalar(heading, Math.cos(pitch), _frameDir),
      Cesium.Cartesian3.multiplyByScalar(up, Math.sin(pitch), _frameLevelUp),
      _frameDir,
    ),
    _frameDir,
  );
  // Orthonormal camera frame, then roll it about its own forward axis: a
  // positive rotation drops the right wing, which is what a right turn wants.
  const right = Cesium.Cartesian3.normalize(
    Cesium.Cartesian3.cross(direction, up, _frameRight), _frameRight,
  );
  const levelUp = Cesium.Cartesian3.normalize(
    Cesium.Cartesian3.cross(right, direction, _frameLevelUp), _frameLevelUp,
  );
  const bankRad = Cesium.Math.toRadians(appliedBankDeg);
  let bankedUp = levelUp;
  if (Math.abs(bankRad) > 1e-6) {
    const quat = Cesium.Quaternion.fromAxisAngle(direction, bankRad, _bankQuat);
    const rotation = Cesium.Matrix3.fromQuaternion(quat, _bankMatrix);
    bankedUp = Cesium.Matrix3.multiplyByVector(rotation, levelUp, _frameBankedUp);
  }

  // Keep the corridor ahead of the camera warm. The batch dedupes to coarse
  // cells, skips warm ones and queues contenders, so a repeat costs nothing.
  state.warmDueS -= step;
  if (state.warmDueS <= 0) {
    state.warmDueS = ROUTE_WARM_INTERVAL_S;
    warmRouteCorridor(state, traveled, ROUTE_WARM_AHEAD_M);
  }

  // Ground floor: the max of here and just ahead, so a rise is cleared BEFORE
  // the camera reaches it. Both are cached reads — nothing samples the mesh.
  let sampledFloor = Number.NaN;
  if (typeof state.floorFn === 'function') {
    const aheadPos = arcPoint(state, traveled + (lookaheadM / 2), _frameAheadPos);
    const aheadCarto = Cesium.Cartographic.fromCartesian(
      aheadPos, Cesium.Ellipsoid.WGS84, _frameAheadCarto,
    );
    try {
      const here = state.floorFn(
        Cesium.Math.toDegrees(carto.latitude), Cesium.Math.toDegrees(carto.longitude),
      );
      const ahead = state.floorFn(
        Cesium.Math.toDegrees(aheadCarto.latitude), Cesium.Math.toDegrees(aheadCarto.longitude),
      );
      const warm = [here, ahead].filter((value) => Number.isFinite(value));
      if (warm.length) sampledFloor = Math.max(...warm);
    } catch {
      sampledFloor = Number.NaN;
    }
  }
  if (!Number.isFinite(sampledFloor)) {
    // NEVER descend blind. A cold cell is missing data, not flat ground — the
    // route's own vertices carry height 0, so trusting them put the eye 1.3 km
    // UNDER Albuquerque. Hold the last floor we actually knew; before we have
    // ever known one, hold the conservative seed captured at flight start.
    state.floorM = Number.isFinite(state.floorM) ? state.floorM : state.coldSeedFloorM;
    state.coldFrames += 1;
  } else if (!state.floorKnown) {
    // Data arrived AFTER the arm gave up. Easing is the right move now: the
    // camera is already flying, so taking the gap between the safety hold and
    // the ground in one frame would snap. (Pre-departure acquisition takes it
    // whole — see acquireCorridorFloor — because nothing is moving yet.)
    state.floorM = routeFloorHoldM(state.floorM, sampledFloor, step);
    state.floorKnown = true;
  } else {
    state.floorM = routeFloorHoldM(state.floorM, sampledFloor, step);
  }

  state.liftBankDeg = approachValue(state.liftBankDeg, appliedBankDeg, ROUTE_LIFT_TRACK_RATE, step);
  const bankFraction = state.liftBankDeg / ROUTE_BANK_MAX_DEG;
  state.offsetM = approachValue(
    state.offsetM,
    routeAltitudeOffsetM(traveled, bankFraction, state.reducedMotion),
    ROUTE_ALT_SMOOTH_RATE,
    step,
  );
  // Two floors, two jobs. The SMOOTHED floor shapes the ride, so a cell
  // boundary does not pop the eye. The RAW sample owns the safety clamp, so a
  // real rise is cleared on the frame it is seen, smoothing or not.
  let heightM = Math.max(
    routeEyeHeightM(state.floorM, state.offsetM),
    (Number.isFinite(sampledFloor) ? sampledFloor : state.floorM) + ROUTE_MIN_CLEARANCE_M,
  );
  // Still no terrain data (the arm timed out, or the warm never landed at all):
  // hold the launch altitude for as long as that lasts. It is not a clearance
  // guarantee — nothing can promise clearance over ground that was never
  // measured — but the dolly will not take the camera DOWN into the unknown.
  if (!state.floorKnown && Number.isFinite(state.safeHoldHeightM)) {
    heightM = Math.max(heightM, state.safeHoldHeightM);
  }
  // Releasing that hold onto late data is a controlled descent, never a drop.
  if (Number.isFinite(state.appliedHeightM)) {
    heightM = Math.max(heightM, state.appliedHeightM - (ROUTE_MAX_DESCENT_MPS * step));
  }
  state.appliedHeightM = heightM;
  const eye = Cesium.Cartesian3.fromRadians(
    carto.longitude, carto.latitude, heightM, Cesium.Ellipsoid.WGS84, _frameEye,
  );

  state.appliedBankDeg = appliedBankDeg;
  return {
    finished: state.u >= 1,
    eye,
    direction,
    up: bankedUp,
    bankDeg: appliedBankDeg,
    heightM,
    aglM: heightM - state.floorM,
    groundSpeedMps: state.groundSpeedMps,
    progress: state.u,
  };
}
