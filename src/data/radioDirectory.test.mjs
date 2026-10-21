// Directory refresh, accepted-catalog snapshots, and session telemetry.

import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getRadioAcceptedCatalogSnapshot,
  getRadioUIState,
  radioLayer,
} from './radio.js';

const stations = [
  { id: 'news', tags: ['News', 'Weather Radio', 'air traffic'] },
  { id: 'safety', tags: ['police scanner', 'emergency'] },
  { id: 'music', tags: ['jazz', 'soul'] },
  { id: 'other', tags: ['community'] },
];

test('unusable directory responses preserve warm client state atomically', async () => {
  const originalFetch = globalThis.fetch;
  const now = new Date().toISOString();
  const station = {
    id: '00000000-0000-4000-8000-000000000001',
    name: 'Warm Station',
    lat: 30.2672,
    lon: -97.7431,
    streamUrl: 'https://stream.example.org/live.mp3',
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
  const viewer = {
    camera: { positionWC: { x: 7_000_000, y: 0, z: 0 } },
    scene: { canvas: { disableRootEvents: true, onwheel: null, addEventListener() {}, removeEventListener() {} } },
    dataSources: { add() {}, remove() {} },
    entities: { add(entity) { return entity; }, remove() {} },
  };
  radioLayer.destroy();
  try {
    radioLayer.init(viewer);
    globalThis.fetch = async () => new Response(JSON.stringify({
      stations: [station],
      stale: false,
      degraded: false,
      acceptedGeneration: 1,
      catalogInstance: 'qa-instance-a',
      updatedAt: now,
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    radioLayer.enable();
    await radioLayer.update();
    assert.equal(getRadioUIState().stationCount, 1);
    assert.equal(getRadioUIState().updatedAt, now);
    const acceptedSnapshot = getRadioAcceptedCatalogSnapshot();
    assert.equal(acceptedSnapshot.generation, 1);
    assert.equal(acceptedSnapshot.stations[0].id, station.id);
    assert.equal(acceptedSnapshot.stations[0].metadataTrust, 'untrusted-community');
    assert.equal(Object.isFrozen(acceptedSnapshot), true);
    assert.equal(Object.isFrozen(acceptedSnapshot.stations), true);
    assert.equal(Object.isFrozen(acceptedSnapshot.stations[0]), true);
    assert.equal(Object.isFrozen(acceptedSnapshot.stations[0].tags), true);
    assert.equal(Object.isFrozen(acceptedSnapshot.stations[0].languages), true);
    assert.throws(() => { acceptedSnapshot.stations[0].name = 'mutated'; }, TypeError);
    radioLayer.selectStation(station.id, { autoplay: false, focus: false });

    const replacement = {
      ...station,
      id: '00000000-0000-4000-8000-000000000002',
      name: 'Partial Replacement',
    };
    for (const body of [
      { stations: [replacement], stale: false, degraded: true, acceptedGeneration: 1, updatedAt: now },
      { stations: [replacement], stale: true, degraded: true, acceptedGeneration: 1, updatedAt: now },
    ]) {
      globalThis.fetch = async () => new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
      await radioLayer.update();
      const preserved = getRadioUIState();
      assert.equal(preserved.stationCount, 1);
      assert.equal(preserved.selected?.id, station.id);
      assert.equal(preserved.selected?.name, station.name);
      assert.equal(preserved.updatedAt, now);
      assert.equal(preserved.degraded, true);
      assert.equal(preserved.stale, body.stale);
      assert.equal(getRadioAcceptedCatalogSnapshot(), acceptedSnapshot);
    }

    for (const body of [
      { stations: {} },
      { stations: [station, { id: 'malformed' }], stale: false, degraded: false, updatedAt: now },
      { stations: [station], stale: false, degraded: false, updatedAt: 'not-a-date' },
      { stations: [station], stale: 'false', degraded: false, updatedAt: now },
    ]) {
      globalThis.fetch = async () => new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
      await radioLayer.update();
      assert.equal(getRadioUIState().stationCount, 1);
      assert.equal(getRadioUIState().updatedAt, now);
      assert.equal(getRadioUIState().stale, true);
      assert.equal(getRadioUIState().degraded, true);
    }
  } finally {
    globalThis.fetch = originalFetch;
    radioLayer.destroy();
  }
});

test('tuner refuses a degraded fallback that has no accepted catalog generation', async () => {
  const originalFetch = globalThis.fetch;
  const viewer = {
    camera: { positionWC: { x: 7_000_000, y: 0, z: 0 } },
    scene: { canvas: { disableRootEvents: true, onwheel: null, addEventListener() {}, removeEventListener() {} } },
    dataSources: { add() {}, remove() {} },
    entities: { add(entity) { return entity; }, remove() {} },
  };
  const station = {
    id: '00000000-0000-4000-8000-000000000043',
    name: 'Degraded Fallback',
    lat: 30,
    lon: -97,
    streamUrl: 'https://radio.example.com/degraded.mp3',
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

  radioLayer.destroy();
  try {
    globalThis.fetch = async () => new Response(JSON.stringify({
      stations: [station],
      stale: false,
      degraded: true,
      acceptedGeneration: null,
      updatedAt: new Date().toISOString(),
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    radioLayer.init(viewer);
    radioLayer.enable();
    await radioLayer.update();

    assert.equal(getRadioUIState().stationCount, 1, 'fallback remains visible outside the tuner');
    assert.equal(getRadioUIState().acceptedCatalogGeneration, null);
    assert.deepEqual(radioLayer.getTunerStations(), []);
    assert.equal(radioLayer.beginTuning(), false);
    assert.equal(getRadioUIState().tuningActive, false);
    assert.equal(getRadioUIState().tuningCatalogGeneration, null);
  } finally {
    globalThis.fetch = originalFetch;
    radioLayer.destroy();
  }
});

test('accepted snapshots allowlist station fields and never regress generation identity', async () => {
  const originalFetch = globalThis.fetch;
  const now = new Date().toISOString();
  const station = {
    id: '00000000-0000-4000-8000-000000000011',
    name: 'Generation One',
    lat: 30.2672,
    lon: -97.7431,
    streamUrl: 'https://stream.example.org/one.mp3',
    homepage: null,
    tags: ['news'],
    languages: ['English'],
    state: 'Texas',
    country: 'United States',
    countryCode: 'US',
    metadataTrust: 'untrusted-community',
    codec: 'MP3',
    bitrate: 128,
    extension: { mutable: true },
  };
  const viewer = {
    camera: { positionWC: { x: 7_000_000, y: 0, z: 0 } },
    scene: { canvas: { disableRootEvents: true, onwheel: null, addEventListener() {}, removeEventListener() {} } },
    dataSources: { add() {}, remove() {} },
    entities: { add(entity) { return entity; }, remove() {} },
  };
  const serve = (stations, acceptedGeneration, catalogInstance = 'qa-instance-a') => {
    globalThis.fetch = async () => new Response(JSON.stringify({
      stations,
      stale: false,
      degraded: false,
      acceptedGeneration,
      catalogInstance,
      updatedAt: now,
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };

  radioLayer.destroy();
  try {
    radioLayer.init(viewer);
    serve([station], 1);
    radioLayer.enable();
    await radioLayer.update();
    const generationOne = getRadioAcceptedCatalogSnapshot();
    assert.equal(generationOne.generation, 1);
    assert.equal('extension' in generationOne.stations[0], false);

    const forgedSameGeneration = {
      ...station,
      id: '00000000-0000-4000-8000-000000000012',
      name: 'Forged Same Generation',
    };
    serve([forgedSameGeneration], 1);
    await radioLayer.update();
    assert.strictEqual(getRadioAcceptedCatalogSnapshot(), generationOne);
    assert.equal(getRadioUIState().selected, null);
    assert.equal(getRadioUIState().stationCount, 1);

    const generationTwoStation = {
      ...station,
      id: '00000000-0000-4000-8000-000000000013',
      name: 'Generation Two',
    };
    serve([generationTwoStation], 2);
    await radioLayer.update();
    const generationTwo = getRadioAcceptedCatalogSnapshot();
    assert.notStrictEqual(generationTwo, generationOne);
    assert.equal(generationTwo.generation, 2);
    assert.equal(generationTwo.stations[0].id, generationTwoStation.id);

    serve([station], 1);
    await radioLayer.update();
    assert.strictEqual(getRadioAcceptedCatalogSnapshot(), generationTwo);
    assert.equal(getRadioUIState().stationCount, 1);
    assert.equal(getRadioUIState().stale, true);
    assert.equal(getRadioUIState().degraded, true);
    assert.match(getRadioUIState().error, /pembaruan direktori gagal/i);

    // Producer restart: a NEW instance token restarts the generation sequence.
    // Generation 1 from instance B is a fresh catalog, not a repeat of the old
    // instance's generation 1 and not a regression from its generation 2.
    const restartStation = {
      ...station,
      id: '00000000-0000-4000-8000-000000000021',
      name: 'Post Restart Station',
    };
    serve([restartStation], 1, 'qa-instance-b');
    await radioLayer.update();
    const postRestart = getRadioAcceptedCatalogSnapshot();
    assert.notStrictEqual(postRestart, generationTwo);
    assert.equal(postRestart.instance, 'qa-instance-b');
    assert.equal(postRestart.generation, 1);
    assert.equal(postRestart.stations[0].id, restartStation.id);
    assert.equal(getRadioUIState().stationCount, 1);
    assert.equal(getRadioUIState().stale, false);
    assert.equal(getRadioUIState().degraded, false);
    assert.equal(getRadioUIState().error, null);

    // Same generation NUMBER as the pre-restart snapshot from yet another
    // instance must also fully reconcile — equal numbers across instances are
    // different catalogs, not "unchanged".
    const secondRestartStation = {
      ...station,
      id: '00000000-0000-4000-8000-000000000022',
      name: 'Second Restart Station',
    };
    serve([secondRestartStation], 1, 'qa-instance-c');
    await radioLayer.update();
    const secondRestart = getRadioAcceptedCatalogSnapshot();
    assert.equal(secondRestart.instance, 'qa-instance-c');
    assert.equal(secondRestart.stations[0].id, secondRestartStation.id);
  } finally {
    globalThis.fetch = originalFetch;
    radioLayer.destroy();
  }
});

test('update abort, destroy, and re-init invalidate the prior session and reset catalog telemetry', async () => {
  const originalFetch = globalThis.fetch;
  let resolveFetch;
  let requestSignal = null;
  const viewer = {
    camera: { positionWC: { x: 7_000_000, y: 0, z: 0 } },
    scene: { canvas: { disableRootEvents: true, onwheel: null, addEventListener() {}, removeEventListener() {} } },
    dataSources: { add() {}, remove() {} },
    entities: { add(entity) { return entity; }, remove() {} },
  };
  const lateStation = {
    id: '00000000-0000-4000-8000-000000000099',
    name: 'Late Station',
    lat: 30,
    lon: -97,
    streamUrl: 'https://radio.example.com/late.mp3',
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

  radioLayer.destroy();
  try {
    globalThis.fetch = (_url, options) => {
      requestSignal = options.signal;
      return new Promise((resolve) => { resolveFetch = resolve; });
    };
    radioLayer.init(viewer);
    radioLayer.enable();
    const pending = radioLayer.update();
    assert.equal(getRadioUIState().loading, true);
    radioLayer.disable();
    assert.equal(requestSignal.aborted, true);
    assert.equal(getRadioUIState().loading, false);

    radioLayer.destroy();
    radioLayer.init(viewer);
    const cleanState = getRadioUIState();
    assert.deepEqual({
      enabled: cleanState.enabled,
      loading: cleanState.loading,
      stale: cleanState.stale,
      degraded: cleanState.degraded,
      error: cleanState.error,
      updatedAt: cleanState.updatedAt,
      stationCount: cleanState.stationCount,
      selected: cleanState.selected,
      audioState: cleanState.audioState,
      voiceDucked: cleanState.voiceDucked,
      voiceRestoring: cleanState.voiceRestoring,
      acceptedCatalogGeneration: cleanState.acceptedCatalogGeneration,
    }, {
      enabled: false,
      loading: false,
      stale: false,
      degraded: false,
      error: null,
      updatedAt: null,
      stationCount: 0,
      selected: null,
      audioState: 'stopped',
      voiceDucked: false,
      voiceRestoring: false,
      acceptedCatalogGeneration: null,
    });
    assert.equal(getRadioAcceptedCatalogSnapshot().generation, null);

    resolveFetch(new Response(JSON.stringify({
      stations: [lateStation],
      stale: false,
      degraded: false,
      acceptedGeneration: 99,
      catalogInstance: 'qa-instance-a',
      updatedAt: new Date().toISOString(),
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    await pending;
    assert.deepEqual(getRadioUIState(), cleanState, 'retired update completion is inert after re-init');
  } finally {
    globalThis.fetch = originalFetch;
    radioLayer.destroy();
  }
});
