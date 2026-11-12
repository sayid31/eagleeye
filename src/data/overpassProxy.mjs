/**
 * overpassProxy.mjs — the `/api/overpass` Vite plugin (traffic roads,
 * annotations): validation, memory/disk/COVER cache tiers, in-flight dedupe,
 * abuse guards, gzip responses and abandoned-request aborts. The upstream
 * sweep lives in overpassFetch.mjs, caches in overpassCore/overpassDiskCache.
 * Moved out of vite.config.js (file-health pass, 2026-11-12) — no behavior change.
 *
 * Node-only (imported by vite.config.js), never bundled for the browser.
 *
 * @module data/overpassProxy
 */
import { clientKey, makeRateLimiter, readRequestBodyCapped } from '../server/proxyInfra.mjs';
import { sendBody } from '../server/jsonCompression.mjs';
import { createSharedAbortRegistry } from '../server/sharedAbort.mjs';
import {
  OVERPASS_CACHE_MAX_ENTRIES,
  _overpassCache,
  _overpassInFlight,
  resolveOverpassPreflight,
  sanitizeOverpassBody,
} from './overpassCore.mjs';
import { serveFromCover } from './overpassCoverIndex.mjs';
import { createOverpassCoverStore } from './overpassCoverStore.mjs';
import { overpassDiskTtlMs, readOverpassDisk, writeOverpassDisk } from './overpassDiskCache.mjs';
import { fetchOverpassPayload, isCacheableOverpassPayload } from './overpassFetch.mjs';

// --- Abuse guards for the Overpass proxy ------------------------------------
/** Max accepted POST body for the Overpass proxy (Overpass QL queries are tiny). */
const OVERPASS_MAX_BODY_BYTES = 24 * 1024; // 24 KB
/** Max concurrent in-flight upstream Overpass fetches across all distinct queries. */
const OVERPASS_MAX_CONCURRENT = 6;
let _overpassConcurrent = 0;

const _overpassRateLimiter = makeRateLimiter({ windowMs: 60_000, max: 90, globalMax: 300 });

/** Evict oldest Overpass cache entries until size is within the cap. */
function trimOverpassCache() {
  while (_overpassCache.size > OVERPASS_CACHE_MAX_ENTRIES) {
    const oldestKey = _overpassCache.keys().next().value;
    if (!oldestKey) break;
    _overpassCache.delete(oldestKey);
  }
}

/**
 * Write a completed Overpass payload to the HTTP response.
 *
 * Gzipped when the client accepts it: a residential road tile is ~1–3 MB of
 * JSON, which took seconds to cross the staging host's uplink even when
 * served from cache.
 *
 * @param {import('http').IncomingMessage} req - Node HTTP request (Accept-Encoding).
 * @param {import('http').ServerResponse} res - Node HTTP response.
 * @param {{status:number,body:string,contentType:string,endpoint:string}} payload
 * @param {string} [cacheStatus='MISS'] - 'HIT', 'MISS', or 'INFLIGHT'.
 * @returns {Promise<void>}
 */
function sendOverpassResponse(req, res, payload, cacheStatus = 'MISS') {
  return sendBody(req, res, payload.status, payload.body || '', {
    'Content-Type': payload.contentType || 'application/json',
    'Cache-Control': 'public, max-age=15',
    'X-Overpass-Cache': cacheStatus,
    'X-Overpass-Upstream': payload.endpoint || 'unknown',
  });
}

/**
 * Vite plugin: Overpass API proxy with response caching and request coalescing.
 *
 * Accepts POST requests at /api/overpass, normalizes the query body for
 * cache keying, and fans out to multiple Overpass mirrors with per-upstream
 * timeout and rate-limit detection. Successful responses are cached for
 * OVERPASS_CACHE_MS. Concurrent identical queries share a single upstream
 * request via the in-flight map.
 *
 * A request whose every waiting client disconnected (the traffic layer aborts
 * its fetch when the camera moves on) is aborted too, so a viewport the user
 * already left gives its Overpass slot to the current one.
 *
 * @returns {import('vite').Plugin}
 */
export function overpassProxy() {
  // Remembers cached road tiles so a miss inside one is answered by cropping it
  // (src/data/overpassCoverIndex.mjs) instead of waiting on the public mirrors.
  const coverIndex = createOverpassCoverStore();
  // Clients waiting per cache key, including dedupe joiners (resolveOverpassPreflight).
  const abandonable = createSharedAbortRegistry();
  const readCover = (key) => _overpassCache.get(key) || readOverpassDisk(key, overpassDiskTtlMs(key));
  return {
    name: 'overpass-proxy',
    configureServer(server) {
      server.middlewares.use('/api/overpass', async (req, res) => {
        // Hoisted out of the try so the catch's serve-stale lookup can see it
        // (a body-read failure would otherwise hit an out-of-scope reference).
        let cacheKey = null;
        /** @type {ReturnType<ReturnType<typeof createSharedAbortRegistry>['join']>|null} */
        let subscription = null;
        try {
          if (req.method !== 'POST') {
            res.writeHead(405, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Method Not Allowed' }));
            return;
          }

          // Collect POST body with a hard byte cap (Overpass QL queries are small)
          let body;
          try {
            body = (await readRequestBodyCapped(req, OVERPASS_MAX_BODY_BYTES)).toString();
          } catch (err) {
            if (err?.code === 'BODY_TOO_LARGE') {
              res.writeHead(413, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'Overpass query too large' }));
              return;
            }
            throw err;
          }
          if (!body) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Missing Overpass query body' }));
            return;
          }

          // Validate + clamp the QL: reject unbounded/global queries and cap the
          // server-side timeout so a tiny body can't request planet-scale work.
          const sanitized = sanitizeOverpassBody(body);
          if (!sanitized.ok) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: sanitized.error }));
            return;
          }
          const safeBody = sanitized.body;

          // Normalize whitespace so semantically identical Overpass QL queries share cache entries
          cacheKey = safeBody.replace(/\s+/g, ' ').trim();
          const key = cacheKey;
          subscription = abandonable.join(key, () => {
            // Next request for this key starts fresh instead of awaiting the aborted one.
            _overpassInFlight.delete(key);
          });
          res.on('close', () => { if (!res.writableFinished) subscription.leave(); });
          const preflight = await resolveOverpassPreflight({
            cacheKey,
            memoryCache: _overpassCache,
            inFlight: _overpassInFlight,
            // Fresh-enough disk entries survive restarts and skip the public
            // mirrors; boundary-class queries keep their month-long TTL.
            readDisk: () => readOverpassDisk(cacheKey, overpassDiskTtlMs(cacheKey)),
            allowUpstream: () => _overpassRateLimiter(clientKey(req)),
          });
          if (preflight.source === 'RATE_LIMITED' || preflight.source === 'UPSTREAM') {
            const covered = await serveFromCover(coverIndex, cacheKey, readCover);
            if (covered) {
              // Memory only (not disk, not the index): repeats skip the crop,
              // and the disk keeps one copy per real upstream answer.
              _overpassCache.set(cacheKey, covered);
              trimOverpassCache();
              await sendOverpassResponse(req, res, covered, 'COVER');
              return;
            }
          }
          if (preflight.source === 'RATE_LIMITED') {
            res.writeHead(429, { 'Content-Type': 'application/json', 'Retry-After': '5' });
            res.end(JSON.stringify({ error: 'Rate limit exceeded' }));
            return;
          }
          if (preflight.source !== 'UPSTREAM') {
            if (preflight.source === 'DISK') {
              _overpassCache.set(cacheKey, preflight.payload);
              trimOverpassCache();
              coverIndex.record(cacheKey, preflight.payload.cachedAt);
            }
            await sendOverpassResponse(req, res, preflight.payload, preflight.source);
            return;
          }

          // From here onward the request is genuinely upstream-bound and has
          // consumed one local limiter slot. Cache and dedupe hits above do not.
          if (_overpassConcurrent >= OVERPASS_MAX_CONCURRENT) {
            res.writeHead(503, { 'Content-Type': 'application/json', 'Retry-After': '2' });
            res.end(JSON.stringify({ error: 'Overpass proxy busy — try again shortly' }));
            return;
          }
          _overpassConcurrent += 1;
          const requestPromise = fetchOverpassPayload(safeBody, undefined, { signal: subscription.signal })
            .then((payload) => {
              if (isCacheableOverpassPayload(payload)) {
                const entry = { ...payload, cachedAt: Date.now() };
                _overpassCache.set(cacheKey, entry);
                trimOverpassCache();
                writeOverpassDisk(cacheKey, entry);
                coverIndex.record(cacheKey, entry.cachedAt);
              }
              return payload;
            })
            .finally(() => {
              _overpassConcurrent -= 1;
              // Only our own entry: an abandoned request may settle after a newer one took the key.
              if (_overpassInFlight.get(key) === requestPromise) _overpassInFlight.delete(key);
            });

          _overpassInFlight.set(cacheKey, requestPromise);
          const payload = await requestPromise;
          // Degraded upstream (rate-limited on every mirror / 5xx / runtime
          // error): last-good roads beat an empty layer — serve stale from
          // memory or disk at ANY age before surfacing the failure.
          if (payload.rateLimited || payload.runtimeError || payload.status >= 500) {
            const stale = _overpassCache.get(cacheKey) || await readOverpassDisk(cacheKey, Infinity);
            console.warn(`[Overpass Proxy] degraded upstream (${payload.attempts.join('; ')})${stale ? '; serving stale roads' : ''}`);
            if (stale) {
              await sendOverpassResponse(req, res, stale, 'STALE');
              return;
            }
          }
          await sendOverpassResponse(req, res, payload, 'MISS');
        } catch (e) {
          // Every waiting client left: nobody to answer, and not a mirror fault.
          if (subscription?.left) return;
          // Every mirror threw (network-level). Same serve-stale rule.
          const stale = cacheKey
            ? (_overpassCache.get(cacheKey) || await readOverpassDisk(cacheKey, Infinity).catch(() => null))
            : null;
          if (stale) {
            await sendOverpassResponse(req, res, stale, 'STALE');
            return;
          }
          console.error('[Overpass Proxy]', e.message);
          res.writeHead(502, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Overpass proxy error' }));
        } finally {
          subscription?.done();
        }
      });
    },
  };
}
