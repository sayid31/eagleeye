// Audio ownership, playback confirmation, and voice ducking.

import assert from 'node:assert/strict';
import test from 'node:test';
import {
  confirmRadioPlayback,
  DEFAULT_RADIO_FILTER,
  getRadioUIState,
  radioLayer,
  setRadioVolume,
  setRadioVoiceDucking,
} from './radio.js';

test('destroy and re-init reset Radio audio ownership, volume, filter, and telemetry', async () => {
  const originalAudio = globalThis.Audio;
  const audioInstances = [];
  globalThis.Audio = class FakeAudio {
    constructor() {
      this.volume = 0.8;
      this.listeners = new Map();
      this.srcRemoved = false;
      audioInstances.push(this);
    }

    addEventListener(type, listener) { this.listeners.set(type, listener); }
    pause() {}
    play() { return Promise.resolve(); }
    removeAttribute(name) { if (name === 'src') this.srcRemoved = true; }
    load() {}
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
    radioLayer.enable();
    radioLayer.setLifecyclePresentation({
      lifecycleState: 'enabled', enabled: true, uncertain: false,
    });
    assert.equal(audioInstances.length, 1);
    assert.equal(setRadioVolume(0.25), true);
    setRadioVoiceDucking(true, { restoreDelayMs: 5, restoreDurationMs: 5 });
    assert.equal(getRadioUIState().voiceDucked, true);
    assert.equal(getRadioUIState().effectiveVolume, 0);
    const oldAudio = audioInstances[0];

    radioLayer.destroy();
    assert.equal(oldAudio.srcRemoved, true);
    assert.equal(getRadioUIState().loading, false);
    assert.equal(getRadioUIState().stale, false);
    assert.equal(getRadioUIState().degraded, false);
    assert.equal(getRadioUIState().error, null);
    assert.equal(getRadioUIState().updatedAt, null);
    assert.equal(getRadioUIState().filter, DEFAULT_RADIO_FILTER);
    assert.equal(getRadioUIState().voiceDucked, false);
    assert.equal(getRadioUIState().voiceRestoring, false);
    assert.equal(getRadioUIState().volume, 0.8);
    assert.equal(getRadioUIState().effectiveVolume, 0.8);

    radioLayer.init(viewer);
    assert.equal(audioInstances.length, 2, 're-init creates a clean Audio session');
    const nextState = getRadioUIState();
    for (const eventName of ['playing', 'pause', 'waiting', 'error']) {
      oldAudio.listeners.get(eventName)?.();
      assert.deepEqual(getRadioUIState(), nextState, `discarded ${eventName} callback is inert`);
    }
  } finally {
    radioLayer.destroy();
    if (originalAudio === undefined) delete globalThis.Audio;
    else globalThis.Audio = originalAudio;
  }
});

test('late media errors after replacement or Pause cannot mutate the active station', async () => {
  const originalAudio = globalThis.Audio;
  const originalFetch = globalThis.fetch;
  const audioInstances = [];
  globalThis.Audio = class FakeAudio {
    constructor() {
      this.volume = 0.8;
      this.src = '';
      this.currentSrc = '';
      this.listeners = new Map();
      this.playCalls = 0;
      audioInstances.push(this);
    }

    addEventListener(type, listener) { this.listeners.set(type, listener); }
    pause() {}
    play() {
      this.playCalls += 1;
      this.currentSrc = this.src;
      return new Promise(() => {});
    }
    removeAttribute(name) { if (name === 'src') this.src = ''; }
    load() {}
  };
  const stationRows = [
    {
      id: '00000000-0000-4000-8000-000000000001',
      name: 'Primary station',
      lat: 30,
      lon: -97,
      streamUrl: 'https://radio.example.com/primary.mp3',
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
      id: '00000000-0000-4000-8000-000000000002',
      name: 'Fallback station',
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
  globalThis.fetch = async (url) => String(url).startsWith('/api/radio/click/')
    ? { ok: true }
    : {
      ok: true,
      json: async () => ({
        stations: stationRows,
        updatedAt: new Date().toISOString(),
        stale: false,
        degraded: false,
        acceptedGeneration: 1,
        catalogInstance: 'qa-instance-a',
      }),
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
    radioLayer.enable();
    await radioLayer.update();
    radioLayer.setLifecyclePresentation({
      lifecycleState: 'enabled',
      enabled: true,
      uncertain: true,
    });
    assert.equal(radioLayer.getUIState().presentationActive, false);
    assert.equal(radioLayer.selectStation(stationRows[0].id, {
      autoplay: true,
      origin: 'voice',
    }), false, 'uncertain lifecycle blocks direct station selection');
    assert.equal(radioLayer.cycleStation(1, {
      stationIds: stationRows.map(({ id }) => id),
      autoplay: false,
      rotate: true,
    }), false, 'uncertain lifecycle blocks cycling before camera or fallback mutation');
    assert.equal(await radioLayer.togglePlayback({ origin: 'user' }), false);
    assert.equal(radioLayer.getUIState().selected, null);
    assert.equal(audioInstances.reduce((sum, audio) => sum + audio.playCalls, 0), 0);
    radioLayer.setLifecyclePresentation({
      lifecycleState: 'enabled',
      enabled: true,
      uncertain: false,
    });
    void radioLayer.togglePlayback({ origin: 'user' });
    await Promise.resolve();
    const primaryAudio = audioInstances.at(-1);
    const loadingState = radioLayer.getUIState();
    assert.equal(loadingState.audioState, 'loading');
    assert.equal(loadingState.selected?.id, stationRows[0].id);

    radioLayer.selectStation(stationRows[1].id, {
      autoplay: true,
      focus: false,
      origin: 'user',
    });
    await Promise.resolve();
    const replacementAudio = audioInstances.at(-1);
    assert.notEqual(replacementAudio, primaryAudio);
    assert.equal(radioLayer.getUIState().selected?.id, stationRows[1].id);
    assert.equal(audioInstances.reduce((sum, audio) => sum + audio.playCalls, 0), 2);

    primaryAudio.currentSrc = '';
    primaryAudio.listeners.get('error')?.();
    assert.equal(radioLayer.getUIState().audioState, 'loading');
    assert.equal(radioLayer.getUIState().selected?.id, stationRows[1].id);
    assert.equal(audioInstances.reduce((sum, audio) => sum + audio.playCalls, 0), 2);

    const controlEvents = [];
    const unsubscribeControls = radioLayer.subscribePlaybackControls((event) => {
      const observed = radioLayer.getUIState();
      const cleanupResult = radioLayer.stopPlayback({
        origin: 'voice-cleanup',
        attemptId: event.attemptId,
      });
      controlEvents.push({
        action: event.action,
        observedAudioState: observed.audioState,
        observedStationId: observed.playingStationId,
        cleanupResult,
      });
    });
    assert.equal(radioLayer.pause({ origin: 'user' }), true);
    replacementAudio.listeners.get('error')?.();
    await Promise.resolve();

    const state = radioLayer.getUIState();
    assert.equal(state.audioState, 'paused');
    assert.equal(state.selected?.id, stationRows[1].id);
    assert.equal(state.playingStationId, stationRows[1].id);
    assert.equal(replacementAudio.src, stationRows[1].streamUrl);
    assert.deepEqual(controlEvents, [{
      action: 'pause',
      observedAudioState: 'paused',
      observedStationId: stationRows[1].id,
      cleanupResult: false,
    }]);

    void radioLayer.togglePlayback({ origin: 'user' });
    await Promise.resolve();
    const resumedAudio = audioInstances.at(-1);
    assert.equal(radioLayer.getUIState().audioState, 'loading');
    assert.equal(radioLayer.stopPlayback({ origin: 'user' }), true);
    assert.deepEqual(controlEvents[1], {
      action: 'stop',
      observedAudioState: 'stopped',
      observedStationId: null,
      cleanupResult: false,
    });
    assert.equal(radioLayer.getUIState().audioState, 'stopped');
    assert.equal(resumedAudio.src, '');
    unsubscribeControls();
    assert.equal(audioInstances.reduce((sum, audio) => sum + audio.playCalls, 0), 3);
  } finally {
    radioLayer.destroy();
    globalThis.fetch = originalFetch;
    if (originalAudio === undefined) delete globalThis.Audio;
    else globalThis.Audio = originalAudio;
  }
});

test('voice ducking preserves the user-owned Radio volume', async () => {
  radioLayer.destroy();
  radioLayer.enable();
  radioLayer.setLifecyclePresentation({
    lifecycleState: 'enabled', enabled: true, uncertain: false,
  });
  try {
    setRadioVoiceDucking(true);
    let state = getRadioUIState();
    assert.equal(state.voiceDucked, true);
    assert.equal(state.volume, 0.8);
    assert.equal(state.effectiveVolume, 0);
    assert.equal(setRadioVolume(0.42), true);
    state = getRadioUIState();
    assert.equal(state.voiceDucked, true);
    assert.equal(state.volume, 0.42);
    assert.equal(state.effectiveVolume, 0);
    setRadioVoiceDucking(false, { restoreDelayMs: 0, restoreDurationMs: 0 });
    await new Promise((resolve) => setTimeout(resolve, 25));
    state = getRadioUIState();
    assert.equal(state.voiceDucked, false);
    assert.equal(state.voiceRestoring, false);
    assert.equal(state.volume, 0.42);
    assert.equal(state.effectiveVolume, 0.42);
  } finally {
    radioLayer.destroy();
  }
});

test('Radio volume requires certain enabled lifecycle authority', () => {
  radioLayer.destroy();
  assert.equal(setRadioVolume(0.2), false);
  assert.equal(getRadioUIState().volume, 0.8);

  radioLayer.enable();
  for (const presentation of [
    { lifecycleState: 'enabling', enabled: false, uncertain: false },
    { lifecycleState: 'disabling', enabled: true, uncertain: false },
    { lifecycleState: 'enabled', enabled: true, uncertain: true },
  ]) {
    radioLayer.setLifecyclePresentation(presentation);
    assert.equal(setRadioVolume(0.2), false, presentation.lifecycleState);
    assert.equal(getRadioUIState().volume, 0.8);
  }

  radioLayer.setLifecyclePresentation({
    lifecycleState: 'enabled', enabled: true, uncertain: false,
  });
  assert.equal(setRadioVolume(0.2), true);
  assert.equal(getRadioUIState().volume, 0.2);
  radioLayer.destroy();
});

test('voice playback confirmation waits for playing and requires a hard duck', async () => {
  let listener = () => {};
  let state = {
    audioState: 'loading',
    playingStationId: 'news',
    voiceDucked: true,
  };
  const confirmed = confirmRadioPlayback({
    startPlayback: async () => {
      state = { ...state, audioState: 'playing' };
      listener(state);
      return true;
    },
    subscribe: (next) => {
      listener = next;
      next({ ...state, audioState: 'stopped' });
      return () => { listener = () => {}; };
    },
    getState: () => state,
    timeoutMs: 50,
  });
  assert.equal(await confirmed, true);

  state = { ...state, voiceDucked: false };
  assert.equal(await confirmRadioPlayback({
    startPlayback: async () => true,
    subscribe: (next) => {
      next(state);
      return () => {};
    },
    getState: () => state,
    timeoutMs: 5,
  }), false);
});

test('voice playback confirmation accepts fallback buffering but times out safely', async () => {
  let listener = () => {};
  const state = {
    audioState: 'loading',
    playingStationId: 'fallback',
    voiceDucked: true,
  };
  const startedAt = Date.now();
  const confirmed = await confirmRadioPlayback({
    startPlayback: async () => false,
    subscribe: (next) => {
      listener = next;
      next(state);
      return () => { listener = () => {}; };
    },
    getState: () => state,
    timeoutMs: 10,
  });
  assert.equal(confirmed, false);
  assert.ok(Date.now() - startedAt >= 8);
});
