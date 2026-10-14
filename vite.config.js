/**
 * Vite configuration for EagleEye View — a cinematic geospatial app.
 *
 * Assembles the dev/preview-server proxy plugins that bypass CORS and add
 * caching/auth for upstream APIs, plus the `import.meta.env.*` defines for
 * the Cesium and Google 3D Tiles API keys the client bundle needs. Each
 * proxy is a self-contained Vite plugin factory imported from its own
 * module (see the `plugins:` array in `defineConfig()` below for the
 * exact registration order) rather than defined inline here:
 *
 *   - src/data/celestrakProxy.mjs, tomtomProxy.mjs, firmsProxy.mjs,
 *     adsbdbProxy.mjs, gbfsProxy.mjs — isolated single-upstream proxies.
 *   - src/data/openSkyProxy.mjs, adsbLolProxy.mjs, trackBackfillProxies.mjs
 *     — aircraft state vectors + track-history backfill (share one OAuth2
 *     token via openSkyProxy.mjs's exported `getOpenSkyToken()`).
 *   - src/data/aisLiveProxy.mjs — AISStream websocket-backed live vessel
 *     positions and per-MMSI recent-path buffers.
 *   - src/data/overpassCore.mjs (shared fetch/cache machinery) +
 *     src/data/overpassProxy.mjs (`/api/overpass`) +
 *     src/data/osrmRouteProxy.mjs (`/api/route`) +
 *     src/data/militaryInstallationsProxy.mjs (bounded OSM installation
 *     context, also built on overpassCore.mjs).
 *   - src/data/regionalProxyHandlers.mjs — regional briefing + weather
 *     effects (imports rate-limit/cache helpers back from this file; see
 *     that module's header for why).
 *   - src/data/cctvProxy.mjs — traffic-camera frames, media streams, and
 *     fallback SVG (catalog assembly lives in cctvSourceCatalog.mjs,
 *     live packs in cctvOpenDataSources.mjs).
 *   - src/data/radioBrowserProxy.mjs, rocketLaunchesProxy.mjs,
 *     googlePlacesContextProxy.mjs — station directory, launch metadata,
 *     keyless place context.
 *   - src/voice/openAiRealtimeProxy.mjs, anthropicProxy.mjs — voice-agent
 *     token/session proxies.
 *   - src/data/terrainHeightsProxy.js — Re:Earth ellipsoidal point-height
 *     lookups.
 *
 * `nominatimSearchProxy()` (forward geocode) and `keySetupEndpoint()`
 * (the in-app "POWER UP" credential writer) stay defined in this file —
 * see their own JSDoc for why each wasn't moved out with the rest.
 *
 * A handful of names are re-exported below purely so
 * `src/data/regionalProxy.test.mjs` and `src/nominatimSearchProxy.test.mjs`
 * keep working without a test-file edit; see the comment above each
 * `export { ... }` for which module now owns the real implementation.
 *
 * @module vite.config
 */

import fs from 'node:fs';
import { promises as fsp } from 'node:fs';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { celestrakProxy } from './src/data/celestrakProxy.mjs';
import { tomtomProxy } from './src/data/tomtomProxy.mjs';
import { firmsProxy } from './src/data/firmsProxy.mjs';
import { myMapsProxy } from './src/data/myMapsProxy.mjs';
import { adsbdbProxy } from './src/data/adsbdbProxy.mjs';
import { gbfsProxy } from './src/data/gbfsProxy.mjs';
import { rocketLaunchesProxy, LL2_CACHE_TTL_MS, launchLibraryRequestHeaders } from './src/data/rocketLaunchesProxy.mjs';
import { googlePlacesContextProxy, keylessGooglePlacesResponse } from './src/data/googlePlacesContextProxy.mjs';
import { cctvProxy } from './src/data/cctvProxy.mjs';
import { osrmRouteProxy } from './src/data/osrmRouteProxy.mjs';
import { openSkyProxy, adsbLolFallbackAnchor } from './src/data/openSkyProxy.mjs';
import { adsbLolProxy } from './src/data/adsbLolProxy.mjs';
import { trackBackfillProxies } from './src/data/trackBackfillProxies.mjs';
import { aisLiveProxy } from './src/data/aisLiveProxy.mjs';
import {
  OVERPASS_CACHE_MAX_ENTRIES,
  _overpassCache,
  _overpassInFlight,
  sanitizeOverpassBody,
  resolveOverpassPreflight,
  readOverpassDisk,
  writeOverpassDisk,
  overpassDiskTtlMs,
  fetchOverpassPayload,
} from './src/data/overpassCore.mjs';
import {
  militaryInstallationsProxy,
  validMilitaryInstallationBox,
} from './src/data/militaryInstallationsProxy.mjs';
import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv } from 'vite';
import cesium from 'vite-plugin-cesium';
import { radioBrowserProxy } from './src/data/radioBrowserProxy.mjs';
import {
  regionalBriefProxy,
  weatherEffectsProxy,
  requiredFiniteQueryNumber,
  validRegionalPoint,
  regionalBriefHasAnySource,
  queuedNominatimFetch,
  fetchRegionalJson,
  NOMINATIM_HEADERS,
} from './src/data/regionalProxyHandlers.mjs';
import { parseEnv as parseDotenvText } from 'node:util';
import { readEnvironmentSource as readPinokioEnvironmentSource } from './scripts/pinokio-environment.mjs';
import {
  admitKeySetupRequest,
  isKeySetupExternallyManaged,
  keySetupStatus,
  knownKeySetupEnvVars,
  upsertDotenvValues,
  validateKeySetupUpdates,
} from './src/keySetupCore.mjs';
import { hardenCredentialFile } from './src/keySetupHardening.mjs';
import {
  makeRateLimiter,
  nominatimSearchRateLimiter,
  enforceOptInRateLimit,
  clientKey,
  readRequestBodyCapped,
  readResponseTextCapped,
  readResponseJsonCapped,
  coalesceProxyRequest,
} from './src/server/proxyInfra.mjs';
import {
  fetchTerrainChunkWithRetry,
  parseTerrainPoints,
  resolveTerrainHeightRequest,
  terrainPointKey,
  validTerrainResult,
} from './src/data/terrainHeightsProxy.js';
import { openAiRealtimeProxy } from './src/voice/openAiRealtimeProxy.mjs';
import { anthropicProxy } from './src/voice/anthropicProxy.mjs';

/** Resolve __dirname for ESM context. */
const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Which launcher started this process, captured at MODULE LOAD — before the
 * config factory's loadEnv() copies dotenv files into process.env. Provider
 * Settings uses this to decide which credential store it owns, so it must
 * reflect the real launcher (scripts/pinokio-start.mjs sets it) and never a
 * value a project `.env` could inject.
 */
const LAUNCHER_AT_BOOT = process.env.GEV_LAUNCHER;

/**
 * Provider values present before Vite loads the checkout's dotenv files.
 * Memoized on globalThis: a panel save sets its values live on process.env and
 * then calls server.restart(), which re-evaluates this config IN-PROCESS.
 * Recomputing the snapshot there would classify the panel's own keys as
 * external (read-only) until the whole process is relaunched.
 */
const PROVIDER_ENV_AT_BOOT = globalThis.__GEV_PROVIDER_ENV_AT_BOOT ??= Object.freeze(Object.fromEntries(
  [...knownKeySetupEnvVars()].map((name) => [name, String(process.env[name] ?? '').trim()]),
));

/**
 * `dev-fresh.sh` resolves dotenv and Keychain values before it starts Vite, so
 * it supplies an explicit names-only provenance marker for values inherited
 * from its parent shell. Plain Vite launches use the raw boot snapshot above;
 * Pinokio deliberately treats its app-scoped ENVIRONMENT as authoritative.
 */
const DEV_FRESH_EXTERNAL_KEYS_AT_BOOT = new Set(
  String(process.env.GEV_KEY_SETUP_EXTERNAL_KEYS ?? '')
    .split(',')
    .map((name) => name.trim())
    .filter((name) => knownKeySetupEnvVars().has(name)),
);

// --- Abuse guards for the Overpass proxy ------------------------------------
/** Max accepted POST body for the Overpass proxy (Overpass QL queries are tiny). */
const OVERPASS_MAX_BODY_BYTES = 24 * 1024; // 24 KB
/** Max concurrent in-flight upstream Overpass fetches across all distinct queries. */
const OVERPASS_MAX_CONCURRENT = 6;
let _overpassConcurrent = 0;

const _overpassRateLimiter = makeRateLimiter({ windowMs: 60_000, max: 90, globalMax: 300 });

/**
 * Re:Earth terrain point-height proxy: batched lon/lat → ellipsoidal height
 * lookups, keyless. Upstream: https://terrain.reearth.land/heights.json
 * (≤256 points per call). Terrain doesn't move, so results are cached to
 * disk with a long TTL (30 days) — mirrors celestrakProxy's memory+disk
 * cache and serve-stale shape. Cache entries and stale fallback are keyed per
 * 5dp point, so reordered and partially overlapping batches reuse prior work.
 * Only missing/stale points go upstream; the response is rebuilt in exact
 * request order. Oversized requests (>256 points) are chunked sequentially.
 */
function terrainHeightsProxy() {
  const TTL_MS = 30 * 24 * 3600_000;
  const CACHE_DIR = path.join(process.cwd(), '.gev-cache');
  const CACHE_PATH = path.join(CACHE_DIR, 'terrain-heights.json');
  const UPSTREAM_CHUNK = 256;
  const MAX_POINTS = 2000;

  /** @type {Map<string, {at:number, result:object}>} keyed by canonical 5dp lon/lat. */
  const mem = new Map();
  /** @type {Map<string, Promise<Array<object>>>} single-flight per missing-point subset. */
  const inflight = new Map();
  let diskLoaded = false;
  let diskDirty = false;

  /** Load the on-disk cache into memory once, lazily (first request only). */
  async function loadDiskOnce() {
    if (diskLoaded) return;
    diskLoaded = true;
    try {
      const parsed = JSON.parse(await fsp.readFile(CACHE_PATH, 'utf8'));
      const pointEntries = parsed?.version === 2 && parsed.points && typeof parsed.points === 'object'
        ? parsed.points
        : null;
      if (pointEntries) {
        for (const [key, entry] of Object.entries(pointEntries)) {
          if (entry && Number.isFinite(entry.at) && validTerrainResult(entry.result)) {
            mem.set(key, entry);
          }
        }
      } else if (parsed && typeof parsed === 'object') {
        // One-time migration from the former raw-batch cache. Zip only real,
        // positionally present results; an absent value never becomes height 0.
        for (const [rawPoints, entry] of Object.entries(parsed)) {
          const points = parseTerrainPoints(rawPoints);
          if (!points || !entry || !Number.isFinite(entry.at) || !Array.isArray(entry.results)) continue;
          for (let i = 0; i < points.length; i += 1) {
            const result = entry.results[i];
            if (!validTerrainResult(result)) continue;
            const key = terrainPointKey(points[i]);
            const existing = mem.get(key);
            if (!existing || entry.at > existing.at) mem.set(key, { at: entry.at, result });
          }
        }
        diskDirty = mem.size > 0;
      }
    } catch { /* no disk cache yet */ }
    // Periodic flush, same shape as adsbdbProxy: coalesce writes instead of
    // hitting disk on every request.
    setInterval(async () => {
      if (!diskDirty) return;
      diskDirty = false;
      try {
        await fsp.mkdir(CACHE_DIR, { recursive: true });
        const obj = { version: 2, points: Object.fromEntries(mem.entries()) };
        await fsp.writeFile(CACHE_PATH, JSON.stringify(obj), 'utf8');
      } catch (err) {
        diskDirty = true; // retry next tick
        console.warn('[terrain-heights-proxy] cache write failed:', err?.message || err);
      }
    }, 15_000).unref?.();
  }

  /**
   * Fetch all missing chunks sequentially (upstream caps each call at 256).
   *
   * The first try keeps its empirically required 30s timeout; network errors,
   * 429, and 5xx receive up to three jittered retries sharing a 10s added-time
   * budget, with Retry-After honored within that bound.
   * @param {Array<[number, number]>} points
   * @returns {Promise<Array<object>>}
   */
  async function fetchUpstreamAll(points) {
    const results = [];
    for (let i = 0; i < points.length; i += UPSTREAM_CHUNK) {
      const chunk = points.slice(i, i + UPSTREAM_CHUNK);
      const chunkResults = await fetchTerrainChunkWithRetry(chunk);
      // Keep later chunks aligned even if a malformed upstream response omits
      // trailing positions. The resolver will reject each null individually.
      for (let j = 0; j < chunk.length; j += 1) results.push(chunkResults[j] ?? null);
    }
    return results;
  }

  /** Coalesce concurrent requests for the same canonical missing-point list. */
  function fetchMissingSingleFlight(points) {
    const key = points.map(terrainPointKey).join(';');
    if (!inflight.has(key)) {
      const request = fetchUpstreamAll(points)
        .finally(() => {
          if (inflight.get(key) === request) inflight.delete(key);
        });
      inflight.set(key, request);
    }
    return inflight.get(key);
  }

  return {
    name: 'terrain-heights-proxy',
    configureServer(server) {
      server.middlewares.use('/api/terrain/heights', async (req, res) => {
        const send = (status, bodyObj) => {
          if (res.headersSent) return;
          res.writeHead(status, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(bodyObj));
        };
        try {
          await loadDiskOnce();
          const parsedUrl = new URL(req.url || '', 'http://internal');
          const rawPoints = parsedUrl.searchParams.get('points');
          const points = parseTerrainPoints(rawPoints);
          if (!points) {
            send(400, { error: 'invalid points parameter — expected "lon,lat;lon,lat;…" with finite numbers' });
            return;
          }
          if (points.length > MAX_POINTS) {
            send(500, { error: `too many points (${points.length}); max ${MAX_POINTS} per request` });
            return;
          }

          const outcome = await resolveTerrainHeightRequest({
            points,
            cache: mem,
            fetchMissing: fetchMissingSingleFlight,
            ttlMs: TTL_MS,
          });
          if (outcome.cacheChanged) diskDirty = true;
          if (outcome.upstreamError) {
            console.warn(
              `[terrain-heights-proxy] refresh incomplete (${outcome.upstreamError?.message || outcome.upstreamError})`
              + ' — serving stale points when available'
            );
          }
          send(outcome.status, outcome.body);
        } catch (err) {
          send(500, { error: `terrain heights proxy error: ${err?.message || err}` });
        }
      });
    },
  };
}

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
 * @param {import('http').ServerResponse} res - Node HTTP response.
 * @param {{status:number,body:string,contentType:string,endpoint:string}} payload
 * @param {string} [cacheStatus='MISS'] - 'HIT', 'MISS', or 'INFLIGHT'.
 */
function sendOverpassResponse(res, payload, cacheStatus = 'MISS') {
  res.writeHead(payload.status, {
    'Content-Type': payload.contentType || 'application/json',
    'Cache-Control': 'public, max-age=15',
    'X-Overpass-Cache': cacheStatus,
    'X-Overpass-Upstream': payload.endpoint || 'unknown',
  });
  res.end(payload.body || '');
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
 * @returns {import('vite').Plugin}
 */
function overpassProxy() {
  return {
    name: 'overpass-proxy',
    configureServer(server) {
      server.middlewares.use('/api/overpass', async (req, res) => {
        // Hoisted out of the try so the catch's serve-stale lookup can see it
        // (a body-read failure would otherwise hit an out-of-scope reference).
        let cacheKey = null;
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
          const preflight = await resolveOverpassPreflight({
            cacheKey,
            memoryCache: _overpassCache,
            inFlight: _overpassInFlight,
            // Fresh-enough disk entries survive restarts and skip the public
            // mirrors; boundary-class queries keep their month-long TTL.
            readDisk: () => readOverpassDisk(cacheKey, overpassDiskTtlMs(cacheKey)),
            allowUpstream: () => _overpassRateLimiter(clientKey(req)),
          });
          if (preflight.source === 'RATE_LIMITED') {
            res.writeHead(429, { 'Content-Type': 'application/json', 'Retry-After': '5' });
            res.end(JSON.stringify({ error: 'Rate limit exceeded' }));
            return;
          }
          if (preflight.source !== 'UPSTREAM') {
            if (preflight.source === 'DISK') {
              _overpassCache.set(cacheKey, preflight.payload);
              trimOverpassCache();
            }
            sendOverpassResponse(res, preflight.payload, preflight.source);
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
          const requestPromise = fetchOverpassPayload(safeBody)
            .then((payload) => {
              if (payload.status < 500 && !payload.rateLimited && !payload.runtimeError) {
                const entry = { ...payload, cachedAt: Date.now() };
                _overpassCache.set(cacheKey, entry);
                trimOverpassCache();
                writeOverpassDisk(cacheKey, entry);
              }
              return payload;
            })
            .finally(() => {
              _overpassConcurrent -= 1;
              _overpassInFlight.delete(cacheKey);
            });

          _overpassInFlight.set(cacheKey, requestPromise);
          const payload = await requestPromise;
          // Degraded upstream (rate-limited on every mirror / 5xx / runtime
          // error): last-good roads beat an empty layer — serve stale from
          // memory or disk at ANY age before surfacing the failure.
          if (payload.rateLimited || payload.runtimeError || payload.status >= 500) {
            const stale = _overpassCache.get(cacheKey) || await readOverpassDisk(cacheKey, Infinity);
            if (stale) {
              sendOverpassResponse(res, stale, 'STALE');
              return;
            }
          }
          sendOverpassResponse(res, payload, 'MISS');
        } catch (e) {
          // Every mirror threw (network-level). Same serve-stale rule.
          const stale = cacheKey
            ? (_overpassCache.get(cacheKey) || await readOverpassDisk(cacheKey, Infinity).catch(() => null))
            : null;
          if (stale) {
            sendOverpassResponse(res, stale, 'STALE');
            return;
          }
          console.error('[Overpass Proxy]', e.message);
          res.writeHead(502, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Overpass proxy error' }));
        }
      });
    },
  };
}

// ---------------------------------------------------------------------------
// Regional cockpit briefing proxy + weather effects proxy
// ---------------------------------------------------------------------------
// Moved to src/data/regionalProxyHandlers.mjs — a mechanical relocation, not
// a redesign (see that file's header). `requiredFiniteQueryNumber` and
// `validRegionalPoint` are re-exported here because
// src/data/regionalProxy.test.mjs imports them directly from this module.
export { requiredFiniteQueryNumber, validRegionalPoint, regionalBriefHasAnySource };

// `makeRateLimiter`, `clientKey`, `readResponseJsonCapped`,
// `readResponseTextCapped`, and `coalesceProxyRequest` now live in
// src/server/proxyInfra.mjs (generic proxy infra, imported above) —
// re-exported here because src/data/regionalProxyHandlers.mjs and
// src/data/regionalProxy.test.mjs import them directly from this module.
export { makeRateLimiter, clientKey, readResponseJsonCapped, readResponseTextCapped, coalesceProxyRequest };

// `LL2_CACHE_TTL_MS` and `launchLibraryRequestHeaders` now live in
// src/data/rocketLaunchesProxy.mjs (imported above) — re-exported here
// because src/data/regionalProxy.test.mjs imports them directly from this
// module.
export { LL2_CACHE_TTL_MS, launchLibraryRequestHeaders };

// `keylessGooglePlacesResponse` now lives in
// src/data/googlePlacesContextProxy.mjs (imported above) — re-exported here
// because src/data/regionalProxy.test.mjs imports it directly from this
// module.
export { keylessGooglePlacesResponse };

// `validMilitaryInstallationBox` now lives in
// src/data/militaryInstallationsProxy.mjs (imported above) — re-exported
// here because src/data/regionalProxy.test.mjs imports it directly from
// this module.
export { validMilitaryInstallationBox };

// `adsbLolFallbackAnchor` now lives in src/data/openSkyProxy.mjs (imported
// above) — re-exported here because src/data/regionalProxy.test.mjs imports
// it directly from this module.
export { adsbLolFallbackAnchor };

/**
 * Forward-search (place name -> candidates) via Nominatim, for
 * `nominatimSearchProxy()` below. Only the top hit is used by callers
 * (src/geocodeProvider.js), matching Google Geocoding's `results[0]`-only
 * usage — so `limit=1`. Shares the same request queue/throttle as
 * `fetchRegionalPlace` (reverse geocode, src/data/regionalProxyHandlers.mjs)
 * via the imported `queuedNominatimFetch`/`fetchRegionalJson`/
 * `NOMINATIM_HEADERS` — this stayed in vite.config.js (out of scope for that
 * move) but must not spin up a second, independent Nominatim throttle.
 */
function fetchNominatimSearch(query, viewbox) {
  return queuedNominatimFetch(async () => {
    const params = new URLSearchParams({
      q: query,
      format: 'jsonv2',
      addressdetails: '1',
      limit: '1',
    });
    if (viewbox) params.set('viewbox', viewbox);
    return fetchRegionalJson(`https://nominatim.openstreetmap.org/search?${params}`, {
      headers: NOMINATIM_HEADERS,
    });
  });
}

/**
 * Vite plugin: forward-geocode via Nominatim (search box, voice fly-to, voice
 * Radio — see src/geocodeProvider.js). Server-side because Nominatim's usage
 * policy requires a custom User-Agent, which browser `fetch` cannot set.
 */
export function nominatimSearchProxy() {
  function install(middlewares) {
    middlewares.use('/api/nominatim/search', async (req, res) => {
      if (req.method !== 'GET') {
        res.statusCode = 405;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: 'Method not allowed' }));
        return;
      }
      if (!enforceOptInRateLimit(nominatimSearchRateLimiter(), req, res)) return;

      const url = new URL(req.url || '', 'http://localhost');
      const query = String(url.searchParams.get('q') || '').trim();
      if (!query) {
        res.statusCode = 400;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: 'A non-empty q is required' }));
        return;
      }
      const viewbox = url.searchParams.get('viewbox') || null;

      try {
        const results = await fetchNominatimSearch(query, viewbox);
        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Cache-Control', 'no-store');
        res.end(JSON.stringify(Array.isArray(results) ? results : []));
      } catch {
        res.statusCode = 502;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: 'Nominatim search is temporarily unavailable' }));
      }
    });
  }

  return {
    name: 'nominatim-search-proxy',
    configureServer(server) {
      install(server.middlewares);
    },
    configurePreviewServer(server) {
      install(server.middlewares);
    },
  };
}

/**
 * In-app key setup ("POWER UP" panel) — dev-server only.
 *
 * GET  /api/setup/status → which keys are configured, as presence plus a
 *   source classification. Never a value or suffix. The panel renders itself entirely from
 *   this payload, so the key registry stays in one place (src/keySetupCore.mjs).
 * POST /api/setup/keys → validate {ENV_VAR: value} pairs and upsert them into
 *   the repo-root .env (created if absent), set process.env live, then restart
 *   the dev server so the client-exposed defines re-inject and the page
 *   reloads itself. Pasting a key in the app IS the whole setup — no
 *   hand-edited env files.
 *
 * Loopback-only on purpose: with HOST=0.0.0.0 the app can be shared on a LAN,
 * and a guest must be able to neither write the host's .env nor probe which
 * keys exist. Prod builds never register this middleware (apply: 'serve'), so
 * the panel's status fetch fails and the client removes the whole surface.
 */
function keySetupEndpoint() {
  const respond = (res, statusCode, payload) => {
    res.statusCode = statusCode;
    res.setHeader('Content-Type', 'application/json');
    // A credential-status response must never be cached by a proxy or the disk
    // cache, and the surface must never be framed (clickjacking a same-origin
    // REMOVE/replace past the Origin check).
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Content-Security-Policy', "frame-ancestors 'none'");
    res.end(JSON.stringify(payload));
  };
  // Which store this launch owns. A Pinokio-managed launch (marker set by
  // scripts/pinokio-start.mjs) writes the app-scoped pinokio/ENVIRONMENT that
  // applyPinokioEnvironment() treats as authoritative; every other launch
  // writes the repo-root .env that Vite's loadEnv reads. The panel never
  // touches a store some other workflow owns.
  // The launcher marker is read from the BOOT environment captured before
  // Vite's loadEnv merges dotenv files into process.env — otherwise a stray
  // `GEV_LAUNCHER=pinokio` line in someone's .env would silently redirect a
  // plain `npm run dev` to write the Pinokio store it never loaded.
  const pinokioManaged = () => LAUNCHER_AT_BOOT === 'pinokio';
  const storeName = () => (pinokioManaged() ? 'pinokio-environment' : 'env-file');
  const storePath = () => path.join(__dirname, ...(pinokioManaged() ? ['pinokio', 'ENVIRONMENT'] : ['.env']));
  // Read the store, distinguishing "no store yet" from "cannot read this
  // store". Only ENOENT means empty. Every other failure — a permission error,
  // an I/O fault, an undecodable file — must ABORT the save: upserting into a
  // wrongly-empty string and atomically replacing the file would destroy every
  // other provider key the user had configured.
  const readStore = () => {
    try {
      // The Pinokio launcher deliberately supports a UTF-16 ENVIRONMENT (a
      // Windows editor or the native Configure panel can write one). Reuse its
      // own encoding-aware decoder so a panel write can never mistake UTF-16
      // bytes for UTF-8, corrupt the file, and wedge the next launch. We always
      // write back UTF-8, which is exactly what the launcher normalizes to.
      if (pinokioManaged()) return readPinokioEnvironmentSource(storePath());
      return fs.readFileSync(storePath(), 'utf8');
    } catch (error) {
      if (error?.code === 'ENOENT') return ''; // The first saved key births the file.
      const unreadable = new Error('the existing configuration could not be read, so nothing was changed');
      unreadable.code = 'GEV_STORE_UNREADABLE';
      throw unreadable;
    }
  };
  // Status must never fail because the store is unreadable — it reports the
  // LIVE environment, and an unreadable store only costs file/external
  // attribution. Persistence uses readStore() directly and refuses instead.
  const storeValues = () => {
    try {
      return parseDotenvText(readStore());
    } catch {
      return {};
    }
  };
  // The gate itself is pure and unit-tested (admitKeySetupRequest in
  // src/keySetupCore.mjs) — this just feeds it the request.
  const admit = (req) => admitKeySetupRequest({
    method: req.method,
    remoteAddress: req.socket?.remoteAddress,
    hostHeader: req.headers?.host,
    protocol: req.socket?.encrypted ? 'https:' : 'http:',
    origin: req.headers?.origin,
    contentType: req.headers?.['content-type'],
    proxyHeaders: req.headers || {},
    env: process.env,
  });
  // Is this env var supplied by a workflow OTHER than this panel's store? Boot
  // provenance closes the equal-value ambiguity: an exported X remains
  // external even when the editable store independently contains X.
  const isExternallyManaged = (name, inStore) => {
    const wasExternalAtBoot = pinokioManaged()
      ? false
      : LAUNCHER_AT_BOOT === 'dev-fresh'
        ? DEV_FRESH_EXTERNAL_KEYS_AT_BOOT.has(name)
        : PROVIDER_ENV_AT_BOOT[name] !== '';
    return isKeySetupExternallyManaged({
      effectiveValue: process.env[name],
      storedValue: inStore[name],
      wasExternalAtBoot,
    });
  };
  const providerStatus = () => {
    const inStore = storeValues();
    const status = keySetupStatus(process.env);
    for (const key of status.keys) {
      // 'file' = this panel's own store holds exactly this value (replace/remove
      // offered); 'external' = supplied by env/Keychain/another workflow
      // (read-only — the panel must never rewrite or delete it).
      key.managed = key.set
        ? (key.envVars.some((name) => isExternallyManaged(name, inStore)) ? 'external' : 'file')
        : null;
    }
    return { ...status, store: storeName() };
  };
  // Atomically replace the store's content: fresh same-dir temp created 0600
  // with the exclusive flag, fsync, rename over the target. Closes the window
  // where writeFileSync leaves a 0644 file holding a real key before any later
  // chmod, and the truncate-in-place data-loss path.
  const persistStore = (text) => {
    const filepath = storePath();
    // Never write THROUGH a symlink into a credential path.
    try {
      if (fs.lstatSync(filepath).isSymbolicLink()) {
        throw new Error('refusing to write a credential store that is a symlink');
      }
    } catch (error) {
      if (error.code !== 'ENOENT') throw error; // absent is fine — first save.
    }
    // Random suffix, not the pid: a stale temp from a failed rename would
    // otherwise make every later save in this process fail EEXIST forever.
    const tmp = path.join(
      path.dirname(filepath),
      `.${path.basename(filepath)}.${randomUUID().slice(0, 8)}.tmp`,
    );
    const fd = fs.openSync(tmp, 'wx', 0o600);
    let staged = false;
    try {
      // Restrict the EMPTY temp file BEFORE the secret touches it. On Windows
      // a fresh file inherits the directory's ACL (world-readable under a
      // C:-rooted Pinokio home) and the 0600 open mode is a no-op — and NTFS
      // renames carry the file object's ACL with it, so hardening the temp IS
      // hardening the final file. Ordering this before the write means a
      // hardening failure aborts with the previous store fully intact and the
      // secret never on disk unprotected — no rollback path to get wrong.
      if (!hardenCredentialFile(tmp)) {
        const error = new Error('could not restrict the credential file to your account; nothing was saved');
        error.code = 'GEV_HARDEN_FAILED';
        throw error;
      }
      // writeSync may write fewer bytes than asked; loop until the whole
      // buffer lands or a truncated store gets fsynced and renamed into place.
      const buffer = Buffer.from(text, 'utf8');
      let written = 0;
      while (written < buffer.length) {
        written += fs.writeSync(fd, buffer, written, buffer.length - written);
      }
      fs.fsyncSync(fd);
      staged = true;
    } finally {
      fs.closeSync(fd);
      if (!staged) fs.rmSync(tmp, { force: true });
    }
    try {
      fs.renameSync(tmp, filepath);
    } catch (error) {
      // Never strand a staged secret on disk when the swap itself fails.
      fs.rmSync(tmp, { force: true });
      throw error;
    }
  };
  return {
    name: 'gev-key-setup',
    // serve AND not preview: `vite preview` resolves with command 'serve' too,
    // so a bare apply:'serve' would still configure under preview. The endpoints
    // only install via configureServer (never configurePreviewServer), so they
    // are absent from preview today — but pinning apply here makes that a
    // guarantee rather than an accident of which hook a future edit uses.
    apply: (_config, { command, isPreview }) => command === 'serve' && !isPreview,
    configureServer(server) {
      server.middlewares.use('/api/setup/status', (req, res) => {
        if (req.method !== 'GET') return respond(res, 405, { error: 'Method not allowed' });
        const admission = admit(req);
        if (!admission.ok) return respond(res, admission.status, { error: admission.error });
        respond(res, 200, providerStatus());
      });
      server.middlewares.use('/api/setup/keys', (req, res) => {
        if (req.method !== 'POST') return respond(res, 405, { error: 'Method not allowed' });
        const admission = admit(req);
        if (!admission.ok) return respond(res, admission.status, { error: admission.error });
        let body = '';
        let overflowed = false;
        req.on('data', (chunk) => {
          body += chunk;
          if (body.length > 8192) {
            overflowed = true;
            req.destroy();
          }
        });
        req.on('end', () => {
          if (overflowed) return respond(res, 413, { error: 'Request too large' });
          let parsed;
          try {
            parsed = JSON.parse(body || '{}');
          } catch {
            return respond(res, 400, { error: 'Invalid JSON' });
          }
          const verdict = validateKeySetupUpdates(parsed);
          if (!verdict.ok) return respond(res, 400, { error: verdict.error });
          // Neither a replace NOR a removal may touch an externally-supplied
          // credential (shell env, Keychain, another workflow). This backs the
          // UI's read-only "configured externally" state with a real contract —
          // and it must guard replace too, not just remove: a clickjacked or
          // scripted same-origin POST could otherwise overwrite the live value.
          const inStore = storeValues();
          for (const name of Object.keys(verdict.updates)) {
            if (isExternallyManaged(name, inStore)) {
              return respond(res, 409, {
                error: `${name} is configured outside Provider Settings and can only be changed where it was set`,
              });
            }
          }
          try {
            persistStore(upsertDotenvValues(readStore(), verdict.updates));
          } catch (error) {
            // The hardening failure carries its own honest, path-free message —
            // "saved world-readable" must never be reported as a generic write
            // error. Everything else returns a fixed message (a raw filesystem
            // error can carry an absolute path; that stays in the server log).
            if (error?.code === 'GEV_HARDEN_FAILED' || error?.code === 'GEV_STORE_UNREADABLE') {
              return respond(res, 500, { error: `The key was not saved: ${error.message}` });
            }
            return respond(res, 500, { error: `Could not write the ${storeName()} store` });
          }
          // Live for the server-side proxies immediately; the restart below is
          // what re-injects the client-exposed defines (Google, Cesium ion).
          // Removal sets '' rather than deleting: an empty value stays falsy
          // through loadEnv after restart, matching the Pinokio launcher's own
          // blank-field semantics.
          for (const [name, value] of Object.entries(verdict.updates)) {
            process.env[name] = value === null ? '' : value;
          }
          respond(res, 200, {
            ok: true,
            saved: Object.keys(verdict.updates),
            status: providerStatus(),
            restarting: true,
          });
          // One deliberate restart, after the response has flushed. Vite's own
          // .env watcher may fire too; a second queued restart is harmless.
          setTimeout(() => {
            server.restart().catch((error) => {
              console.warn('[KeySetup] Dev-server restart failed:', error?.message || error);
            });
          }, 250);
        });
      });
    },
  };
}

/**
 * Main Vite configuration factory.
 *
 * Loads .env files via Vite's loadEnv, registers Cesium + local proxy
 * plugins, configures the dev server host/port, and exposes selected
 * API keys to the client as import.meta.env defines.
 */
export default defineConfig(({ mode }) => {
  // Load only this checkout's dotenv files. Shell/Keychain values still win,
  // and no sibling workspace is consulted implicitly.
  const loaded = loadEnv(mode, __dirname, '');
  for (const [key, val] of Object.entries(loaded)) {
    if (process.env[key] === undefined) process.env[key] = val;
  }
  const env = { ...process.env };
  const localAllowedHosts = ['localhost', '127.0.0.1', '.local'];
  return {
    plugins: [
      cesium(),
      openSkyProxy(),
      celestrakProxy(),
      tomtomProxy(),
      firmsProxy(),
      myMapsProxy(),
      rocketLaunchesProxy(),
      terrainHeightsProxy(),
      adsbdbProxy(),
      overpassProxy(),
      osrmRouteProxy(),
      militaryInstallationsProxy(),
      regionalBriefProxy(),
      weatherEffectsProxy(),
      cctvProxy(),
      radioBrowserProxy(),
      gbfsProxy(),
      adsbLolProxy(),
      aisLiveProxy(),
      trackBackfillProxies(),
      openAiRealtimeProxy(),
      anthropicProxy(),
      googlePlacesContextProxy(),
      nominatimSearchProxy(),
      keySetupEndpoint(),
    ],
    server: {
      host: env.HOST || 'localhost',
      port: parseInt(env.PORT, 10) || 4173,
      // When binding to all interfaces, allow any host; otherwise restrict to local names
      allowedHosts: (env.HOST === '0.0.0.0' || env.HOST === '::')
        ? true
        : localAllowedHosts,
      fs: {
        // Pinokio keeps optional credentials in this ignored local file.
        deny: ['.env', '.env.*', '*.{crt,pem}', '**/.git/**', '**/ENVIRONMENT'],
      },
      // Framing protection belongs on the APP DOCUMENT, not on API responses:
      // a browser evaluates frame-ancestors against the framed page's own
      // navigation response. Without this, a hostile page could frame
      // `/?setup=1`, align a lure over Provider Settings, and have the framed
      // app issue a perfectly same-origin credential write that passes every
      // Host/Origin check. These headers apply to everything this dev server
      // serves, which is what makes that attack impossible rather than unlikely.
      headers: {
        'X-Frame-Options': 'DENY',
        'Content-Security-Policy': "frame-ancestors 'none'",
      },
    },
    // Expose selected API keys to the browser via import.meta.env.*
    define: {
      'import.meta.env.GOOGLE_MAPS_API_KEY': JSON.stringify(env.GOOGLE_MAPS_API_KEY),
      'import.meta.env.CESIUM_ION_TOKEN': JSON.stringify(env.CESIUM_ION_TOKEN),
    },
    build: {
      // The Cesium engine bundle is inherently large; raise the warning ceiling
      // so the build log isn't dominated by an expected chunk-size notice.
      chunkSizeWarningLimit: 1500,
    },
  };
});
