// Indonesia expansion: the remaining 7 metro cities (Surabaya, Bandung,
// Medan, Semarang, Yogyakarta, Makassar, Denpasar) added to CITY_POIS
// alongside Jakarta (covered separately in jakartaLocation.test.mjs). Same
// coverage shape: each city's entry has a valid shape, and
// flyToPresetLocation(viewer, cityId, ...) actually issues a flight.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as Cesium from 'cesium';
import { CITY_POIS, LOCATIONS, flyToPresetLocation } from './locations.js';

const NEW_CITIES = [
  ['surabaya', 'Surabaya'],
  ['bandung', 'Bandung'],
  ['medan', 'Medan'],
  ['semarang', 'Semarang'],
  ['yogyakarta', 'Yogyakarta'],
  ['makassar', 'Makassar'],
  ['denpasar', 'Denpasar'],
];

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

// Denpasar carries a 6th POI (Pura Ulun Danu Beratan, an outlying Bedugul
// landmark added at the user's explicit request) — every other city has 5.
const EXPECTED_POI_COUNT = { denpasar: 6 };

for (const [id, name] of NEW_CITIES) {
  test(`CITY_POIS.${id} exists with a valid viewBounds and POI list`, () => {
    const city = CITY_POIS[id];
    assert.ok(city, `CITY_POIS.${id} is missing`);
    assert.equal(city.name, name);
    assert.ok(city.viewBounds.southwest.lat < city.viewBounds.northeast.lat);
    assert.ok(city.viewBounds.southwest.lng < city.viewBounds.northeast.lng);
    assert.equal(city.pois.length, EXPECTED_POI_COUNT[id] ?? 5);
    for (const poi of city.pois) {
      assert.equal(typeof poi.name, 'string');
      assert.equal(typeof poi.lat, 'number');
      assert.equal(typeof poi.lon, 'number');
      assert.equal(typeof poi.alt, 'number');
      assert.ok(Math.abs(poi.lat) <= 90, `${id}: ${poi.name} lat out of range`);
      assert.ok(Math.abs(poi.lon) <= 180, `${id}: ${poi.name} lon out of range`);
    }
  });

  test(`LOCATIONS (the flat backward-compat array) includes ${id}`, () => {
    const entry = LOCATIONS.find((loc) => loc.id === id);
    assert.ok(entry, `LOCATIONS is missing a ${id} entry`);
    assert.equal(entry.name, name);
  });

  test(`flyToPresetLocation(viewer, "${id}") issues a flight over ${name}`, () => {
    const viewer = stubViewer();
    flyToPresetLocation(viewer, id, { viewMode: 'overview' });
    assert.equal(viewer.flights.length, 1, `a city-overview flight to ${id} must be issued`);
  });
}

test('all 8 Indonesian cities are present in CITY_POIS (jakarta + 7 new)', () => {
  const expected = ['jakarta', ...NEW_CITIES.map(([id]) => id)];
  for (const id of expected) {
    assert.ok(CITY_POIS[id], `CITY_POIS.${id} is missing`);
  }
});
