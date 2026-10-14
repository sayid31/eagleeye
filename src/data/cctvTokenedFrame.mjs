/**
 * cctvTokenedFrame.mjs — one still frame from an MJPEG camera whose stream URL
 * needs a short-lived token printed on the host's public page (see
 * src/server/pageToken.mjs). Node-only.
 */
import { fetchMjpegFrame } from '../server/mjpegSnapshot.mjs';

/**
 * Newest frame of a page-token MJPEG source. A 403 means the cached token
 * expired or was revoked, so the page is re-read once and the stream retried.
 *
 * @param {{url: string, pageToken: {pageUrl: string}}} source
 * @param {object} deps
 * @param {{resolveUrl: (source: object, options?: {forceRefresh?: boolean}) => Promise<string>}} deps.tokens
 * @param {string} deps.userAgent
 * @param {typeof fetch} [deps.fetchFn]
 * @returns {Promise<{ok: true, body: Buffer, contentType: string}|{ok: false, status: number}>}
 *   status 0 = host unreachable, no token on the page, or no frame arrived.
 */
export async function fetchTokenedMjpegFrame(source, { tokens, userAgent, fetchFn }) {
  const attempt = async (forceRefresh) => {
    let streamUrl;
    try {
      streamUrl = await tokens.resolveUrl(source, { forceRefresh });
    } catch {
      return { ok: false, status: 0 };
    }
    return fetchMjpegFrame(streamUrl, { userAgent, fetchFn });
  };
  const first = await attempt(false);
  return !first.ok && first.status === 403 ? attempt(true) : first;
}
