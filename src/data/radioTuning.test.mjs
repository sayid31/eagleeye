// Tuner drag, release, cancellation, and lifecycle authority.

import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getRadioUIState,
  radioLayer,
} from './radio.js';

test('tuner drag keeps one immutable catalog resolution through refresh and release', async () => {
  const originalFetch = globalThis.fetch;
  const viewer = {
    camera: { positionWC: { x: 7_000_000, y: 0, z: 0 } },
    scene: { canvas: { disableRootEvents: true, onwheel: null, addEventListener() {}, removeEventListener() {} } },
    dataSources: { add() {}, remove() {} },
    entities: { add(entity) { return entity; }, remove() {} },
  };
  const stationA = {
    id: '00000000-0000-4000-8000-000000000041',
    name: 'Generation A',
    lat: 30,
    lon: -97,
    streamUrl: 'https://radio.example.com/a.mp3',
    homepage: null,
    tags: ['news'],
    languages: ['English'],
    state: 'Texas',
    country: 'United States',
    countryCode: 'US',
    metadataTrust: 'untrusted-community',
    codec: 'MP3',
    bitrate: 128,
  };
  const stationB = {
    ...stationA,
    name: 'Generation B',
    streamUrl: 'https://radio.example.com/b.mp3',
  };
  const stationC = {
    ...stationB,
    id: '00000000-0000-4000-8000-000000000042',
    name: 'Generation C',
  };
  const publish = async (stationOrStations, acceptedGeneration) => {
    const stations = Array.isArray(stationOrStations) ? stationOrStations : [stationOrStations];
    globalThis.fetch = async () => new Response(JSON.stringify({
      stations,
      stale: false,
      degraded: false,
      acceptedGeneration,
      catalogInstance: 'qa-instance-a',
      updatedAt: new Date().toISOString(),
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    await radioLayer.update();
  };

  radioLayer.destroy();
  try {
    radioLayer.init(viewer);
    radioLayer.enable();
    await publish(stationA, 1);
    assert.equal(radioLayer.beginTuning(), true);
    assert.equal(radioLayer.previewTuningStation(stationA.id, { rotate: false }), true);
    assert.equal(getRadioUIState().tuningCatalogGeneration, 1);

    await publish(stationB, 2);
    assert.equal(getRadioUIState().tuningPreviewStationId, stationA.id);
    const changed = radioLayer.commitTuningStation(stationA.id, { origin: 'user' });
    assert.deepEqual(changed, {
      ok: false,
      reason: 'station-unavailable',
      stationId: stationA.id,
      generation: 1,
    });
    assert.equal(getRadioUIState().selected, null);
    assert.equal(getRadioUIState().tuningUnavailableStationId, stationA.id);

    assert.equal(radioLayer.beginTuning(), true);
    assert.equal(radioLayer.previewTuningStation(stationB.id, { rotate: false }), true);
    await publish(stationB, 3);
    const unchanged = radioLayer.commitTuningStation(stationB.id, { origin: 'user' });
    assert.equal(unchanged.ok, true);
    assert.equal(unchanged.generation, 2);
    assert.equal(getRadioUIState().selected?.name, 'Generation B');

    assert.equal(radioLayer.beginTuning(), true);
    assert.equal(radioLayer.previewTuningStation(stationB.id, { rotate: false }), true);
    await publish(stationC, 4);
    const removed = radioLayer.commitTuningStation(stationB.id, { origin: 'user' });
    assert.equal(removed.ok, false);
    assert.equal(removed.reason, 'station-unavailable');
    assert.equal(removed.stationId, stationB.id);
    assert.notEqual(getRadioUIState().selected?.id, stationC.id);

    await publish([stationA, stationC], 5);
    assert.equal(radioLayer.selectStation(stationA.id, { autoplay: false, focus: false }), true);
    assert.equal(radioLayer.beginTuning(), true);
    assert.equal(radioLayer.previewTuningStation(stationC.id, { rotate: false }), true);
    await publish([stationA, { ...stationC, name: 'Changed target' }], 6);
    const priorSelectionMismatch = radioLayer.commitTuningStation(stationC.id, { origin: 'user' });
    assert.equal(priorSelectionMismatch.ok, false);
    assert.equal(priorSelectionMismatch.reason, 'station-unavailable');
    assert.equal(getRadioUIState().selected, null);
    assert.equal(getRadioUIState().tuningUnavailableStationId, stationC.id);

    await publish([stationB, stationC], 7);
    assert.equal(radioLayer.selectStation(stationB.id, { autoplay: false, focus: false }), true);
    assert.equal(radioLayer.beginTuning(), true);
    assert.equal(radioLayer.previewTuningStation(stationB.id, { rotate: false }), true);
    await publish([{ ...stationB, name: 'Same ID replacement' }, stationC], 8);
    const sameIdMismatch = radioLayer.commitTuningStation(stationB.id, { origin: 'user' });
    assert.equal(sameIdMismatch.ok, false);
    assert.equal(sameIdMismatch.reason, 'station-unavailable');
    assert.equal(getRadioUIState().selected, null);
    assert.equal(getRadioUIState().tuningUnavailableStationId, stationB.id);
  } finally {
    globalThis.fetch = originalFetch;
    radioLayer.destroy();
  }
});

test('failed exact tuner release cannot consume a stale playback fallback', async () => {
  const originalFetch = globalThis.fetch;
  const originalAudio = globalThis.Audio;
  const playUrls = [];
  const stationRows = [
    {
      id: '00000000-0000-4000-8000-000000000071',
      name: 'Exact target',
      lat: 30,
      lon: -97,
      streamUrl: 'https://radio.example.com/exact.mp3',
      homepage: null,
      tags: ['news'],
      languages: ['English'],
      state: 'Texas',
      country: 'United States',
      countryCode: 'US',
      metadataTrust: 'untrusted-community',
      codec: 'MP3',
      bitrate: 128,
    },
    {
      id: '00000000-0000-4000-8000-000000000072',
      name: 'Stale fallback',
      lat: 31,
      lon: -98,
      streamUrl: 'https://radio.example.com/fallback.mp3',
      homepage: null,
      tags: ['news'],
      languages: ['English'],
      state: 'Texas',
      country: 'United States',
      countryCode: 'US',
      metadataTrust: 'untrusted-community',
      codec: 'MP3',
      bitrate: 128,
    },
  ];
  globalThis.Audio = class FakeAudio {
    constructor() {
      this.volume = 0.8;
      this.src = '';
    }

    addEventListener() {}
    pause() {}
    play() {
      playUrls.push(this.src);
      if (this.src === stationRows[0].streamUrl) {
        return Promise.reject(new DOMException('Exact target unavailable', 'NotSupportedError'));
      }
      return Promise.resolve();
    }
    removeAttribute() { this.src = ''; }
    load() {}
  };
  globalThis.fetch = async (url) => String(url).startsWith('/api/radio/click/')
    ? { ok: true }
    : new Response(JSON.stringify({
      stations: stationRows,
      stale: false,
      degraded: false,
      acceptedGeneration: 1,
      catalogInstance: 'qa-instance-a',
      updatedAt: new Date().toISOString(),
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  const viewer = {
    camera: { positionWC: { x: 7_000_000, y: 0, z: 0 } },
    scene: { canvas: { disableRootEvents: true, onwheel: null, addEventListener() {}, removeEventListener() {} } },
    dataSources: { add() {}, remove() {} },
    entities: { add(entity) { return entity; }, remove() {} },
  };

  radioLayer.destroy();
  try {
    radioLayer.init(viewer);
    radioLayer.enable();
    await radioLayer.update();
    assert.equal(radioLayer.selectStation(stationRows[0].id, { autoplay: false }), true);
    assert.equal(radioLayer.cycleStation(1, {
      stationIds: stationRows.map(({ id }) => id),
      autoplay: false,
    }), true, 'non-playing cycle creates the stale-fallback precondition');
    assert.equal(radioLayer.beginTuning(), true);
    assert.equal(radioLayer.previewTuningStation(stationRows[0].id, { rotate: false }), true);
    assert.equal(radioLayer.commitTuningStation(stationRows[0].id, { origin: 'user' }).ok, true);
    await new Promise((resolve) => setTimeout(resolve));
    const state = radioLayer.getUIState();
    assert.deepEqual(playUrls, [stationRows[0].streamUrl]);
    assert.equal(state.selected?.id, stationRows[0].id);
    assert.equal(state.audioState, 'error');
    assert.equal(state.tuningStatic, true);
    assert.equal(state.tuningAwaitingStationId, stationRows[0].id);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalAudio === undefined) delete globalThis.Audio;
    else globalThis.Audio = originalAudio;
    radioLayer.destroy();
  }
});

test('tuner cancellation restores the frozen start marker after catalog removal', async () => {
  const originalFetch = globalThis.fetch;
  const originalAudio = globalThis.Audio;
  const selectedEntities = new Map();
  let playCalls = 0;
  let flyToCalls = 0;
  globalThis.Audio = class FakeAudio {
    constructor() {
      this.volume = 0.8;
    }

    addEventListener() {}
    pause() {}
    play() { playCalls += 1; return Promise.resolve(); }
    removeAttribute() {}
    load() {}
  };
  const viewer = {
    camera: {
      positionWC: { x: 7_000_000, y: 0, z: 0 },
      flyTo() { flyToCalls += 1; },
    },
    scene: {
      canvas: { disableRootEvents: true, onwheel: null, addEventListener() {}, removeEventListener() {} },
      requestRender() {},
    },
    dataSources: { add() {}, remove() {} },
    entities: {
      add(entity) { selectedEntities.set(entity.id, entity); return entity; },
      remove(entity) { return selectedEntities.delete(entity?.id); },
    },
  };
  const stationA = {
    id: '00000000-0000-4000-8000-000000000051',
    name: 'Frozen start',
    lat: 30,
    lon: -97,
    streamUrl: 'https://radio.example.com/start.mp3',
    homepage: null,
    tags: ['news'],
    languages: ['English'],
    state: 'Texas',
    country: 'United States',
    countryCode: 'US',
    metadataTrust: 'untrusted-community',
    codec: 'MP3',
    bitrate: 128,
  };
  const stationB = {
    ...stationA,
    id: '00000000-0000-4000-8000-000000000052',
    name: 'Preview target',
    lat: 44,
    lon: 12,
    streamUrl: 'https://radio.example.com/preview.mp3',
  };
  const publish = async (rows, acceptedGeneration) => {
    globalThis.fetch = async () => new Response(JSON.stringify({
      stations: rows,
      stale: false,
      degraded: false,
      acceptedGeneration,
      catalogInstance: 'qa-instance-a',
      updatedAt: new Date().toISOString(),
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    await radioLayer.update();
  };

  radioLayer.destroy();
  try {
    radioLayer.init(viewer);
    radioLayer.enable();
    radioLayer.setLifecyclePresentation({
      lifecycleState: 'enabled', enabled: true, uncertain: false,
    });
    let nextGeneration = 1;
    const restoreRemovedStartMarker = async () => {
      await publish([stationA, stationB], nextGeneration);
      nextGeneration += 1;
      assert.equal(radioLayer.selectStation(stationA.id, { autoplay: false, focus: false }), true);
      const startMarker = selectedEntities.get(`radio:selected:${stationA.id}`);
      assert.ok(startMarker);
      assert.equal(radioLayer.beginTuning(), true);
      assert.equal(radioLayer.previewTuningStation(stationB.id, { rotate: false }), true);
      await publish([stationB], nextGeneration);
      nextGeneration += 1;
      assert.equal(getRadioUIState().selected, null);
      assert.equal(radioLayer.cancelTuning(), true);
      const restoredMarker = selectedEntities.get(`radio:selected:${stationA.id}`);
      assert.ok(restoredMarker, 'the frozen start marker remains visible after cancellation');
      assert.deepEqual(restoredMarker.position, startMarker.position);
      assert.equal(getRadioUIState().tuningRestoredStationId, stationA.id);
      assert.equal(getRadioUIState().tuningActive, false);
      assert.equal(getRadioUIState().selected, null, 'stale marker never becomes playback authority');
      assert.equal(playCalls, 0);
      assert.equal(flyToCalls, 0);
      return radioLayer.getAcceptedCatalogSnapshot();
    };

    const sameFilterSnapshot = await restoreRemovedStartMarker();
    const sameFilter = getRadioUIState().filter;
    assert.equal(radioLayer.setFilter(sameFilter), true);
    assert.equal(getRadioUIState().filter, sameFilter);
    assert.equal(getRadioUIState().tuningRestoredStationId, null);
    assert.equal(selectedEntities.has(`radio:selected:${stationA.id}`), false);
    assert.equal(radioLayer.getAcceptedCatalogSnapshot(), sameFilterSnapshot);
    assert.equal(getRadioUIState().selected, null);
    assert.equal(playCalls, 0);
    assert.equal(flyToCalls, 0);

    const changedFilterSnapshot = await restoreRemovedStartMarker();
    assert.equal(radioLayer.setFilter('news'), true);
    assert.equal(getRadioUIState().filter, 'news');
    assert.equal(getRadioUIState().tuningRestoredStationId, null);
    assert.equal(selectedEntities.has(`radio:selected:${stationA.id}`), false);
    assert.equal(radioLayer.getAcceptedCatalogSnapshot(), changedFilterSnapshot);
    assert.equal(getRadioUIState().selected, null);
    assert.equal(playCalls, 0);
    assert.equal(flyToCalls, 0);

    const equalGenerationSnapshot = await restoreRemovedStartMarker();
    await publish([stationB], equalGenerationSnapshot.generation);
    assert.equal(
      getRadioUIState().tuningRestoredStationId,
      null,
      'the next accepted equal-generation refresh clears the presentation-only marker',
    );
    assert.equal(selectedEntities.has(`radio:selected:${stationA.id}`), false);
    assert.equal(radioLayer.getAcceptedCatalogSnapshot(), equalGenerationSnapshot);
    assert.equal(playCalls, 0);
    assert.equal(flyToCalls, 0);

    assert.equal(radioLayer.selectStation(stationB.id, { autoplay: false, focus: false }), true);
    assert.equal(getRadioUIState().tuningRestoredStationId, null);
    assert.equal(selectedEntities.has(`radio:selected:${stationA.id}`), false);
  } finally {
    globalThis.fetch = originalFetch;
    radioLayer.destroy();
    if (originalAudio === undefined) delete globalThis.Audio;
    else globalThis.Audio = originalAudio;
  }
});

test('Radio public tuner, filter, and resume mutations require certain enabled lifecycle authority', async () => {
  const originalFetch = globalThis.fetch;
  const stationRows = [{
    id: '00000000-0000-4000-8000-000000000061',
    name: 'Lifecycle station',
    lat: 30,
    lon: -97,
    streamUrl: 'https://radio.example.com/lifecycle.mp3',
    homepage: null,
    tags: ['news'],
    languages: ['English'],
    state: 'Texas',
    country: 'United States',
    countryCode: 'US',
    metadataTrust: 'untrusted-community',
    codec: 'MP3',
    bitrate: 128,
  }];
  globalThis.fetch = async () => new Response(JSON.stringify({
    stations: stationRows,
    stale: false,
    degraded: false,
    acceptedGeneration: 1,
    catalogInstance: 'qa-instance-a',
    updatedAt: new Date().toISOString(),
  }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  const viewer = {
    camera: { positionWC: { x: 7_000_000, y: 0, z: 0 } },
    scene: { canvas: { disableRootEvents: true, onwheel: null, addEventListener() {}, removeEventListener() {} } },
    dataSources: { add() {}, remove() {} },
    entities: { add(entity) { return entity; }, remove() {} },
  };
  viewer.scene.requestRender = () => {};

  radioLayer.destroy();
  try {
    radioLayer.init(viewer);
    radioLayer.enable();
    await radioLayer.update();
    radioLayer.setLifecyclePresentation({
      lifecycleState: 'enabled', enabled: true, uncertain: false,
    });
    assert.equal(radioLayer.beginTuning(), true);
    assert.equal(radioLayer.setTuningStatic(false), true);

    for (const presentation of [
      { lifecycleState: 'disabled', enabled: false, uncertain: false },
      { lifecycleState: 'enabling', enabled: false, uncertain: false },
      { lifecycleState: 'disabling', enabled: true, uncertain: false },
      { lifecycleState: 'enabled', enabled: true, uncertain: true },
    ]) {
      radioLayer.setLifecyclePresentation(presentation);
      const before = getRadioUIState();
      assert.equal(radioLayer.setTuningStatic(true), false, presentation.lifecycleState);
      assert.equal(radioLayer.setFilter('news'), false, presentation.lifecycleState);
      assert.equal(await radioLayer.togglePlayback({ origin: 'user' }), false, presentation.lifecycleState);
      const after = getRadioUIState();
      assert.equal(after.tuningStatic, before.tuningStatic, presentation.lifecycleState);
      assert.equal(after.filter, before.filter, presentation.lifecycleState);
      assert.equal(after.selected, null, presentation.lifecycleState);
      assert.equal(after.audioState, 'stopped', presentation.lifecycleState);
    }

    radioLayer.setLifecyclePresentation({
      lifecycleState: 'enabled', enabled: true, uncertain: false,
    });
    assert.equal(radioLayer.setTuningStatic(true), true);
    assert.equal(getRadioUIState().tuningStatic, true);
    assert.equal(radioLayer.cancelTuning(), true);
    assert.equal(radioLayer.setFilter('news'), true);
    assert.equal(getRadioUIState().filter, 'news');
  } finally {
    globalThis.fetch = originalFetch;
    radioLayer.destroy();
  }
});
