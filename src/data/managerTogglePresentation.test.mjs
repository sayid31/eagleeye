import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildLayerMetaText, formatLayerAge, formatLayerCount, toggleButtonPresentation,
} from './managerTogglePresentation.js';

const NOW = 1_800_000_000_000; // test-only fixed clock

test('formatLayerCount compacts thousands', () => {
  assert.equal(formatLayerCount(999), '999');
  assert.equal(formatLayerCount(1000), '1.0K');
  assert.equal(formatLayerCount(12_345), '12.3K');
});

test('formatLayerAge buckets seconds, minutes and hours', () => {
  assert.equal(formatLayerAge(NOW - 2_000, NOW), 'baru saja');
  assert.equal(formatLayerAge(NOW - 42_000, NOW), '42d lalu');
  assert.equal(formatLayerAge(NOW - 5 * 60_000, NOW), '5m lalu');
  assert.equal(formatLayerAge(NOW - 3 * 3_600_000, NOW), '3j lalu');
});

test('buildLayerMetaText leads with the lifecycle phase, then errors, then age', () => {
  assert.equal(
    buildLayerMetaText({ source: 'NASA FIRMS', lifecycleState: 'enabling', stats: {} }, NOW),
    'MENYALAKAN · NASA FIRMS',
  );
  assert.equal(
    buildLayerMetaText({ source: 'USGS', enabled: true, lifecycleState: 'enabled', stats: { lastUpdate: NOW - 120_000 } }, NOW),
    'USGS · 2m lalu',
  );
  assert.equal(
    buildLayerMetaText({ source: 'USGS', enabled: true, lifecycleState: 'enabled', stats: {} }, NOW),
    'USGS · belum pernah',
  );
  assert.equal(
    buildLayerMetaText({ source: 'GBFS', enabled: true, lifecycleState: 'enabled', stats: { loading: true } }, NOW),
    'GBFS · memuat...',
  );
});

test('a still-enabling layer presents ON with the enabling label', () => {
  const view = toggleButtonPresentation({
    name: 'Titik api', enabled: false, effectiveEnabled: true, lifecycleState: 'enabling', stats: {},
  });
  assert.equal(view.on, true);
  assert.equal(view.phase, 'enabling');
  assert.equal(view.state, 'enabling');
  assert.equal(view.text, 'MENYALAKAN');
  assert.equal(view.ariaLabel, 'Titik api: MENYALAKAN');
  assert.equal(view.feedClass, null, 'no feed colouring before the layer is settled ON');
});

test('a revoked enable presents OFF and heading to disabled before cleanup runs', () => {
  const view = toggleButtonPresentation({
    name: 'Titik api', enabled: false, effectiveEnabled: false, lifecycleState: 'enabling', stats: {},
  });
  assert.equal(view.on, false);
  assert.equal(view.phase, 'disabling');
  assert.equal(view.text, 'MEMATIKAN');
});

test('a settled layer presents its feed state; uncertainty overrides it', () => {
  const live = toggleButtonPresentation({
    name: 'Gempa', enabled: true, lifecycleState: 'enabled', stats: { count: 3, lastUpdate: NOW },
  });
  assert.equal(live.on, true, 'falls back to settled state without an intent field');
  assert.equal(live.phase, null);
  assert.equal(live.feedClass, live.state);

  const off = toggleButtonPresentation({ name: 'Gempa', enabled: false, lifecycleState: 'disabled', stats: {} });
  assert.equal(off.on, false);
  assert.equal(off.text, 'MATI');
  assert.equal(off.state, 'off');

  const uncertain = toggleButtonPresentation({
    name: 'Radio', enabled: true, lifecycleState: 'enabled', lifecycleUncertain: true, stats: {},
  });
  assert.equal(uncertain.text, 'TIDAK PASTI');
  assert.equal(uncertain.state, 'uncertain');
  assert.equal(uncertain.feedClass, null);
});
