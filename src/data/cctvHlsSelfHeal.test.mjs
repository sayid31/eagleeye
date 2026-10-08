import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  HLS_MAX_MEDIA_ERROR_RECOVERIES,
  HLS_MAX_NETWORK_ERROR_RECOVERIES,
  HLS_REATTACH_BASE_DELAY_MS,
  HLS_REATTACH_MAX_DELAY_MS,
  HLS_REATTACH_OFFLINE_MAX_DELAY_MS,
  HLS_STALL_CHECK_MS,
  HLS_STALL_RESTART_MS,
} from './cctvConstants.js';
import { createHlsSelfHeal, nextReattachDelayMs } from './cctvHlsSelfHeal.js';

const EVENTS = { FRAG_BUFFERED: 'frag', MANIFEST_PARSED: 'manifest', ERROR: 'error' };
const ERROR_TYPES = { NETWORK_ERROR: 'net', MEDIA_ERROR: 'media', OTHER_ERROR: 'other' };

function fakePlayer() {
  const handlers = {};
  return {
    handlers,
    calls: [],
    on(event, fn) { handlers[event] = fn; },
    loadSource(url) { this.calls.push(['loadSource', url]); },
    attachMedia() { this.calls.push(['attachMedia']); },
    recoverMediaError() { this.calls.push(['recoverMediaError']); },
    destroy() { this.calls.push(['destroy']); },
    fire(event, data) { handlers[event]?.(event, data); },
  };
}

function harness(overrides = {}) {
  const clock = { t: 0 };
  const timeouts = [];
  const intervals = [];
  const players = [];
  const states = [];
  const video = { paused: false, currentTime: 0, play: () => Promise.resolve() };
  const current = { player: null };
  const heal = createHlsSelfHeal({
    createPlayer: () => { const p = fakePlayer(); players.push(p); return p; },
    events: EVENTS,
    errorTypes: ERROR_TYPES,
    url: '/api/cctv/media/x',
    video,
    onPlayer: (p) => { current.player = p; },
    onState: (state, info) => states.push([state, info.attempt]),
    now: () => clock.t,
    timers: {
      setTimeout: (fn, ms) => { const h = { fn, ms, cleared: false }; timeouts.push(h); return h; },
      clearTimeout: (h) => { h.cleared = true; },
      setInterval: (fn) => { const h = { fn }; intervals.push(h); return h; },
      clearInterval: () => {},
    },
    ...overrides,
  });
  return { heal, clock, timeouts, intervals, players, states, video, current };
}

const fatal = (type) => ({ fatal: true, type });

test('backoff doubles per attempt and is capped', () => {
  const limits = { baseMs: 2000, maxMs: 30000 };
  assert.deepEqual([1, 2, 3, 4, 5, 6].map((n) => nextReattachDelayMs(n, limits)), [2000, 4000, 8000, 16000, 30000, 30000]);
});

test('start attaches one player and reports connecting then live', () => {
  const h = harness();
  h.heal.start();
  assert.equal(h.players.length, 1);
  assert.deepEqual(h.players[0].calls, [['loadSource', '/api/cctv/media/x'], ['attachMedia']]);
  h.players[0].fire('frag');
  assert.deepEqual(h.states, [['connecting', 0], ['live', 0]]);
});

test('fatal network error restarts from the live edge with loadSource, not startLoad', () => {
  const h = harness();
  h.heal.start();
  const p = h.players[0];
  assert.equal(typeof p.startLoad, 'undefined');
  p.fire('error', fatal('net'));
  assert.deepEqual(p.calls.at(-1), ['loadSource', '/api/cctv/media/x']);
  assert.equal(h.heal.getState(), 'recovering');
  assert.equal(h.players.length, 1);
});

test('fatal media error uses recoverMediaError within its budget', () => {
  const h = harness();
  h.heal.start();
  h.players[0].fire('error', fatal('media'));
  assert.deepEqual(h.players[0].calls.at(-1), ['recoverMediaError']);
});

test('non-fatal errors are ignored', () => {
  const h = harness();
  h.heal.start();
  h.players[0].fire('error', { fatal: false, type: 'net' });
  assert.equal(h.heal.getState(), 'connecting');
});

test('after the network budget is spent the player is rebuilt, not abandoned', () => {
  const h = harness();
  h.heal.start();
  const first = h.players[0];
  for (let i = 0; i < HLS_MAX_NETWORK_ERROR_RECOVERIES; i += 1) first.fire('error', fatal('net'));
  assert.equal(h.heal.getState(), 'recovering');
  first.fire('error', fatal('net'));
  assert.equal(h.heal.getState(), 'retrying');
  assert.equal(first.calls.at(-1)[0], 'destroy');
  assert.equal(h.current.player, null);
  assert.equal(h.timeouts.at(-1).ms, HLS_REATTACH_BASE_DELAY_MS);

  h.timeouts.at(-1).fn();
  assert.equal(h.players.length, 2);
  assert.equal(h.current.player, h.players[1]);
  assert.equal(h.heal.getState(), 'connecting');
});

test('media budget exhaustion also rebuilds', () => {
  const h = harness();
  h.heal.start();
  for (let i = 0; i <= HLS_MAX_MEDIA_ERROR_RECOVERIES; i += 1) h.players[0].fire('error', fatal('media'));
  assert.equal(h.heal.getState(), 'retrying');
});

test('consecutive failed rebuilds back off, and a buffered fragment resets the ladder', () => {
  const h = harness();
  h.heal.start();
  const exhaust = (p) => { for (let i = 0; i <= HLS_MAX_MEDIA_ERROR_RECOVERIES; i += 1) p.fire('error', fatal('media')); };
  exhaust(h.players[0]);
  h.timeouts.at(-1).fn();
  exhaust(h.players[1]);
  assert.equal(h.timeouts.at(-1).ms, HLS_REATTACH_BASE_DELAY_MS * 2);
  h.timeouts.at(-1).fn();
  h.players[2].fire('frag');
  exhaust(h.players[2]);
  assert.equal(h.timeouts.at(-1).ms, HLS_REATTACH_BASE_DELAY_MS);
});

test('a source the proxy reports offline is probed on the slower ladder', () => {
  const h = harness({ isSourceOffline: () => true });
  h.heal.start();
  let delay = 0;
  for (let n = 0; n < 12; n += 1) {
    const p = h.players.at(-1);
    for (let i = 0; i <= HLS_MAX_MEDIA_ERROR_RECOVERIES; i += 1) p.fire('error', fatal('media'));
    delay = h.timeouts.at(-1).ms;
    h.timeouts.at(-1).fn();
  }
  assert.equal(delay, HLS_REATTACH_OFFLINE_MAX_DELAY_MS);
  assert.ok(HLS_REATTACH_OFFLINE_MAX_DELAY_MS > HLS_REATTACH_MAX_DELAY_MS);
});

test('rebuild waits while the camera is inactive and attaches once it is active again', () => {
  const state = { active: true };
  const h = harness({ canRun: () => state.active });
  h.heal.start();
  for (let i = 0; i <= HLS_MAX_MEDIA_ERROR_RECOVERIES; i += 1) h.players[0].fire('error', fatal('media'));
  state.active = false;
  h.timeouts.at(-1).fn();
  assert.equal(h.players.length, 1);
  state.active = true;
  h.timeouts.at(-1).fn();
  assert.equal(h.players.length, 2);
});

test('stop destroys the player, cancels the pending rebuild, and ignores late events', () => {
  const h = harness();
  h.heal.start();
  const p = h.players[0];
  for (let i = 0; i <= HLS_MAX_MEDIA_ERROR_RECOVERIES; i += 1) p.fire('error', fatal('media'));
  const pending = h.timeouts.at(-1);
  h.heal.stop();
  assert.equal(pending.cleared, true);
  pending.fn();
  assert.equal(h.players.length, 1);
  p.fire('error', fatal('media'));
  assert.equal(h.heal.getState(), 'retrying');
});

test('watchdog restarts a feed whose playhead never moves', () => {
  const h = harness();
  h.heal.start();
  const tick = () => { h.clock.t += HLS_STALL_CHECK_MS; h.intervals[0].fn(); };
  while (h.clock.t < HLS_STALL_RESTART_MS - HLS_STALL_CHECK_MS) tick();
  assert.equal(h.heal.getState(), 'connecting');
  tick();
  tick();
  assert.equal(h.heal.getState(), 'recovering');
  assert.deepEqual(h.players[0].calls.at(-1), ['loadSource', '/api/cctv/media/x']);
});

test('watchdog stays quiet while the playhead advances, the video is paused, or the page is hidden', () => {
  const h = harness({ isPageVisible: () => false });
  h.heal.start();
  for (let i = 0; i < 20; i += 1) { h.clock.t += HLS_STALL_CHECK_MS; h.intervals[0].fn(); }
  assert.equal(h.heal.getState(), 'connecting');

  const moving = harness();
  moving.heal.start();
  for (let i = 0; i < 20; i += 1) {
    moving.clock.t += HLS_STALL_CHECK_MS;
    moving.video.currentTime += 1;
    moving.intervals[0].fn();
  }
  assert.equal(moving.heal.getState(), 'connecting');
});
