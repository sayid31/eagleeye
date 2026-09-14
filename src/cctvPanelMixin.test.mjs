import { test } from 'node:test';
import assert from 'node:assert/strict';
import { orderCctvCameraOptions } from './cctvPanelMixin.js';

/** Minimal fixture: an "official" camera and an "unofficial" one. */
function camera(id, sourceKind) {
  return { id, city: 'City', name: id, sourceKind };
}

test('orderCctvCameraOptions: unofficial sources sort ahead of official ones', () => {
  const cameras = [camera('a', 'configured'), camera('b', 'unofficial-hls-id'), camera('c', 'seed')];
  const ordered = orderCctvCameraOptions(cameras);
  assert.deepEqual(ordered.map((c) => c.id), ['b', 'a', 'c']);
});

test('orderCctvCameraOptions: multiple unofficial sources all sort to the top', () => {
  const cameras = [
    camera('austin-1', 'configured'),
    camera('jakarta-unofficial', 'unofficial-hls-id'),
    camera('caltrans-1', 'configured'),
    camera('bandung-unofficial', 'unofficial-hls-id'),
    camera('denpasar-unofficial', 'unofficial-hls-id'),
  ];
  const ordered = orderCctvCameraOptions(cameras);
  assert.deepEqual(ordered.slice(0, 3).map((c) => c.id), [
    'jakarta-unofficial',
    'bandung-unofficial',
    'denpasar-unofficial',
  ]);
  assert.deepEqual(ordered.slice(3).map((c) => c.id), ['austin-1', 'caltrans-1']);
});

test('orderCctvCameraOptions: stable within each group — original order preserved on ties', () => {
  const cameras = [camera('z', 'configured'), camera('a', 'configured'), camera('m', 'unofficial-hls-id')];
  const ordered = orderCctvCameraOptions(cameras);
  // 'm' (unofficial) first, then 'z'/'a' keep their original relative order
  // (not re-sorted alphabetically) since this is a display-priority sort,
  // not a name sort.
  assert.deepEqual(ordered.map((c) => c.id), ['m', 'z', 'a']);
});

test('orderCctvCameraOptions: no unofficial cameras leaves order untouched', () => {
  const cameras = [camera('a', 'configured'), camera('b', 'seed'), camera('c', 'configured')];
  const ordered = orderCctvCameraOptions(cameras);
  assert.deepEqual(ordered.map((c) => c.id), ['a', 'b', 'c']);
});

test('orderCctvCameraOptions: missing/undefined sourceKind is treated as official', () => {
  const cameras = [{ id: 'x', city: 'City', name: 'x' }, camera('y', 'unofficial-hls-id')];
  const ordered = orderCctvCameraOptions(cameras);
  assert.deepEqual(ordered.map((c) => c.id), ['y', 'x']);
});

test('orderCctvCameraOptions: does not mutate the input array', () => {
  const cameras = [camera('a', 'configured'), camera('b', 'unofficial-hls-id')];
  const originalOrder = cameras.map((c) => c.id);
  orderCctvCameraOptions(cameras);
  assert.deepEqual(cameras.map((c) => c.id), originalOrder);
});

test('orderCctvCameraOptions: empty input returns empty output', () => {
  assert.deepEqual(orderCctvCameraOptions([]), []);
});
