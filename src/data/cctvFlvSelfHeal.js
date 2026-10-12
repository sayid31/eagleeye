// Keeps one camera's mpegts.js (FLV) player alive. mpegts.js has no in-place
// recovery like hls.js's recoverMediaError()/loadSource(), so every fault means
// a full rebuild with the same exponential backoff the HLS controller uses. A
// watchdog covers streams that go quiet without ever raising an error: the
// source holds the connection open but sends no frames (measured 2026-10-12 on
// the Surakarta ATCS cameras that accept the TCP connection and then stay mute).

import {
  HLS_REATTACH_BASE_DELAY_MS,
  HLS_REATTACH_MAX_DELAY_MS,
  HLS_REATTACH_OFFLINE_MAX_DELAY_MS,
  HLS_STALL_CHECK_MS,
} from './cctvConstants.js';
import { nextReattachDelayMs } from './cctvHlsBackoff.js';
import { evaluateStall } from './cctvHlsStall.js';

/**
 * Creates the self-healing controller for one camera's FLV feed.
 *
 * States reported through `onState`: connecting (waiting for the first frame),
 * live (frames are playing), retrying (player torn down, rebuild scheduled).
 *
 * @param {Object} options
 * @param {() => Object} options.createPlayer - Builds a fresh, loaded mpegts.js player.
 * @param {Object} options.events - mpegts.js `Events` map.
 * @param {HTMLVideoElement} options.video
 * @param {(state: string, info: {attempt: number, reason: string|null}) => void} options.onState
 * @param {() => boolean} [options.canRun] - False while the feed should stay idle (inactive camera).
 * @param {() => boolean} [options.isSourceOffline] - True when the proxy reports the camera dead.
 * @param {() => boolean} [options.isPageVisible]
 * @param {() => number} [options.now]
 * @param {Object} [options.timers] - Injectable setTimeout/clearTimeout/setInterval/clearInterval.
 * @returns {{start: () => void, stop: () => void, getState: () => string|null}}
 */
export function createFlvSelfHeal({
  createPlayer,
  events,
  video,
  onState,
  canRun = () => true,
  isSourceOffline = () => false,
  isPageVisible = () => true,
  now = Date.now,
  timers = {},
}) {
  const setTimeoutFn = timers.setTimeout || setTimeout;
  const clearTimeoutFn = timers.clearTimeout || clearTimeout;
  const setIntervalFn = timers.setInterval || setInterval;
  const clearIntervalFn = timers.clearInterval || clearInterval;

  let player = null;
  let stopped = false;
  let state = null;
  let attempt = 0;
  let reason = null;
  let lastProgressAt = now();
  let lastPlayhead = null;
  let connectStartedAt = now();
  let retryTimer = null;
  let watchdog = null;
  let detachPlaying = null;

  function setState(next) {
    if (next === state && next !== 'retrying') return;
    state = next;
    onState(next, { attempt, reason });
  }

  function destroyPlayer() {
    detachPlaying?.();
    detachPlaying = null;
    const doomed = player;
    player = null;
    if (!doomed) return;
    try {
      doomed.pause();
      doomed.unload();
      doomed.detachMediaElement();
      doomed.destroy();
    } catch (error) {
      console.warn('[CCTV] FLV player destroy failed:', error);
    }
  }

  function rebuild(why) {
    reason = why;
    destroyPlayer();
    attempt += 1;
    setState('retrying');
    const maxMs = isSourceOffline() ? HLS_REATTACH_OFFLINE_MAX_DELAY_MS : HLS_REATTACH_MAX_DELAY_MS;
    retryTimer = setTimeoutFn(() => attach(), nextReattachDelayMs(attempt, {
      baseMs: HLS_REATTACH_BASE_DELAY_MS,
      maxMs,
    }));
  }

  function onPlaying() {
    attempt = 0;
    reason = null;
    lastProgressAt = now();
    setState('live');
  }

  function attach(isFirstAttach = false) {
    retryTimer = null;
    if (stopped) return;
    // Only rebuilds wait for the camera to be the active one; the first attach
    // matches the HLS path's always-attach behaviour.
    if (!isFirstAttach && !canRun()) {
      retryTimer = setTimeoutFn(() => attach(), HLS_REATTACH_BASE_DELAY_MS);
      return;
    }
    lastProgressAt = now();
    connectStartedAt = now();
    lastPlayhead = null;
    const mpegts = createPlayer();
    player = mpegts;
    mpegts.on(events.ERROR, (type, detail) => {
      if (player !== mpegts) return;
      rebuild(`${type}:${detail}`);
    });
    video.addEventListener('playing', onPlaying);
    detachPlaying = () => video.removeEventListener('playing', onPlaying);
    setState('connecting');
    Promise.resolve(mpegts.play()).catch(() => {});
  }

  function checkStall() {
    if (stopped || !player) return;
    const connecting = state === 'connecting';
    const idle = !canRun() || !isPageVisible() || (!connecting && video.paused);
    const verdict = evaluateStall({
      state, idle, now: now(), connectStartedAt, lastProgressAt, playhead: video.currentTime, lastPlayhead,
    });
    ({ connectStartedAt, lastProgressAt, lastPlayhead } = verdict);
    if (verdict.action === 'rebuild-no-data') rebuild('no-data');
    else if (verdict.action === 'recover') rebuild('stalled');
  }

  return {
    start() {
      if (stopped || watchdog !== null) return;
      attach(true);
      watchdog = setIntervalFn(checkStall, HLS_STALL_CHECK_MS);
    },
    stop() {
      stopped = true;
      if (retryTimer !== null) clearTimeoutFn(retryTimer);
      if (watchdog !== null) clearIntervalFn(watchdog);
      retryTimer = null;
      watchdog = null;
      destroyPlayer();
    },
    getState: () => state,
  };
}
