// What the HLS player is really doing, in words. Health (/api/cctv/health) only
// proves the playlist is reachable, so "ok" + a dark plane used to read as a
// connected live feed. These helpers keep the monitor plane and the panel badge
// honest about the player state reported by cctvHlsSelfHeal.js.

import { EMPTY_PLAYLIST_MESSAGE, isSourceOffline } from './cctvSourceHealth.mjs';

const NO_DATA_REASON = 'no-data';

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
 * @param {{state?: string, attempt?: number, reason?: string|null}|null} playback
 * @returns {{status: string, message: string}}
 */
export function videoPlaceholderHealth(health, playback) {
  if (isSourceOffline(health?.status)) {
    return { status: health.status, message: health.message || 'Kamera mati di sumber' };
  }
  // The proxy saw a 200 with no playlist in it: say that, it is the real cause.
  if (health?.message === EMPTY_PLAYLIST_MESSAGE) {
    return { status: 'degraded', message: 'Sumber mengirim playlist kosong · mencoba lagi' };
  }
  switch (playback?.state) {
    case 'retrying':
      if (playback.reason === NO_DATA_REASON) {
        return { status: 'no-data', message: `Tidak ada data dari sumber · mencoba lagi (#${playback.attempt || 1})` };
      }
      return { status: 'stalled', message: `Stream macet · mencoba lagi (#${playback.attempt || 1})` };
    case 'recovering':
      return { status: 'recovering', message: 'Stream terputus · memulihkan' };
    case 'unavailable':
      return { status: 'unavailable', message: 'Pemutar video tidak tersedia di browser ini' };
    default:
      break;
  }
  if (health?.status === 'degraded' || health?.status === 'error') {
    return { status: health.status, message: health.message || health.status };
  }
  return { status: 'waiting', message: 'Menunggu video' };
}

const STREAM_BADGES = Object.freeze({
  connecting: { text: 'STREAM · MENGHUBUNGKAN', frameState: 'loading' },
  recovering: { text: 'STREAM · MEMULIHKAN', frameState: 'loading' },
  retrying: { text: '⚠ STREAM MACET · MENCOBA LAGI', frameState: 'stalled' },
  unavailable: { text: 'STREAM · PEMUTAR TIDAK TERSEDIA', frameState: 'error' },
});

const NO_DATA_BADGE = Object.freeze({ text: '⚠ TIDAK ADA DATA DARI SUMBER · MENCOBA LAGI', frameState: 'stalled' });
const EMPTY_PLAYLIST_BADGE = Object.freeze({ text: '⚠ SUMBER MENGIRIM PLAYLIST KOSONG', frameState: 'stalled' });

/**
 * Panel badge for a non-healthy player or source, or null when playback is fine.
 * A source that sends an empty playlist or never delivers data is named as such
 * instead of a generic "connecting".
 * @param {string|null|undefined} playbackState
 * @param {{reason?: string|null, sourceMessage?: string}} [detail]
 * @returns {{text: string, frameState: string}|null}
 */
export function playbackBadge(playbackState, { reason = null, sourceMessage = '' } = {}) {
  if (playbackState === 'live') return null;
  if (sourceMessage === EMPTY_PLAYLIST_MESSAGE) return EMPTY_PLAYLIST_BADGE;
  if (playbackState === 'retrying' && reason === NO_DATA_REASON) return NO_DATA_BADGE;
  return STREAM_BADGES[playbackState] || null;
}
