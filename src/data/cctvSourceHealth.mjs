/**
 * Pure helpers that classify what a CCTV upstream told us, shared by the dev
 * proxy (cctvProxy.mjs, which writes per-camera health) and the UI (which
 * renders it). Kept free of DOM/Cesium/Node-only imports so both sides and the
 * unit tests can load it.
 */
import { isManifestContentType } from '../server/hlsManifestProxy.mjs';

/** Health status for a camera whose provider has taken the feed down. */
export const SOURCE_OFFLINE_STATUS = 'offline';

/** Network error codes that mean the provider host itself is gone/refusing. */
const UNREACHABLE_ERROR_CODES = new Set(['ENOTFOUND', 'ECONNREFUSED']);

/**
 * True when an upstream HTTP status means the feed no longer exists at the
 * provider (as opposed to a transient 5xx or an auth/rate-limit response).
 * @param {number} status
 * @returns {boolean}
 */
export function isUpstreamGoneStatus(status) {
  return status === 404 || status === 410;
}

/**
 * True when a fetch failure means the provider host cannot be reached at all
 * (DNS gone, connection refused). Timeouts are deliberately excluded: they are
 * indistinguishable from a slow link, so they stay "degraded".
 * @param {unknown} error
 * @returns {boolean}
 */
export function isUpstreamUnreachableError(error) {
  const code = error?.cause?.code || error?.code;
  return typeof code === 'string' && UNREACHABLE_ERROR_CODES.has(code);
}

/**
 * Message shown beside / painted on a camera whose source is offline.
 * @param {{status?: number, unreachable?: boolean}} reason
 * @returns {string}
 */
export function describeOfflineSource({ status, unreachable } = {}) {
  if (unreachable) return 'Kamera mati di sumber (host tidak terjangkau)';
  return `Kamera mati di sumber (HTTP ${status})`;
}

/**
 * Whether a video-feed upstream response looks like playable media. Mirrors
 * the manifest branch of the proxy (case-insensitive, `.m3u8`/`.flv` URL accepted
 * when the provider omits Content-Type) so a stream that plays is never labelled
 * "unexpected media type".
 * @param {string} contentType
 * @param {string} mediaUrl
 * @returns {boolean}
 */
export function isExpectedVideoMedia(contentType, mediaUrl) {
  const type = String(contentType || '').toLowerCase();
  // FLV sources (Surakarta ATCS) send no Content-Type, so the .flv path counts.
  return type.startsWith('video/') || isManifestContentType(type, mediaUrl)
    || /\.flv(\?|#|$)/i.test(String(mediaUrl || ''));
}

/**
 * @param {string|undefined} status - Health status from /api/cctv/health.
 * @returns {boolean}
 */
export function isSourceOffline(status) {
  return status === SOURCE_OFFLINE_STATUS;
}

/** Health message for a source that answers 200 but sends no playlist. */
export const EMPTY_PLAYLIST_MESSAGE = 'Sumber mengirim playlist kosong';

/**
 * Whether an HLS manifest body is a playlist at all. A 200 with an empty or
 * non-M3U8 body would otherwise be reported "Live stream connected".
 * @param {string} text
 * @returns {boolean}
 */
export function isValidHlsPlaylist(text) {
  return String(text || '').trimStart().startsWith('#EXTM3U');
}
