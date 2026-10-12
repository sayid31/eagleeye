// Pure stall decision for the HLS watchdog. Kept free of timers and the DOM so
// the rules (what counts as "no data" vs "playhead frozen") are unit-testable.

import {
  HLS_CONNECT_TIMEOUT_MS,
  HLS_MAX_MEDIA_ERROR_RECOVERIES,
  HLS_MAX_NETWORK_ERROR_RECOVERIES,
  HLS_STALL_RESTART_MS,
} from './cctvConstants.js';

/**
 * Which in-place recovery a fatal error may still use, or null once that
 * budget is spent (the caller then rebuilds the whole player).
 * @param {string} type - hls.js error type.
 * @param {{networkRecoveries: number, mediaRecoveries: number}} used
 * @param {{MEDIA_ERROR: string, NETWORK_ERROR: string}} errorTypes
 * @returns {'media'|'network'|null}
 */
export function chooseRecovery(type, { networkRecoveries, mediaRecoveries }, errorTypes) {
  if (type === errorTypes.MEDIA_ERROR && mediaRecoveries < HLS_MAX_MEDIA_ERROR_RECOVERIES) return 'media';
  if (type === errorTypes.NETWORK_ERROR && networkRecoveries < HLS_MAX_NETWORK_ERROR_RECOVERIES) return 'network';
  return null;
}

/**
 * Decides what one watchdog tick should do.
 *
 * While connecting/recovering nothing has reached the buffer, so the playhead
 * is meaningless: empty playlists never raise a fatal error and
 * `video.paused` is true until the first play(). Only the connect timeout can
 * catch that case. Once live, a playhead that stays put (and is not paused or
 * hidden on purpose) for HLS_STALL_RESTART_MS means the feed froze.
 *
 * @param {Object} input
 * @param {string|null} input.state - Controller state.
 * @param {boolean} input.idle - Camera inactive, page hidden, or (when live) video paused.
 * @param {number} input.now
 * @param {number} input.connectStartedAt
 * @param {number} input.lastProgressAt
 * @param {number} input.playhead - video.currentTime.
 * @param {number|null} input.lastPlayhead
 * @returns {{action: 'rebuild-no-data'|'recover'|null, connectStartedAt: number, lastProgressAt: number, lastPlayhead: number|null}}
 */
export function evaluateStall({ state, idle, now, connectStartedAt, lastProgressAt, playhead, lastPlayhead }) {
  const keep = { action: null, connectStartedAt, lastProgressAt, lastPlayhead };
  if (state === 'connecting' || state === 'recovering') {
    if (idle) return { ...keep, connectStartedAt: now };
    return now - connectStartedAt >= HLS_CONNECT_TIMEOUT_MS ? { ...keep, action: 'rebuild-no-data' } : keep;
  }
  if (idle || playhead !== lastPlayhead) return { ...keep, lastPlayhead: playhead, lastProgressAt: now };
  return now - lastProgressAt >= HLS_STALL_RESTART_MS ? { ...keep, action: 'recover' } : keep;
}
