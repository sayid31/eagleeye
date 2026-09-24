// Drift-prevention test for src/data/layerMetadata.js (lazy-loading refactor,
// plan §3.7). Each in-scope layer file spreads its slice of LAYER_METADATA
// instead of duplicating the id/name/icon/source/showInTogglePanel literal
// inline, so drift is structurally hard — but cheap to also assert directly,
// and this catches a future inline override placed AFTER the spread.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LAYER_METADATA } from './layerMetadata.js';
import flightsLayer from './flights.js';
import militaryFlightsLayer from './militaryFlights.js';
import trafficLayer from './traffic.js';
import satellitesLayer from './satellites.js';
import cctvLayer from './cctv.js';
import radioLayer from './radio.js';
import bikeshareLayer from './bikeshare.js';
import aisLiveVesselsLayer from './aisLiveVessels.js';
import rocketLaunchesLayer from './rocketLaunches.js';
import militaryInstallationsLayer from './militaryInstallations.js';
import militaryAwarenessLayer from './militaryAwareness.js';
import earthquakesLayer from './earthquakes.js';

const LAYER_MODULES = {
  flights: flightsLayer,
  military: militaryFlightsLayer,
  traffic: trafficLayer,
  satellites: satellitesLayer,
  cctv: cctvLayer,
  radio: radioLayer,
  bikeshare: bikeshareLayer,
  'ais-live-vessels': aisLiveVesselsLayer,
  'rocket-launches': rocketLaunchesLayer,
  'military-installations': militaryInstallationsLayer,
  'military-awareness': militaryAwarenessLayer,
  earthquakes: earthquakesLayer,
};

const METADATA_FIELDS = ['id', 'name', 'icon', 'source', 'showInTogglePanel'];

test('LAYER_METADATA id set exactly matches the in-scope layer module set', () => {
  assert.deepEqual(
    Object.keys(LAYER_METADATA).sort(),
    Object.keys(LAYER_MODULES).sort(),
  );
});

for (const [id, module] of Object.entries(LAYER_MODULES)) {
  test(`${id} layer module's metadata exactly matches LAYER_METADATA.${id}`, () => {
    const meta = LAYER_METADATA[id];
    assert.ok(meta, `LAYER_METADATA is missing an entry for ${id}`);
    for (const field of METADATA_FIELDS) {
      assert.equal(
        module[field],
        meta[field],
        `${id}.${field}: module has ${JSON.stringify(module[field])}, LAYER_METADATA has ${JSON.stringify(meta[field])}`,
      );
    }
  });
}

test('every LAYER_METADATA entry is frozen (including the top-level object)', () => {
  assert.ok(Object.isFrozen(LAYER_METADATA));
  for (const [id, meta] of Object.entries(LAYER_METADATA)) {
    assert.ok(Object.isFrozen(meta), `LAYER_METADATA.${id} is not frozen`);
  }
});

test('showInTogglePanel defaults true for every layer except military-awareness', () => {
  for (const [id, meta] of Object.entries(LAYER_METADATA)) {
    if (id === 'military-awareness') {
      assert.equal(meta.showInTogglePanel, false, 'military-awareness is entered from its own rail, not the toggle panel');
    } else {
      assert.equal(meta.showInTogglePanel, true, `${id} should default to visible in the toggle panel`);
    }
  }
});
