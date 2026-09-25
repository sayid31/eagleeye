/**
 * Pure cinematic helpers for the fly_route dolly — unit-tested, no viewer, no
 * module state. Split out of `cameraVerbs.js` (see
 * docs/superpowers/specs/2026-07-23-camera-verbs-fly-route-spec.md); every
 * export here is re-imported by `cameraVerbs.js` for use in the stateful
 * per-frame code that stays there (`advanceRouteFlight`, `createRouteFlight`,
 * `flyRoute`), and re-exported from it so `./cameraVerbs.js` stays the one
 * import surface for external callers/tests.
 */

/* ── Route dolly: cinematic tuning ──────────────────────────────────────────
 * Every knob an owner may want to retune lives in this block. The shaping is
 * built from four independent layers, each of which flattens to nothing on its
 * own: a trapezoid speed profile, a banked-turn roll, altitude breathing, and
 * a gaze that leads the path. Under prefers-reduced-motion the last three are
 * zeroed and the dolly is a plain eased track along the route.
 * -------------------------------------------------------------------------- */
/** Mean AGL the dolly rides at — the altitude shaping oscillates AROUND this.
 *  Exported (not just used here): also the seed for `routeColdSeedFloorM` in
 *  `cameraVerbs.js`, which stays there since it needs the stateful flight's
 *  camera height, not just pure inputs. */
export const ROUTE_CAMERA_HEIGHT_M = 260;
/** Locked look-down angle. Decoupled from the lookahead distance so the framing
 *  no longer changes with the speed word (it used to fall out of the geometry:
 *  a 260 m eye aiming at a point 260 m ahead is a hard −45° at the pavement).
 *  Exported: also applied directly to the camera pitch in
 *  `advanceRouteFlight` (`cameraVerbs.js`). */
export const ROUTE_PITCH_DEG = -32;
/** Seconds of ease-in (and again ease-out) at the ends of the flight. */
const ROUTE_RAMP_S = 2.4;
/** Ramps never eat more than this share of a SHORT route's runtime. */
const ROUTE_RAMP_MAX_FRACTION = 0.35;
/** This is a map, not a flight sim: the roll is a hint, never a barrel roll.
 *  Exported: also used directly by `advanceRouteFlight` (`cameraVerbs.js`) to
 *  normalize the tracked bank into a −1..1 fraction. */
export const ROUTE_BANK_MAX_DEG = 10;
/** Degrees of bank per °/s of planned turn. After the roll filters below, a 90°
 *  street corner settles near 7.5° and a hairpin saturates the cap, so the cap
 *  stays a limit rather than the everyday value. */
const ROUTE_BANK_PER_DEG_S = 0.44;
/** Zero-mean altitude "breathing" over long straights. */
const ROUTE_BREATH_M = 20;
const ROUTE_BREATH_WAVELENGTH_M = 2200;
/** Extra height at full bank — the lookahead rise into a turn. Sized by its
 *  RATE, not its size: the lift has to be delivered inside the few seconds the
 *  camera takes to roll in, so a bigger number reads as a lurch, not a swell. */
const ROUTE_TURN_LIFT_M = 26;
/** Hard clearance above the sampled ground floor; the shaping can never dip
 *  the eye below this, whatever the tuning above says. Exported: also the
 *  floor for the RAW-sample safety clamp in `advanceRouteFlight`
 *  (`cameraVerbs.js`), separate from the smoothed value this module shapes. */
export const ROUTE_MIN_CLEARANCE_M = 90;
/** 1/s — how fast the SHAPING floor follows the sampled one, in both
 *  directions. The hard clearance clamp reads the raw sample, so this rate is
 *  a comfort setting, not a safety one. */
const ROUTE_FLOOR_FALL_RATE = 0.9;

/** Whether the operating system asked us to keep motion boring. */
export function prefersReducedMotion() {
  try {
    return typeof window !== 'undefined'
      && typeof window.matchMedia === 'function'
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches === true;
  } catch {
    return false;
  }
}

/**
 * Frame-rate independent first-order approach (exponential smoothing).
 * `1 - e^(-rate·dt)` rather than `rate·dt` so a dropped frame cannot overshoot.
 * @param {number} current Current value (NaN adopts the target).
 * @param {number} target Value to approach.
 * @param {number} ratePerS Approach rate, 1/s.
 * @param {number} dt Seconds elapsed.
 * @returns {number} The smoothed value.
 */
export function approachValue(current, target, ratePerS, dt) {
  if (!Number.isFinite(current)) return target;
  if (!Number.isFinite(target)) return current;
  const k = 1 - Math.exp(-Math.max(0, ratePerS) * Math.max(0, dt));
  return current + (target - current) * k;
}

/**
 * Share of the flight's runtime spent easing in (and again easing out).
 * @param {number} durationS Flight duration.
 * @returns {number} Ramp fraction in [0, ROUTE_RAMP_MAX_FRACTION].
 */
export function routeRampFraction(durationS) {
  if (!(durationS > 0)) return 0;
  return Math.min(ROUTE_RAMP_MAX_FRACTION, ROUTE_RAMP_S / durationS);
}

/**
 * Trapezoid speed profile — smoothstep up, cruise, smoothstep down.
 *
 * Distance is the CLOSED-FORM integral of the speed curve, so position is
 * exact (no per-frame accumulation drift) and speed is continuous everywhere:
 * zero at both ends, and C¹ across the ramp/plateau joins because smoothstep
 * has zero slope at 0 and 1. Waypoints are invisible to it — the profile is a
 * function of arc length only, so nothing steps as a segment changes.
 * @param {number} u Normalized time, 0..1.
 * @param {number} r Ramp fraction from routeRampFraction().
 * @returns {{distance: number, speed: number}} Arc fraction 0..1, and speed as
 * a multiple of the plateau (cruise) speed.
 */
export function routeSpeedProfile(u, r) {
  const t = Math.min(1, Math.max(0, Number.isFinite(u) ? u : 0));
  if (!(r > 0)) return { distance: t, speed: 1 };
  const area = 1 - r; // ∫₀¹ v du — both ramps together contribute r
  const rampArea = (p) => r * ((p * p * p) - ((p * p * p * p) / 2));
  const smoothstep = (p) => p * p * (3 - (2 * p));
  if (t <= r) {
    const p = t / r;
    return { distance: rampArea(p) / area, speed: smoothstep(p) };
  }
  if (t >= 1 - r) {
    const p = (1 - t) / r;
    return { distance: (area - rampArea(p)) / area, speed: smoothstep(p) };
  }
  return { distance: ((r / 2) + (t - r)) / area, speed: 1 };
}

/**
 * Bank angle for a planned turn rate — proportional, capped, honest about zero.
 * @param {number} turnRateDegS Planned turn rate, °/s (+ = turning right).
 * @param {boolean} [reducedMotion] Flatten the roll entirely.
 * @returns {number} Degrees of roll, + = right wing down.
 */
export function routeBankTargetDeg(turnRateDegS, reducedMotion = false) {
  if (reducedMotion || !Number.isFinite(turnRateDegS)) return 0;
  const raw = turnRateDegS * ROUTE_BANK_PER_DEG_S;
  return Math.max(-ROUTE_BANK_MAX_DEG, Math.min(ROUTE_BANK_MAX_DEG, raw));
}

/**
 * Altitude offset around the route's mean AGL: a zero-mean breath over long
 * straights, plus a small rise into turns for lookahead. Breathing fades out
 * as the bank comes in so the two never fight.
 * @param {number} arcM Distance travelled along the route.
 * @param {number} bankFraction Current bank as a fraction of the cap, −1..1.
 * @param {boolean} [reducedMotion] Flatten to a constant altitude.
 * @returns {number} Metres to add to the mean AGL.
 */
export function routeAltitudeOffsetM(arcM, bankFraction, reducedMotion = false) {
  if (reducedMotion) return 0;
  const bank = Number.isFinite(bankFraction) ? Math.max(-1, Math.min(1, bankFraction)) : 0;
  const straight = 1 - Math.abs(bank);
  const s = Number.isFinite(arcM) ? arcM : 0;
  const breath = Math.sin((2 * Math.PI * s) / ROUTE_BREATH_WAVELENGTH_M) * ROUTE_BREATH_M * straight;
  return breath + (Math.abs(bank) * ROUTE_TURN_LIFT_M);
}

/**
 * Eye height above the ellipsoid. The last word on terrain: whatever the
 * shaping asks for, the eye stays ROUTE_MIN_CLEARANCE_M above the floor.
 * @param {number} floorM Ground floor height at the camera.
 * @param {number} offsetM Altitude shaping offset.
 * @returns {number} Height above the ellipsoid.
 */
export function routeEyeHeightM(floorM, offsetM) {
  const base = Number.isFinite(floorM) ? floorM : 0;
  const shaped = base + ROUTE_CAMERA_HEIGHT_M + (Number.isFinite(offsetM) ? offsetM : 0);
  return Math.max(base + ROUTE_MIN_CLEARANCE_M, shaped);
}

/**
 * Track the ground floor SMOOTHLY, in both directions.
 *
 * The floor is a staircase: cells are 0.001° (~111 m) and the dolly reads the
 * max of the cell it is over and one ahead, so crossing a boundary can step
 * several metres in one frame. Adopting a rise instantly — which terrain safety
 * seems to argue for — turns every one of those steps into an altitude pop
 * (measured: 21.7 m/s of vertical rate over otherwise flat downtown). Safety
 * does not actually need it: the hard clamp in advanceRouteFlight is applied
 * against the RAW sample, so the smoothed value only ever shapes the ride.
 * @param {number} previousM Held floor.
 * @param {number} sampledM Newly sampled floor (NaN keeps the held value).
 * @param {number} dt Seconds elapsed.
 * @returns {number} The floor to shape the flight over this frame.
 */
export function routeFloorHoldM(previousM, sampledM, dt) {
  if (!Number.isFinite(sampledM)) return previousM;
  if (!Number.isFinite(previousM)) return sampledM;
  return approachValue(previousM, sampledM, ROUTE_FLOOR_FALL_RATE, dt);
}

/** Read-only view of the tuning, for tests and harnesses. */
export const ROUTE_CINEMA = Object.freeze({
  meanHeightM: ROUTE_CAMERA_HEIGHT_M,
  pitchDeg: ROUTE_PITCH_DEG,
  maxBankDeg: ROUTE_BANK_MAX_DEG,
  minClearanceM: ROUTE_MIN_CLEARANCE_M,
  breathM: ROUTE_BREATH_M,
  turnLiftM: ROUTE_TURN_LIFT_M,
  rampS: ROUTE_RAMP_S,
});
