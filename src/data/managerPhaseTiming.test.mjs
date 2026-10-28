// Boot-timing seam inside DataLayerManager's lifecycle phase transitions.
//
// There was previously no test covering `_setVisibilityIntentPhase`'s sequence
// at all, so adding a line to it — in a file already well over the size limit
// — would otherwise have been an unobserved change to a hot path that runs on
// every layer toggle for the whole life of the page. This file pins both
// halves of the guarantee: the phases really are emitted in order while the
// boot window is open, and the seam is inert once it closes.
//
// A sibling file rather than an addition to manager.test.mjs, which is 3608
// lines (9× the 400-line test budget).
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import { DataLayerManager } from './manager.js';
import {
  _resetBootTimingForTest,
  clearBootTimingEntries,
  finalizeBootTiming,
  getBootTimingEntries,
} from '../bootTiming.js';
import { BOOT_LAYER_PHASES, parseBootMarkName } from '../bootTimingReport.js';

beforeEach(() => {
  clearBootTimingEntries();
  _resetBootTimingForTest();
});

/** Minimal layer whose lifecycle resolves on the next microtask. */
function makeLayer(id) {
  return {
    id,
    name: id,
    icon: '',
    source: 'test',
    updateInterval: -1,
    async init() { await Promise.resolve(); },
    enable() {},
    disable() {},
    async update() { await Promise.resolve(); },
    getStats() { return { count: 0, lastUpdate: null }; },
  };
}

/** Phases recorded for one layer, in emission order. */
function phasesFor(layerId) {
  return getBootTimingEntries()
    .map((entry) => ({ entry, parsed: parseBootMarkName(entry.name) }))
    .filter(({ parsed }) => parsed?.kind === 'layer' && parsed.layerId === layerId)
    .sort((a, b) => a.entry.startTime - b.entry.startTime)
    .map(({ parsed }) => parsed.phase);
}

test('an enable emits its lifecycle phases in order, starting at queued', async () => {
  const manager = new DataLayerManager({});
  manager._registerLayer(makeLayer('earthquakes'));

  await manager.setEnabled('earthquakes', true, { origin: 'test' });

  const phases = phasesFor('earthquakes');
  assert.equal(phases[0], 'queued', 'queued must be first — queued→resolve IS the queue wait');
  // Every emitted phase is one the report vocabulary knows about; an
  // unrecognized phase would render as a nameless row.
  for (const phase of phases) {
    assert.ok(BOOT_LAYER_PHASES.includes(phase), `${phase} must be a known phase`);
  }
  // Emission order must match the declared order, with no phase out of place.
  const expectedOrder = BOOT_LAYER_PHASES.filter((phase) => phases.includes(phase));
  const seenInDeclaredOrder = phases.filter((phase, index) => phases.indexOf(phase) === index);
  assert.deepEqual(seenInDeclaredOrder, expectedOrder);
});

test('the seam does not change the return contract of a toggle', async () => {
  const manager = new DataLayerManager({});
  manager._registerLayer(makeLayer('bikeshare'));

  const result = await manager.setEnabled('bikeshare', true, { origin: 'test' });
  assert.notEqual(result, undefined, 'setEnabled must still resolve to its own result');
  assert.equal(manager.isEnabled('bikeshare'), true);

  await manager.setEnabled('bikeshare', false, { origin: 'test' });
  assert.equal(manager.isEnabled('bikeshare'), false);
});

test('each layer gets its own marks, so a slow layer is attributable', async () => {
  const manager = new DataLayerManager({});
  manager._registerLayer(makeLayer('traffic'));
  manager._registerLayer(makeLayer('radio'));

  await Promise.all([
    manager.setEnabled('traffic', true, { origin: 'test' }),
    manager.setEnabled('radio', true, { origin: 'test' }),
  ]);

  assert.ok(phasesFor('traffic').length > 1);
  assert.ok(phasesFor('radio').length > 1);
});

test('once the boot window closes, a toggle emits nothing at all', async () => {
  const manager = new DataLayerManager({});
  manager._registerLayer(makeLayer('cctv'));

  finalizeBootTiming();
  const before = getBootTimingEntries().length;

  await manager.setEnabled('cctv', true, { origin: 'test' });
  await manager.setEnabled('cctv', false, { origin: 'test' });

  assert.equal(getBootTimingEntries().length, before,
    'the per-toggle seam must not grow the entry buffer after boot');
  assert.deepEqual(phasesFor('cctv'), []);
});
