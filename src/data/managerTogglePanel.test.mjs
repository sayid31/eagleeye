// Panel switch contract: a layer that is still loading reads ON and stays
// clickable, and a click during that window cancels the pending enable.
// Headless — no toggle container is attached, so _refreshTogglePanel no-ops and
// the button is a minimal stand-in passed to _syncToggleButton directly.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DataLayerManager } from './manager.js';

/** Layer whose first init() blocks until released, holding the manager in 'enabling'. */
function makeGatedLayer(id) {
  const calls = { init: 0, enable: 0, update: 0, disable: 0 };
  let releaseInit;
  let announceInit;
  const initStarted = new Promise((resolve) => { announceInit = resolve; });
  return {
    calls,
    initStarted,
    releaseInit: () => releaseInit(),
    module: {
      id,
      name: id,
      icon: '',
      source: 'test',
      updateInterval: 0,
      async init() {
        calls.init++;
        if (calls.init > 1) return;
        announceInit();
        await new Promise((resolve) => { releaseInit = resolve; });
      },
      enable() { calls.enable++; },
      disable() { calls.disable++; },
      async update() { calls.update++; },
      getStats() { return { count: 0, lastUpdate: null }; },
    },
  };
}

function makeButton() {
  const classes = new Map();
  const attributes = new Map();
  return {
    classes,
    attributes,
    classList: { toggle(name, on) { classes.set(name, Boolean(on)); } },
    dataset: {},
    disabled: true,
    textContent: '',
    setAttribute(name, value) { attributes.set(name, String(value)); },
  };
}

function syncedButton(mgr, layerId) {
  const button = makeButton();
  mgr._syncToggleButton(button, mgr.getAll().find(({ id }) => id === layerId));
  return button;
}

test('a layer still enabling shows its switch ON and clickable', async () => {
  const mgr = new DataLayerManager({});
  const layer = makeGatedLayer('local-firms');
  mgr.register(layer.module);

  const enabling = mgr.setEnabled('local-firms', true, { origin: 'user' });
  await layer.initStarted;

  const row = mgr.getAll()[0];
  assert.equal(row.enabled, false, 'settled state is still OFF');
  assert.equal(row.effectiveEnabled, true, 'intent is ON');
  const button = syncedButton(mgr, 'local-firms');
  assert.equal(button.classes.get('active'), true);
  assert.equal(button.classes.get('enabling'), true);
  assert.equal(button.disabled, false);
  assert.equal(button.textContent, 'MENYALAKAN');
  assert.equal(button.attributes.get('aria-pressed'), 'true');

  layer.releaseInit();
  assert.equal(await enabling, true);
  assert.equal(syncedButton(mgr, 'local-firms').classes.get('active'), true);
  await mgr.destroyAll();
});

test('clicking the switch mid-enable cancels the load and leaves the layer off', async () => {
  const mgr = new DataLayerManager({});
  const layer = makeGatedLayer('local-firms');
  mgr.register(layer.module);

  const enabling = mgr.setEnabled('local-firms', true, { origin: 'user' });
  await layer.initStarted;

  const click = mgr._onPanelToggleClick('local-firms');
  assert.equal(mgr.isEffectivelyEnabled('local-firms'), false, 'the OFF intent is effective at once');
  const midFlight = syncedButton(mgr, 'local-firms');
  assert.equal(midFlight.classes.get('active'), false, 'switch flips OFF before cleanup runs');
  assert.equal(midFlight.textContent, 'MEMATIKAN');
  assert.equal(midFlight.classes.get('disabling'), true);
  assert.equal(midFlight.disabled, false);

  layer.releaseInit();
  assert.equal(await enabling, false, 'the superseded enable reports cancellation');
  await click;

  assert.equal(mgr.isEnabled('local-firms'), false);
  assert.equal(layer.calls.enable, 0, 'module.enable never ran after the cancel');
  assert.equal(mgr.layers.get('local-firms').intervalId ?? null, null, 'no poll loop armed');
  const settled = syncedButton(mgr, 'local-firms');
  assert.equal(settled.classes.get('active'), false);
  assert.equal(settled.textContent, 'MATI');
  await mgr.destroyAll();
});

test('a second click re-requests ON after a cancel', async () => {
  const mgr = new DataLayerManager({});
  const layer = makeGatedLayer('earthquakes');
  mgr.register(layer.module);

  const enabling = mgr.setEnabled('earthquakes', true, { origin: 'user' });
  await layer.initStarted;
  const cancel = mgr._onPanelToggleClick('earthquakes');
  const reenable = mgr._onPanelToggleClick('earthquakes');
  assert.equal(mgr.isEffectivelyEnabled('earthquakes'), true);
  assert.equal(syncedButton(mgr, 'earthquakes').classes.get('active'), true);

  layer.releaseInit();
  await Promise.all([enabling, cancel, reenable]);
  assert.equal(mgr.isEnabled('earthquakes'), true);
  const settled = syncedButton(mgr, 'earthquakes');
  assert.equal(settled.classes.get('active'), true);
  assert.equal(settled.classes.get('transitioning'), false);
  await mgr.destroyAll();
});

test('a settled layer without an intent field falls back to settled state', () => {
  const mgr = new DataLayerManager({});
  const button = makeButton();
  mgr._syncToggleButton(button, {
    name: 'Radio', enabled: true, lifecycleState: 'enabled', stats: { count: 1, lastUpdate: Date.now() },
  });
  assert.equal(button.classes.get('active'), true);
  assert.equal(button.disabled, false);
  assert.equal(button.attributes.get('aria-pressed'), 'true');
});
