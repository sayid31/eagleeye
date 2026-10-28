// The Sudut control's UI half: that a click re-aims the live camera, and that
// the restore paths deliberately do not.
//
// Own file rather than a section of reasonableDefaultsCameraAngle.test.mjs,
// which pins the first-run default across three surfaces and has nothing to do
// with camera motion.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as Cesium from 'cesium';

import { cameraAngleMixin } from './uiCameraAngle.js';
import {
  CAMERA_ANGLE_MODES,
  GLOBE_OBLIQUE_PITCH_DEG,
  NADIR_PITCH_DEG,
  OBLIQUE_PITCH_DEG,
  getCameraAngleMode,
  _resetCameraAngleModeForTest,
} from './cameraAngleMode.js';
import { MIN_TILT_RANGE_M } from './cameraAngleTilt.js';

const uiSource = fs.readFileSync(new URL('./ui.js', import.meta.url), 'utf8');
const presetsSource = fs.readFileSync(new URL('./uiPresets.js', import.meta.url), 'utf8');

/** A button element stub with just the surface _syncCameraAngleButtonState touches. */
function buttonStub(mode) {
  const classes = new Set();
  const attrs = {};
  return {
    dataset: { cameraAngle: mode },
    classList: {
      toggle(name, on) { if (on) classes.add(name); else classes.delete(name); },
      contains(name) { return classes.has(name); },
    },
    setAttribute(name, value) { attrs[name] = value; },
    getAttribute(name) { return attrs[name]; },
    addEventListener(type, handler) { this._handlers = { ...this._handlers, [type]: handler }; },
    click() { this._handlers?.click?.(); },
  };
}

/**
 * A StyleManager-shaped host with the mixin applied.
 * @param {{altitudeM?: number, pitchDeg?: number, pickTarget?: object|null,
 *          cockpit?: boolean, tracked?: object|null}} [options]
 */
function host(options = {}) {
  const {
    altitudeM = 2000,
    pitchDeg = -35,
    pickTarget = Cesium.Cartesian3.fromDegrees(106.8272, -6.1751),
    cockpit = false,
    tracked = null,
  } = options;

  const flights = [];
  const cancels = [];
  const target = {
    _cameraAngleBtns: [
      buttonStub(CAMERA_ANGLE_MODES.ATAS),
      buttonStub(CAMERA_ANGLE_MODES.SAMPING),
    ],
    flights,
    cancels,
    shareSyncs: 0,
    restoreLanes: [],
    shareLinkManager: { claimRestoreLane(lane) { target.restoreLanes.push(lane); } },
    _syncShareState() { target.shareSyncs += 1; },
    viewer: {
      trackedEntity: tracked,
      scene: {
        globe: { ellipsoid: Cesium.Ellipsoid.WGS84 },
        canvas: { clientWidth: 1600, clientHeight: 900 },
      },
      camera: {
        heading: Cesium.Math.toRadians(135),
        pitch: Cesium.Math.toRadians(pitchDeg),
        position: Cesium.Cartesian3.fromDegrees(106.8272, -6.1751, altitudeM),
        positionCartographic: { height: altitudeM },
        pickEllipsoid() { return pickTarget; },
        cancelFlight() { cancels.push(true); },
        flyToBoundingSphere(sphere, flightOptions) { flights.push({ sphere, ...flightOptions }); },
      },
    },
  };
  Object.assign(target, cameraAngleMixin);

  // document.body is read for the cockpit guard; the mixin must not assume a DOM.
  const previousDocument = globalThis.document;
  globalThis.document = {
    body: { classList: { contains: (name) => cockpit && name === 'cockpit-mode' } },
  };
  target.restoreDocument = () => {
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
  };
  return target;
}

/** The pitch, in degrees, a recorded tilt flight was given. */
function tiltPitchDeg(target, index = 0) {
  return Cesium.Math.toDegrees(target.flights[index].offset.pitch);
}

test('clicking Atas re-aims the live camera instead of only setting a preference', () => {
  _resetCameraAngleModeForTest();
  const target = host({ pitchDeg: -35 });
  try {
    target._initCameraAngleControl();
    target._cameraAngleBtns[0].click();

    assert.equal(getCameraAngleMode(), CAMERA_ANGLE_MODES.ATAS);
    assert.equal(target.flights.length, 1, 'the click must move the camera — this is the bug fix');
    assert.equal(Math.round(tiltPitchDeg(target)), NADIR_PITCH_DEG);
    assert.equal(target.cancels.length, 1, 'an in-flight camera is stopped before the tilt');
  } finally {
    target.restoreDocument();
    _resetCameraAngleModeForTest();
  }
});

test('the tilt keeps the heading and the standoff, so the target stays centered', () => {
  _resetCameraAngleModeForTest();
  const target = host({ pitchDeg: -35, altitudeM: 3000 });
  try {
    const result = target.setCameraAngle(CAMERA_ANGLE_MODES.ATAS);
    assert.equal(result.ok, true);
    assert.equal(result.tilted, true);
    assert.equal(result.tiltReason, 'tilt');
    const flight = target.flights[0];
    assert.equal(flight.offset.heading, target.viewer.camera.heading,
      'a tilt is not a turn: the heading the operator chose survives');
    assert.ok(flight.offset.range >= MIN_TILT_RANGE_M);
    assert.ok(flight.duration > 0, 'the move is animated, not a snap');
    assert.equal(flight.sphere.radius, 0,
      'a zero-radius sphere is what makes the offset mean "relative to this exact point"');
  } finally {
    target.restoreDocument();
    _resetCameraAngleModeForTest();
  }
});

test('Samping tilts to the generic oblique near the ground and the globe oblique from orbit', () => {
  _resetCameraAngleModeForTest();
  const near = host({ pitchDeg: NADIR_PITCH_DEG, altitudeM: 3000 });
  try {
    near.setCameraAngle(CAMERA_ANGLE_MODES.SAMPING);
    assert.equal(Math.round(tiltPitchDeg(near)), OBLIQUE_PITCH_DEG);
  } finally {
    near.restoreDocument();
  }
  _resetCameraAngleModeForTest();
  const far = host({ pitchDeg: NADIR_PITCH_DEG, altitudeM: 18_000_000 });
  try {
    far.setCameraAngle(CAMERA_ANGLE_MODES.SAMPING);
    assert.equal(Math.round(tiltPitchDeg(far)), GLOBE_OBLIQUE_PITCH_DEG,
      'pressing the globe button then Samping must show the disc, not empty space');
  } finally {
    far.restoreDocument();
    _resetCameraAngleModeForTest();
  }
});

test('tilt: false sets the mode and leaves the camera where it was', () => {
  _resetCameraAngleModeForTest();
  const target = host({ pitchDeg: -35 });
  try {
    const result = target.setCameraAngle(CAMERA_ANGLE_MODES.ATAS, { tilt: false });
    assert.equal(result.ok, true);
    assert.equal(getCameraAngleMode(), CAMERA_ANGLE_MODES.ATAS, 'the preference still lands');
    assert.equal(result.tilted, false);
    assert.equal(result.tiltReason, 'not-requested');
    assert.equal(target.flights.length, 0);
    assert.equal(target.cancels.length, 0, 'a restore flight in progress must not be cancelled');
  } finally {
    target.restoreDocument();
    _resetCameraAngleModeForTest();
  }
});

test('both restore paths pass tilt: false, so a share link reproduces its sender framing', () => {
  // The pin is on the source rather than on behavior because the restore paths
  // live inside ui.js's onRestore handler and uiPresets' applyGlobalPostDefaults,
  // neither of which is reachable without a StyleManager. A silently dropped
  // `tilt: false` would re-aim the recipient away from the view the link exists
  // to show — the same failure the pitch-beats-ca contract prevents.
  assert.match(uiSource, /this\.setCameraAngle\(cameraAngle, \{ syncShare: false, tilt: false \}\)/,
    'ui.js share restore must not tilt');
  assert.match(
    presetsSource,
    /this\.setCameraAngle\(defaults\.cameraAngle, \{ syncShare: false, tilt: false \}\)/,
    'uiPresets.js defaults must not tilt',
  );
});

test('the cockpit and a tracked entity keep the camera they own', () => {
  _resetCameraAngleModeForTest();
  const cockpit = host({ cockpit: true });
  try {
    const result = cockpit.setCameraAngle(CAMERA_ANGLE_MODES.ATAS);
    assert.equal(result.ok, true, 'the preference still lands — only the motion is declined');
    assert.equal(result.tilted, false);
    assert.equal(result.tiltReason, 'cockpit-active');
    assert.equal(cockpit.flights.length, 0);
  } finally {
    cockpit.restoreDocument();
  }
  _resetCameraAngleModeForTest();
  const tracking = host({ tracked: { id: 'aaa097' } });
  try {
    const result = tracking.setCameraAngle(CAMERA_ANGLE_MODES.ATAS);
    assert.equal(result.tiltReason, 'tracking-holds-view');
    assert.equal(tracking.flights.length, 0);
  } finally {
    tracking.restoreDocument();
    _resetCameraAngleModeForTest();
  }
});

test('a view aimed past the limb declines the tilt rather than picking an arbitrary point', () => {
  _resetCameraAngleModeForTest();
  const target = host({ pickTarget: null });
  try {
    const result = target.setCameraAngle(CAMERA_ANGLE_MODES.ATAS);
    assert.equal(result.tiltReason, 'no-ground-target');
    assert.equal(target.flights.length, 0);
  } finally {
    target.restoreDocument();
    _resetCameraAngleModeForTest();
  }
});

test('re-clicking the mode the camera already shows does not re-animate it', () => {
  _resetCameraAngleModeForTest();
  const target = host({ pitchDeg: NADIR_PITCH_DEG });
  try {
    const result = target.setCameraAngle(CAMERA_ANGLE_MODES.ATAS);
    assert.equal(result.tilted, false);
    assert.equal(result.tiltReason, 'already-there');
    assert.equal(target.flights.length, 0);
  } finally {
    target.restoreDocument();
    _resetCameraAngleModeForTest();
  }
});

test('a missing viewer is a declined tilt, not a thrown error', () => {
  _resetCameraAngleModeForTest();
  const target = host();
  target.viewer = null;
  try {
    const result = target.setCameraAngle(CAMERA_ANGLE_MODES.ATAS);
    assert.equal(result.ok, true);
    assert.equal(result.tiltReason, 'no-viewer');
    assert.equal(getCameraAngleMode(), CAMERA_ANGLE_MODES.ATAS);
  } finally {
    target.restoreDocument();
    _resetCameraAngleModeForTest();
  }
});

test('an invalid mode or a non-boolean tilt option is rejected and moves nothing', () => {
  _resetCameraAngleModeForTest();
  const target = host();
  try {
    const bad = target.setCameraAngle('sideways');
    assert.equal(bad.ok, false);
    assert.match(bad.error, /Invalid camera angle mode/);
    assert.equal(target.flights.length, 0);

    const badOption = target.setCameraAngle(CAMERA_ANGLE_MODES.ATAS, { tilt: 'yes' });
    assert.equal(badOption.ok, false);
    assert.equal(target.flights.length, 0);
    assert.equal(getCameraAngleMode(), CAMERA_ANGLE_MODES.SAMPING,
      'a rejected call must not have moved the singleton either');
  } finally {
    target.restoreDocument();
    _resetCameraAngleModeForTest();
  }
});

test('a synced click claims the visual restore lane and pushes share state exactly once', () => {
  _resetCameraAngleModeForTest();
  const target = host();
  try {
    target.setCameraAngle(CAMERA_ANGLE_MODES.ATAS);
    assert.deepEqual(target.restoreLanes, ['visual']);
    assert.equal(target.shareSyncs, 1);

    target.setCameraAngle(CAMERA_ANGLE_MODES.SAMPING, { syncShare: false });
    assert.deepEqual(target.restoreLanes, ['visual'], 'an unsynced call claims no lane');
    assert.equal(target.shareSyncs, 1);
  } finally {
    target.restoreDocument();
    _resetCameraAngleModeForTest();
  }
});

test('the selected segment is reported to sighted operators and to assistive tech alike', () => {
  _resetCameraAngleModeForTest();
  const target = host();
  try {
    target.setCameraAngle(CAMERA_ANGLE_MODES.ATAS);
    const [atas, samping] = target._cameraAngleBtns;
    assert.equal(atas.classList.contains('active'), true);
    assert.equal(atas.getAttribute('aria-checked'), 'true');
    assert.equal(samping.classList.contains('active'), false);
    assert.equal(samping.getAttribute('aria-checked'), 'false');
  } finally {
    target.restoreDocument();
    _resetCameraAngleModeForTest();
  }
});
