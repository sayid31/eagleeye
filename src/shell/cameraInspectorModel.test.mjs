import test from 'node:test';
import assert from 'node:assert/strict';
import { searchCameras, statusTone } from './cameraInspectorModel.js';

test('statusTone maps health to dot tone', () => {
  assert.equal(statusTone('ok'), 'ok');
  assert.equal(statusTone('offline'), 'off');
  assert.equal(statusTone('error'), 'off');
  assert.equal(statusTone('unknown'), 'idle');
  assert.equal(statusTone(undefined), 'idle');
  assert.equal(statusTone('degraded'), 'warn');
});

test('searchCameras matches name, city and id and ranks prefix matches first', () => {
  const cams = [
    { id: 'a1', name: 'Tol Jagorawi KM 5', city: 'Jakarta', sourceStatus: 'ok' },
    { id: 'b2', name: 'Simpang Jakarta Pusat', city: 'Jakarta', sourceStatus: 'offline' },
    { id: 'c3', name: 'Jakarta Barat', city: 'Jakarta' },
    { id: 'd4', name: 'Pelabuhan Benoa', city: 'Denpasar' },
  ];
  assert.deepEqual(searchCameras('jakarta', cams).items.map((c) => c.id), ['c3', 'a1', 'b2']);
  assert.deepEqual(searchCameras('denpasar', cams).items.map((c) => c.id), ['d4']);
  assert.deepEqual(searchCameras('B2', cams).items.map((c) => c.id), ['b2']);
  assert.equal(searchCameras('b2', cams).items[0].tone, 'off');
  assert.deepEqual(searchCameras('   ', cams), { items: [], total: 0 });
});

test('a city query returns every camera in that city, not a fixed handful', () => {
  const cams = Array.from({ length: 90 }, (_, i) => ({ id: `dps${i}`, name: `CCTV ${i}`, city: 'Denpasar' }));
  cams.push({ id: 'x', name: 'Other', city: 'Badung' });
  const { items, total } = searchCameras('denpasar', cams);
  assert.equal(items.length, 90);
  assert.equal(total, 90);
});

test('rendering is capped at the limit but total still reports every match', () => {
  const cams = Array.from({ length: 30 }, (_, i) => ({ id: `c${i}`, name: `Cam ${i}`, city: 'Surabaya' }));
  const { items, total } = searchCameras('surabaya', cams, 10);
  assert.equal(items.length, 10);
  assert.equal(total, 30);
  assert.equal(searchCameras('surabaya', cams).items.length, 30);
});
