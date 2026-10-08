// Same honesty and self-healing as cctvHlsSelfHeal.js, for browsers that play
// HLS natively (Safari, newer Chrome) where no hls.js instance exists to raise
// errors. A native <video> given an empty or dead playlist just sits there, so
// a timeout reloads the source with backoff and reports what is happening.

import { HLS_CONNECT_TIMEOUT_MS, HLS_REATTACH_BASE_DELAY_MS, HLS_REATTACH_MAX_DELAY_MS } from './cctvConstants.js';
import { nextReattachDelayMs } from './cctvHlsSelfHeal.js';

/**
 * Watches a natively-played HLS <video> and reloads it when no data arrives.
 * @param {HTMLVideoElement} video
 * @param {Object} options
 * @param {(state: string, info: {attempt: number, reason: string|null}) => void} options.onState
 * @param {() => boolean} [options.canRun] - False while the camera is inactive.
 * @param {Object} [options.timers] - Injectable setTimeout/clearTimeout.
 * @returns {() => void} Stop function.
 */
export function watchNativeHls(video, { onState, canRun = () => true, timers = {} }) {
  const setTimeoutFn = timers.setTimeout || setTimeout;
  const clearTimeoutFn = timers.clearTimeout || clearTimeout;
  let attempt = 0;
  let timer = null;
  let stopped = false;

  const clear = () => {
    if (timer !== null) clearTimeoutFn(timer);
    timer = null;
  };
  const armConnectTimeout = () => {
    clear();
    timer = setTimeoutFn(onTimeout, HLS_CONNECT_TIMEOUT_MS);
  };
  function reload() {
    timer = null;
    if (stopped) return;
    if (!canRun()) {
      timer = setTimeoutFn(reload, HLS_REATTACH_BASE_DELAY_MS);
      return;
    }
    video.load();
    onState('connecting', { attempt, reason: 'no-data' });
    armConnectTimeout();
  }
  function onTimeout() {
    if (stopped) return;
    attempt += 1;
    onState('retrying', { attempt, reason: 'no-data' });
    clear();
    timer = setTimeoutFn(reload, nextReattachDelayMs(attempt, { baseMs: HLS_REATTACH_BASE_DELAY_MS, maxMs: HLS_REATTACH_MAX_DELAY_MS }));
  }
  const onPlaying = () => {
    attempt = 0;
    clear();
    onState('live', { attempt: 0, reason: null });
  };
  const onError = () => onTimeout();

  video.addEventListener('playing', onPlaying);
  video.addEventListener('error', onError);
  onState('connecting', { attempt: 0, reason: null });
  armConnectTimeout();
  return () => {
    stopped = true;
    clear();
    video.removeEventListener('playing', onPlaying);
    video.removeEventListener('error', onError);
  };
}
