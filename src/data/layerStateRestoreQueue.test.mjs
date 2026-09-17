// Concurrency-limited, priority-ordered layer-restore queue (see
// LAYER_RESTORE_CONCURRENCY / RESTORE_PRIORITY_TIER in layerState.js). A
// returning user or a rich share link can enable most/all 16 registered
// layers at once — `_restoreSelectedState` used to fan them all out via an
// unbounded `Promise.allSettled`, launching every layer's init/enable/
// first-update sequence simultaneously. This file proves the bounded,
// priority-ordered replacement actually caps concurrency and dispatches
// light layers first, while every existing invariant in layerState.test.mjs
// (isolation, all-16-results, small-session parity) still holds.
import test from 'node:test';
import assert from 'node:assert/strict';

import { DataLayerManager } from './manager.js';
import {
  LAYER_STATE_REGISTRY,
  LAYER_RESTORE_CONCURRENCY,
  LayerStateCoordinator,
  REGISTERED_LAYER_IDS,
  createDefaultLayerState,
} from './layerState.js';

function deferred() {
  let resolve;
  const promise = new Promise((res) => { resolve = res; });
  return { promise, resolve };
}

function fakeLayer(id, hooks = {}) {
  return {
    id,
    name: id,
    icon: '',
    source: 'test',
    async init() { return hooks.init ? hooks.init() : true; },
    async enable() { return hooks.enable ? hooks.enable() : true; },
    async update() { return hooks.update ? hooks.update() : true; },
    async disable() { return hooks.disable ? hooks.disable() : true; },
  };
}

function productionManager(hooksById = {}) {
  const manager = new DataLayerManager({});
  for (const id of REGISTERED_LAYER_IDS) manager.register(fakeLayer(id, hooksById[id] || {}));
  manager.finalizeRegistrations(LAYER_STATE_REGISTRY);
  return manager;
}

function memoryStorage() {
  const values = new Map();
  return {
    writes: [],
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, value); this.writes.push([key, value]); },
  };
}

function shareSink() {
  return {
    provider: null,
    setLayerStateProvider(provider) { this.provider = provider; },
    onLayerStateChange() {},
  };
}

// A representative mix that exceeds the cap: 2 light (tier 0) + 2 moderate
// (tier 1) + 4 heavy (tier 2) = 8 layers, well above LAYER_RESTORE_CONCURRENCY.
const LIGHT_IDS = ['flights', 'earthquakes'];
const MODERATE_IDS = ['bikeshare', 'rocket-launches'];
const HEAVY_IDS = ['cctv', 'satellites', 'radio', 'local-dams'];
const ALL_TEST_IDS = [...LIGHT_IDS, ...MODERATE_IDS, ...HEAVY_IDS];

/**
 * Pump microtasks and release any currently-held init() gates, repeatedly,
 * until every expected layer has dispatched (or a generous iteration budget
 * is exhausted — treated as a hang, not a slow pass, so it fails loudly
 * instead of hanging the suite).
 */
async function pumpUntilDispatched(dispatched, expectedCount, releasePending) {
  for (let i = 0; i < 200 && dispatched.size < expectedCount; i += 1) {
    releasePending();
    // eslint-disable-next-line no-await-in-loop -- deliberate microtask pump
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  assert.equal(dispatched.size, expectedCount, 'queue never dispatched every enabled layer (looks hung)');
  // The pump loop exits as soon as the LAST wave is observed as dispatched,
  // but that wave's own gates are still held open (nothing has released
  // them yet) — release once more so every init() actually resolves and the
  // coordinator's restore promise can settle.
  releasePending();
}

test('concurrent in-flight restores never exceed LAYER_RESTORE_CONCURRENCY', async () => {
  let active = 0;
  let peak = 0;
  const dispatched = new Set();
  const pendingGates = [];
  const hooksById = {};
  for (const id of ALL_TEST_IDS) {
    hooksById[id] = {
      init: () => new Promise((resolve) => {
        active += 1;
        peak = Math.max(peak, active);
        dispatched.add(id);
        pendingGates.push(() => { active -= 1; resolve(true); });
      }),
    };
  }
  const manager = productionManager(hooksById);
  const state = createDefaultLayerState();
  state.enabledLayerIds = ALL_TEST_IDS;
  const coordinator = new LayerStateCoordinator(manager, shareSink(), { storage: memoryStorage() });
  const restore = coordinator.start({ shareLayerState: state });

  await pumpUntilDispatched(dispatched, ALL_TEST_IDS.length, () => {
    while (pendingGates.length) pendingGates.shift()();
  });
  await restore;

  assert.ok(peak <= LAYER_RESTORE_CONCURRENCY, `peak concurrency ${peak} exceeded cap ${LAYER_RESTORE_CONCURRENCY}`);
  assert.ok(peak > 1, 'the queue should still run several layers concurrently, not serialize to 1');
  coordinator.destroy();
});

test('light layers dispatch before heavy layers once the queue exceeds the cap', async () => {
  const dispatchOrder = [];
  const dispatched = new Set();
  const hooksById = {};
  const pendingGates = new Map();
  for (const id of ALL_TEST_IDS) {
    hooksById[id] = {
      init: () => new Promise((resolve) => {
        dispatchOrder.push(id);
        dispatched.add(id);
        pendingGates.set(id, resolve);
      }),
    };
  }
  const manager = productionManager(hooksById);
  const state = createDefaultLayerState();
  state.enabledLayerIds = ALL_TEST_IDS;
  const coordinator = new LayerStateCoordinator(manager, shareSink(), { storage: memoryStorage() });
  const restore = coordinator.start({ shareLayerState: state });

  await pumpUntilDispatched(dispatched, ALL_TEST_IDS.length, () => {
    for (const [id, resolve] of [...pendingGates]) {
      pendingGates.delete(id);
      resolve(true);
    }
  });
  await restore;

  assert.equal(dispatchOrder.length, ALL_TEST_IDS.length, 'every enabled layer must eventually dispatch');
  const firstWave = dispatchOrder.slice(0, LAYER_RESTORE_CONCURRENCY);
  for (const heavyId of HEAVY_IDS) {
    assert.ok(!firstWave.includes(heavyId), `heavy layer ${heavyId} should not be in the first dispatch wave`);
  }
  for (const lightId of LIGHT_IDS) {
    assert.ok(firstWave.includes(lightId), `light layer ${lightId} should dispatch in the first wave`);
  }
  coordinator.destroy();
});

test('a small session (at or under the cap) still dispatches all layers together', async () => {
  const flightsStarted = deferred();
  const radioStarted = deferred();
  const manager = productionManager({
    flights: { init: async () => { flightsStarted.resolve(); return true; } },
    radio: { init: async () => { radioStarted.resolve(); return true; } },
  });
  const state = createDefaultLayerState();
  state.enabledLayerIds = ['flights', 'radio'];
  const coordinator = new LayerStateCoordinator(manager, shareSink(), { storage: memoryStorage() });
  const restore = coordinator.start({ shareLayerState: state });

  // Both must start without waiting on each other — proves priority
  // ordering never serializes a session smaller than the concurrency cap.
  await Promise.all([flightsStarted.promise, radioStarted.promise]);
  await restore;
  coordinator.destroy();
});

test('all 16 registry results are returned and one failure stays isolated under the bounded queue', async () => {
  const manager = productionManager({
    cctv: { init: () => { throw new Error('missing key'); } },
  });
  const state = createDefaultLayerState();
  state.enabledLayerIds = ALL_TEST_IDS;
  const coordinator = new LayerStateCoordinator(manager, shareSink(), { storage: memoryStorage() });
  const results = await coordinator.start({ shareLayerState: state });

  assert.equal(results.length, REGISTERED_LAYER_IDS.length);
  assert.deepEqual(
    results.map((r) => r.layerId).slice().sort(),
    [...REGISTERED_LAYER_IDS].sort(),
    'the bounded queue must still return exactly one result per registry entry, in registry order',
  );
  assert.deepEqual(results.map((r) => r.layerId), [...REGISTERED_LAYER_IDS]);
  const cctvResult = results.find((r) => r.layerId === 'cctv');
  assert.equal(cctvResult.succeeded, false);
  const earthquakesResult = results.find((r) => r.layerId === 'earthquakes');
  assert.equal(earthquakesResult.succeeded, true, 'a sibling failure must not affect other queued layers');
  coordinator.destroy();
});
