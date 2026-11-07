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
 *     src/data/overpassDiskCache.mjs (the disk layer of that cache) +
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
 *   - src/voice/openAiVoiceProxy.mjs — GPT-Live voice session, screenshot
 *     reader and HUD-summary proxies.
 *   - src/data/terrainHeightsProxy.js — Re:Earth ellipsoidal point-height
 *     lookups.
 *
 *   - src/admin/keys/ — the provider-key store behind /admin → API Keys. Its boot-time provenance snapshots stay in this file because
 *     they must be captured when THIS module first loads.
 *
 * `nominatimSearchProxy()` (forward geocode) stays defined in this file —
 * see its own JSDoc for why it wasn't moved out with the rest.
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
import path from 'node:path';
import { loadCheckoutEnv } from './src/config/dotenvPrecedence.mjs';
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
import { aisLiveProxy, aisStreamKeyEvidence } from './src/data/aisLiveProxy.mjs';
import {
  OVERPASS_CACHE_MAX_ENTRIES,
  _overpassCache,
  _overpassInFlight,
  sanitizeOverpassBody,
  resolveOverpassPreflight,
  fetchOverpassPayload,
} from './src/data/overpassCore.mjs';
import {
  readOverpassDisk,
  writeOverpassDisk,
  overpassDiskTtlMs,
} from './src/data/overpassDiskCache.mjs';
import { serveFromCover } from './src/data/overpassCoverIndex.mjs';
import { createOverpassCoverStore } from './src/data/overpassCoverStore.mjs';
import {
  militaryInstallationsProxy,
  validMilitaryInstallationBox,
} from './src/data/militaryInstallationsProxy.mjs';
import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv } from 'vite';
import cesium from 'vite-plugin-cesium';
import react from '@vitejs/plugin-react';
import { adminRoute, skipOnAdminPage } from './src/admin/adminRoute.mjs';
import { adminAuthPlugin } from './src/admin/auth/adminAuthPlugin.mjs';
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
import { knownKeySetupEnvVars } from './src/keySetupCore.mjs';
import { createProviderKeyStore } from './src/admin/keys/providerKeyStore.mjs';
import { adminKeysPlugin } from './src/admin/keys/adminKeysRoutes.mjs';
import { createAdminAuditLog } from './src/admin/audit/adminAuditLog.mjs';
import { serverLogPlugin } from './src/admin/log/serverLogPlugin.mjs';
import { systemHealthPlugin } from './src/admin/health/systemHealthPlugin.mjs';
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
import { openAiVoiceProxy } from './src/voice/openAiVoiceProxy.mjs';

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

/** package.json version, for the browser Server Log entries. */
const APP_VERSION = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'), 'utf8')).version;

/** Owner audit trail, shown on /admin → Audit Log (names and codes only, never values). */
const adminAudit = createAdminAuditLog();

/**
 * The provider-key store behind /admin → API Keys
 * (src/admin/keys/providerKeyStore.mjs). It is handed the BOOT snapshots
 * above so a restart's re-evaluation cannot reclassify keys.
 */
const providerKeyStore = createProviderKeyStore({
  rootDir: __dirname,
  launcherAtBoot: LAUNCHER_AT_BOOT,
  providerEnvAtBoot: PROVIDER_ENV_AT_BOOT,
  devFreshExternalAtBoot: DEV_FRESH_EXTERNAL_KEYS_AT_BOOT,
});

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
  // Remembers cached road tiles so a miss inside one is answered by cropping it
  // (src/data/overpassCoverIndex.mjs) instead of waiting on the public mirrors.
  const coverIndex = createOverpassCoverStore();
  const readCover = (key) => _overpassCache.get(key) || readOverpassDisk(key, overpassDiskTtlMs(key));
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
          if (preflight.source === 'RATE_LIMITED' || preflight.source === 'UPSTREAM') {
            const covered = await serveFromCover(coverIndex, cacheKey, readCover);
            if (covered) {
              // Memory only (not disk, not the index): repeats skip the crop,
              // and the disk keeps one copy per real upstream answer.
              _overpassCache.set(cacheKey, covered);
              trimOverpassCache();
              sendOverpassResponse(res, covered, 'COVER');
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
                coverIndex.record(cacheKey, entry.cachedAt);
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
 * Main Vite configuration factory.
 *
 * Loads .env files via Vite's loadEnv, registers Cesium + local proxy
 * plugins, configures the dev server host/port, and exposes selected
 * API keys to the client as import.meta.env defines.
 */
export default defineConfig(({ mode }) => {
  // Load only this checkout's dotenv files. A real shell/Keychain value still
  // wins, an EMPTY one counts as absence (loadEnv itself defers to empties, so
  // they must be pruned before it reads), and no sibling workspace is
  // consulted implicitly — see src/config/dotenvPrecedence.mjs.
  loadCheckoutEnv({ target: process.env, loadEnv, mode, dir: __dirname });
  const env = { ...process.env };
  const localAllowedHosts = ['localhost', '127.0.0.1', '.local'];
  return {
    plugins: [
      skipOnAdminPage(cesium()),
      // React is for the /admin dashboard only; the map app stays plain JS.
      react({ include: /src\/admin\/.*\.jsx$/ }),
      adminRoute(),
      // First of the server plugins: its failure watch must see every /api response.
      serverLogPlugin({ audit: adminAudit, aisFeedEvidence: aisStreamKeyEvidence }),
      adminAuthPlugin({ audit: adminAudit }),
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
      openAiVoiceProxy({ audit: adminAudit }),
      googlePlacesContextProxy(),
      nominatimSearchProxy(),
      // Provider keys are managed only from /admin → API Keys (dev server only).
      adminKeysPlugin({ store: providerKeyStore, audit: adminAudit, aisFeedEvidence: aisStreamKeyEvidence }),
      systemHealthPlugin({ keyStore: providerKeyStore, audit: adminAudit, aisFeedEvidence: aisStreamKeyEvidence, appVersion: APP_VERSION }),
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
      // App version stamped on browser Server Log entries (to reproduce a bug).
      'import.meta.env.GEV_APP_VERSION': JSON.stringify(APP_VERSION),
    },
    build: {
      // The Cesium engine bundle is inherently large; raise the warning ceiling
      // so the build log isn't dominated by an expected chunk-size notice.
      chunkSizeWarningLimit: 1500,
      rollupOptions: {
        input: {
          main: path.resolve(__dirname, 'index.html'),
          admin: path.resolve(__dirname, 'admin.html'),
        },
      },
    },
  };
});
