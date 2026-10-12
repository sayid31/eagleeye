// Pass-through for unbounded live byte streams (FLV over chunked HTTP). Unlike
// an HLS segment or a snapshot, the upstream body never ends on its own, so the
// proxy must (a) stop reading it the moment the browser goes away, and (b) give
// up on a source that never sends response headers. Without (a) every closed
// camera panel would leave one upstream connection open until the source drops it.

import { pipeline, Readable } from 'node:stream';

/** Content-Type sent to the browser: these sources send none at all. */
export const FLV_CONTENT_TYPE = 'video/x-flv';

/**
 * How long to wait for the upstream response headers. Measured 2026-10-12: the
 * reachable Surakarta streams answer within a few seconds, the dead ones never
 * answer at all (25 s probe), so a bounded wait is what separates the two.
 */
export const LIVE_STREAM_HEADER_TIMEOUT_MS = 15_000;

/**
 * AbortSignal for one live upstream fetch. Aborts when the browser connection
 * closes or when the upstream has not answered within `headerTimeoutMs`.
 *
 * @param {import('http').ServerResponse} res - Browser-facing response.
 * @param {Object} [options]
 * @param {number} [options.headerTimeoutMs]
 * @returns {{signal: AbortSignal, headersReceived: () => void, clientGone: () => boolean, timedOut: () => boolean}}
 */
export function createLiveUpstreamAbort(res, { headerTimeoutMs = LIVE_STREAM_HEADER_TIMEOUT_MS } = {}) {
  const controller = new AbortController();
  let gone = false;
  let late = false;
  const timer = setTimeout(() => {
    late = true;
    controller.abort();
  }, headerTimeoutMs);
  res.once('close', () => {
    gone = true;
    clearTimeout(timer);
    controller.abort();
  });
  return {
    signal: controller.signal,
    headersReceived: () => clearTimeout(timer),
    clientGone: () => gone,
    timedOut: () => late,
  };
}

/**
 * Streams an upstream live body to the browser without buffering. The pipeline
 * tears both ends down together, so a closed browser connection cancels the
 * upstream read and an upstream that drops ends the browser response.
 *
 * @param {import('http').ServerResponse} res
 * @param {Response} upstream - fetch() response with a streaming body.
 * @param {Object} [options]
 * @param {string} [options.sourceHeader] - Value for X-CCTV-Source.
 * @returns {void}
 */
export function pipeLiveStream(res, upstream, { sourceHeader = 'live-flv' } = {}) {
  res.writeHead(200, {
    'Content-Type': FLV_CONTENT_TYPE,
    'Cache-Control': 'no-store',
    'X-CCTV-Source': sourceHeader,
  });
  if (!upstream.body) {
    res.end();
    return;
  }
  // A closed browser or dropped upstream surfaces as a pipeline error; both
  // ends are already torn down by then, so there is nothing left to report.
  pipeline(Readable.fromWeb(upstream.body), res, () => {});
}
