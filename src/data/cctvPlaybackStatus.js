// What the HLS player is really doing, in words. Health (/api/cctv/health) only
// proves the playlist is reachable, so "ok" + a dark plane used to read as a
// connected live feed. These helpers keep the monitor plane and the panel badge
// honest about the player state reported by cctvHlsSelfHeal.js.

import { isSourceOffline } from './cctvSourceHealth.mjs';

/**
 * True when the player gave up on the current stream and a rebuild is pending;
 * the last decoded frame is then stale and must not keep passing for live video.
 * @param {{state?: string}|null} playback
 * @returns {boolean}
 */
export function isPlaybackStalled(playback) {
  return playback?.state === 'retrying';
}

/**
 * Health object for the plane placeholder of a video camera that has no live
 * frame to show. A provider-dead camera keeps its offline wording; otherwise the
 * player state wins over a generic "ok".
 * @param {{status?: string, message?: string}|null} health
 * @param {{state?: string, attempt?: number}|null} playback
 * @returns {{status: string, message: string}}
 */
export function videoPlaceholderHealth(health, playback) {
  if (isSourceOffline(health?.status)) {
    return { status: health.status, message: health.message || 'Camera offline at source' };
  }
  switch (playback?.state) {
    case 'retrying':
      return { status: 'stalled', message: `Stream stalled · retrying (#${playback.attempt || 1})` };
    case 'recovering':
      return { status: 'recovering', message: 'Stream interrupted · recovering' };
    case 'unavailable':
      return { status: 'unavailable', message: 'Video player unavailable in this browser' };
    default:
      break;
  }
  if (health?.status === 'degraded' || health?.status === 'error') {
    return { status: health.status, message: health.message || health.status };
  }
  return { status: 'waiting', message: 'Waiting for video' };
}

const STREAM_BADGES = Object.freeze({
  connecting: { text: 'STREAM · CONNECTING', frameState: 'loading' },
  recovering: { text: 'STREAM · RECOVERING', frameState: 'loading' },
  retrying: { text: '⚠ STREAM STALLED · RETRYING', frameState: 'stalled' },
  unavailable: { text: 'STREAM · PLAYER UNAVAILABLE', frameState: 'error' },
});

/**
 * Panel badge for a non-healthy player state, or null when playback is fine.
 * @param {string|null|undefined} playbackState
 * @returns {{text: string, frameState: string}|null}
 */
export function playbackBadge(playbackState) {
  return STREAM_BADGES[playbackState] || null;
}
