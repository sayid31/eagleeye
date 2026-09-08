// Default initial camera view (PM task: Indonesia expansion #1).
// Coverage: CAMERA_PRESETS.jakarta exists with the correct coordinates, and
// flyToDefault() (the on-load cinematic fly-in, formerly flyToAustin())
// targets Jakarta rather than Austin, TX.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as Cesium from 'cesium';
import { CAMERA_PRESETS, flyToDefault, flyToPreset } from './camera.js';

const JAKARTA_LON = 106.8456;
const JAKARTA_LAT = -6.2088;

function stubCamera() {
  const calls = { setView: [], flyTo: [] };
  return {
    calls,
    setView(options) { calls.setView.push(options); },
    flyTo(options) { calls.flyTo.push(options); },
  };
}

function cartographicDegrees(cartesian) {
  const carto = Cesium.Cartographic.fromCartesian(cartesian);
  return {
    lon: Cesium.Math.toDegrees(carto.longitude),
    lat: Cesium.Math.toDegrees(carto.latitude),
  };
}

test('CAMERA_PRESETS has a jakarta entry at the correct coordinates', () => {
  const preset = CAMERA_PRESETS.jakarta;
  assert.ok(preset, 'CAMERA_PRESETS.jakarta is missing');
  const { lon, lat } = cartographicDegrees(preset.destination);
  assert.ok(Math.abs(lon - JAKARTA_LON) < 0.001);
  assert.ok(Math.abs(lat - JAKARTA_LAT) < 0.001);
});

test('the austin/sf/nyc presets remain available alongside jakarta', () => {
  assert.ok(CAMERA_PRESETS.austin);
  assert.ok(CAMERA_PRESETS.sf);
  assert.ok(CAMERA_PRESETS.nyc);
});

test('flyToPreset("jakarta") flies the camera to the Jakarta preset', () => {
  const camera = stubCamera();
  const viewer = { camera };
  flyToPreset(viewer, 'jakarta', 2.0);
  assert.equal(camera.calls.flyTo.length, 1);
  const { lon, lat } = cartographicDegrees(camera.calls.flyTo[0].destination);
  assert.ok(Math.abs(lon - JAKARTA_LON) < 0.001);
  assert.ok(Math.abs(lat - JAKARTA_LAT) < 0.001);
});

test('flyToDefault() sets an initial high-altitude view over Jakarta, then flies down', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const camera = stubCamera();
  const viewer = { camera };

  flyToDefault(viewer);

  assert.equal(camera.calls.setView.length, 1);
  const initial = cartographicDegrees(camera.calls.setView[0].destination);
  assert.ok(Math.abs(initial.lon - JAKARTA_LON) < 0.001);
  assert.ok(Math.abs(initial.lat - JAKARTA_LAT) < 0.001);
  assert.equal(camera.calls.flyTo.length, 0, 'the cinematic arrival is deferred until the timeout fires');

  t.mock.timers.tick(500);

  assert.equal(camera.calls.flyTo.length, 1);
  const arrival = cartographicDegrees(camera.calls.flyTo[0].destination);
  assert.ok(Math.abs(arrival.lon - JAKARTA_LON) < 0.001);
  assert.ok(Math.abs(arrival.lat - JAKARTA_LAT) < 0.001);
});
