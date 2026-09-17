// src/data/rocketLaunchesRenderHold.test.mjs
// Render-governor integration for the mission-replay carve-out (perf wave 3 —
// see docs/CURRENT-STATE.md / CHANGELOG.md). Mission replay is a discrete,
// explicit opt-in mode — same shape as cctv.js's 'cctv-adjust' calibration
// hold — so it gets its OWN hold, acquired in startMissionReplay and released
// in stopMissionReplay, independent of the layer-wide 'rocket-launches' hold
// (enable()/disable(), unchanged by this carve-out). Wires the REAL governor
// so the acquire/release is observed, not just inferred from source shape.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as Cesium from 'cesium';
import rocketLaunchesLayer, {
  _setRocketMissionOverlayHostForTest,
  _startMissionReplayForTest,
  _stopMissionReplayForTest,
} from './rocketLaunches.js';
import {
  installRenderGovernor,
  getRenderGovernorDiagnostics,
  _resetRenderGovernorForTest,
} from '../renderGovernor.js';

/** Minimal DOM stub — same shape as rocketLaunches.test.mjs's FakeElement. */
class FakeElement {
  constructor(tagName = 'div') {
    this.tagName = tagName.toUpperCase();
    this.children = [];
    this.parentElement = null;
    this.style = { setProperty() {} };
    this.classList = { add() {}, remove() {}, toggle() {} };
    this.dataset = {};
    this.hidden = false;
    this.clientWidth = 1600;
    this.clientHeight = 900;
    this.width = 1600;
    this.height = 900;
  }

  addEventListener() {}
  removeEventListener() {}
  appendChild(child) { child.parentElement = this; this.children.push(child); return child; }
  remove() {
    if (this.parentElement) {
      this.parentElement.children = this.parentElement.children.filter((c) => c !== this);
    }
    this.parentElement = null;
  }
  setAttribute() {}
  getBoundingClientRect() { return { left: 0, top: 0, width: 1600, height: 900 }; }
  getContext() {
    return this.tagName === 'CANVAS'
      ? { strokeStyle: '', lineWidth: 1, lineCap: '', shadowColor: '', shadowBlur: 0, beginPath() {}, moveTo() {}, lineTo() {}, stroke() {} }
      : null;
  }
}

/** A launch with a resolvable orbit path — required for _replayTracks to gain an entry. */
function launchPayload() {
  return { results: [{
    id: 'mission-replay-hold',
    name: 'Falcon 9 | Render Hold Fixture',
    net: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    status: { name: 'Launch Successful' },
    pad: { latitude: '28.608', longitude: '-80.604', name: 'Space Launch Complex 39A' },
    rocket: { launcher_stage: [{ id: 'booster-1', type: 'Core', landing: { attempt: false } }] },
    mission: { name: 'Render Hold Fixture', orbit: { name: 'Low Earth Orbit' } },
  }] };
}

test('mission replay holds continuous render only for its own lifetime, independent of the layer-wide hold', async () => {
  const realDocument = globalThis.document;
  const realFetch = globalThis.fetch;
  const realHtmlCanvasElement = globalThis.HTMLCanvasElement;
  const realHtmlImageElement = globalThis.HTMLImageElement;
  const realImageBitmap = globalThis.ImageBitmap;
  const realOffscreenCanvas = globalThis.OffscreenCanvas;

  const body = new FakeElement('body');
  const document = {
    body,
    createElement: (tagName) => new FakeElement(tagName),
    getElementById: () => null,
    addEventListener() {},
    removeEventListener() {},
  };
  const canvas = new FakeElement('canvas');
  const dataSources = [];
  const camera = {
    positionCartographic: null,
    positionWC: Cesium.Cartesian3.fromDegrees(-80.604, 28.608, 18_000_000),
    cancelFlight() {},
    lookAtTransform() {},
    lookAt() {},
    setView() {},
    flyToBoundingSphere(_sphere, opts) { opts?.complete?.(); },
  };
  const scene = {
    canvas,
    camera,
    frameState: { frameNumber: 1 },
    postRender: new Cesium.Event(),
    preRender: new Cesium.Event(),
    preUpdate: new Cesium.Event(),
    primitives: { add: (p) => p, remove: () => true },
    drillPick: () => [],
  };
  const viewer = {
    camera,
    scene,
    dataSources: {
      add(dataSource) { dataSources.push(dataSource); return dataSource; },
      remove(dataSource) {
        const index = dataSources.indexOf(dataSource);
        if (index >= 0) dataSources.splice(index, 1);
        return index >= 0;
      },
    },
    selectedEntity: undefined,
  };

  globalThis.document = document;
  globalThis.HTMLCanvasElement = FakeElement;
  globalThis.HTMLImageElement = class {};
  globalThis.ImageBitmap = class {};
  globalThis.OffscreenCanvas = class {};
  globalThis.fetch = async (url) => {
    if (url === '/api/celestrak/active') return { ok: true, text: async () => '' };
    return { ok: true, json: async () => launchPayload() };
  };
  _setRocketMissionOverlayHostForTest({ setEntries() {}, setVisible() {}, clearSource() {} });
  _resetRenderGovernorForTest();
  installRenderGovernor(viewer);

  let initialized = false;
  try {
    rocketLaunchesLayer.init(viewer);
    initialized = true;
    await rocketLaunchesLayer.enable();
    await rocketLaunchesLayer.update();

    // enable() already holds 'rocket-launches' unconditionally (unchanged by
    // this carve-out) — confirm that baseline before touching replay at all.
    assert.ok(
      getRenderGovernorDiagnostics().holds.includes('rocket-launches'),
      'the layer-wide hold must be exactly as it was before this carve-out',
    );
    assert.ok(
      !getRenderGovernorDiagnostics().holds.includes('rocket-replay'),
      'replay must not be held before it has started',
    );

    const started = _startMissionReplayForTest('mission-replay-hold');
    assert.equal(started, true, 'the fixture launch must have a resolvable orbit path to replay');
    assert.ok(
      getRenderGovernorDiagnostics().holds.includes('rocket-replay'),
      'starting replay must acquire its own hold',
    );

    _stopMissionReplayForTest();
    assert.ok(
      !getRenderGovernorDiagnostics().holds.includes('rocket-replay'),
      'stopping replay must release its own hold',
    );
    assert.ok(
      getRenderGovernorDiagnostics().holds.includes('rocket-launches'),
      'the layer-wide hold must survive a replay stop untouched',
    );
  } finally {
    if (initialized) await rocketLaunchesLayer.destroy(viewer);
    _setRocketMissionOverlayHostForTest();
    _resetRenderGovernorForTest();
    globalThis.fetch = realFetch;
    globalThis.document = realDocument;
    globalThis.HTMLCanvasElement = realHtmlCanvasElement;
    globalThis.HTMLImageElement = realHtmlImageElement;
    globalThis.ImageBitmap = realImageBitmap;
    globalThis.OffscreenCanvas = realOffscreenCanvas;
  }
});

test('re-clicking the same launch stops replay and releases the hold without re-acquiring it', async () => {
  const realDocument = globalThis.document;
  const realFetch = globalThis.fetch;
  const realHtmlCanvasElement = globalThis.HTMLCanvasElement;
  const realHtmlImageElement = globalThis.HTMLImageElement;
  const realImageBitmap = globalThis.ImageBitmap;
  const realOffscreenCanvas = globalThis.OffscreenCanvas;

  const body = new FakeElement('body');
  const document = {
    body,
    createElement: (tagName) => new FakeElement(tagName),
    getElementById: () => null,
    addEventListener() {},
    removeEventListener() {},
  };
  const canvas = new FakeElement('canvas');
  const dataSources = [];
  const camera = {
    positionCartographic: null,
    positionWC: Cesium.Cartesian3.fromDegrees(-80.604, 28.608, 18_000_000),
    cancelFlight() {},
    lookAtTransform() {},
    lookAt() {},
    setView() {},
    flyToBoundingSphere(_sphere, opts) { opts?.complete?.(); },
  };
  const scene = {
    canvas,
    camera,
    frameState: { frameNumber: 1 },
    postRender: new Cesium.Event(),
    preRender: new Cesium.Event(),
    preUpdate: new Cesium.Event(),
    primitives: { add: (p) => p, remove: () => true },
    drillPick: () => [],
  };
  const viewer = {
    camera,
    scene,
    dataSources: {
      add(dataSource) { dataSources.push(dataSource); return dataSource; },
      remove(dataSource) {
        const index = dataSources.indexOf(dataSource);
        if (index >= 0) dataSources.splice(index, 1);
        return index >= 0;
      },
    },
    selectedEntity: undefined,
  };

  globalThis.document = document;
  globalThis.HTMLCanvasElement = FakeElement;
  globalThis.HTMLImageElement = class {};
  globalThis.ImageBitmap = class {};
  globalThis.OffscreenCanvas = class {};
  globalThis.fetch = async (url) => {
    if (url === '/api/celestrak/active') return { ok: true, text: async () => '' };
    return { ok: true, json: async () => launchPayload() };
  };
  _setRocketMissionOverlayHostForTest({ setEntries() {}, setVisible() {}, clearSource() {} });
  _resetRenderGovernorForTest();
  installRenderGovernor(viewer);

  let initialized = false;
  try {
    rocketLaunchesLayer.init(viewer);
    initialized = true;
    await rocketLaunchesLayer.enable();
    await rocketLaunchesLayer.update();

    assert.equal(_startMissionReplayForTest('mission-replay-hold'), true);
    assert.ok(getRenderGovernorDiagnostics().holds.includes('rocket-replay'));

    // startMissionReplay's own early-return path for re-selecting the launch
    // already replaying: it calls stopMissionReplay() and returns false.
    const restarted = _startMissionReplayForTest('mission-replay-hold');
    assert.equal(restarted, false, 'starting an already-replaying launch toggles it off');
    assert.ok(
      !getRenderGovernorDiagnostics().holds.includes('rocket-replay'),
      'the toggle-off path must release the hold too — it funnels through stopMissionReplay()',
    );
  } finally {
    if (initialized) await rocketLaunchesLayer.destroy(viewer);
    _setRocketMissionOverlayHostForTest();
    _resetRenderGovernorForTest();
    globalThis.fetch = realFetch;
    globalThis.document = realDocument;
    globalThis.HTMLCanvasElement = realHtmlCanvasElement;
    globalThis.HTMLImageElement = realHtmlImageElement;
    globalThis.ImageBitmap = realImageBitmap;
    globalThis.OffscreenCanvas = realOffscreenCanvas;
  }
});
