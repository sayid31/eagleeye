import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  HLS_CONNECT_TIMEOUT_MS,
  HLS_REATTACH_BASE_DELAY_MS,
  HLS_REATTACH_MAX_DELAY_MS,
  HLS_REATTACH_OFFLINE_MAX_DELAY_MS,
  HLS_STALL_RESTART_MS,
} from './cctvConstants.js';
import { createFlvSelfHeal } from './cctvFlvSelfHeal.js';

const EVENTS = { ERROR: 'error' };

function fakePlayer() {
  const handlers = {};
  return {
    calls: [],
    on(event, fn) { handlers[event] = fn; },
    play() { this.calls.push('play'); return Promise.resolve(); },
    pause() { this.calls.push('pause'); },
    unload() { this.calls.push('unload'); },
    detachMediaElement() { this.calls.push('detach'); },
    destroy() { this.calls.push('destroy'); },
    fire(type, detail) { handlers[EVENTS.ERROR]?.(type, detail); },
  };
}

function harness(overrides = {}) {
  const clock = { t: 0 };
  const timeouts = [];
  const intervals = [];
  const players = [];
  const states = [];
  const listeners = new Set();
  const video = {
    paused: false,
    currentTime: 0,
    addEventListener: (_name, fn) => listeners.add(fn),
    removeEventListener: (_name, fn) => listeners.delete(fn),
  };
  const heal = createFlvSelfHeal({
    createPlayer: () => { const p = fakePlayer(); players.push(p); return p; },
    events: EVENTS,
    video,
    onState: (state, info) => states.push([state, info.attempt, info.reason]),
    now: () => clock.t,
    timers: {
      setTimeout: (fn, ms) => { const h = { fn, ms, cleared: false }; timeouts.push(h); return h; },
      clearTimeout: (h) => { h.cleared = true; },
      setInterval: (fn) => { const h = { fn }; intervals.push(h); return h; },
      clearInterval: () => {},
    },
    ...overrides,
  });
  const playing = () => listeners.forEach((fn) => fn());
  return { heal, clock, timeouts, intervals, players, states, video, listeners, playing };
}

test('start builds one player, plays it and reports connecting, then live on the first frame', () => {
  const h = harness();
  h.heal.start();
  assert.equal(h.players.length, 1);
  assert.deepEqual(h.players[0].calls, ['play']);
  assert.deepEqual(h.states, [['connecting', 0, null]]);
  h.playing();
  assert.deepEqual(h.states.at(-1), ['live', 0, null]);
});

test('a player error tears the player down and schedules a rebuild with backoff', () => {
  const h = harness();
  h.heal.start();
  h.players[0].fire('NetworkError', 'NetworkUnrecoverableEarlyEof');
  assert.deepEqual(h.players[0].calls, ['play', 'pause', 'unload', 'detach', 'destroy']);
  assert.deepEqual(h.states.at(-1), ['retrying', 1, 'NetworkError:NetworkUnrecoverableEarlyEof']);
  assert.equal(h.timeouts.at(-1).ms, HLS_REATTACH_BASE_DELAY_MS);
  h.timeouts.at(-1).fn();
  assert.equal(h.players.length, 2);
  h.players[1].fire('MediaError', 'x');
  assert.equal(h.timeouts.at(-1).ms, HLS_REATTACH_BASE_DELAY_MS * 2);
});

test('a stale player cannot trigger a rebuild after it was replaced', () => {
  const h = harness();
  h.heal.start();
  const first = h.players[0];
  first.fire('NetworkError', 'a');
  h.timeouts.at(-1).fn();
  const before = h.timeouts.length;
  first.fire('NetworkError', 'late');
  assert.equal(h.timeouts.length, before);
});

test('going live refills the retry budget', () => {
  const h = harness();
  h.heal.start();
  h.players[0].fire('NetworkError', 'a');
  h.timeouts.at(-1).fn();
  h.playing();
  h.players[1].fire('NetworkError', 'b');
  assert.equal(h.timeouts.at(-1).ms, HLS_REATTACH_BASE_DELAY_MS);
});

test('backoff is capped, and capped higher for a camera the proxy reports offline', () => {
  const run = (offline) => {
    const h = harness({ isSourceOffline: () => offline });
    h.heal.start();
    for (let i = 0; i < 12; i += 1) {
      h.players.at(-1).fire('NetworkError', 'x');
      if (i < 11) h.timeouts.at(-1).fn();
    }
    return h.timeouts.at(-1).ms;
  };
  assert.equal(run(false), HLS_REATTACH_MAX_DELAY_MS);
  assert.equal(run(true), HLS_REATTACH_OFFLINE_MAX_DELAY_MS);
});

test('a connection that never delivers a frame is rebuilt as no-data', () => {
  const h = harness();
  h.heal.start();
  h.clock.t = HLS_CONNECT_TIMEOUT_MS;
  h.intervals[0].fn();
  assert.deepEqual(h.states.at(-1), ['retrying', 1, 'no-data']);
});

test('a live feed whose playhead freezes is rebuilt as stalled', () => {
  const h = harness();
  h.heal.start();
  h.playing();
  h.intervals[0].fn();
  h.clock.t = HLS_STALL_RESTART_MS;
  h.intervals[0].fn();
  assert.deepEqual(h.states.at(-1), ['retrying', 1, 'stalled']);
});

test('an inactive camera is not rebuilt while hidden or inactive, and rebuilds wait for canRun', () => {
  let active = true;
  const h = harness({ canRun: () => active });
  h.heal.start();
  h.playing();
  active = false;
  h.clock.t = HLS_STALL_RESTART_MS * 2;
  h.intervals[0].fn();
  assert.equal(h.states.at(-1)[0], 'live');
  h.playing();
  active = true;
  h.players[0].fire('NetworkError', 'x');
  active = false;
  h.timeouts.at(-1).fn();
  assert.equal(h.players.length, 1);
  assert.equal(h.timeouts.at(-1).ms, HLS_REATTACH_BASE_DELAY_MS);
});

test('stop destroys the player, cancels the retry timer and detaches the playing listener', () => {
  const h = harness();
  h.heal.start();
  h.players[0].fire('NetworkError', 'x');
  h.heal.stop();
  assert.equal(h.timeouts.at(-1).cleared, true);
  h.heal.start();
  assert.equal(h.players.length, 1);
  const live = harness();
  live.heal.start();
  live.heal.stop();
  assert.equal(live.listeners.size, 0);
  assert.equal(live.players[0].calls.at(-1), 'destroy');
});

test('a throwing destroy is logged, not swallowed, and the rebuild still happens', () => {
  const h = harness();
  h.heal.start();
  h.players[0].destroy = () => { throw new Error('boom'); };
  const warnings = [];
  const original = console.warn;
  console.warn = (...args) => warnings.push(args);
  try {
    h.players[0].fire('NetworkError', 'x');
  } finally {
    console.warn = original;
  }
  assert.equal(warnings.length, 1);
  assert.equal(h.states.at(-1)[0], 'retrying');
});
