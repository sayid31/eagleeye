import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCctvHealthStore } from './cctvHealthStore.mjs';

test('set fills defaults and later patches keep unset fields', () => {
  const store = createCctvHealthStore(10);
  store.set('a', { status: 'ok', sourceKind: 'live', label: 'Prov', message: 'up' });
  store.set('a', { message: 'still up' });
  const [row] = store.list();
  assert.equal(row.id, 'a');
  assert.equal(row.status, 'ok');
  assert.equal(row.sourceKind, 'live');
  assert.equal(row.label, 'Prov');
  assert.equal(row.message, 'still up');
  assert.equal(typeof row.updatedAt, 'number');
});

test('a brand-new camera with an empty patch reads as unknown', () => {
  const store = createCctvHealthStore(10);
  store.set('b', {});
  assert.deepEqual(
    (({ status, sourceKind, label, message }) => ({ status, sourceKind, label, message }))(store.list()[0]),
    { status: 'unknown', sourceKind: 'unknown', label: '', message: '' },
  );
});

test('evicts the oldest camera at capacity, but updating an existing one never evicts', () => {
  const store = createCctvHealthStore(2);
  store.set('a', { status: 'ok' });
  store.set('b', { status: 'ok' });
  store.set('a', { status: 'degraded' });
  assert.deepEqual(store.list().map((r) => r.id), ['a', 'b']);
  store.set('c', { status: 'ok' });
  assert.deepEqual(store.list().map((r) => r.id), ['b', 'c']);
});
