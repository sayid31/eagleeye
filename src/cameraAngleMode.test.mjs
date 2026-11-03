// Camera angle mode (owner directive 2026-10-28): a persisted ATAS/SAMPING
// choice applied to every pitch-bearing camera flight. These tests pin the
// CONTRACT, not just the numbers — specifically that ATAS overrides the ~30
// hand-curated CITY_POIS pitches while SAMPING preserves them, which is the
// whole design decision and the thing a future refactor is most likely to
// "simplify" away. Pure functions only, no Cesium viewer.
//
// Run with: npm test   (node --test)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CAMERA_ANGLE_MODES,
  CAMERA_ANGLE_MODE_DEFAULT,
  NADIR_PITCH_DEG,
  OBLIQUE_PITCH_DEG,
  CCTV_OBLIQUE_PITCH_DEG,
  GLOBE_OBLIQUE_PITCH_DEG,
  isCameraAngleMode,
  normalizeCameraAngleMode,
  resolveCameraPitchDeg,
  getCameraAngleMode,
  setCameraAngleMode,
  resolveActiveCameraPitchDeg,
  _resetCameraAngleModeForTest,
} from './cameraAngleMode.js';

test('the mode enum is frozen and holds exactly two modes', () => {
  assert.equal(Object.isFrozen(CAMERA_ANGLE_MODES), true);
  assert.deepEqual(Object.values(CAMERA_ANGLE_MODES).sort(), ['atas', 'samping']);
});

test('the default is SAMPING, because oblique is what the app already did', () => {
  // An ATAS default would silently re-frame every existing pitch-bearing flight
  // on first boot. Also pinned against markup + GLOBAL_POST_DEFAULTS in
  // reasonableDefaults.test.mjs — this is the constant surface of that trio.
  assert.equal(CAMERA_ANGLE_MODE_DEFAULT, CAMERA_ANGLE_MODES.SAMPING);
});

test('normalize accepts both modes and tolerates casing and padding', () => {
  assert.equal(normalizeCameraAngleMode('atas'), 'atas');
  assert.equal(normalizeCameraAngleMode('samping'), 'samping');
  assert.equal(normalizeCameraAngleMode('ATAS'), 'atas');
  assert.equal(normalizeCameraAngleMode('  Samping  '), 'samping');
});

test('the predicate recognizes a mode without coercing it', () => {
  // Two different questions, deliberately two functions. The public setter must
  // REJECT junk (its caller is owed an error), while a share link must COERCE
  // it. Asking the coercer "did it come back unchanged?" answers the first
  // question only by accident of normalization being trim + lowercase.
  assert.equal(isCameraAngleMode('atas'), true);
  assert.equal(isCameraAngleMode('ATAS'), true, 'casing is recognized, not rejected');
  assert.equal(isCameraAngleMode('  samping  '), true, 'and so is padding');
  for (const junk of [undefined, null, '', 'top-down', '2d', 3, {}, [], NaN, true]) {
    assert.equal(isCameraAngleMode(junk), false);
  }
});

test('the predicate separates "is the default" from "is recognized"', () => {
  // The trap the old round-trip check sat next to: SAMPING is both a real mode
  // and the junk fallback, so a validity test built on "normalize returned the
  // default" cannot tell a caller who asked for Samping from one who typed
  // nonsense. These two assertions are the whole reason the predicate exists.
  assert.equal(normalizeCameraAngleMode('nonsense'), CAMERA_ANGLE_MODE_DEFAULT);
  assert.equal(isCameraAngleMode('nonsense'), false);
  assert.equal(isCameraAngleMode(CAMERA_ANGLE_MODE_DEFAULT), true);
});

test('normalize sends every junk shape to the default, never to undefined', () => {
  // A share link, a dataset attribute and a public setter all funnel through
  // here, so a bad value must not be able to wedge the mode into a state no
  // seam can resolve a pitch from.
  for (const junk of [undefined, null, '', 'top-down', '2d', 3, {}, [], NaN, true]) {
    assert.equal(normalizeCameraAngleMode(junk), CAMERA_ANGLE_MODE_DEFAULT);
  }
});

test('ATAS overrides curated pitch — the facade-vs-plan-view decision', () => {
  // CITY_POIS hand-tunes pitch per landmark to frame a building's FACE (Empire
  // State at -12 against a 443 m height, Pentagon at -40). In plan view there is
  // no face, so honoring those would keep the number and lose the intent.
  assert.equal(resolveCameraPitchDeg(CAMERA_ANGLE_MODES.ATAS, -12), NADIR_PITCH_DEG);
  assert.equal(resolveCameraPitchDeg(CAMERA_ANGLE_MODES.ATAS, -45), NADIR_PITCH_DEG);
  assert.equal(resolveCameraPitchDeg(CAMERA_ANGLE_MODES.ATAS, undefined), NADIR_PITCH_DEG);
});

test('SAMPING preserves curated pitch verbatim', () => {
  // The curated values are already oblique, so SAMPING must leave them alone.
  // If this ever starts returning OBLIQUE_PITCH_DEG, ~30 per-landmark framings
  // have been silently flattened.
  assert.equal(resolveCameraPitchDeg(CAMERA_ANGLE_MODES.SAMPING, -12), -12);
  assert.equal(resolveCameraPitchDeg(CAMERA_ANGLE_MODES.SAMPING, -45), -45);
  assert.equal(resolveCameraPitchDeg(CAMERA_ANGLE_MODES.SAMPING, -22), -22);
});

test('SAMPING supplies the fallback only where no curation exists', () => {
  for (const absent of [undefined, null, NaN, Infinity, 'steep']) {
    assert.equal(resolveCameraPitchDeg(CAMERA_ANGLE_MODES.SAMPING, absent), OBLIQUE_PITCH_DEG);
  }
});

test('a curated pitch of 0 is honored, not mistaken for absent', () => {
  // Number.isFinite(0) is true, so a deliberate horizon shot must survive. A
  // truthiness check here would silently turn 0 into -35.
  assert.equal(resolveCameraPitchDeg(CAMERA_ANGLE_MODES.SAMPING, 0), 0);
});

test('an unrecognized mode resolves as the default mode would', () => {
  assert.equal(resolveCameraPitchDeg('3d', -12), -12);
  assert.equal(resolveCameraPitchDeg(undefined, undefined), OBLIQUE_PITCH_DEG);
});

test('the oblique fallback sits inside cameraVerbs own tilt band', () => {
  // cameraVerbs.js clamps voice tilt to [-89, -5]. A fallback outside that band
  // would mean a flight the operator cannot then adjust by voice.
  assert.ok(OBLIQUE_PITCH_DEG > -89 && OBLIQUE_PITCH_DEG < -5);
  assert.ok(CCTV_OBLIQUE_PITCH_DEG > -89 && CCTV_OBLIQUE_PITCH_DEG < -5);
  assert.ok(GLOBE_OBLIQUE_PITCH_DEG > -89 && GLOBE_OBLIQUE_PITCH_DEG < -5);
});

test('nadir sits deliberately at the tilt band edge, 1 degree outside it', () => {
  // PITCH_MIN in cameraVerbs.js is -89, so a voice tilt right after an ATAS
  // flight clamps by one degree. This is PRE-EXISTING — GLOBE_VIEW.pitchDeg has
  // shipped at -90 all along — and is documented rather than patched. Do not
  // "fix" it by widening the band or softening nadir to -89.
  assert.equal(NADIR_PITCH_DEG, -90);
});

test('the globe oblique pitch keeps the whole disc inside the frustum', () => {
  // At 18,000 km the planet's angular radius is asin(6371/24371) = 15.15 deg,
  // against Cesium's 30 deg half-FOV. -80 puts the far limb at ~25.1 deg
  // (inside); -75 puts it at ~30.15 deg (clipped). -35 would aim 55 deg off
  // nadir, at empty space. Hence the band, and hence why the globe cannot just
  // reuse OBLIQUE_PITCH_DEG.
  assert.ok(GLOBE_OBLIQUE_PITCH_DEG < -75, 'shallower than -75 clips the far limb');
  assert.ok(GLOBE_OBLIQUE_PITCH_DEG > -89, 'steeper than -89 is indistinguishable from nadir');
  assert.notEqual(GLOBE_OBLIQUE_PITCH_DEG, OBLIQUE_PITCH_DEG);
});

test('the CCTV pitch stays its own constant, not an alias of the fallback', () => {
  // -22 is calibrated against focusCctvRecord's own range (rangeM * 1.18) and
  // sphere radius (rangeM * 0.36). Unifying the two constants would retune CCTV
  // activation framing as a side effect of touching the generic fallback.
  assert.equal(CCTV_OBLIQUE_PITCH_DEG, -22);
  assert.notEqual(CCTV_OBLIQUE_PITCH_DEG, OBLIQUE_PITCH_DEG);
});

test('the singleton round-trips and normalizes on the way in', () => {
  _resetCameraAngleModeForTest();
  assert.equal(getCameraAngleMode(), CAMERA_ANGLE_MODE_DEFAULT);

  assert.equal(setCameraAngleMode('atas'), 'atas');
  assert.equal(getCameraAngleMode(), 'atas');

  assert.equal(setCameraAngleMode('nonsense'), CAMERA_ANGLE_MODE_DEFAULT);
  assert.equal(getCameraAngleMode(), CAMERA_ANGLE_MODE_DEFAULT);

  _resetCameraAngleModeForTest();
});

test('the active-pitch convenience tracks the singleton', () => {
  _resetCameraAngleModeForTest();
  assert.equal(resolveActiveCameraPitchDeg(-12), -12, 'SAMPING preserves curation');
  assert.equal(resolveActiveCameraPitchDeg(), OBLIQUE_PITCH_DEG);

  setCameraAngleMode(CAMERA_ANGLE_MODES.ATAS);
  assert.equal(resolveActiveCameraPitchDeg(-12), NADIR_PITCH_DEG, 'ATAS overrides curation');
  assert.equal(resolveActiveCameraPitchDeg(), NADIR_PITCH_DEG);

  _resetCameraAngleModeForTest();
});
