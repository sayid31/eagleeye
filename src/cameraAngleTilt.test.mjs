import test from 'node:test';
import assert from 'node:assert/strict';

import {
  GLOBAL_VIEW_ALTITUDE_M,
  MIN_TILT_RANGE_M,
  TILT_DURATION_S,
  planTiltInPlace,
  resolveTiltPitchDeg,
} from './cameraAngleTilt.js';
import {
  CAMERA_ANGLE_MODES,
  GLOBE_OBLIQUE_PITCH_DEG,
  NADIR_PITCH_DEG,
  OBLIQUE_PITCH_DEG,
} from './cameraAngleMode.js';

test('Atas tilts to nadir regardless of how far away the camera is', () => {
  for (const altitude of [0, 500, 20000, GLOBAL_VIEW_ALTITUDE_M, 18_000_000]) {
    assert.equal(
      resolveTiltPitchDeg(CAMERA_ANGLE_MODES.ATAS, altitude),
      NADIR_PITCH_DEG,
      `Atas must be nadir at ${altitude} m`,
    );
  }
});

test('Samping uses the generic oblique below the global band and the globe oblique at or above it', () => {
  assert.equal(resolveTiltPitchDeg(CAMERA_ANGLE_MODES.SAMPING, 0), OBLIQUE_PITCH_DEG);
  assert.equal(
    resolveTiltPitchDeg(CAMERA_ANGLE_MODES.SAMPING, GLOBAL_VIEW_ALTITUDE_M - 1),
    OBLIQUE_PITCH_DEG,
    'one metre below the band is still a local view',
  );
  assert.equal(
    resolveTiltPitchDeg(CAMERA_ANGLE_MODES.SAMPING, GLOBAL_VIEW_ALTITUDE_M),
    GLOBE_OBLIQUE_PITCH_DEG,
    'the boundary itself belongs to the global band, matching viewScaleForAltitude',
  );
  assert.equal(
    resolveTiltPitchDeg(CAMERA_ANGLE_MODES.SAMPING, 18_000_000),
    GLOBE_OBLIQUE_PITCH_DEG,
  );
});

test('a non-finite altitude is treated as ground level, not as the global band', () => {
  // Reading camera.positionCartographic?.height can legitimately yield undefined
  // before the scene has a pose. Falling into the globe oblique there would aim a
  // street-level view 80 degrees off nadir, so the safe default is the local one.
  for (const bad of [undefined, null, NaN, Infinity, 'tall']) {
    assert.equal(resolveTiltPitchDeg(CAMERA_ANGLE_MODES.SAMPING, bad), OBLIQUE_PITCH_DEG);
  }
});

test('an unrecognized mode normalizes rather than throwing', () => {
  assert.equal(resolveTiltPitchDeg('ATAS', 0), NADIR_PITCH_DEG, 'casing is tolerated');
  assert.equal(resolveTiltPitchDeg(' atas ', 0), NADIR_PITCH_DEG, 'padding is tolerated');
  // Junk falls to the default mode, which is Samping — so a local view, oblique.
  assert.equal(resolveTiltPitchDeg('sideways', 0), OBLIQUE_PITCH_DEG);
  assert.equal(resolveTiltPitchDeg(undefined, 0), OBLIQUE_PITCH_DEG);
});

const base = {
  mode: CAMERA_ANGLE_MODES.ATAS,
  altitudeM: 2000,
  currentPitchDeg: -35,
  targetDistanceM: 2400,
};

test('a plain switch produces a tilt that preserves the standoff distance', () => {
  const plan = planTiltInPlace(base);
  assert.equal(plan.tilt, true);
  assert.equal(plan.reason, 'tilt');
  assert.equal(plan.pitchDeg, NADIR_PITCH_DEG);
  assert.equal(plan.rangeM, 2400, 'range is the measured eye-to-target distance');
  assert.equal(plan.durationS, TILT_DURATION_S);
});

test('the cockpit keeps the camera it owns', () => {
  const plan = planTiltInPlace({ ...base, cockpitActive: true });
  assert.equal(plan.tilt, false);
  assert.equal(plan.reason, 'cockpit-active');
});

test('a tracked entity keeps the camera it owns', () => {
  const plan = planTiltInPlace({ ...base, trackingActive: true });
  assert.equal(plan.tilt, false);
  assert.equal(plan.reason, 'tracking-holds-view');
});

test('the cockpit refusal is checked before tracking, so a cockpit lock reports itself', () => {
  // Both can be true at once; the point of the ordering is a stable reason code.
  const plan = planTiltInPlace({ ...base, cockpitActive: true, trackingActive: true });
  assert.equal(plan.reason, 'cockpit-active');
});

test('no aim point on the globe means there is no in-place to pivot around', () => {
  const plan = planTiltInPlace({ ...base, targetResolved: false });
  assert.equal(plan.tilt, false);
  assert.equal(plan.reason, 'no-ground-target');
  assert.equal(plan.pitchDeg, undefined, 'a refusal carries no pitch to apply');
});

test('a camera already at the target pitch does not animate', () => {
  const plan = planTiltInPlace({ ...base, currentPitchDeg: NADIR_PITCH_DEG });
  assert.equal(plan.tilt, false);
  assert.equal(plan.reason, 'already-there');
  assert.equal(plan.pitchDeg, NADIR_PITCH_DEG, 'the no-op still reports where it is');
});

test('the already-there epsilon is half a degree, inclusive of float drift but not of a real difference', () => {
  assert.equal(planTiltInPlace({ ...base, currentPitchDeg: -89.6 }).tilt, false);
  assert.equal(planTiltInPlace({ ...base, currentPitchDeg: -89.4 }).tilt, true);
});

test('a non-finite current pitch tilts rather than guessing it is already there', () => {
  // The alternative — treating unknown as equal — would make the control dead
  // exactly when the camera pose is unreadable, which is the bug being fixed.
  const plan = planTiltInPlace({ ...base, currentPitchDeg: undefined });
  assert.equal(plan.tilt, true);
});

test('the standoff is clamped so a close-in nadir tilt is a view change, not a collision', () => {
  const plan = planTiltInPlace({ ...base, targetDistanceM: 10 });
  assert.equal(plan.rangeM, MIN_TILT_RANGE_M);
  const unknown = planTiltInPlace({ ...base, targetDistanceM: undefined });
  assert.equal(unknown.rangeM, MIN_TILT_RANGE_M, 'an unmeasurable distance clamps too');
});

test('Samping from a globe-height nadir view tilts to the globe oblique, not the generic one', () => {
  // This is the gesture the request originated from: press the globe button, then
  // ask for a side view without flying anywhere.
  const plan = planTiltInPlace({
    mode: CAMERA_ANGLE_MODES.SAMPING,
    altitudeM: 18_000_000,
    currentPitchDeg: NADIR_PITCH_DEG,
    targetDistanceM: 18_000_000,
  });
  assert.equal(plan.tilt, true);
  assert.equal(plan.pitchDeg, GLOBE_OBLIQUE_PITCH_DEG);
  assert.equal(plan.rangeM, 18_000_000, 'the globe stays the same size on screen');
});

test('planTiltInPlace tolerates being called with nothing', () => {
  const plan = planTiltInPlace();
  assert.equal(plan.tilt, true, 'no state still resolves to the default mode at ground level');
  assert.equal(plan.pitchDeg, OBLIQUE_PITCH_DEG);
  assert.equal(plan.rangeM, MIN_TILT_RANGE_M);
});

test('the tilt animation is short enough to read as a toggle', () => {
  assert.ok(TILT_DURATION_S > 0, 'zero would snap with no sense of which way the world moved');
  assert.ok(TILT_DURATION_S <= 1.5, 'a toggle must not feel like a journey');
});

test('the global band matches viewScaleForAltitude so there is one threshold, not two', async () => {
  const policy = await import('./data/detectionPolicy.js');
  const fn = policy.viewScaleForAltitude;
  assert.equal(typeof fn, 'function');
  assert.notEqual(
    fn(GLOBAL_VIEW_ALTITUDE_M - 1),
    'global',
    'just below the tilt band must not yet be the global view scale',
  );
  assert.equal(
    fn(GLOBAL_VIEW_ALTITUDE_M),
    'global',
    'the tilt band boundary must be exactly where the view scale turns global',
  );
});
