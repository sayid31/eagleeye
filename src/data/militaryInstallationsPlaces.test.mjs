// Google Places candidates in the military-installations layer follow the
// `premium` toggle: without it (window.__GOOGLE_MAPS_PROXY_AVAILABLE__ false)
// "search nearby" still refreshes the mapped sites but never calls Google.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as Cesium from 'cesium';
import militaryInstallationsLayer from './militaryInstallations.js';
import { _resetRenderGovernorForTest, installRenderGovernor } from '../renderGovernor.js';

const VIEWPORT = { south: 30, west: -98, north: 31, east: -97 }; // test-only

async function searchNearbyWith({ googleAvailable }) {
  const saved = { document: globalThis.document, window: globalThis.window, fetch: globalThis.fetch };
  const requests = [];
  _resetRenderGovernorForTest();
  globalThis.document = { addEventListener() {}, removeEventListener() {} };
  globalThis.window = {
    __GOOGLE_MAPS_PROXY_AVAILABLE__: googleAvailable,
    dispatchEvent() {},
    CustomEvent: class { constructor(type, init) { this.type = type; Object.assign(this, init); } },
  };
  globalThis.fetch = async (url) => {
    const href = String(url);
    if (href.includes('/api/terrain/heights')) return { ok: true, status: 200, json: async () => ({ results: [] }) };
    requests.push(new URL(href, 'http://localhost').pathname);
    if (href.includes('/api/google/text-search')) {
      return { ok: true, status: 200, json: async () => ({ places: [{ id: 'p1', name: 'Fort Candidate', latitude: 30.4, longitude: -97.4, types: ['military_base'] }] }) };
    }
    const elements = [{ type: 'node', id: 1, lat: 30.5, lon: -97.5, tags: { military: 'range', name: 'Mapped Range' } }];
    return { ok: true, status: 200, json: async () => ({ status: 'fresh', retrievedAt: '2026-08-18T00:00:00.000Z', elements, elementCap: 700, saturated: false }) };
  };
  const dataSources = [];
  const viewer = {
    camera: {
      moveEnd: { addEventListener() { return () => {}; } },
      flyToBoundingSphere() {},
      computeViewRectangle: () => ({
        south: Cesium.Math.toRadians(VIEWPORT.south), west: Cesium.Math.toRadians(VIEWPORT.west),
        north: Cesium.Math.toRadians(VIEWPORT.north), east: Cesium.Math.toRadians(VIEWPORT.east),
      }),
    },
    scene: {
      canvas: { addEventListener() {}, removeEventListener() {} },
      globe: { ellipsoid: Cesium.Ellipsoid.WGS84 },
      pick: () => null,
      requestRenderMode: false,
      maximumRenderTimeChange: 0,
      requestRender() {},
    },
    dataSources: { add(source) { dataSources.push(source); return source; }, remove() { return true; } },
  };
  try {
    militaryInstallationsLayer.init(viewer);
    installRenderGovernor(viewer);
    militaryInstallationsLayer.enable();
    await militaryInstallationsLayer.update();
    requests.length = 0;
    await militaryInstallationsLayer.searchNearby();
    const titles = (dataSources[0]?.entities?.values || []).map((entity) => entity.gevLabelModel?.title).sort();
    return { requests, titles };
  } finally {
    militaryInstallationsLayer.destroy(viewer);
    _resetRenderGovernorForTest();
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete globalThis[key];
      else globalThis[key] = value;
    }
  }
}

test('with premium, search nearby adds Google Places candidates to the mapped sites', async () => {
  const { requests, titles } = await searchNearbyWith({ googleAvailable: true });
  assert.deepEqual(requests, ['/api/military-installations', '/api/google/text-search']);
  assert.deepEqual(titles, ['Fort Candidate', 'Mapped Range']);
});

test('without premium, search nearby refreshes mapped sites only — no Google call, no candidates', async () => {
  const { requests, titles } = await searchNearbyWith({ googleAvailable: false });
  assert.deepEqual(requests, ['/api/military-installations']);
  assert.deepEqual(titles, ['Mapped Range']);
});
