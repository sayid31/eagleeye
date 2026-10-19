import test from 'node:test';
import assert from 'node:assert/strict';
import {
  distanceKm, formatDirection, formatDistance, formatFeed, inspectorBadges, inspectorRows,
  nearbyCameras, statusTone,
} from './cameraInspectorModel.js';

test('distanceKm matches a known short baseline', () => {
  // 0.01° of latitude is ~1.112 km.
  assert.ok(Math.abs(distanceKm(-6.2, 106.8, -6.19, 106.8) - 1.112) < 0.01);
  assert.equal(distanceKm(1, 2, 1, 2), 0);
});

test('formatDistance switches between metres and kilometres', () => {
  assert.equal(formatDistance(0.34), '340 m');
  assert.equal(formatDistance(1.24), '1,2 km');
  assert.equal(formatDistance(NaN), '—');
});

test('formatDirection names the compass sector and wraps negatives', () => {
  assert.equal(formatDirection(45), 'Timur laut · 45°');
  assert.equal(formatDirection(-90), 'Barat · 270°');
  assert.equal(formatDirection(359), 'Utara · 359°');
  assert.equal(formatDirection(undefined), 'tidak diketahui');
});

test('formatFeed labels known types and echoes unknown ones', () => {
  assert.equal(formatFeed('hls'), 'HLS');
  assert.equal(formatFeed(''), 'Gambar (JPEG)');
  assert.equal(formatFeed('rtsp'), 'RTSP');
});

test('statusTone maps health to dot tone', () => {
  assert.equal(statusTone('ok'), 'ok');
  assert.equal(statusTone('offline'), 'off');
  assert.equal(statusTone('unknown'), 'idle');
  assert.equal(statusTone('degraded'), 'warn');
});

test('badges: live unofficial raw-prior camera shows all three, honestly', () => {
  const keys = inspectorBadges({
    sourceStatus: 'ok', playbackState: 'live', sourceKind: 'unofficial-hls', calBadge: 'raw-prior',
  }).map((b) => b.key);
  assert.deepEqual(keys, ['live', 'unofficial', 'approx']);
});

test('badges: curated official camera has no unofficial or approximate badge', () => {
  const keys = inspectorBadges({
    sourceStatus: 'ok', playbackState: null, sourceKind: 'official', calBadge: 'curated',
  }).map((b) => b.key);
  assert.deepEqual(keys, ['live']);
});

test('badges: offline source is never labelled Live; connecting is Terganggu', () => {
  assert.deepEqual(inspectorBadges({ sourceStatus: 'offline', playbackState: 'live' }).map((b) => b.key), ['offline']);
  assert.deepEqual(inspectorBadges({ sourceStatus: 'ok', playbackState: 'retrying' }).map((b) => b.key), ['degraded']);
  assert.deepEqual(inspectorBadges(null), []);
});

test('rows: unavailable operator/check time read "tidak diketahui", never invented', () => {
  const rows = inspectorRows({ headingDeg: 90, feedType: 'hls' });
  assert.deepEqual(rows.map((r) => r.value), ['tidak diketahui', 'Timur · 90°', 'HLS', 'tidak diketahui']);
  const checked = inspectorRows({ provider: 'Dishub' }, 10 * 60000, 0);
  assert.equal(checked[0].value, 'Dishub');
  assert.equal(checked[3].value, '10 menit lalu');
});

test('nearbyCameras excludes the active camera, sorts ascending, and limits', () => {
  const active = { id: 'a', lat: 0, lon: 0 };
  const cams = [
    active,
    { id: 'far', name: 'Far', lat: 0, lon: 0.5, sourceStatus: 'offline' },
    { id: 'near', name: 'Near', lat: 0, lon: 0.001, sourceStatus: 'ok' },
    { id: 'bad', name: 'Bad', lat: NaN, lon: 0 },
    { id: 'mid', name: 'Mid', lat: 0, lon: 0.05, sourceStatus: 'degraded' },
  ];
  const out = nearbyCameras(active, cams, 2);
  assert.deepEqual(out.map((c) => c.id), ['near', 'mid']);
  assert.deepEqual(out.map((c) => c.tone), ['ok', 'warn']);
  assert.equal(out[0].distance, '111 m');
  assert.deepEqual(nearbyCameras(null, cams), []);
});

test('searchCameras matches name, city and id, ranks prefix matches first, and caps results', async () => {
  const { searchCameras } = await import('./cameraInspectorModel.js');
  const cams = [
    { id: 'a1', name: 'Tol Jagorawi KM 5', city: 'Jakarta', sourceStatus: 'ok' },
    { id: 'b2', name: 'Simpang Jakarta Pusat', city: 'Jakarta', sourceStatus: 'offline' },
    { id: 'c3', name: 'Jakarta Barat', city: 'Jakarta' },
    { id: 'd4', name: 'Pelabuhan Benoa', city: 'Denpasar' },
  ];
  assert.deepEqual(searchCameras('jakarta', cams).map((c) => c.id), ['c3', 'a1', 'b2']);
  assert.deepEqual(searchCameras('denpasar', cams).map((c) => c.id), ['d4']);
  assert.deepEqual(searchCameras('B2', cams).map((c) => c.id), ['b2']);
  assert.equal(searchCameras('b2', cams)[0].tone, 'off');
  assert.deepEqual(searchCameras('   ', cams), []);
  assert.equal(searchCameras('j', cams, 2).length, 2);
});
