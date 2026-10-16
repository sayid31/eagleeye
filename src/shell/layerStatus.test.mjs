import test from 'node:test';
import assert from 'node:assert/strict';
import {
  layerShellStatus, summarizeSources, layerGroupId, layerOrder, agoLabel, layerLabel, LAYER_GROUPS,
} from './layerStatus.js';

const NOW = 1_700_000_000_000;
const row = (over = {}) => ({ id: 'flights', enabled: true, lifecycleState: 'enabled', stats: { count: 5, lastUpdate: NOW }, ...over });

test('a disabled layer reads Mati', () => {
  assert.deepEqual(layerShellStatus(row({ enabled: false }), NOW), { key: 'off', label: 'Mati', detail: '' });
});

test('a healthy enabled layer reads Live', () => {
  assert.equal(layerShellStatus(row(), NOW).label, 'Live');
});

test('bundled datasets never claim Live', () => {
  const status = layerShellStatus(row({ id: 'local-dams' }), NOW);
  assert.equal(status.key, 'static');
  assert.notEqual(status.label, 'Live');
});

test('stale data reads Terganggu with its age', () => {
  const status = layerShellStatus(row({ stats: { count: 3, stale: true, lastUpdate: NOW - 14 * 3600 * 1000 } }), NOW);
  assert.equal(status.key, 'degraded');
  assert.equal(status.label, 'Terganggu');
  assert.equal(status.detail, 'data 14 jam lalu');
});

test('fallback and unavailable feeds are Terganggu, not Live', () => {
  assert.equal(layerShellStatus(row({ stats: { count: 1, fallback: true } }), NOW).detail, 'memakai sumber cadangan');
  assert.equal(layerShellStatus(row({ stats: { status: 'unavailable' } }), NOW).detail, 'sumber tidak tersedia');
});

test('an uncertain lifecycle is never Live, even with healthy stats', () => {
  assert.equal(layerShellStatus(row({ lifecycleUncertain: true }), NOW).key, 'degraded');
});

test('enabling/disabling and loading read Memuat', () => {
  assert.equal(layerShellStatus(row({ lifecycleState: 'enabling' }), NOW).key, 'loading');
  assert.equal(layerShellStatus(row({ stats: { loading: true } }), NOW).key, 'loading');
});

test('summary counts only enabled layers and keeps static/loading out of live', () => {
  const summary = summarizeSources([
    row(),
    row({ id: 'traffic' }),
    row({ id: 'earthquakes', stats: { count: 1, stale: true, lastUpdate: NOW } }),
    row({ id: 'local-dams' }),
    row({ id: 'cctv', enabled: false }),
    row({ id: 'radio', stats: { loading: true } }),
  ], NOW);
  assert.deepEqual(summary, { live: 2, degraded: 1, active: 5 });
});

test('groups: known ids map, unknown ids fall into Kota', () => {
  assert.equal(layerGroupId('ais-live-vessels'), 'pergerakan');
  assert.equal(layerGroupId('earthquakes'), 'lingkungan');
  assert.equal(layerGroupId('cctv'), 'kota');
  assert.equal(layerGroupId('something-new'), 'kota');
});

test('row order clusters by group while keeping registry order inside a group', () => {
  const a = layerOrder('cctv', 0);
  const b = layerOrder('flights', 9);
  const c = layerOrder('traffic', 3);
  assert.ok(b.rowOrder < layerOrder('earthquakes', 0).rowOrder);
  assert.ok(layerOrder('earthquakes', 99).rowOrder < a.rowOrder);
  assert.ok(a.rowOrder < c.rowOrder);
  for (const [i, group] of LAYER_GROUPS.entries()) {
    assert.ok(layerOrder(group.id === 'kota' ? 'cctv' : group.id === 'lingkungan' ? 'earthquakes' : 'flights', 0).headingOrder === i * 1000);
  }
});

test('labels fall back to the declared name', () => {
  assert.equal(layerLabel('flights', 'Live Flights'), 'Pesawat sipil');
  assert.equal(layerLabel('unknown', 'Declared'), 'Declared');
});

test('agoLabel is Indonesian and tolerant of bad input', () => {
  assert.equal(agoLabel(NOW - 5000, NOW), 'baru saja');
  assert.equal(agoLabel(NOW - 90_000, NOW), '1 menit lalu');
  assert.equal(agoLabel(undefined, NOW), null);
});
