import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_CCTV_CITY_ID, pickDefaultCameraId } from './cctvDefaultCamera.js';

const rec = (id, cityId, feedConfigured = false) => ({ camera: { id, cityId, feedConfigured } });

test('default city is Denpasar', () => {
  assert.equal(DEFAULT_CCTV_CITY_ID, 'denpasar');
});

test('prefers the live Denpasar camera over Austin-first catalog order and Denpasar seeds', () => {
  const records = [
    rec('austin-1', 'austin', true),
    rec('denpasar-seed', 'denpasar', false),
    rec('denpasar-live', 'denpasar', true),
  ];
  assert.equal(pickDefaultCameraId(records), 'denpasar-live');
});

test('falls back to a Denpasar seed when no live Denpasar camera exists', () => {
  const records = [rec('austin-1', 'austin', true), rec('denpasar-seed', 'denpasar', false)];
  assert.equal(pickDefaultCameraId(records), 'denpasar-seed');
});

test('falls back to the first record when the catalog has no Denpasar camera', () => {
  assert.equal(pickDefaultCameraId([rec('a', 'austin'), rec('b', 'nyc')]), 'a');
});

test('returns null for an empty or invalid catalog', () => {
  assert.equal(pickDefaultCameraId([]), null);
  assert.equal(pickDefaultCameraId(null), null);
  assert.equal(pickDefaultCameraId([{}, { camera: {} }]), null);
});

test('layer wiring: enable/init default through pickDefaultCameraId and the panel flies to a pending default', async () => {
  const { default: cctvLayer } = await import('./cctv.js');
  assert.match(cctvLayer.enable.toString(), /pickDefaultCameraId\(S\._records\)/);
  assert.match(cctvLayer.enable.toString(), /_defaultCameraPending = true/);
  assert.equal(typeof cctvLayer.isDefaultCameraPending, 'function');
  assert.equal(cctvLayer.isDefaultCameraPending(), false, 'no catalog → nothing pending');
  assert.equal(cctvLayer.activateDefaultCamera(), null);
});
