import assert from 'node:assert/strict';
import test from 'node:test';

import {
  approachValue,
  prefersReducedMotion,
  ROUTE_CINEMA,
  routeAltitudeOffsetM,
  routeBankTargetDeg,
  routeEyeHeightM,
  routeFloorHoldM,
  routeRampFraction,
  routeSpeedProfile,
} from './cameraVerbsMath.js';

// The deep behavioral pins for these functions (turn geometry, banked frames,
// terrain-clamp interaction) live in src/routeCinematics.test.mjs, which
// exercises them through the stateful advanceRouteFlight()/createRouteFlight()
// pipeline in cameraVerbs.js. These tests cover the pure functions directly —
// this file is about the extraction boundary (right export, right shape),
// not re-deriving the cinematic pins already covered there.

test('prefersReducedMotion returns false outside a browser (no window)', () => {
  assert.equal(prefersReducedMotion(), false);
});

test('approachValue adopts the target from a non-finite current value', () => {
  assert.equal(approachValue(Number.NaN, 10, 1, 1), 10);
});

test('approachValue holds the current value when the target is non-finite', () => {
  assert.equal(approachValue(5, Number.NaN, 1, 1), 5);
});

test('approachValue is frame-rate independent (halving dt then repeating matches one big step)', () => {
  const oneStep = approachValue(0, 100, 2, 1);
  const twoHalfSteps = approachValue(approachValue(0, 100, 2, 0.5), 100, 2, 0.5);
  assert.ok(Math.abs(oneStep - twoHalfSteps) < 1e-9);
});

test('routeRampFraction is zero for a non-positive duration', () => {
  assert.equal(routeRampFraction(0), 0);
  assert.equal(routeRampFraction(-5), 0);
});

test('routeRampFraction is capped at ROUTE_RAMP_MAX_FRACTION for very short routes', () => {
  const r = routeRampFraction(0.1);
  assert.ok(r <= 0.35 + 1e-9);
});

test('routeSpeedProfile is zero speed at both ends and 1 across the cruise', () => {
  const r = routeRampFraction(10);
  assert.ok(Math.abs(routeSpeedProfile(0, r).speed) < 1e-9);
  assert.ok(Math.abs(routeSpeedProfile(1, r).speed) < 1e-9);
  assert.ok(Math.abs(routeSpeedProfile(0.5, r).speed - 1) < 1e-9);
});

test('routeSpeedProfile falls back to linear distance when the ramp fraction is zero', () => {
  const profile = routeSpeedProfile(0.4, 0);
  assert.equal(profile.distance, 0.4);
  assert.equal(profile.speed, 1);
});

test('routeBankTargetDeg is zero under reduced motion regardless of turn rate', () => {
  assert.equal(routeBankTargetDeg(50, true), 0);
});

test('routeBankTargetDeg is zero for a non-finite turn rate', () => {
  assert.equal(routeBankTargetDeg(Number.NaN), 0);
});

test('routeBankTargetDeg is proportional and capped at ROUTE_CINEMA.maxBankDeg', () => {
  assert.ok(Math.abs(routeBankTargetDeg(1)) > 0);
  const capped = routeBankTargetDeg(1000);
  assert.equal(capped, ROUTE_CINEMA.maxBankDeg);
});

test('routeAltitudeOffsetM is zero under reduced motion', () => {
  assert.equal(routeAltitudeOffsetM(500, 0.5, true), 0);
});

test('routeAltitudeOffsetM adds the full turn lift at full bank with no breath term', () => {
  const offset = routeAltitudeOffsetM(0, 1, false);
  assert.ok(Math.abs(offset - ROUTE_CINEMA.turnLiftM) < 1e-9);
});

test('routeEyeHeightM never dips below floor + minClearanceM', () => {
  assert.equal(routeEyeHeightM(500, -100000), 500 + ROUTE_CINEMA.minClearanceM);
});

test('routeEyeHeightM falls back to a zero floor for a non-finite floor input', () => {
  assert.equal(routeEyeHeightM(Number.NaN, 0), ROUTE_CINEMA.meanHeightM);
});

test('routeFloorHoldM keeps the previous floor when the new sample is non-finite', () => {
  assert.equal(routeFloorHoldM(120, Number.NaN, 1), 120);
});

test('routeFloorHoldM adopts the sample instantly when there is no previous floor', () => {
  assert.equal(routeFloorHoldM(Number.NaN, 300, 1), 300);
});

test('routeFloorHoldM eases toward a new sample rather than snapping to it', () => {
  const held = routeFloorHoldM(0, 100, 0.1);
  assert.ok(held > 0 && held < 100);
});

test('ROUTE_CINEMA is a frozen read-only tuning snapshot', () => {
  assert.ok(Object.isFrozen(ROUTE_CINEMA));
  assert.equal(typeof ROUTE_CINEMA.meanHeightM, 'number');
  assert.equal(typeof ROUTE_CINEMA.pitchDeg, 'number');
  assert.equal(typeof ROUTE_CINEMA.maxBankDeg, 'number');
  assert.equal(typeof ROUTE_CINEMA.minClearanceM, 'number');
  assert.equal(typeof ROUTE_CINEMA.breathM, 'number');
  assert.equal(typeof ROUTE_CINEMA.turnLiftM, 'number');
  assert.equal(typeof ROUTE_CINEMA.rampS, 'number');
});
