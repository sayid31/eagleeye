// Owner choice 2026-11-12: a fresh boot shows Bing aerial with labels (via
// Cesium ion) instead of Esri Satellite — but the app must still start with
// no key at all. Cesium network calls are stubbed; nothing leaves the machine.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as Cesium from 'cesium';
import { DEFAULT_BOOT_STACK, MapStackController, PREFERRED_BOOT_STACK } from './mapStackController.js';

/**
 * Controller with stubbed Cesium providers.
 * @param {{token?: string, bingFails?: boolean, googleTileset?: object|null}} [options]
 */
function harness({ token = '', bingFails = false, googleTileset = { show: false } } = {}) {
  const original = {
    arcgis: Cesium.ArcGisMapServerImageryProvider.fromUrl,
    terrainUrl: Cesium.CesiumTerrainProvider.fromUrl,
    worldTerrain: Cesium.Terrain.fromWorldTerrain,
    warn: console.warn,
  };
  const worldImageryCalls = [];
  Cesium.ArcGisMapServerImageryProvider.fromUrl = async () => new Cesium.OpenStreetMapImageryProvider({ url: 'https://tile.openstreetmap.org/' });
  Cesium.CesiumTerrainProvider.fromUrl = async () => { throw new Error('no network in tests'); };
  Cesium.Terrain.fromWorldTerrain = () => ({ test: 'world-terrain' });
  console.warn = () => {};

  const layers = [];
  const viewer = {
    scene: { canvas: { width: 800, height: 600 }, globe: { show: true }, frameState: {}, setTerrain() {} },
    camera: { moveEnd: new Cesium.Event() },
    imageryLayers: {
      add: (layer) => layers.push(layer),
      remove: (layer) => { const i = layers.indexOf(layer); if (i >= 0) layers.splice(i, 1); },
    },
    terrainProvider: null,
  };
  const controller = new MapStackController(viewer, { googleTileset, cesiumToken: token });
  // Stand-in for Cesium ion world imagery (Bing): no network.
  controller._createIonImagery = async (style) => {
    worldImageryCalls.push({ style });
    if (bingFails) throw new Error('ion unreachable (test)');
    return new Cesium.OpenStreetMapImageryProvider({ url: 'https://tile.openstreetmap.org/' });
  };
  return {
    controller,
    googleTileset,
    worldImageryCalls,
    restore() {
      Cesium.ArcGisMapServerImageryProvider.fromUrl = original.arcgis;
      Cesium.CesiumTerrainProvider.fromUrl = original.terrainUrl;
      Cesium.Terrain.fromWorldTerrain = original.worldTerrain;
      console.warn = original.warn;
    },
  };
}

test('the preferred boot basemap is Bing with labels, the keyless fallback stays Esri', () => {
  assert.equal(PREFERRED_BOOT_STACK, 'bing-labels');
  assert.equal(DEFAULT_BOOT_STACK, 'esri-imagery');
});

test('with an ion token a fresh boot lands on Bing aerial with labels', async () => {
  const h = harness({ token: 'ion-test-token' }); // test-only
  try {
    const state = await h.controller.activateBootStack();
    assert.equal(state.activeId, 'bing-labels');
    assert.equal(h.worldImageryCalls.length, 1);
    assert.equal(h.worldImageryCalls[0].style, Cesium.IonWorldImageryStyle.AERIAL_WITH_LABELS);
  } finally { h.restore(); }
});

test('without an ion token boot stays keyless on Esri and never asks ion', async () => {
  const h = harness({ token: '' });
  try {
    const state = await h.controller.activateBootStack();
    assert.equal(state.activeId, 'esri-imagery');
    assert.equal(h.worldImageryCalls.length, 0);
  } finally { h.restore(); }
});

test('if Bing fails to load, boot falls back to Esri — never to Google 3D', async () => {
  const h = harness({ token: 'ion-test-token', bingFails: true, googleTileset: { show: false } }); // test-only
  try {
    const state = await h.controller.activateBootStack();
    assert.equal(state.activeId, 'esri-imagery');
    assert.equal(h.googleTileset.show, false, 'the opt-in Google 3D tileset is not left showing');
  } finally { h.restore(); }
});
