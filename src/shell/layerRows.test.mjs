import test from 'node:test';
import assert from 'node:assert/strict';
import { planRows, activeCount } from './layerRows.js';

const NOW = 1_700_000_000_000;
const layers = [
  { id: 'traffic', name: 'Street Traffic', showInTogglePanel: true, enabled: true, stats: { count: 4, lastUpdate: NOW } },
  { id: 'flights', name: 'Live Flights', showInTogglePanel: true, enabled: false, stats: {} },
  { id: 'hidden', name: 'Hidden', showInTogglePanel: false, enabled: true, stats: {} },
  { id: 'earthquakes', name: 'Earthquakes (24h)', showInTogglePanel: true, enabled: true, stats: { count: 2, stale: true, lastUpdate: NOW - 7200_000 } },
];

test('rows hidden from the toggle panel are not planned', () => {
  assert.deepEqual(planRows(layers, NOW).map((r) => r.id), ['traffic', 'flights', 'earthquakes']);
});

test('each row carries label, honest status text and group order', () => {
  const byId = Object.fromEntries(planRows(layers, NOW).map((r) => [r.id, r]));
  assert.equal(byId.traffic.label, 'Lalu lintas');
  assert.equal(byId.traffic.statusText, 'Live');
  assert.equal(byId.flights.statusText, 'Mati');
  assert.equal(byId.earthquakes.statusText, 'Terganggu · data 2 jam lalu');
  assert.ok(byId.flights.rowOrder < byId.earthquakes.rowOrder);
  assert.ok(byId.earthquakes.rowOrder < byId.traffic.rowOrder);
});

test('the original declared name is kept for the tooltip', () => {
  assert.equal(planRows(layers, NOW).find((r) => r.id === 'flights').originalName, 'Live Flights');
});

test('activeCount counts enabled layers, including ones hidden from the panel', () => {
  assert.equal(activeCount(layers), 3);
});
