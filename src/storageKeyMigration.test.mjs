// See src/storageKeyMigration.js header for why this exists: a one-time
// carry-forward of the pre-rebrand `godsEyeView.*` localStorage keys onto
// the newer `gev:*` convention, without losing a returning user's data.
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  migrateStorageKey,
  migrateStorageKeyPrefix,
  runStorageKeyMigrations,
} from './storageKeyMigration.js';

/**
 * Plain-object-backed fake storage. `migrateStorageKeyPrefix` calls
 * `Object.keys(storage)` directly (mirroring `src/ui.js:3975`'s own
 * `Object.keys(localStorage)` usage against real localStorage), so the fake
 * must expose its data keys as its own enumerable properties — built as the
 * plain data object itself, with non-enumerable getItem/setItem/removeItem
 * attached, so `Object.keys()` returns exactly the seeded storage keys.
 */
function storageObject(seed = {}) {
  const store = { ...seed };
  Object.defineProperties(store, {
    getItem: { value(key) { return Object.prototype.hasOwnProperty.call(store, key) ? store[key] : null; }, enumerable: false },
    setItem: { value(key, value) { store[key] = String(value); }, enumerable: false },
    removeItem: { value(key) { delete store[key]; }, enumerable: false },
  });
  return store;
}

test('migrateStorageKey copies the old value and removes the old key', () => {
  const storage = storageObject({ 'godsEyeView.sceneProject.v2': '{"a":1}' });
  migrateStorageKey('godsEyeView.sceneProject.v2', 'gev:scene-project:v2', storage);
  assert.equal(storage.getItem('gev:scene-project:v2'), '{"a":1}');
  assert.equal(storage.getItem('godsEyeView.sceneProject.v2'), null);
});

test('migrateStorageKey never overwrites an already-populated new key', () => {
  const storage = storageObject({
    'godsEyeView.voiceCost.tier': 'legacy-tier',
    'gev:voice-cost:tier': 'current-tier',
  });
  migrateStorageKey('godsEyeView.voiceCost.tier', 'gev:voice-cost:tier', storage);
  assert.equal(storage.getItem('gev:voice-cost:tier'), 'current-tier', 'live new-era data must not be clobbered');
  assert.equal(storage.getItem('godsEyeView.voiceCost.tier'), 'legacy-tier', 'the shadowed old key is left alone, not deleted');
});

test('migrateStorageKey is a no-op when the old key is absent', () => {
  const storage = storageObject({});
  migrateStorageKey('godsEyeView.cockpitWeatherEffects.enabled', 'gev:cockpit-weather-effects:enabled', storage);
  assert.equal(storage.getItem('gev:cockpit-weather-effects:enabled'), null);
});

test('migrateStorageKey swallows a throwing storage without raising', () => {
  const hostileStorage = {
    getItem() { throw new Error('storage disabled'); },
    setItem() { throw new Error('storage disabled'); },
    removeItem() { throw new Error('storage disabled'); },
  };
  assert.doesNotThrow(() => migrateStorageKey('godsEyeView.sceneProject.v2', 'gev:scene-project:v2', hostileStorage));
});

test('migrateStorageKeyPrefix migrates every matching key while preserving its own suffix', () => {
  const storage = storageObject({
    'godsEyeView.v8.panelPos.control-panel': '{"x":10,"y":20}',
    'godsEyeView.v8.panelPos.cctv-panel': '{"x":30,"y":40}',
    'some-unrelated-key': 'untouched',
  });
  migrateStorageKeyPrefix('godsEyeView.v8.panelPos.', 'gev:panel-pos:v8:', storage);

  assert.equal(storage.getItem('gev:panel-pos:v8:control-panel'), '{"x":10,"y":20}');
  assert.equal(storage.getItem('gev:panel-pos:v8:cctv-panel'), '{"x":30,"y":40}');
  assert.equal(storage.getItem('godsEyeView.v8.panelPos.control-panel'), null);
  assert.equal(storage.getItem('godsEyeView.v8.panelPos.cctv-panel'), null);
  assert.equal(storage.getItem('some-unrelated-key'), 'untouched', 'a key that merely contains the prefix as a substring elsewhere must not be touched');
});

test('migrateStorageKeyPrefix does not clobber a lookalike key that is not a real prefix match', () => {
  const storage = storageObject({
    'godsEyeView.v8.panelPositionExtra.x': 'should-not-move',
  });
  migrateStorageKeyPrefix('godsEyeView.v8.panelPos.', 'gev:panel-pos:v8:', storage);
  assert.equal(storage.getItem('godsEyeView.v8.panelPositionExtra.x'), 'should-not-move');
});

test('migrateStorageKeyPrefix is a no-op when no key matches the prefix', () => {
  const storage = storageObject({ 'unrelated-key': 'v' });
  assert.doesNotThrow(() => migrateStorageKeyPrefix('godsEyeView.v6.panelCollapsed.', 'gev:panel-collapsed:v6:', storage));
  assert.equal(storage.getItem('unrelated-key'), 'v');
});

test('runStorageKeyMigrations migrates the full legacy key set in one pass', () => {
  const storage = storageObject({
    'godsEyeView.cockpitWeatherEffects.enabled': '1',
    'godsEyeView.sceneProject.v2': '{"project":true}',
    'godsEyeView.voiceCost.tier': 'standard',
    'godsEyeView.voiceCost.limits': '{"daily":10}',
    'godsEyeView.cctv.calibration.v2': '{"values":[1,2,3]}',
    'godsEyeView.v8.layoutResetNotified': '1',
    'godsEyeView.v8.panelPos.control-panel': '{"x":1,"y":2}',
    'godsEyeView.v6.panelCollapsed.control-panel': '1',
  });

  runStorageKeyMigrations(storage);

  assert.equal(storage.getItem('gev:cockpit-weather-effects:enabled'), '1');
  assert.equal(storage.getItem('gev:scene-project:v2'), '{"project":true}');
  assert.equal(storage.getItem('gev:voice-cost:tier'), 'standard');
  assert.equal(storage.getItem('gev:voice-cost:limits'), '{"daily":10}');
  assert.equal(storage.getItem('gev:cctv-calibration:v2'), '{"values":[1,2,3]}');
  assert.equal(storage.getItem('gev:layout-reset-notified:v8'), '1');
  assert.equal(storage.getItem('gev:panel-pos:v8:control-panel'), '{"x":1,"y":2}');
  assert.equal(storage.getItem('gev:panel-collapsed:v6:control-panel'), '1');

  for (const oldKey of [
    'godsEyeView.cockpitWeatherEffects.enabled',
    'godsEyeView.sceneProject.v2',
    'godsEyeView.voiceCost.tier',
    'godsEyeView.voiceCost.limits',
    'godsEyeView.cctv.calibration.v2',
    'godsEyeView.v8.layoutResetNotified',
    'godsEyeView.v8.panelPos.control-panel',
    'godsEyeView.v6.panelCollapsed.control-panel',
  ]) {
    assert.equal(storage.getItem(oldKey), null, `${oldKey} should have been removed after migration`);
  }
});

test('runStorageKeyMigrations never migrates the already-dead cctv v1 key', () => {
  const storage = storageObject({ 'godsEyeView.cctv.calibration.v1': 'stale-dead-data' });
  runStorageKeyMigrations(storage);
  // No gev:cctv-calibration:v1 migration exists by design — the v1 key is
  // dead data per an explicit owner decision (see src/data/cctv.js).
  assert.equal(storage.getItem('gev:cctv-calibration:v1'), null);
  assert.equal(storage.getItem('godsEyeView.cctv.calibration.v1'), 'stale-dead-data', 'the dead v1 key is left untouched, not migrated or deleted');
});

test('runStorageKeyMigrations is idempotent — a second run is a safe no-op', () => {
  const storage = storageObject({ 'godsEyeView.sceneProject.v2': '{"project":true}' });
  runStorageKeyMigrations(storage);
  assert.doesNotThrow(() => runStorageKeyMigrations(storage));
  assert.equal(storage.getItem('gev:scene-project:v2'), '{"project":true}');
});

test('runStorageKeyMigrations swallows a null/unavailable storage without throwing', () => {
  assert.doesNotThrow(() => runStorageKeyMigrations(null));
});
