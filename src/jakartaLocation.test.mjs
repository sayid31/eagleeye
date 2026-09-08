// Indonesia expansion: Jakarta added to CITY_POIS (the registry that drives
// the Location dropdown menu, CCTV seed placement, and voice fly_to_location).
// Coverage: the jakarta entry exists with a valid shape, and
// flyToPresetLocation(viewer, 'jakarta', ...) actually issues a flight —
// distinct from CAMERA_PRESETS.jakarta (covered in camera.test.mjs), which
// only drives the one-time on-load default fly-in.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as Cesium from 'cesium';
import { CITY_POIS, LOCATIONS, flyToPresetLocation } from './locations.js';

function stubViewer() {
  const flights = [];
  return {
    flights,
    scene: { globe: null, canvas: { clientWidth: 0, clientHeight: 0 } },
    camera: {
      positionCartographic: {
        longitude: Cesium.Math.toRadians(106.8456),
        latitude: Cesium.Math.toRadians(-6.2088),
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

test('CITY_POIS.jakarta exists with a valid viewBounds and 5 POIs', () => {
  const jakarta = CITY_POIS.jakarta;
  assert.ok(jakarta, 'CITY_POIS.jakarta is missing');
  assert.equal(jakarta.name, 'Jakarta');
  assert.ok(jakarta.viewBounds.southwest.lat < jakarta.viewBounds.northeast.lat);
  assert.ok(jakarta.viewBounds.southwest.lng < jakarta.viewBounds.northeast.lng);
  assert.equal(jakarta.pois.length, 5);
  for (const poi of jakarta.pois) {
    assert.equal(typeof poi.name, 'string');
    assert.equal(typeof poi.lat, 'number');
    assert.equal(typeof poi.lon, 'number');
    assert.equal(typeof poi.alt, 'number');
  }
});

test('LOCATIONS (the flat backward-compat array) includes jakarta', () => {
  const jakarta = LOCATIONS.find((loc) => loc.id === 'jakarta');
  assert.ok(jakarta, 'LOCATIONS is missing a jakarta entry');
  assert.equal(jakarta.name, 'Jakarta');
});

test('flyToPresetLocation(viewer, "jakarta") issues a flight over Jakarta', () => {
  const viewer = stubViewer();
  flyToPresetLocation(viewer, 'jakarta', { viewMode: 'overview' });
  assert.equal(viewer.flights.length, 1, 'a city-overview flight to jakarta must be issued');
});
