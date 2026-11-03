// The Sudut (camera angle) mode at the CCTV focus seam.
//
// This is the seam the owner pointed at when asking for the feature ("kamera
// dari samping seperti saat cctv active") — the -22 oblique a CCTV activation
// flies to was a bare inline literal before the mode existed. It is now
// CCTV_OBLIQUE_PITCH_DEG and deliberately NOT unified with the generic
// OBLIQUE_PITCH_DEG: it is calibrated against focusCctvRecord's own range and
// sphere radius, and happens to equal buildingPitch's mid-ratio value by
// coincidence.
//
// Own file rather than appended to cctv.test.mjs, which is 2109 lines — over
// five times the 400-line test budget (Rule 8).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as Cesium from 'cesium';
import { focusCctvRecord } from './cctvActivation.js';
import { CCTV_FOCUS_RESULT } from './cctvFocusResult.js';
import {
  CAMERA_ANGLE_MODES,
  CCTV_OBLIQUE_PITCH_DEG,
  NADIR_PITCH_DEG,
  OBLIQUE_PITCH_DEG,
  setCameraAngleMode,
  _resetCameraAngleModeForTest,
} from '../cameraAngleMode.js';

const RECORD = Object.freeze({
  camera: Object.freeze({ rangeM: 210, headingDeg: 41 }),
  position: Object.freeze({ x: 1, y: 2, z: 3 }),
});

/** A viewer whose camera records the full options object, offset included. */
function stubViewer() {
  const flights = [];
  return {
    flights,
    trackedEntity: null,
    camera: {
      flyToBoundingSphere(sphere, options) { flights.push({ sphere, options }); },
    },
  };
}

function focusAndReadOffset(mode) {
  setCameraAngleMode(mode);
  const viewer = stubViewer();
  assert.equal(focusCctvRecord(viewer, RECORD, 1.9), CCTV_FOCUS_RESULT.FOCUSED);
  assert.equal(viewer.flights.length, 1);
  return viewer.flights[0].options.offset;
}

test('SAMPING flies a CCTV activation to the calibrated CCTV oblique', () => {
  _resetCameraAngleModeForTest();
  try {
    const offset = focusAndReadOffset(CAMERA_ANGLE_MODES.SAMPING);
    assert.equal(Math.round(Cesium.Math.toDegrees(offset.pitch)), CCTV_OBLIQUE_PITCH_DEG);
  } finally {
    _resetCameraAngleModeForTest();
  }
});

test('ATAS flies the same activation nadir', () => {
  _resetCameraAngleModeForTest();
  try {
    const offset = focusAndReadOffset(CAMERA_ANGLE_MODES.ATAS);
    assert.equal(Math.round(Cesium.Math.toDegrees(offset.pitch)), NADIR_PITCH_DEG);
  } finally {
    _resetCameraAngleModeForTest();
  }
});

test('the mode changes the pitch and nothing else — ATAS keeps the device heading and range', () => {
  _resetCameraAngleModeForTest();
  try {
    const samping = focusAndReadOffset(CAMERA_ANGLE_MODES.SAMPING);
    const atas = focusAndReadOffset(CAMERA_ANGLE_MODES.ATAS);
    assert.equal(atas.heading, samping.heading);
    assert.equal(
      Math.round(Cesium.Math.toDegrees(atas.heading)),
      RECORD.camera.headingDeg,
      'a plan view still has to point where the device points',
    );
    assert.equal(atas.range, samping.range);
  } finally {
    _resetCameraAngleModeForTest();
  }
});

test('the default mode leaves CCTV activation flying exactly as it did before the control existed', () => {
  _resetCameraAngleModeForTest();
  const offset = focusAndReadOffset(undefined);
  assert.equal(Math.round(Cesium.Math.toDegrees(offset.pitch)), CCTV_OBLIQUE_PITCH_DEG);
  _resetCameraAngleModeForTest();
});

test('the CCTV oblique is its own constant, not an alias of the generic one', () => {
  assert.notEqual(
    CCTV_OBLIQUE_PITCH_DEG,
    OBLIQUE_PITCH_DEG,
    'unifying these would decalibrate the CCTV flight against its own range and radius',
  );
});

test('a refused focus issues no flight at all, so the mode can never half-apply', () => {
  _resetCameraAngleModeForTest();
  try {
    setCameraAngleMode(CAMERA_ANGLE_MODES.ATAS);
    const viewer = stubViewer();
    viewer.trackedEntity = { id: 'tracked' };
    const originalDebug = console.debug;
    console.debug = () => {};
    try {
      assert.equal(
        focusCctvRecord(viewer, RECORD, 1.9),
        CCTV_FOCUS_RESULT.TRACKING_HOLDS_VIEW,
      );
    } finally {
      console.debug = originalDebug;
    }
    assert.equal(viewer.flights.length, 0);
  } finally {
    _resetCameraAngleModeForTest();
  }
});
