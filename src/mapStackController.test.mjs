// The photoreal coverage-gap watchdog (2026-09 report: a camera parked over
// interior Kalimantan showed an almost entirely white viewport — Google
// Photorealistic 3D Tiles only ship photo-textured "surface" mesh for ~2,500
// cities; everywhere else the tileset streams bare, untextured terrain that
// reads as flat near-white). No Cesium/Google API exposes a per-view
// "has coverage" flag, so `MapStackController` samples the rendered canvas
// after `camera.moveEnd` settles and silently falls back to Esri Satellite
// once two consecutive samples look near-white AND near-uniform — mirroring
// the existing `_watchEsriProvider` tile-failure fallback in the same file.
//
// These tests drive the REAL controller (real Cesium provider/terrain
// classes, no fetch — see `createHarness()`) through `setStack()` and a fake
// `camera.moveEnd`, with a stubbed canvas whose pixel data the test controls
// directly. `node:test`'s mock timers drive the settle delay and the
// min-interval throttle deterministically.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as Cesium from 'cesium';
import { MapStackController } from './mapStackController.js';

const SETTLE_MS = 500; // mirrors COVERAGE_SAMPLE_SETTLE_MS
const MIN_INTERVAL_MS = 2000; // mirrors COVERAGE_SAMPLE_MIN_INTERVAL_MS
const CLEAR_MS = 10000; // generously clears both of the above between unrelated steps

class MockEvent {
  constructor() { this.listeners = new Set(); }
  addEventListener(listener) { this.listeners.add(listener); return () => this.listeners.delete(listener); }
  emit() { for (const listener of [...this.listeners]) listener(); }
}

/** A near-white, near-uniform frame — what bare untextured terrain renders as. */
function blankPixelData(width, height) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = 250; data[i + 1] = 250; data[i + 2] = 250; data[i + 3] = 255;
  }
  return data;
}

/** A dim, high-variance frame — an ordinary textured scene, mean well under the luminance floor. */
function detailedPixelData(width, height) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let px = 0; px < width * height; px++) {
    const i = px * 4;
    const gray = px % 2 === 0 ? 60 : 180;
    data[i] = gray; data[i + 1] = gray; data[i + 2] = gray; data[i + 3] = 255;
  }
  return data;
}

/** A BRIGHT but high-variance frame — the false-positive guard: luminance
 *  alone would flag this as blank, but its shading variance (snow/desert/
 *  cloud relief) must keep it from ever counting as a strike. */
function brightDetailedPixelData(width, height) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let px = 0; px < width * height; px++) {
    const i = px * 4;
    const gray = px % 2 === 0 ? 255 : 150;
    data[i] = gray; data[i + 1] = gray; data[i + 2] = gray; data[i + 3] = 255;
  }
  return data;
}

/**
 * Builds a real `MapStackController` against a duck-typed viewer, with the
 * only two network-bound provider constructions (Esri metadata, ion/Re:Earth
 * terrain) stubbed so tests never touch the network. `esriUnavailable`
 * reproduces a real Esri outage — `_getImageryProvider`'s own OSM
 * sub-fallback then kicks in, landing `esri-imagery` switches on `osm`.
 */
function createHarness({ esriUnavailable = false } = {}) {
  const originalArcGis = Cesium.ArcGisMapServerImageryProvider.fromUrl;
  const originalTerrain = Cesium.CesiumTerrainProvider.fromUrl;
  const originalDocument = globalThis.document;

  Cesium.ArcGisMapServerImageryProvider.fromUrl = esriUnavailable
    ? async () => { throw new Error('Esri unreachable (test)'); }
    : async () => new Cesium.OpenStreetMapImageryProvider({ url: 'https://tile.openstreetmap.org/' });
  Cesium.CesiumTerrainProvider.fromUrl = async () => { throw new Error('no network in tests'); };

  let pixelSource = () => blankPixelData(48, 32);
  let canvasContextAvailable = true;
  globalThis.document = {
    createElement: () => ({
      width: 0,
      height: 0,
      getContext: (type) => {
        if (type !== '2d' || !canvasContextAvailable) return null;
        return {
          drawImage() {},
          getImageData: (x, y, w, h) => ({ data: pixelSource(w, h) }),
        };
      },
    }),
  };

  const moveEnd = new MockEvent();
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
    viewer,
    moveEnd,
    changes,
    errors,
    setPixelSource(fn) { pixelSource = fn; },
    setCanvasContextAvailable(value) { canvasContextAvailable = value; },
    restore() {
      Cesium.ArcGisMapServerImageryProvider.fromUrl = originalArcGis;
      Cesium.CesiumTerrainProvider.fromUrl = originalTerrain;
      globalThis.document = originalDocument;
    },
  };
}

/** Fires moveEnd and ticks past the settle delay, awaiting any pending microtasks so a sample completes. */
async function settledMove(t, moveEnd) {
  moveEnd.emit();
  t.mock.timers.tick(SETTLE_MS + 100);
  for (let i = 0; i < 20; i++) await Promise.resolve();
}

test('two consecutive blank samples trigger the Esri fallback and fire the toast flag once', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const h = createHarness();
  try {
    await h.controller.setStack('photoreal');
    h.setPixelSource(blankPixelData);

    t.mock.timers.tick(CLEAR_MS);
    await settledMove(t, h.moveEnd);
    assert.equal(h.controller.getActiveId(), 'photoreal', 'one blank sample is not enough on its own');

    t.mock.timers.tick(MIN_INTERVAL_MS + 100);
    await settledMove(t, h.moveEnd);

    assert.equal(h.controller.getActiveId(), 'esri-imagery');
    assert.equal(h.controller.getState().lastError, 'Google 3D has no photo coverage here; showing Esri Satellite');
    assert.equal(h.controller.consumeCoverageFallbackFlag(), true, 'the flag reads true the first time');
    assert.equal(h.controller.consumeCoverageFallbackFlag(), false, 'and clears itself on read');
  } finally {
    h.restore();
  }
});

test('one blank sample followed by a real/detailed sample resets strikes — no fallback', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const h = createHarness();
  try {
    await h.controller.setStack('photoreal');

    h.setPixelSource(blankPixelData);
    t.mock.timers.tick(CLEAR_MS);
    await settledMove(t, h.moveEnd);

    h.setPixelSource(detailedPixelData);
    t.mock.timers.tick(MIN_INTERVAL_MS + 100);
    await settledMove(t, h.moveEnd);

    assert.equal(h.controller.getActiveId(), 'photoreal', 'a detailed frame must reset the strike streak');

    // A single further blank sample must not be enough — proves the streak
    // actually reset to 0, not just to 1.
    h.setPixelSource(blankPixelData);
    t.mock.timers.tick(MIN_INTERVAL_MS + 100);
    await settledMove(t, h.moveEnd);
    assert.equal(h.controller.getActiveId(), 'photoreal');
  } finally {
    h.restore();
  }
});

test('a bright-but-detailed frame never counts as a strike, even sampled repeatedly', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const h = createHarness();
  try {
    await h.controller.setStack('photoreal');
    h.setPixelSource(brightDetailedPixelData);

    t.mock.timers.tick(CLEAR_MS);
    await settledMove(t, h.moveEnd);
    t.mock.timers.tick(MIN_INTERVAL_MS + 100);
    await settledMove(t, h.moveEnd);
    t.mock.timers.tick(MIN_INTERVAL_MS + 100);
    await settledMove(t, h.moveEnd);

    assert.equal(h.controller.getActiveId(), 'photoreal', 'luminance alone must not trip the watchdog');
  } finally {
    h.restore();
  }
});

test('samples firing faster than the min interval are throttled to one per window', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const h = createHarness();
  try {
    await h.controller.setStack('photoreal');
    h.setPixelSource(blankPixelData);

    t.mock.timers.tick(CLEAR_MS);
    await settledMove(t, h.moveEnd); // sample #1 — counts, strikes = 1

    // A second moveEnd well inside MIN_INTERVAL_MS of the first sample.
    await settledMove(t, h.moveEnd);
    assert.equal(h.controller.getActiveId(), 'photoreal', 'the throttled second call must not have counted toward the 2-strike threshold');

    // Now clear the throttle window and confirm the SAME strike streak (not
    // a fresh one) still only needs one more real sample to fire.
    t.mock.timers.tick(MIN_INTERVAL_MS + 100);
    await settledMove(t, h.moveEnd);
    assert.equal(h.controller.getActiveId(), 'esri-imagery', 'the un-throttled second sample completes the 2-strike streak');
  } finally {
    h.restore();
  }
});

test('manually switching away from photoreal tears down the watchdog', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const h = createHarness();
  try {
    await h.controller.setStack('photoreal');
    assert.equal(h.moveEnd.listeners.size, 1, 'the watchdog installs exactly one moveEnd listener');

    await h.controller.setStack('esri-imagery');
    assert.equal(h.moveEnd.listeners.size, 0, 'switching away disposes the listener');

    // Even with a blank pixel source and repeated moveEnd firing, nothing
    // should re-arm or sample while photoreal is inactive.
    h.setPixelSource(blankPixelData);
    t.mock.timers.tick(CLEAR_MS);
    await settledMove(t, h.moveEnd);
    t.mock.timers.tick(MIN_INTERVAL_MS + 100);
    await settledMove(t, h.moveEnd);
    assert.equal(h.controller.getActiveId(), 'esri-imagery', 'no sampling occurs once the watchdog is torn down');
  } finally {
    h.restore();
  }
});

test('manually switching back to photoreal re-arms the watchdog with strikes reset', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const h = createHarness();
  try {
    await h.controller.setStack('photoreal');
    h.setPixelSource(blankPixelData);
    t.mock.timers.tick(CLEAR_MS);
    await settledMove(t, h.moveEnd); // one strike, not yet enough to fall back

    // Round-trip through another stack and back.
    await h.controller.setStack('esri-imagery');
    t.mock.timers.tick(CLEAR_MS);
    await h.controller.setStack('photoreal');

    // If the earlier strike had survived the round trip, this single sample
    // would complete a 2-strike streak and trigger the fallback. It must not.
    t.mock.timers.tick(CLEAR_MS);
    await settledMove(t, h.moveEnd);
    assert.equal(h.controller.getActiveId(), 'photoreal', 're-arming must start the strike count at 0');
  } finally {
    h.restore();
  }
});

test('reentrancy: a fallback already in flight blocks a second concurrent trigger', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const h = createHarness();
  try {
    await h.controller.setStack('photoreal');

    let setStackCalls = 0;
    const originalSetStack = h.controller.setStack.bind(h.controller);
    h.controller.setStack = (...args) => { setStackCalls += 1; return originalSetStack(...args); };

    // Both calls happen synchronously, before the first's setStack() promise
    // can resolve — the guard must be checked (and set) synchronously too.
    h.controller._triggerCoverageFallback();
    h.controller._triggerCoverageFallback();

    for (let i = 0; i < 20; i++) await Promise.resolve();

    assert.equal(setStackCalls, 1, 'the second trigger must bail on _coverageFallbackPending, not start a second switch');
    assert.equal(h.controller.getActiveId(), 'esri-imagery');
  } finally {
    h.restore();
  }
});

test('an unreadable canvas/context is a no-op — no throw, no strike change', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const h = createHarness();
  try {
    await h.controller.setStack('photoreal');
    h.setCanvasContextAvailable(false);

    t.mock.timers.tick(CLEAR_MS);
    await assert.doesNotReject(async () => { await settledMove(t, h.moveEnd); });
    t.mock.timers.tick(MIN_INTERVAL_MS + 100);
    await assert.doesNotReject(async () => { await settledMove(t, h.moveEnd); });

    assert.equal(h.controller.getActiveId(), 'photoreal', 'an indeterminate read must never count toward either direction');
  } finally {
    h.restore();
  }
});

test('Esri unreachable at fallback time still stamps lastError and fires the toast flag (lands on osm)', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const h = createHarness({ esriUnavailable: true });
  try {
    await h.controller.setStack('photoreal');
    h.setPixelSource(blankPixelData);

    t.mock.timers.tick(CLEAR_MS);
    await settledMove(t, h.moveEnd);
    t.mock.timers.tick(MIN_INTERVAL_MS + 100);
    await settledMove(t, h.moveEnd);

    assert.equal(h.controller.getActiveId(), 'osm', 'Esri\'s own OSM sub-fallback still applies underneath the coverage fallback');
    assert.equal(h.controller.getState().lastError, 'Google 3D has no photo coverage here; showing Esri Satellite');
    assert.equal(h.controller.consumeCoverageFallbackFlag(), true);
  } finally {
    h.restore();
  }
});
