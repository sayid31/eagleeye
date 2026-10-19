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

test('searchCameras matches name, city and id, ranks prefix matches first, and caps results', () => {
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
