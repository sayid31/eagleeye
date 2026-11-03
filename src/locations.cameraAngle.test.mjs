// Sudut (camera angle) mode as it reaches the two flight seams in locations.js.
//
// This is the behavioral half of the contract that cameraAngleMode.test.mjs
// pins arithmetically: ATOMS of the contract are tested there, here we assert
// the pitch a real flight actually receives.
//
// Own file rather than appended to locations.test.mjs, which is already past
// the 400-line test budget (Rule 8).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as Cesium from 'cesium';
import { flyToGlobeView, flyToLandmark, GLOBE_VIEW } from './locations.js';
import {
  CAMERA_ANGLE_MODES,
  GLOBE_OBLIQUE_PITCH_DEG,
  NADIR_PITCH_DEG,
  OBLIQUE_PITCH_DEG,
  setCameraAngleMode,
  _resetCameraAngleModeForTest,
} from './cameraAngleMode.js';

function stubViewer() {
  const flights = [];
  return {
    flights,
    scene: { globe: null, canvas: { clientWidth: 0, clientHeight: 0 } },
    camera: {
      positionCartographic: {
        longitude: Cesium.Math.toRadians(-73.9857),
        latitude: Cesium.Math.toRadians(40.7484),
        height: 1200,
      },
      cancelFlight() {},
      flyTo(options) { flights.push(options); },
      flyToBoundingSphere(sphere, options) { flights.push({ sphere, ...options }); },
      lookAt() {},
      lookAtTransform() {},
    },
  };
}

/** Read the pitch a recorded flight was given, in degrees. */
function flownPitchDeg(viewer, index = 0) {
  const flight = viewer.flights[index];
  const radians = flight.offset ? flight.offset.pitch : flight.orientation.pitch;
  return Cesium.Math.toDegrees(radians);
}

test('SAMPING preserves a curated landmark pitch — the Empire State facade still reads as a facade', () => {
  _resetCameraAngleModeForTest();
  setCameraAngleMode(CAMERA_ANGLE_MODES.SAMPING);
  const viewer = stubViewer();
  flyToLandmark(viewer, 40.7484, -73.9857, { pitch: -12, range: 900, buildingHeight: 443 });
  assert.equal(Math.round(flownPitchDeg(viewer)), -12);
  _resetCameraAngleModeForTest();
});

test('ATAS overrides a curated landmark pitch — in plan view a building has no face to frame', () => {
  _resetCameraAngleModeForTest();
  setCameraAngleMode(CAMERA_ANGLE_MODES.ATAS);
  const viewer = stubViewer();
  flyToLandmark(viewer, 40.7484, -73.9857, { pitch: -12, range: 900, buildingHeight: 443 });
  assert.equal(Math.round(flownPitchDeg(viewer)), NADIR_PITCH_DEG);
  _resetCameraAngleModeForTest();
});

// Documents a real asymmetry rather than asserting a tidier one: flyToLandmark
// destructures its OWN `pitch = -30` default, so the resolver is handed a finite
// number even when the caller passed nothing. OBLIQUE_PITCH_DEG (-35) is
// therefore unreachable through this seam by construction — it is the fallback
// for seams that can genuinely hand over a non-finite pitch (worldFocus with an
// absent framing.pitchDeg). Keeping the function's default rather than routing
// it through the fallback is what makes SAMPING a no-op against today's
// behavior, which is the whole point of SAMPING being the default mode.
test('SAMPING preserves flyToLandmark own -30 default — it is curation too, not an absence', () => {
  _resetCameraAngleModeForTest();
  setCameraAngleMode(CAMERA_ANGLE_MODES.SAMPING);
  const viewer = stubViewer();
  flyToLandmark(viewer, 40.7484, -73.9857, { range: 900 });
  assert.equal(Math.round(flownPitchDeg(viewer)), -30);
  assert.notEqual(
    Math.round(flownPitchDeg(viewer)),
    OBLIQUE_PITCH_DEG,
    'the generic oblique must NOT displace the function own documented default',
  );
  _resetCameraAngleModeForTest();
});

test('the globe button goes nadir in ATAS and to its own derived oblique in SAMPING', () => {
  _resetCameraAngleModeForTest();
  setCameraAngleMode(CAMERA_ANGLE_MODES.ATAS);
  const atasViewer = stubViewer();
  flyToGlobeView(atasViewer);
  assert.equal(Math.round(flownPitchDeg(atasViewer)), GLOBE_VIEW.pitchDeg);

  setCameraAngleMode(CAMERA_ANGLE_MODES.SAMPING);
  const sampingViewer = stubViewer();
  flyToGlobeView(sampingViewer);
  assert.equal(Math.round(flownPitchDeg(sampingViewer)), GLOBE_OBLIQUE_PITCH_DEG);
  assert.notEqual(
    GLOBE_OBLIQUE_PITCH_DEG,
    OBLIQUE_PITCH_DEG,
    'the globe cannot reuse the generic oblique: -35 aims past the limb at this height',
  );
  _resetCameraAngleModeForTest();
});

test('the globe flight keeps its height and heading in both modes — the view-scale band and the reset watchdog depend on it', () => {
  _resetCameraAngleModeForTest();
  for (const mode of [CAMERA_ANGLE_MODES.ATAS, CAMERA_ANGLE_MODES.SAMPING]) {
    setCameraAngleMode(mode);
    const viewer = stubViewer();
    const result = flyToGlobeView(viewer);
    assert.equal(result.heightM, GLOBE_VIEW.heightM, `${mode} must not change globe height`);
    assert.equal(viewer.flights[0].orientation.heading, 0);
    assert.equal(viewer.flights[0].orientation.roll, 0);
    assert.equal(viewer.flights[0].duration, GLOBE_VIEW.durationS);
  }
  _resetCameraAngleModeForTest();
});

test('the mode never touches heading or range — ATAS reads a coverage footprint, it does not lose the aim', () => {
  _resetCameraAngleModeForTest();
  setCameraAngleMode(CAMERA_ANGLE_MODES.ATAS);
  const atasViewer = stubViewer();
  flyToLandmark(atasViewer, 40.7484, -73.9857, { pitch: -22, heading: 135, range: 640 });

  setCameraAngleMode(CAMERA_ANGLE_MODES.SAMPING);
  const sampingViewer = stubViewer();
  flyToLandmark(sampingViewer, 40.7484, -73.9857, { pitch: -22, heading: 135, range: 640 });

  assert.equal(atasViewer.flights[0].offset.heading, sampingViewer.flights[0].offset.heading);
  assert.equal(atasViewer.flights[0].offset.range, sampingViewer.flights[0].offset.range);
  _resetCameraAngleModeForTest();
});

test('the default mode leaves every flight exactly as it flew before the control existed', () => {
  _resetCameraAngleModeForTest();
  const viewer = stubViewer();
  flyToLandmark(viewer, 40.7484, -73.9857, { pitch: -45, range: 900 });
  assert.equal(Math.round(flownPitchDeg(viewer)), -45);
});
