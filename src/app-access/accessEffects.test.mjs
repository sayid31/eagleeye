import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LAYER_LOCK_REASON, PREMIUM_LOCK_REASON, lockDataLayers, lockPremium } from './accessEffects.js';
import { DEFAULT_BOOT_STACK } from '../mapStackController.js';
import { createFakeDocument } from './__fixtures__/fakeDom.mjs';

function fakeManager(layers) {
  const guards = new Set();
  const switched = [];
  return {
    switched,
    guards,
    addVisibilityGuard(fn) { guards.add(fn); return () => guards.delete(fn); },
    getAll: () => layers,
    setEnabled: async (id, enabled, opts) => { switched.push([id, enabled, opts.origin]); return true; },
  };
}

test('layers lock refuses every enable, allows disable, marks the list; release undoes it', () => {
  const manager = fakeManager([]);
  const list = createFakeDocument().createElement('div');
  const release = lockDataLayers(manager, list);
  const [guard] = manager.guards;
  assert.equal(guard({ enabled: true, layerId: 'earthquakes', origin: 'share-restore' }), LAYER_LOCK_REASON);
  assert.equal(guard({ enabled: false, layerId: 'earthquakes' }), null);
  assert.equal(list.classList.contains('account-locked'), true);
  assert.deepEqual([list.getAttribute('aria-disabled'), list.getAttribute('title')], ['true', 'Not yet allowed by an admin']);
  release();
  assert.equal(manager.guards.size, 0);
  assert.equal(list.classList.contains('account-locked'), false);
});

test('a mid-session layers lock switches enabled layers off (stops their poll loops); a boot lock does not', async () => {
  const layers = [{ id: 'flights', enabled: true }, { id: 'cctv', enabled: false }, { id: 'earthquakes', enabled: true }];
  const boot = fakeManager(layers);
  lockDataLayers(boot, null);
  assert.deepEqual(boot.switched, []);
  const runtime = fakeManager(layers);
  lockDataLayers(runtime, null, { switchOff: true });
  await Promise.resolve();
  assert.deepEqual(runtime.switched, [['flights', false, 'programmatic'], ['earthquakes', false, 'programmatic']]);
});

function fakeStack(active) {
  const tileset = { show: true };
  return {
    tileset,
    switchedTo: [],
    cesiumToken: 'test-only-token',
    googleTileset: tileset,
    getActiveStack: () => active,
    async setStack(id) { this.switchedTo.push(id); },
  };
}

test('premium lock: Google proxies off for every consumer, keyed stack replaced by the keyless boot stack', async () => {
  const win = { __GOOGLE_MAPS_PROXY_AVAILABLE__: true };
  const controller = fakeStack({ id: 'photoreal', kind: 'photoreal', requiresIon: false });
  await lockPremium({ mapStackController: controller, win });
  assert.equal(win.__GOOGLE_MAPS_PROXY_AVAILABLE__, false);
  assert.deepEqual(controller.switchedTo, [DEFAULT_BOOT_STACK]);
  assert.deepEqual([controller.cesiumToken, controller.googleTileset, controller.tileset.show], ['', null, false]);
  assert.equal(controller.premiumLockReason, PREMIUM_LOCK_REASON);
});

test('premium lock on a keyless stack does not switch the basemap', async () => {
  const controller = fakeStack({ id: 'esri-imagery', kind: 'esri-imagery', requiresIon: false });
  await lockPremium({ mapStackController: controller, win: {} });
  assert.deepEqual(controller.switchedTo, []);
  const ion = fakeStack({ id: 'bing-labels', kind: 'ion', requiresIon: true });
  await lockPremium({ mapStackController: ion, win: {} });
  assert.deepEqual(ion.switchedTo, [DEFAULT_BOOT_STACK], 'an ion stack is keyed too');
});
