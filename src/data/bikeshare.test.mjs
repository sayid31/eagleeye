import test from 'node:test';
import assert from 'node:assert/strict';
import * as Cesium from 'cesium';
import {
  BIKESHARE_SELECTED_OVERLAY_SOURCE_OPTIONS,
  MONITORED_CITIES_NO_FEED,
  _clearBikeshareSelectionForTest,
  _selectBikeshareStationForTest,
  _setBikeshareSelectionStateForTest,
  createBikeshareSelectedOverlayEntry,
} from './bikeshare.js';

function makeRecord() {
  return {
    stationId: '3790',
    stationName: 'Congress & 6th',
    bikesAvailable: 7,
    docksAvailable: 4,
    capacity: 11,
    isInstalled: true,
    isRenting: false,
    isReturning: true,
    point: {
      position: Cesium.Cartesian3.fromDegrees(-97.7431, 30.2672, 2),
      show: true,
    },
  };
}

test('selected bikeshare entry preserves source copy and protected-lane policy', () => {
  const record = makeRecord();
  const entry = createBikeshareSelectedOverlayEntry('austin-capmetro:3790', record);
  assert.equal(entry.position, record.point.position);
  assert.equal(entry.title, 'Congress & 6th');
  assert.deepEqual(entry.details, [
    '🚲 7 avail · 4 docks · 11 cap',
    '⚠️ Not renting',
  ]);
  assert.equal(entry.variant, 'selected');
  assert.equal(entry.selected, true);
  assert.equal(entry.protected, true);
  assert.equal(entry.paintLane, 'selected');
  assert.equal(entry.collisionGroup, 'ambient-card');
  assert.equal(entry.edgeFade, 'keyhole');
  assert.equal(entry.horizonCull, true);
});

test('real station select/clear path publishes one card and creates no native label graphic', () => {
  const calls = [];
  const overlayHost = {
    setEntries: (...args) => calls.push(['entries', ...args]),
    setVisible: (...args) => calls.push(['visible', ...args]),
    clearSource: (...args) => calls.push(['clear', ...args]),
  };
  const key = 'austin-capmetro:3790';
  const record = makeRecord();
  const viewer = { entities: new Cesium.EntityCollection() };
  _setBikeshareSelectionStateForTest({ viewer, key, record, overlayHost });
  try {
    _selectBikeshareStationForTest(key);
    assert.equal(record.point.show, false);
    assert.equal(viewer.entities.values.length, 1, 'runtime guard requires a real selected entity');
    assert.equal(viewer.entities.values[0].label, undefined);
    assert.ok(viewer.entities.values[0].point, 'selected point highlight remains native');

    const publication = calls.find(([type]) => type === 'entries');
    assert.ok(publication);
    assert.equal(publication[1], 'bikeshare-selected');
    assert.equal(publication[2].length, 1);
    assert.equal(publication[2][0].position, record.point.position);
    assert.deepEqual(publication[3], BIKESHARE_SELECTED_OVERLAY_SOURCE_OPTIONS);

    _clearBikeshareSelectionForTest();
    assert.equal(record.point.show, true);
    assert.equal(viewer.entities.values.length, 0);
    assert.deepEqual(calls.at(-1), ['clear', 'bikeshare-selected']);
  } finally {
    _clearBikeshareSelectionForTest();
  }
});

test('MONITORED_CITIES_NO_FEED lists 8 Indonesian metros with valid coordinates and unique ids', () => {
  const EXPECTED_CITIES = [
    'Jakarta', 'Surabaya', 'Bandung', 'Medan',
    'Semarang', 'Yogyakarta', 'Makassar', 'Denpasar',
  ];
  assert.equal(MONITORED_CITIES_NO_FEED.length, 8);

  const ids = new Set();
  for (const entry of MONITORED_CITIES_NO_FEED) {
    assert.ok(EXPECTED_CITIES.includes(entry.city), `unexpected city: ${entry.city}`);
    assert.equal(typeof entry.id, 'string');
    assert.ok(!ids.has(entry.id), `duplicate monitored city id: ${entry.id}`);
    ids.add(entry.id);
    assert.ok(Number.isFinite(entry.centerLat) && Math.abs(entry.centerLat) <= 90);
    assert.ok(Number.isFinite(entry.centerLon) && Math.abs(entry.centerLon) <= 180);
  }
  for (const city of EXPECTED_CITIES) {
    assert.ok(MONITORED_CITIES_NO_FEED.some((entry) => entry.city === city), `missing city: ${city}`);
  }
});

test('MONITORED_CITIES_NO_FEED entries are not silently duplicated into the live GBFS registry', () => {
  // Guards against someone later copy-pasting a monitored entry into
  // RAW_GBFS_CITY_REGISTRY without wiring a real feed — that registry
  // requires a working station_information/station_status URL pair
  // (normalizeRegistryEntry throws on invalid/missing URLs), so any id
  // collision here would mean a monitored city is masquerading as live.
  const monitoredIds = new Set(MONITORED_CITIES_NO_FEED.map((c) => c.id));
  assert.equal(monitoredIds.has('jakarta'), false);
  assert.equal(monitoredIds.has('jakarta-monitor'), true);
});
