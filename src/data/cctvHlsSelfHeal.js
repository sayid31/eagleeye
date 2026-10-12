// Keeps one camera's hls.js player alive: bounded in-place recovery first, then
// a full rebuild with exponential backoff, plus a watchdog for streams that go
// quiet without ever raising an error. Network recovery uses `loadSource()`
// (re-fetches the playlist, rejoins the live edge) rather than `startLoad()`,
// which resumes from a stale playhead whose segments already left the window.

import {
  HLS_REATTACH_BASE_DELAY_MS,
  HLS_REATTACH_MAX_DELAY_MS,
  HLS_REATTACH_OFFLINE_MAX_DELAY_MS,
  HLS_STALL_CHECK_MS,
} from './cctvConstants.js';
import { nextReattachDelayMs } from './cctvHlsBackoff.js';
import { chooseRecovery, evaluateStall } from './cctvHlsStall.js';

/**
 * Creates the self-healing controller for one camera's HLS feed.
 *
 * States reported through `onState`: connecting (waiting for the first
 * fragment), live (fragments are arriving), recovering (in-place recovery
 * under way), retrying (player torn down, rebuild scheduled).
 *
 * @param {Object} options
 * @param {() => Object} options.createPlayer - Builds a fresh hls.js instance.
 * @param {Object} options.events - hls.js `Events` map.
 * @param {Object} options.errorTypes - hls.js `ErrorTypes` map.
 * @param {string} options.url - Proxied manifest URL.
 * @param {HTMLVideoElement} options.video
 * @param {(player: Object|null) => void} options.onPlayer - Current player (null once destroyed).
 * @param {(state: string, info: {attempt: number, reason: string|null}) => void} options.onState
 * @param {() => boolean} [options.canRun] - False while the feed should stay idle (inactive camera).
 * @param {() => boolean} [options.isSourceOffline] - True when the proxy reports the camera dead.
 * @param {() => boolean} [options.isPageVisible]
 * @param {() => number} [options.now]
 * @param {Object} [options.timers] - Injectable setTimeout/clearTimeout/setInterval/clearInterval.
 * @returns {{start: () => void, stop: () => void, getState: () => string}}
 */
export function createHlsSelfHeal({
  createPlayer,
  events,
  errorTypes,
  url,
  video,
  onPlayer,
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
  let networkRecoveries = 0;
  let mediaRecoveries = 0;
  let attempt = 0;
  let lastProgressAt = now();
  let lastPlayhead = null;
  // When the current connecting/recovering stretch began, and why the last
  // rebuild happened ('no-data' = nothing buffered within the connect timeout).
  let connectStartedAt = now();
  let reason = null;
  let retryTimer = null;
  let watchdog = null;

  function setState(next) {
    if (next === state && next !== 'retrying') return;
    state = next;
    onState(next, { attempt, reason });
  }

  function destroyPlayer() {
    const doomed = player;
    player = null;
    if (!doomed) return;
    try {
      doomed.destroy();
    } catch (error) {
      console.warn('[CCTV] HLS player destroy failed:', error);
    }
    onPlayer(null);
  }

  function scheduleAttach(delayMs) {
    retryTimer = setTimeoutFn(() => attach(), delayMs);
  }

  function rebuild(why = null) {
    reason = why;
    destroyPlayer();
    attempt += 1;
    setState('retrying');
    const maxMs = isSourceOffline() ? HLS_REATTACH_OFFLINE_MAX_DELAY_MS : HLS_REATTACH_MAX_DELAY_MS;
    scheduleAttach(nextReattachDelayMs(attempt, { baseMs: HLS_REATTACH_BASE_DELAY_MS, maxMs }));
  }

  function recover(hls, type) {
    lastProgressAt = now();
    connectStartedAt = now();
    const kind = chooseRecovery(type, { networkRecoveries, mediaRecoveries }, errorTypes);
    try {
      if (kind === 'media') {
        mediaRecoveries += 1;
        setState('recovering');
        hls.recoverMediaError();
        return;
      }
      if (kind === 'network') {
        networkRecoveries += 1;
        setState('recovering');
        hls.loadSource(url);
        return;
      }
    } catch (error) {
      console.warn('[CCTV] HLS in-place recovery failed, rebuilding player:', error);
    }
    rebuild();
  }

  function wire(hls) {
    // A fragment reaching the buffer means the stream is healthy again: every
    // budget refills so a later blip gets its own full retry allowance.
    hls.on(events.FRAG_BUFFERED, () => {
      if (player !== hls) return;
      networkRecoveries = 0;
      mediaRecoveries = 0;
      attempt = 0;
      reason = null;
      lastProgressAt = now();
      setState('live');
    });
    hls.on(events.MANIFEST_PARSED, () => {
      if (player !== hls) return;
      Promise.resolve(video.play()).catch(() => {});
    });
    hls.on(events.ERROR, (_event, data) => {
      if (player !== hls || !data?.fatal) return;
      recover(hls, data.type);
    });
  }

  function attach(isFirstAttach = false) {
    retryTimer = null;
    if (stopped) return;
    // The first attach is never gated (it matches the old always-attach
    // behaviour); only rebuilds wait for the camera to be the active one.
    if (!isFirstAttach && !canRun()) {
      scheduleAttach(HLS_REATTACH_BASE_DELAY_MS);
      return;
    }
    networkRecoveries = 0;
    mediaRecoveries = 0;
    lastProgressAt = now();
    connectStartedAt = now();
    lastPlayhead = null;
    const hls = createPlayer();
    player = hls;
    wire(hls);
    hls.loadSource(url);
    hls.attachMedia(video);
    onPlayer(hls);
    setState('connecting');
  }

  function checkStall() {
    if (stopped || !player) return;
    const connecting = state === 'connecting' || state === 'recovering';
    const idle = !canRun() || !isPageVisible() || (!connecting && video.paused);
    const verdict = evaluateStall({
      state, idle, now: now(), connectStartedAt, lastProgressAt, playhead: video.currentTime, lastPlayhead,
    });
    ({ connectStartedAt, lastProgressAt, lastPlayhead } = verdict);
    if (verdict.action === 'rebuild-no-data') rebuild('no-data');
    else if (verdict.action === 'recover') recover(player, errorTypes.NETWORK_ERROR);
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
