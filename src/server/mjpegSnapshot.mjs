/**
 * mjpegSnapshot.mjs — one JPEG frame out of a multipart/x-mixed-replace
 * (MJPEG) stream, e.g. ZoneMinder's nph-zms. The CCTV panel refreshes
 * image-mode cameras by polling /api/cctv/frame/:id, so an MJPEG camera is
 * served as "newest frame on every poll": open the stream, take the first
 * complete part, close the connection.
 *
 * Node-only (imported by cctvProxy.mjs), never bundled for the browser.
 */

import { createHash } from 'node:crypto';

/** Largest single JPEG part accepted (a 640x480 ZoneMinder frame is ~6-60 KB). */
export const MJPEG_MAX_FRAME_BYTES = 2 * 1024 * 1024;
/** Whole attempt budget: some cameras take ~11 s to send their first frame. */
export const MJPEG_FRAME_TIMEOUT_MS = 15 * 1000;

/**
 * SHA-256 of the 640x480 "Unable to stream" JPEG that ZoneMinder's nph-zms
 * sends for a monitor it cannot read (measured 2026-10-14 on Jombang: 9 of 25
 * monitors). It is an HTTP 200 multipart frame, so without this check a dead
 * camera would show a black "Unable to stream" picture as if it were live.
 */
export const ZONEMINDER_NO_SIGNAL_SHA256 = 'f5e0f1d9b1d5b3c83d1a6de1fb9e317534484eb28e613c849ebc19cb6c50f8e2';

const HEADER_END = Buffer.from('\r\n\r\n');
const JPEG_SOI = Buffer.from([0xff, 0xd8]);

/**
 * Pull the first complete JPEG part out of a chunked byte stream.
 * Honours the part's Content-Length; without one, the part ends at the next
 * `\r\n--` boundary line.
 *
 * @param {AsyncIterable<Uint8Array>} chunks
 * @param {{maxBytes?: number}} [options]
 * @returns {Promise<Buffer|null>} JPEG bytes, or null when the stream ends or overflows first.
 */
export async function readFirstJpegPart(chunks, { maxBytes = MJPEG_MAX_FRAME_BYTES } = {}) {
  let buf = Buffer.alloc(0);
  for await (const chunk of chunks) {
    buf = Buffer.concat([buf, chunk]);
    if (buf.length > maxBytes + 1024) return null;
    const headerEnd = buf.indexOf(HEADER_END);
    if (headerEnd < 0) continue;
    const header = buf.subarray(0, headerEnd).toString('latin1');
    if (!/content-type:\s*image\/jpeg/i.test(header)) return null;
    const bodyStart = headerEnd + HEADER_END.length;
    const declared = /content-length:\s*(\d+)/i.exec(header);
    let bodyEnd = -1;
    if (declared) {
      const length = Number(declared[1]);
      if (length <= 0 || length > maxBytes) return null;
      if (buf.length >= bodyStart + length) bodyEnd = bodyStart + length;
    } else {
      const next = buf.indexOf('\r\n--', bodyStart);
      if (next >= 0) bodyEnd = next;
    }
    if (bodyEnd < 0) continue;
    const jpeg = buf.subarray(bodyStart, bodyEnd);
    return jpeg.subarray(0, 2).equals(JPEG_SOI) ? Buffer.from(jpeg) : null;
  }
  return null;
}

/**
 * Fetch one frame from an MJPEG URL and close the connection.
 *
 * @param {string} url - Full stream URL (token included; never logged here).
 * @param {object} options
 * @param {string} options.userAgent
 * @param {typeof fetch} [options.fetchFn]
 * @param {number} [options.timeoutMs]
 * @param {string} [options.noSignalSha256] - SHA-256 of the host's "no signal" frame, which is rejected.
 * @returns {Promise<{ok: true, body: Buffer, contentType: string}|{ok: false, status: number}>}
 *   `status` is the upstream HTTP status, or 0 when unreachable / no frame arrived.
 */
export async function fetchMjpegFrame(url, {
  userAgent,
  fetchFn = fetch,
  timeoutMs = MJPEG_FRAME_TIMEOUT_MS,
  noSignalSha256 = ZONEMINDER_NO_SIGNAL_SHA256,
} = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchFn(url, { headers: { 'User-Agent': userAgent }, signal: controller.signal });
    if (!res.ok) {
      await res.body?.cancel?.();
      return { ok: false, status: res.status };
    }
    const body = await readFirstJpegPart(res.body);
    if (!body || createHash('sha256').update(body).digest('hex') === noSignalSha256) {
      return { ok: false, status: 0 };
    }
    return { ok: true, body, contentType: 'image/jpeg' };
  } catch {
    return { ok: false, status: 0 };
  } finally {
    clearTimeout(timer);
    // Ends the still-open multipart connection on every path.
    controller.abort();
  }
}
