// `sci` share-link round-trip — the scope mask intensity dial (0..100, plain
// multiplier, independent of the `sce` terminus band covered in
// sharelink.celestial.test.mjs). Split into its own file because
// sharelink.celestial.test.mjs is already over the 400-line test budget
// (Rule 8).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ShareLinkManager } from './sharelink.js';

function makeManager(hash = '') {
  globalThis.window = { location: { hash, href: `http://localhost/${hash}` } };
  globalThis.history = {
    replaceState(_state, _title, nextHash) {
      window.location.hash = nextHash;
    },
  };
  const viewer = {
    camera: {
      changed: { addEventListener() {} },
      positionCartographic: { latitude: 0, longitude: 0, height: 1000 },
      heading: 0,
      pitch: -Math.PI / 2,
      roll: 0,
    },
  };
  return new ShareLinkManager(viewer);
}

test('an absent sci defaults to 100 — pre-existing links render as they always did', () => {
  assert.equal(makeManager('#lat=10&lon=20&style=normal').parseInitialHash().scopeIntensityPct, 100);
});

test('sci parses and clamps into 0..100', () => {
  assert.equal(makeManager('#lat=10&lon=20&sci=0').parseInitialHash().scopeIntensityPct, 0);
  assert.equal(makeManager('#lat=10&lon=20&sci=50').parseInitialHash().scopeIntensityPct, 50);
  assert.equal(makeManager('#lat=10&lon=20&sci=100').parseInitialHash().scopeIntensityPct, 100);
  assert.equal(makeManager('#lat=10&lon=20&sci=-40').parseInitialHash().scopeIntensityPct, 0);
  assert.equal(makeManager('#lat=10&lon=20&sci=500').parseInitialHash().scopeIntensityPct, 100);
  assert.equal(makeManager('#lat=10&lon=20&sci=abc').parseInitialHash().scopeIntensityPct, 100,
    'junk falls back to the default, not 0');
});

test('sci is always written on serialization, unlike the adaptive-by-omission sce', () => {
  const manager = makeManager();
  manager.onToggleChange(false, false, { scopeIntensityPct: 0 });
  clearTimeout(manager._debounceTimer);
  manager._updateHash();
  assert.equal(new URLSearchParams(window.location.hash.slice(1)).get('sci'), '0');

  manager.onToggleChange(false, false, { scopeIntensityPct: 62 });
  clearTimeout(manager._debounceTimer);
  manager._updateHash();
  assert.equal(new URLSearchParams(window.location.hash.slice(1)).get('sci'), '62');
});

test('onToggleChange clamps an out-of-range extras value before it reaches state', () => {
  const manager = makeManager();
  manager.onToggleChange(false, false, { scopeIntensityPct: 500 });
  clearTimeout(manager._debounceTimer);
  manager._updateHash();
  assert.equal(new URLSearchParams(window.location.hash.slice(1)).get('sci'), '100');

  manager.onToggleChange(false, false, { scopeIntensityPct: -20 });
  clearTimeout(manager._debounceTimer);
  manager._updateHash();
  assert.equal(new URLSearchParams(window.location.hash.slice(1)).get('sci'), '0');
});
