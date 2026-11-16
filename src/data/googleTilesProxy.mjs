/**
 * googleTilesProxy.mjs — same-origin proxy for Google Photorealistic 3D Tiles
 * (Map Tiles API) that keeps GOOGLE_MAPS_API_KEY server-side.
 *
 * Node-only (imported by vite.config.js), never bundled for the browser.
 * The browser requests `/api/google/3dtiles/<path>`; this route forwards ONLY
 * to `https://tile.googleapis.com/v1/3dtiles/<path>` and appends `key` from
 * the server environment. The upstream host is fixed here — the client only
 * ever supplies a path below `/v1/3dtiles/`, validated segment by segment.
 *
 * Child tile URIs: Google's tileset JSON references children by absolute path
 * (`/v1/3dtiles/datasets/...?session=...`). The browser side
 * (src/mapStartup.js) builds the tileset resource on Google's logical URL
 * with a Cesium `Resource.proxy` that maps every derived URL back onto this
 * route, so no JSON is rewritten here and attribution fields reach the client
 * byte for byte.
 *
 * Google Map Tiles policy: no pre-fetching, storing or caching outside HTTP
 * caching rules. So this proxy keeps NO tile body in memory or on disk; it
 * streams each response straight through, passes the upstream caching headers
 * (`Cache-Control`, `ETag`, `Expires`, `Last-Modified`) and forwards
 * conditional request headers so a browser revalidation can end in a 304.
 * Node's fetch decodes `Content-Encoding`, so the decoded body is sent without
 * the upstream `Content-Encoding`/`Content-Length` (which describe the
 * encoded bytes).
 *
 * @module data/googleTilesProxy
 */

import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { enforceOptInRateLimit, makeOptInRateLimiter } from '../server/proxyInfra.mjs';
import { redactSecret } from '../server/redactSecret.mjs';
import { buildGoogleTilesUpstreamUrl, resolveGoogleTilesUpstream } from './googleTilesUpstream.mjs';

/** Same-origin mount path of the tile proxy. */
export const GOOGLE_TILES_ROUTE = '/api/google/3dtiles';
/** Hard cap on one proxied response body (a glb tile is normally < 5 MB). */
export const GOOGLE_TILES_MAX_BYTES = 32 * 1024 * 1024;
/** Upstream deadline for one tile/tileset request, body included. */
export const GOOGLE_TILES_TIMEOUT_MS = 30_000;

const FORWARDED_REQUEST_HEADERS = ['accept', 'if-none-match', 'if-modified-since'];
const FORWARDED_RESPONSE_HEADERS = ['content-type', 'cache-control', 'etag', 'expires', 'last-modified'];
const UPSTREAM_ERROR_CODES = new Map([
  [400, 'google_tiles_bad_request'],
  [403, 'google_tiles_denied'],
  [404, 'google_tiles_not_found'],
  [429, 'google_tiles_quota_exceeded'],
]);

function sendJson(res, status, payload, extraHeaders = {}) {
  if (res.headersSent) {
    res.destroy();
    return;
  }
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    ...extraHeaders,
  });
  res.end(JSON.stringify(payload));
}

function passthroughHeaders(upstream, { includeLength }) {
  const headers = {};
  for (const name of FORWARDED_RESPONSE_HEADERS) {
    const value = upstream.headers.get(name);
    if (value) headers[name] = value;
  }
  const length = upstream.headers.get('content-length');
  if (includeLength && length && !upstream.headers.get('content-encoding')) headers['content-length'] = length;
  return headers;
}

/** Short, query-free description of a target for logs (never the URL/key/session). */
const logPath = (target) => target.path.slice(0, 120);

/**
 * Create the request handler behind `/api/google/3dtiles`.
 *
 * @param {object} [options]
 * @param {typeof fetch} [options.fetchImpl] - Upstream fetch (tests inject a stub).
 * @param {() => (string|undefined)} [options.getApiKey] - Reads the key per request.
 * @param {{warn: Function}} [options.logger]
 * @param {number} [options.timeoutMs]
 * @param {number} [options.maxBytes]
 * @returns {(req: import('http').IncomingMessage, res: import('http').ServerResponse) => Promise<void>}
 */
export function createGoogleTilesHandler({
  fetchImpl = (...args) => globalThis.fetch(...args),
  getApiKey = () => process.env.GOOGLE_MAPS_API_KEY,
  logger = console,
  timeoutMs = GOOGLE_TILES_TIMEOUT_MS,
  maxBytes = GOOGLE_TILES_MAX_BYTES,
} = {}) {
  // Opt-in per-IP throttle, built lazily so `.env` is loaded first. Separate
  // from GEV_RATELIMIT_GOOGLE_PER_MIN: one Google 3D view streams hundreds of
  // tiles, which a Places-sized cap would starve.
  let limiter;
  const tilesLimiter = () => {
    if (limiter === undefined) limiter = makeOptInRateLimiter(process.env.GEV_RATELIMIT_GOOGLE_TILES_PER_MIN);
    return limiter;
  };

  return async function handleGoogleTiles(req, res) {
    if (req.method !== 'GET') {
      sendJson(res, 405, { error: 'method_not_allowed' }, { Allow: 'GET' });
      return;
    }
    const target = resolveGoogleTilesUpstream(req.url);
    if (!target.ok) {
      sendJson(res, target.status, { error: target.error });
      return;
    }
    const apiKey = String(getApiKey() ?? '').trim();
    if (!apiKey) {
      sendJson(res, 503, { error: 'google_maps_key_not_configured' });
      return;
    }
    if (!enforceOptInRateLimit(tilesLimiter(), req, res)) return;

    const upstreamHeaders = {};
    for (const name of FORWARDED_REQUEST_HEADERS) {
      const value = req.headers?.[name];
      if (typeof value === 'string' && value) upstreamHeaders[name] = value;
    }

    const clientAbort = new AbortController();
    const onClose = () => {
      if (!res.writableFinished) clientAbort.abort();
    };
    res.on?.('close', onClose);
    const timeout = AbortSignal.timeout(timeoutMs);
    const signal = AbortSignal.any([clientAbort.signal, timeout]);

    try {
      let upstream;
      try {
        upstream = await fetchImpl(buildGoogleTilesUpstreamUrl(target, apiKey), {
          method: 'GET',
          headers: upstreamHeaders,
          redirect: 'error',
          signal,
        });
      } catch (error) {
        if (clientAbort.signal.aborted) return;
        const timedOut = timeout.aborted;
        logger.warn(`[google-tiles-proxy] upstream ${timedOut ? 'timed out' : 'failed'} for ${logPath(target)}: ${redactSecret(error?.message || error, apiKey)}`);
        sendJson(res, timedOut ? 504 : 502, { error: timedOut ? 'upstream_timeout' : 'upstream_unreachable' });
        return;
      }

      if (upstream.status === 304) {
        await upstream.body?.cancel?.();
        res.writeHead(304, passthroughHeaders(upstream, { includeLength: false }));
        res.end();
        return;
      }
      if (!upstream.ok) {
        await upstream.body?.cancel?.();
        const code = UPSTREAM_ERROR_CODES.get(upstream.status);
        if (upstream.status !== 404) {
          logger.warn(`[google-tiles-proxy] upstream HTTP ${upstream.status} for ${logPath(target)}`);
        }
        const retryAfter = upstream.headers.get('retry-after');
        sendJson(res, code ? upstream.status : 502, {
          error: code || 'upstream_error',
          upstreamStatus: upstream.status,
        }, upstream.status === 429 && retryAfter ? { 'Retry-After': retryAfter } : {});
        return;
      }

      const declared = Number(upstream.headers.get('content-length'));
      if (Number.isFinite(declared) && declared > maxBytes) {
        await upstream.body?.cancel?.();
        logger.warn(`[google-tiles-proxy] upstream body over ${maxBytes} bytes for ${logPath(target)}`);
        sendJson(res, 502, { error: 'upstream_too_large' });
        return;
      }

      res.writeHead(upstream.status, passthroughHeaders(upstream, { includeLength: true }));
      if (!upstream.body) {
        res.end();
        return;
      }
      let total = 0;
      const sizeCap = new Transform({
        transform(chunk, _encoding, callback) {
          total += chunk.length;
          if (total > maxBytes) callback(new Error(`body exceeded ${maxBytes} bytes`));
          else callback(null, chunk);
        },
      });
      try {
        await pipeline(Readable.fromWeb(upstream.body), sizeCap, res);
      } catch (error) {
        // Headers are already sent, so the only honest signal left is a cut
        // connection (pipeline destroys `res`). A client that went away is
        // not an upstream problem and is not logged.
        if (!clientAbort.signal.aborted) {
          logger.warn(`[google-tiles-proxy] stream aborted for ${logPath(target)}: ${redactSecret(error?.message || error, apiKey)}`);
        }
      }
    } finally {
      res.off?.('close', onClose);
    }
  };
}

/**
 * Vite plugin: mount the Google 3D Tiles proxy on the dev and preview servers.
 *
 * @param {Parameters<typeof createGoogleTilesHandler>[0]} [options]
 * @returns {import('vite').Plugin}
 */
export function googleTilesProxy(options = {}) {
  const install = (middlewares) => middlewares.use(GOOGLE_TILES_ROUTE, createGoogleTilesHandler(options));
  return {
    name: 'google-tiles-proxy',
    configureServer(server) {
      install(server.middlewares);
    },
    configurePreviewServer(server) {
      install(server.middlewares);
    },
  };
}
