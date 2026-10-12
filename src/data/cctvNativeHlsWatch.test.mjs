import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HLS_CONNECT_TIMEOUT_MS, HLS_REATTACH_BASE_DELAY_MS } from './cctvConstants.js';
import { watchNativeHls } from './cctvNativeHlsWatch.js';

function setup(canRun = () => true) {
  const listeners = {};
  const timers = [];
  const states = [];
  const video = {
    loads: 0,
    load() { this.loads += 1; },
    addEventListener(name, fn) { listeners[name] = fn; },
    removeEventListener(name) { delete listeners[name]; },
  };
  const stop = watchNativeHls(video, {
    onState: (state, info) => states.push([state, info.attempt, info.reason]),
    canRun,
    timers: {
      setTimeout: (fn, ms) => {
        const t = { ms, cleared: false };
        t.fn = () => { t.cleared = true; fn(); };
        timers.push(t);
        return t;
      },
      clearTimeout: (t) => { t.cleared = true; },
    },
  });
  const live = () => timers.filter((t) => !t.cleared);
  return { listeners, timers, states, video, stop, live };
}

test('a native feed that never plays is reported as no-data and reloaded after backoff', () => {
  const s = setup();
  assert.equal(s.live().at(-1).ms, HLS_CONNECT_TIMEOUT_MS);
  s.live().at(-1).fn();
  assert.deepEqual(s.states.at(-1), ['retrying', 1, 'no-data']);
  assert.equal(s.live().at(-1).ms, HLS_REATTACH_BASE_DELAY_MS);
  s.live().at(-1).fn();
  assert.equal(s.video.loads, 1);
  assert.deepEqual(s.states.at(-1), ['connecting', 1, 'no-data']);
});

test('playing resets the attempt and cancels the timeout', () => {
  const s = setup();
  s.live().at(-1).fn();
  s.listeners.playing();
  assert.deepEqual(s.states.at(-1), ['live', 0, null]);
  assert.equal(s.live().length, 0);
});

test('a media error counts as a failed attempt immediately', () => {
  const s = setup();
  s.listeners.error();
  assert.deepEqual(s.states.at(-1), ['retrying', 1, 'no-data']);
});

test('reload waits while the camera is inactive; stop silences everything', () => {
  const state = { active: false };
  const s = setup(() => state.active);
  s.live().at(-1).fn();
  s.live().at(-1).fn();
  assert.equal(s.video.loads, 0);
  s.stop();
  assert.equal(s.live().length, 0);
  assert.equal(Object.keys(s.listeners).length, 0);
});
