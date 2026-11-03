// src/voice/gevLiveRadio.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createLiveRadioBridge,
  shouldPauseRadioForVoice,
  shouldStopVoiceAfterRadioTool,
  silenceRadioForVoice,
  startPreparedRadioAfterPlaybackReady,
} from './gevLiveRadio.js';

/** A dataManager double whose radio module can resolve late (registerLazy). */
function fakeDataManager(radioModule = null) {
  const subscribers = new Set();
  const entry = { module: radioModule };
  return {
    entry,
    layers: new Map([['radio', entry]]),
    subscribe(cb) { subscribers.add(cb); return () => subscribers.delete(cb); },
    emit(change) { [...subscribers].forEach((cb) => cb(change)); },
    subscriberCount: () => subscribers.size,
  };
}

function fakeRadio() {
  const calls = [];
  let controlCb = null;
  return {
    calls,
    fireControl: (event) => controlCb?.(event),
    setVoiceDucked: (v) => calls.push(['duck', v]),
    pause: (o) => { calls.push(['pause', o.origin]); return true; },
    stopPlayback: (o) => calls.push(['stop', o.origin]),
    playForVoice: async () => { calls.push(['playForVoice']); return true; },
    subscribePlaybackControls: (cb) => { controlCb = cb; return () => { controlCb = null; }; },
  };
}

test('voice activation and speech pause Radio without an idle auto-resume', () => {
  assert.equal(shouldPauseRadioForVoice({ status: 'connecting' }), true);
  assert.equal(shouldPauseRadioForVoice({ status: 'executing' }), true);
  assert.equal(shouldPauseRadioForVoice({ status: 'listening', speaker: 'user' }), true);
  assert.equal(shouldPauseRadioForVoice({ status: 'listening', speaker: 'ai' }), true);
  assert.equal(shouldPauseRadioForVoice({ status: 'listening' }), false);
  assert.equal(shouldPauseRadioForVoice({ status: 'idle' }), false);
  assert.equal(shouldPauseRadioForVoice({ status: 'error' }), false);
});

test('successful Radio activation tools close voice after handing control to Radio', () => {
  for (const radioAction of ['play', 'resume', 'select', 'next', 'previous']) {
    assert.equal(shouldStopVoiceAfterRadioTool({ ok: true, action: 'control_radio', radioAction }), true);
  }
  assert.equal(shouldStopVoiceAfterRadioTool({ ok: true, action: 'control_radio', radioAction: 'enable' }), false);
  assert.equal(shouldStopVoiceAfterRadioTool({ ok: true, action: 'control_radio', radioAction: 'volume' }), false);
  assert.equal(shouldStopVoiceAfterRadioTool({ ok: false, action: 'control_radio', radioAction: 'play' }), false);
  assert.equal(shouldStopVoiceAfterRadioTool({ ok: true, action: 'control_cctv', radioAction: 'play' }), false);
});

test('silenceRadioForVoice ducks first, then pauses', () => {
  const order = [];
  const paused = silenceRadioForVoice({ duckRadio: () => order.push('duck'), pauseRadio: () => { order.push('pause'); return true; } });
  assert.deepEqual(order, ['duck', 'pause']);
  assert.equal(paused, true);
});

test('prepared Radio playback is verified under mute before voice closes', async () => {
  const order = [];
  const handoff = await startPreparedRadioAfterPlaybackReady(
    { ok: true, action: 'control_radio', radioAction: 'select', radioPlaybackRequested: true },
    {
      prepareRadio: async () => { order.push('radio-play-muted'); return true; },
      stopVoice: () => order.push('voice-stop'),
    },
  );
  assert.deepEqual(order, ['radio-play-muted', 'voice-stop']);
  assert.equal(handoff.handled, true);
  assert.equal(handoff.result.ok, true);
  assert.equal(handoff.result.audioState, 'playing');
});

test('failed or superseded Radio preflight keeps voice open and cancels audio', async () => {
  for (const scenario of [
    { started: false, current: true, cancelled: false },
    { started: true, current: false, cancelled: true },
  ]) {
    const order = [];
    const handoff = await startPreparedRadioAfterPlaybackReady(
      { ok: true, action: 'control_radio', radioPlaybackRequested: true },
      {
        prepareRadio: async () => scenario.started,
        isCurrent: () => scenario.current,
        cancelRadio: () => order.push('radio-cancel'),
        stopVoice: () => order.push('voice-stop'),
      },
    );
    assert.deepEqual(order, ['radio-cancel']);
    assert.equal(handoff.result.ok, false);
    assert.equal(Boolean(handoff.cancelled), scenario.cancelled);
  }
});

test('bridge ducks and pauses Radio while voice owns the speaker, releases on idle', () => {
  const radio = fakeRadio();
  const bridge = createLiveRadioBridge({ dataManager: fakeDataManager(radio), stopVoice() {}, isActive: () => true });
  bridge.onStatus('connecting');
  assert.deepEqual(radio.calls, [['duck', true], ['pause', 'voice-duck']]);
  bridge.onStatus('listening');
  assert.equal(radio.calls.length, 2, 'listening alone does not touch Radio');
  bridge.onStatus('idle');
  assert.deepEqual(radio.calls.at(-1), ['duck', false]);
});

test('bridge reads the lazily-resolved radio module live and binds controls once it appears', () => {
  const dm = fakeDataManager(null);
  let stopped = 0;
  const bridge = createLiveRadioBridge({ dataManager: dm, stopVoice: () => { stopped += 1; }, isActive: () => true });
  bridge.onStatus('connecting'); // radio unresolved: must not throw
  assert.equal(dm.subscriberCount(), 1, 'waits on the manager change stream');
  const radio = fakeRadio();
  dm.entry.module = radio;
  dm.emit({ layerId: 'radio' });
  assert.equal(dm.subscriberCount(), 0, 'resolution watcher released after binding');
  radio.fireControl({ action: 'play', origin: 'user' });
  assert.equal(stopped, 1, 'a user Play takes the speaker from voice');
});

test('a user Play does not stop an idle voice session, and non-user events are ignored', () => {
  const radio = fakeRadio();
  let stopped = 0;
  let active = false;
  createLiveRadioBridge({ dataManager: fakeDataManager(radio), stopVoice: () => { stopped += 1; }, isActive: () => active });
  radio.fireControl({ action: 'play', origin: 'user' });
  active = true;
  radio.fireControl({ action: 'play', origin: 'voice-duck' });
  radio.fireControl('pause');
  assert.equal(stopped, 0);
});

test('a play result with radioPlaybackRequested starts Radio muted, then closes voice', async () => {
  const radio = fakeRadio();
  const order = [];
  radio.playForVoice = async () => { order.push('play'); return true; };
  const bridge = createLiveRadioBridge({
    dataManager: fakeDataManager(radio),
    stopVoice: () => order.push('voice-stop'),
    isActive: () => true,
  });
  await bridge.onToolResult({ ok: true, action: 'control_radio', radioAction: 'play', radioPlaybackRequested: true });
  assert.deepEqual(order, ['play', 'voice-stop']);
  assert.deepEqual(radio.calls[0], ['duck', true], 'hard mute is reasserted before playback');
});

test('a failed Radio start leaves voice open and cancels the attempt', async () => {
  const radio = fakeRadio();
  radio.playForVoice = async () => false;
  let stopped = 0;
  const bridge = createLiveRadioBridge({ dataManager: fakeDataManager(radio), stopVoice: () => { stopped += 1; }, isActive: () => true });
  await bridge.onToolResult({ ok: true, action: 'control_radio', radioAction: 'play', radioPlaybackRequested: true });
  assert.equal(stopped, 0);
  assert.ok(radio.calls.some(([k, origin]) => k === 'stop' && origin === 'voice-cleanup'));
});

test('a non-play radio result never closes voice', async () => {
  let stopped = 0;
  const bridge = createLiveRadioBridge({ dataManager: fakeDataManager(fakeRadio()), stopVoice: () => { stopped += 1; }, isActive: () => true });
  await bridge.onToolResult({ ok: true, action: 'control_radio', radioAction: 'volume' });
  await bridge.onToolResult({ ok: false, action: 'control_radio', radioAction: 'play' });
  assert.equal(stopped, 0);
});

test('dispose unsubscribes and releases the duck', () => {
  const radio = fakeRadio();
  const bridge = createLiveRadioBridge({ dataManager: fakeDataManager(radio), stopVoice() {}, isActive: () => true });
  bridge.onStatus('connecting');
  bridge.dispose();
  assert.deepEqual(radio.calls.at(-1), ['duck', false]);
  radio.fireControl({ action: 'play', origin: 'user' }); // no-op: unsubscribed
});
