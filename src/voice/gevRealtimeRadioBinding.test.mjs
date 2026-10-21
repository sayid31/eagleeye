// Regression guard for the voice <-> Radio wiring across LAZY layer resolution.
//
// `radio` is a registerLazy entry (src/main.js), so its module is null until the
// first lifecycle touch. The controller used to read `entry.module` ONCE in
// initGevVoiceCommands and store the result, which pinned that null for the
// controller's whole life. Every consumer uses optional chaining
// (`this.radioLayer?.setVoiceDucked?.(...)`), so the entire ducking/handoff
// contract no-opped in complete silence — no error, no log, just voice never
// pausing Radio and a manual Play never taking the speaker back.
//
// These tests construct the controller BEFORE the lazy module resolves, which is
// exactly the real boot order, and assert the wiring arrives anyway.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DataLayerManager } from '../data/manager.js';
import { GevRealtimeController } from './gevRealtime.js';

/** Minimal voice-control DOM stand-in; the controller only touches these. */
function stubUi() {
  const el = () => ({
    addEventListener() {}, removeEventListener() {}, setAttribute() {},
    classList: { toggle() {}, add() {}, remove() {} },
    querySelectorAll: () => [],
    dataset: {}, style: {}, textContent: '', title: '', hidden: false, remove() {},
  });
  return {
    root: el(), button: el(), label: el(), status: el(), detail: el(),
    errorDetail: el(), hint: el(), tierButton: el(), costReadout: el(),
  };
}

/**
 * A lazily-registered `radio` layer whose module appears only on first enable,
 * mirroring registerLazy + _ensureModuleResolved.
 */
function lazyRadioManager() {
  const calls = { ducked: [], paused: [], subscribed: 0 };
  let emitPlaybackControl = null;
  const radioModule = {
    id: 'radio',
    name: 'Radio',
    async init() {},
    async enable() {},
    async disable() {},
    async update() {},
    destroy() {},
    getUIState: () => ({ enabled: true, audioState: 'playing' }),
    setVoiceDucked(next) { calls.ducked.push(next); },
    pause(opts) { calls.paused.push(opts); },
    subscribe() { return () => {}; },
    subscribePlaybackControls(listener) {
      calls.subscribed += 1;
      emitPlaybackControl = listener;
      return () => { emitPlaybackControl = null; };
    },
  };
  const dataManager = new DataLayerManager({});
  dataManager.registerLazy({
    id: 'radio',
    name: 'Radio',
    loader: async () => radioModule,
  });
  return {
    dataManager,
    radioModule,
    calls,
    emit: (event) => emitPlaybackControl?.(event),
    isSubscribed: () => Boolean(emitPlaybackControl),
  };
}

function makeController(dataManager, extra = {}) {
  const controller = new GevRealtimeController({
    ui: stubUi(),
    dataManager,
    runner: async () => ({ ok: true }),
    ...extra,
  });
  controller.debugLog = () => {};
  return controller;
}

test('radioLayer resolves after the lazy radio module loads, not just at construction', async () => {
  const { dataManager, radioModule } = lazyRadioManager();
  const controller = makeController(dataManager);

  // Real boot order: the controller exists while `radio` is still unresolved.
  assert.equal(dataManager.layers.get('radio').module, null, 'radio starts unresolved');
  assert.equal(controller.radioLayer, null, 'no module yet, so nothing to return');

  await dataManager.setEnabled('radio', true);

  assert.equal(controller.radioLayer, radioModule, 'the live module is read through, not a pinned null');
});

test('voice ducking reaches the radio layer enabled after the controller was built', async () => {
  const { dataManager, calls } = lazyRadioManager();
  const controller = makeController(dataManager);

  // Pre-resolution ducking still cannot reach a module that does not exist,
  // but it must not throw and must not corrupt the controller's own flag.
  controller.setRadioVoiceDucking(true);
  assert.deepEqual(calls.ducked, [], 'nothing to notify while unresolved');
  assert.equal(controller.radioVoiceDucked, true, 'controller still tracks its own intent');

  controller.setRadioVoiceDucking(false);
  await dataManager.setEnabled('radio', true);

  controller.setRadioVoiceDucking(true);
  controller.setRadioVoiceDucking(false);
  assert.deepEqual(calls.ducked, [true, false], 'ducking now lands on the real layer');
});

test('pauseRadioForVoice pauses a station on a layer enabled after construction', async () => {
  const { dataManager, calls } = lazyRadioManager();
  const controller = makeController(dataManager);
  await dataManager.setEnabled('radio', true);

  controller.pauseRadioForVoice();

  assert.equal(calls.paused.length, 1, 'the layer was actually asked to pause');
  assert.equal(calls.paused[0].origin, 'voice-duck', 'paused for voice ownership, not by the user');
});

test('the playback-control subscription installs when the lazy module resolves', async () => {
  const { dataManager, calls, isSubscribed } = lazyRadioManager();
  const controller = makeController(dataManager);

  assert.equal(calls.subscribed, 0, 'nothing to subscribe to before resolution');
  assert.equal(controller.radioControlUnsubscribe, null);
  assert.notEqual(controller.radioResolutionUnsubscribe, null, 'a resolution watcher is armed instead');

  await dataManager.setEnabled('radio', true);

  assert.equal(calls.subscribed, 1, 'subscribed exactly once, on resolution');
  assert.equal(typeof controller.radioControlUnsubscribe, 'function');
  assert.equal(controller.radioResolutionUnsubscribe, null, 'the watcher retires after it fires');
  assert.equal(isSubscribed(), true);
});

test('a user Play on a late-resolved layer hands the speaker back to Radio', async () => {
  const { dataManager, emit } = lazyRadioManager();
  const controller = makeController(dataManager);
  await dataManager.setEnabled('radio', true);

  const stopCalls = [];
  controller.stop = (opts) => { stopCalls.push(opts || {}); };
  controller.isActive = () => true;

  emit({ action: 'play', origin: 'user', attemptId: 'attempt-1' });

  assert.equal(stopCalls.length, 1, 'the voice session yields to explicit playback');
  assert.equal(stopCalls[0].preserveRadioPlayback, true, 'without tearing down the stream the user just started');
});

test('a user pause on a late-resolved layer cancels a pending voice handoff', async () => {
  const { dataManager, emit } = lazyRadioManager();
  const controller = makeController(dataManager);
  await dataManager.setEnabled('radio', true);

  let cancelled = 0;
  controller.cancelRadioHandoff = () => { cancelled += 1; };

  emit({ action: 'pause', origin: 'user', attemptId: 'attempt-1' });
  emit({ action: 'stop', origin: 'user', attemptId: 'attempt-2' });

  assert.equal(cancelled, 2, 'both explicit silencing actions cancel the handoff');
});

test('a voice-origin playback control is not mistaken for a user takeover', async () => {
  const { dataManager, emit } = lazyRadioManager();
  const controller = makeController(dataManager);
  await dataManager.setEnabled('radio', true);

  const stopCalls = [];
  let cancelled = 0;
  controller.stop = (opts) => { stopCalls.push(opts || {}); };
  controller.cancelRadioHandoff = () => { cancelled += 1; };
  controller.isActive = () => true;

  emit({ action: 'play', origin: 'voice', attemptId: 'attempt-1' });
  emit({ action: 'pause', origin: 'voice-duck', attemptId: 'attempt-1' });

  assert.deepEqual(stopCalls, [], 'the voice session does not stop itself');
  assert.equal(cancelled, 0, 'and does not cancel its own handoff');
});

test('an explicitly injected radioLayer still wins over the live lookup', async () => {
  // The existing suite constructs controllers with hand-rolled radio doubles and
  // no dataManager at all; that injection path must keep working unchanged.
  const { dataManager, radioModule } = lazyRadioManager();
  const injected = { ...radioModule, setVoiceDucked() {} };
  const controller = makeController(dataManager, { radioLayer: injected });
  await dataManager.setEnabled('radio', true);

  assert.equal(controller.radioLayer, injected, 'the injected double is not shadowed by the real module');
});

test('full teardown drops the resolution watcher of a layer that never loaded', () => {
  const { dataManager } = lazyRadioManager();
  const controller = makeController(dataManager);
  assert.notEqual(controller.radioResolutionUnsubscribe, null);

  controller.stop({ removeUi: true });

  assert.equal(controller.radioResolutionUnsubscribe, null, 'no live callback is left pointing into the manager');
});
