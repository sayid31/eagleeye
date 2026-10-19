// Esri Dark Gray Canvas — the second keyless Esri-family map stack (see
// docs/CURRENT-STATE.md / CHANGELOG.md). `esri-imagery` already had its own
// OSM tile-failure fallback and on-screen attribution watchdog
// (`_watchEsriProvider` / `_syncEsriAttribution`), both string-gated on the
// literal id `'esri-imagery'`. Adding `esri-dark-gray` required widening both
// gates to a shared `ESRI_ATTRIBUTED_STACK_IDS` set — this file proves that
// widening actually protects the new stack (not just that the new stack
// activates) and that `esri-imagery`'s own existing behavior survives the
// refactor untouched. Drives a REAL `MapStackController` with only the two
// network-bound provider constructions stubbed, mirroring
// `mapStackController.test.mjs`'s own harness pattern.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as Cesium from 'cesium';
import { MapStackController, MAP_STACKS } from './mapStackController.js';

/**
 * Builds a real `MapStackController` against a duck-typed viewer, with the
 * only two network-bound provider constructions (Esri metadata, ion/Re:Earth
 * terrain) stubbed so tests never touch the network.
 * @param {{esriUnavailable?: boolean}} [options]
 */
function createHarness({ esriUnavailable = false } = {}) {
  const originalArcGis = Cesium.ArcGisMapServerImageryProvider.fromUrl;
  const originalTerrain = Cesium.CesiumTerrainProvider.fromUrl;

  Cesium.ArcGisMapServerImageryProvider.fromUrl = esriUnavailable
    ? async () => { throw new Error('Esri unreachable (test)'); }
    : async () => new Cesium.OpenStreetMapImageryProvider({ url: 'https://tile.openstreetmap.org/' });
  Cesium.CesiumTerrainProvider.fromUrl = async () => { throw new Error('no network in tests'); };

  const moveEnd = { addEventListener: () => () => {} };
  const addedLayers = [];
  const viewer = {
    scene: {
      canvas: { width: 800, height: 600 },
      globe: { show: true },
      frameState: {}, // no creditDisplay — _syncEsriAttribution no-ops safely
    },
    camera: { moveEnd },
    imageryLayers: {
      add: (layer) => addedLayers.push(layer),
      remove: (layer) => { const i = addedLayers.indexOf(layer); if (i >= 0) addedLayers.splice(i, 1); },
    },
    terrainProvider: null,
  };

  const changes = [];
  const errors = [];
  const controller = new MapStackController(viewer, {
    googleTileset: { show: true },
    cesiumToken: '',
    initialStack: 'photoreal',
    onChange: (state) => changes.push(state),
    onError: (message, stack) => errors.push({ message, stack }),
  });

  return {
    controller,
    changes,
    errors,
    restore() {
      Cesium.ArcGisMapServerImageryProvider.fromUrl = originalArcGis;
      Cesium.CesiumTerrainProvider.fromUrl = originalTerrain;
    },
  };
}

test('esri-dark-gray is registered and activates successfully', async () => {
  const h = createHarness();
  try {
    assert.ok(MAP_STACKS.some((s) => s.id === 'esri-dark-gray'), 'esri-dark-gray must be a live MAP_STACKS entry');
    const state = await h.controller.setStack('esri-dark-gray');
    assert.equal(h.controller.getActiveId(), 'esri-dark-gray');
    assert.equal(state.activeId, 'esri-dark-gray');
    assert.equal(state.lastError, null, 'a successful construction must not stamp an error');
  } finally {
    h.restore();
  }
});

test('esri-dark-gray construction failure falls back to osm with its own fallback message', async () => {
  const h = createHarness({ esriUnavailable: true });
  try {
    const state = await h.controller.setStack('esri-dark-gray');
    assert.equal(state.activeId, 'osm', 'construction failure must fall back to OSM, not strand on a blank layer');
    assert.equal(state.lastError, 'Esri Dark Gray tidak tersedia; memakai OSM');
  } finally {
    h.restore();
  }
});

test('repeated tile failures on an active esri-dark-gray provider trigger the generalized OSM fallback', async () => {
  const h = createHarness();
  try {
    await h.controller.setStack('esri-dark-gray');
    const provider = h.controller._activeImageryProvider;
    assert.ok(provider?.errorEvent?.raiseEvent, 'the stubbed provider must expose a real Cesium errorEvent to drive');

    // Two failures for the active provider trip the same 2-strike watchdog
    // esri-imagery already relies on — proving the widened
    // ESRI_ATTRIBUTED_STACK_IDS gate (not a second hardcoded id) covers it.
    provider.errorEvent.raiseEvent({ timesRetried: 0 });
    provider.errorEvent.raiseEvent({ timesRetried: 1 });
    for (let i = 0; i < 20; i++) await Promise.resolve();

    assert.equal(h.controller.getActiveId(), 'osm', 'two tile failures must trigger the OSM fallback');
    assert.equal(h.controller.getState().lastError, 'Permintaan tile Esri Dark Gray gagal; memakai OSM');
  } finally {
    h.restore();
  }
});

test('esri-imagery keeps its own existing tile-failure message after the gate was widened to a set', async () => {
  const h = createHarness();
  try {
    await h.controller.setStack('esri-imagery');
    const provider = h.controller._activeImageryProvider;

    provider.errorEvent.raiseEvent({ timesRetried: 0 });
    provider.errorEvent.raiseEvent({ timesRetried: 1 });
    for (let i = 0; i < 20; i++) await Promise.resolve();

    assert.equal(h.controller.getActiveId(), 'osm');
    assert.equal(
      h.controller.getState().lastError,
      'Permintaan tile Esri Satellite gagal; memakai OSM',
      'esri-imagery must keep naming itself, not esri-dark-gray, after the shared-set refactor',
    );
  } finally {
    h.restore();
  }
});
