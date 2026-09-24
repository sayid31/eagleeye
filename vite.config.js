/**
 * Vite configuration for EagleEye View — a cinematic geospatial app.
 *
 * Registers the dev-server proxy middlewares that bypass CORS and add
 * caching/auth for upstream APIs:
 *   1. OpenSky  — aircraft state vectors (OAuth / Basic / anon)
 *   2. CelesTrak — satellite TLE orbital elements
 *   3. Overpass  — OpenStreetMap road geometry queries
 *   4. GBFS     — bike-share station feeds
 *   5. CCTV     — traffic-camera frames, media streams, and fallback SVG
 *   6. adsb.lol — military aircraft tracking
 *   7. AIS live — AISStream websocket-backed live vessel positions
 *   8. Terrain heights — Re:Earth keyless point-height lookups (ellipsoidal ground)
 *   9. TomTom   — live traffic-flow vector tiles (budget-governed, keyless-degradable)
 *  10. NASA FIRMS — live active-fire detections (VIIRS ×3, trailing 24 h)
 *  11. Military-installation context — bounded, cached OpenStreetMap features
 *  12. Regional briefing — cached place, weather, and recent location-matched news
 *  13. Weather effects — camera-local Open-Meteo observations without news/geocoding overhead
 *  14. Rocket launches — recent Launch Library 2 mission metadata
 *  15. Radio Browser — public-domain station directory and click counting
 *
 * Also exposes Cesium and Google 3D Tiles API keys to the
 * client via `import.meta.env.*` defines.
 *
 * @module vite.config
 */

import fs from 'node:fs';
import os from 'node:os';
import { promises as fsp } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import path from 'node:path';
import { Readable } from 'node:stream';
import https from 'node:https';
import { lookup as lookupDns } from 'node:dns/promises';
import { celestrakProxy } from './src/data/celestrakProxy.mjs';
import { tomtomProxy } from './src/data/tomtomProxy.mjs';
import { firmsProxy } from './src/data/firmsProxy.mjs';
import { adsbdbProxy } from './src/data/adsbdbProxy.mjs';
import { gbfsProxy } from './src/data/gbfsProxy.mjs';
import { rocketLaunchesProxy, LL2_CACHE_TTL_MS, launchLibraryRequestHeaders } from './src/data/rocketLaunchesProxy.mjs';
import { googlePlacesContextProxy, keylessGooglePlacesResponse } from './src/data/googlePlacesContextProxy.mjs';
import { cctvProxy } from './src/data/cctvProxy.mjs';
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
  migrateMilitaryInstallationEntry,
  militaryInstallationCacheKey,
  militaryInstallationDiskFresh,
  militaryInstallationDiskPath,
  quantizeMilitaryInstallationBox,
  readMilitaryInstallationDisk,
  resolveMilitaryInstallationTier,
  writeMilitaryInstallationDisk,
} from './src/data/militaryInstallationsProxy.mjs';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { defineConfig, loadEnv } from 'vite';
import cesium from 'vite-plugin-cesium';
import { radioBrowserProxy } from './src/data/radioBrowserProxy.mjs';
import {
  normalizeRegionalArticles,
  normalizeRegionalPlace,
  normalizeRegionalWeather,
} from './src/data/regionalBrief.js';
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
import { normalizeAdsbLolPointResponse } from './src/data/adsbLolFallback.js';
import { createAisStreamAdapter, isRecognizedAisEnvelope } from './src/data/aisStreamAdapter.js';
import { parseSilenceTimeoutEnv } from './src/data/aisWatchdog.js';
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
  makeOptInRateLimiter,
  nominatimSearchRateLimiter,
  enforceOptInRateLimit,
  clientKey,
  readRequestBodyCapped,
  readResponseTextCapped,
  readResponseJsonCapped,
  coalesceProxyRequest,
  toReadable,
  readCappedResponseText,
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

// ---------------------------------------------------------------------------
// OpenSky OAuth2 token + response cache state
// ---------------------------------------------------------------------------
/** @type {string|null} Current OAuth2 bearer token. */
let _openskyToken = null;
/** @type {number} Epoch-ms when the current token expires. */
let _openskyTokenExpiry = 0;
/** @type {Promise<string|null>|null} In-flight token refresh promise (coalesces concurrent callers). */
let _openskyTokenPromise = null;
/** @type {string|null} Cached upstream response body (JSON text). */
let _openskyCacheBody = null;
/** @type {number} HTTP status of the cached response. */
let _openskyCacheStatus = 0;
/** @type {number} Epoch-ms when the response was cached. */
let _openskyCacheTime = 0;
/** @type {{requestedMode:string,usedMode:string,reason:string}|null} Auth metadata for the cached response. */
let _openskyCacheMeta = null;
/** @type {number|null} Source snapshot epoch from the cached OpenSky body. */
let _openskyCacheSourceEpochMs = null;
/** TTL for the OpenSky response cache (ms). */
const OPENSKY_CACHE_MS = 9000;
// --- OpenSky credit governor (field-test fix 2026-07-06) -------------------
// The global /states/all this proxy fetches costs 4 CREDITS per call against
// OpenSky's ~4000/day authenticated budget — a day with the app open burned
// the whole quota in ~8h and the layer then hard-died until the daily reset
// ("rate limited for 48h" owner report; auth itself was fine). Three levers:
//  1. Adaptive TTL: OpenSky returns X-Rate-Limit-Remaining on success; as the
//     budget thins, the proxy stretches its cache TTL so a full day of
//     continuous use never exhausts it.
//  2. 429 cooldown: honor X-Rate-Limit-Retry-After-Seconds — no upstream
//     attempts until it passes (bounded 30 s … 30 min).
//  3. Serve-stale: while rate-limited/cooling, serve the last-good body (200 +
//     X-OpenSky-Stale) so the layer keeps rendering instead of dying.
/** @type {number} Current adaptive TTL (ms) — starts at the base cache TTL. */
let _openskyTtlMs = OPENSKY_CACHE_MS;
/** @type {number} Epoch-ms before which no upstream fetch is attempted. */
let _openskyCooldownUntil = 0;
/**
 * Picks the cache TTL from the remaining daily credit budget.
 * Client polls every 30 s, so tiers ≤30 s cost the same 480 credits/h; the
 * later tiers stretch the day: >2400 → ~3 h of full freshness, then 30 s
 * (~2.5 h), 90 s (~5 h), 300 s (~8 h) ≈ 18+ h of continuous use per day.
 * @param {number} remaining - X-Rate-Limit-Remaining header value.
 * @returns {number} TTL in ms.
 */
function openskyAdaptiveTtlMs(remaining) {
  if (!Number.isFinite(remaining)) return OPENSKY_CACHE_MS;
  if (remaining > 2400) return OPENSKY_CACHE_MS;
  if (remaining > 1200) return 30_000;
  if (remaining > 400) return 90_000;
  return 300_000;
}
/** @type {boolean} Guards duplicate auth-failure warnings in logs. */
let _openskyAuthWarned = false;
/** @type {boolean} Guards duplicate invalid-auth-mode warnings. */
let _openskyAuthModeWarned = false;
/** Default auth mode when OPENSKY_AUTH_MODE env is unset. */
const OPENSKY_AUTH_MODE_DEFAULT = 'oauth';
/** Set of valid OPENSKY_AUTH_MODE values. */
const OPENSKY_AUTH_MODE_SET = new Set(['basic', 'oauth', 'auto', 'anon']);
/** Regional civilian fallback cache, keyed by a coarse 0.25° view anchor. */
const _adsbLolPointCache = new Map();
/** Per-anchor single-flight map for concurrent regional fallback requests. */
const _adsbLolPointInFlight = new Map();
const ADSBLOL_POINT_CACHE_MS = 12000;
const ADSBLOL_POINT_CACHE_MAX = 80;
const ADSBLOL_POINT_RADIUS_NM = 250;
const ADSBLOL_POINT_MAX_RESPONSE_BYTES = 8 * 1024 * 1024;
// A 200 response can still contain an old OpenSky snapshot. Past this point
// the viewport-scoped adsb.lol source is more honest and keeps local motion
// current instead of coasting a stale worldwide frame indefinitely.
const OPENSKY_SOURCE_STALE_MS = 120_000;
/** OSM routing (FOSSGIS OSRM) cache: profile|coords -> { payload, cachedAt }. */
const ROUTE_CACHE_MS = 600000;
// Local duplicate of the haversine helper (also defined in cctvProxy.mjs) —
// the /api/route handler below needs it and this project's convention is to
// duplicate small (~12-line) geo helpers per proxy rather than share a
// geo-utils module (see trafficBounds.js's own greatCircleKm). Phase 7's
// cctvProxy.mjs extraction took the sole prior definition with it, leaving
// this call site broken; restored here as its own local copy.
function haversineKm(lat1, lon1, lat2, lon2) {
  const toRad = (value) => value * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
const _routeCache = new Map();

// --- Abuse guards shared by the Overpass + route proxies --------------------
/** Max accepted POST body for the Overpass proxy (Overpass QL queries are tiny). */
const OVERPASS_MAX_BODY_BYTES = 24 * 1024; // 24 KB
/** Max concurrent in-flight upstream Overpass fetches across all distinct queries. */
const OVERPASS_MAX_CONCURRENT = 6;
let _overpassConcurrent = 0;
/** Hard cap on the OSRM route response we will buffer. */
const ROUTE_MAX_RESPONSE_BYTES = 8 * 1024 * 1024; // 8 MB
/** Reject routes whose straight-line spans are obviously abusive (km). */
const ROUTE_MAX_LEG_KM = 600;
const ROUTE_MAX_TOTAL_KM = 2500;

const _overpassRateLimiter = makeRateLimiter({ windowMs: 60_000, max: 90, globalMax: 300 });
const _routeRateLimiter = makeRateLimiter({ windowMs: 60_000, max: 60, globalMax: 200 });

// ---------------------------------------------------------------------------
// AISStream live vessel cache state
// ---------------------------------------------------------------------------
const AISSTREAM_URL = 'wss://stream.aisstream.io/v0/stream';
const AISSTREAM_DEFAULT_BBOXES = [[[-90, -180], [90, 180]]];
const AISSTREAM_DEFAULT_MESSAGE_TYPES = [
  'PositionReport',
  'StandardClassBPositionReport',
  'ExtendedClassBPositionReport',
  'ShipStaticData',
  'StaticDataReport',
];
const AISSTREAM_CACHE_MAX = 50000;
const AISSTREAM_STALE_MS = 30 * 60 * 1000;
// Per-MMSI recent-path ring buffers (PRD WS-F F3). Float32 lat/lon (~1m
// precision, fine for 25m thinning) + Uint32 epoch seconds ≈ 12B/sample;
// 64 samples × 50k MMSIs worst case ≈ 38MB. Tracks exist only while the dev
// server runs — this is "recent path", not voyage history.
const AIS_TRACK_SAMPLES = 64;
const AIS_TRACK_MIN_GAP_SEC = 30;
const AIS_TRACK_MIN_MOVE_M = 25;
// Watchdog budgets (policy lives in src/data/aisWatchdog.js). Silence is
// REPORTED quickly and ACTED ON slowly: a dead feed must read as dead within
// ~2 min, but recycling the socket is throttled so recovery can never become a
// reconnect cycle against AISStream's one-connection-per-key limit.
const AISSTREAM_SILENCE_REPORT_MS = 120_000;
/** Recycle threshold as a multiple of the report threshold. */
const AISSTREAM_RECYCLE_RATIO = 2.5;
const AISSTREAM_BACKOFF_MS = Object.freeze([5_000, 15_000, 60_000, 300_000]);
/** Slow retry cadence once the ladder is spent and the feed reads DOWN. */
const AISSTREAM_DOWN_RETRY_MS = 900_000;
/**
 * Probe cadence while AISStream is rejecting the key. Retrying cannot fix a
 * bad credential, so this exists only to recover from an upstream-side
 * mistake — it must never approach the ladder's pace.
 */
const AISSTREAM_AUTH_PROBE_MS = 3_600_000;
/** How often the watchdog re-evaluates without request traffic. */
const AISSTREAM_TICK_MS = 15_000;

/**
 * @type {ReturnType<typeof createAisStreamAdapter>|null}
 * Module-lifetime: it owns the socket-generation namespace, which must never
 * restart across a dev-server reload (see aisStreamAdapter.js ownership rules).
 */
let _aisAdapter = null;
/** @type {{silenceWatch:boolean,reportMs:number,recycleMs:number,url:string}|null} */
let _aisWatchdogPolicy = null;
/** @type {number|null} */
let _aisStreamTickTimer = null;
/** Set by dispose so the next ensure() re-derives budgets from a reloaded .env. */
let _aisNeedsRearm = false;
/** @type {Function|null|undefined} `ws` constructor; null = unavailable, undefined = not yet probed. */
let _aisWebSocketImpl;
/** @type {Map<string,object>} */
const _aisStreamVessels = new Map();
/** @type {Map<string,object>} */
const _aisStreamStatic = new Map();
/** @type {Map<string,{lats:Float32Array,lons:Float32Array,times:Uint32Array,head:number,len:number}>} mmsi -> track ring buffer */
const _aisStreamTracks = new Map();
/** @type {Map<string,{lat:number,lon:number,epochSec:number}>} mmsi -> first fix awaiting second (lazy buffer allocation) */
const _aisStreamTrackPending = new Map();

/**
 * Obtain a valid OpenSky OAuth2 bearer token, refreshing if needed.
 *
 * Uses the client_credentials grant against the OpenSky Keycloak realm.
 * Concurrent callers share a single in-flight refresh promise so only
 * one token request is issued at a time.
 *
 * @returns {Promise<string|null>} Bearer token string, or null if unavailable.
 */
async function getOpenSkyToken() {
  const now = Date.now();
  // Return cached token if still valid (with 60 s safety margin)
  if (_openskyToken && now < _openskyTokenExpiry - 60000) return _openskyToken;

  // Coalesce concurrent refresh requests — if a refresh is already in-flight,
  // return the same promise instead of issuing a duplicate token request
  if (_openskyTokenPromise) return _openskyTokenPromise;

  const clientId = process.env.OPENSKY_CLIENT_ID;
  const clientSecret = process.env.OPENSKY_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;

  // Wrap the async token fetch in a shared promise stored in _openskyTokenPromise
  _openskyTokenPromise = (async () => {
    try {
      const res = await fetch(
        'https://auth.opensky-network.org/auth/realms/opensky-network/protocol/openid-connect/token',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: `grant_type=client_credentials&client_id=${encodeURIComponent(clientId)}&client_secret=${encodeURIComponent(clientSecret)}`,
        }
      );

      let data = null;
      try {
        data = await res.json();
      } catch {
        data = null;
      }

      const accessToken = data?.access_token;
      const expiresIn = Number(data?.expires_in);
      if (!res.ok || !accessToken) {
        if (!_openskyAuthWarned) {
          const detail = data?.error_description || data?.error || `HTTP ${res.status}`;
          console.warn('[OpenSky] OAuth client_credentials failed:', detail);
          _openskyAuthWarned = true;
        }
        _openskyToken = null;
        _openskyTokenExpiry = 0;
        return null;
      }

      _openskyToken = accessToken;
      // Default to 1800 s (30 min) if expires_in is missing or non-finite
      _openskyTokenExpiry = Date.now() + (Number.isFinite(expiresIn) ? expiresIn : 1800) * 1000;
      console.log('[OpenSky] OAuth token refreshed, expires in', Number.isFinite(expiresIn) ? expiresIn : 1800, 's');
      _openskyAuthWarned = false;
      return _openskyToken;
    } catch (err) {
      if (!_openskyAuthWarned) {
        console.warn('[OpenSky] OAuth token request failed:', err?.message || String(err));
        _openskyAuthWarned = true;
      }
      _openskyToken = null;
      _openskyTokenExpiry = 0;
      return null;
    } finally {
      // Clear the shared promise so the next caller can start a fresh refresh
      _openskyTokenPromise = null;
    }
  })();

  return _openskyTokenPromise;
}

/**
 * Validate and normalize the OPENSKY_AUTH_MODE env value.
 *
 * @param {string} value - Raw env value (e.g. 'basic', 'oauth', 'auto', 'anon').
 * @returns {string} One of the valid mode strings, or the default ('oauth').
 */
function normalizeOpenSkyAuthMode(value) {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return OPENSKY_AUTH_MODE_DEFAULT;
  if (OPENSKY_AUTH_MODE_SET.has(raw)) return raw;
  if (!_openskyAuthModeWarned) {
    console.warn(
      `[OpenSky] Invalid OPENSKY_AUTH_MODE="${raw}", defaulting to "${OPENSKY_AUTH_MODE_DEFAULT}"`
    );
    _openskyAuthModeWarned = true;
  }
  return OPENSKY_AUTH_MODE_DEFAULT;
}

/**
 * Build standard response headers for OpenSky proxy responses.
 *
 * Includes diagnostic X-OpenSky-* headers so the client can inspect
 * cache hit/miss status and which auth mode was actually used.
 *
 * @param {object} opts
 * @param {string} opts.cacheStatus - 'HIT', 'MISS', or 'STALE'.
 * @param {string} opts.requestedMode - The auth mode the config requested.
 * @param {string} opts.usedMode - The auth mode actually used for the upstream call.
 * @param {string} opts.reason - Human-readable reason string for diagnostics.
 * @returns {Record<string,string>} Header object.
 */
function buildOpenSkyHeaders({ cacheStatus, requestedMode, usedMode, reason, staleSeconds, retryAfterSeconds }) {
  const headers = {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
    'X-OpenSky-Cache': cacheStatus,
    'X-OpenSky-Auth': usedMode,
    'X-OpenSky-Auth-Mode-Requested': requestedMode,
    'X-OpenSky-Auth-Mode-Used': usedMode,
    'X-OpenSky-Auth-Reason': reason,
  };
  // Credit-governor extras (field-test fix 2026-07-06): the client can show a
  // STALE cue / countdown without parsing the body.
  if (Number.isFinite(staleSeconds)) headers['X-OpenSky-Stale-Seconds'] = String(Math.round(staleSeconds));
  if (Number.isFinite(retryAfterSeconds)) headers['X-OpenSky-Retry-After-Seconds'] = String(Math.round(retryAfterSeconds));
  return headers;
}

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

      // Real OSM routing via the public FOSSGIS OSRM servers (foot/car/bike).
      // GET /api/route?profile=foot|car|bike&coords=lon,lat;lon,lat[;...]
      server.middlewares.use('/api/route', async (req, res) => {
        const fail = (msg) => {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: false, error: msg }));
        };
        try {
          if (!_routeRateLimiter(clientKey(req))) {
            res.writeHead(429, { 'Content-Type': 'application/json', 'Retry-After': '5' });
            res.end(JSON.stringify({ ok: false, error: 'rate limited' }));
            return;
          }
          const url = new URL(req.url, 'http://localhost');
          const raw = (url.searchParams.get('profile') || 'foot').toLowerCase();
          const profile = (raw === 'car' || raw === 'driving') ? 'car'
            : (raw === 'bike' || raw === 'cycling' || raw === 'bicycle') ? 'bike'
              : (raw === 'foot' || raw === 'walking' || raw === 'walk') ? 'foot'
                : null;
          if (!profile) return fail('invalid profile');
          const osrmProfile = profile === 'car' ? 'driving' : profile;
          const pairs = (url.searchParams.get('coords') || '').split(';').map((s) => s.trim()).filter(Boolean);
          if (pairs.length < 2 || pairs.length > 12) return fail('need 2-12 coordinates');
          const clean = [];
          const pts = [];
          for (const pr of pairs) {
            const parts = pr.split(',');
            if (parts.length !== 2) return fail('invalid coordinate');
            const lon = Number(parts[0]);
            const lat = Number(parts[1]);
            if (!Number.isFinite(lon) || !Number.isFinite(lat) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
              return fail('invalid coordinate');
            }
            clean.push(`${lon},${lat}`);
            pts.push([lon, lat]);
          }
          // Reject obviously-abusive spans — a real walking/driving route is local,
          // so a cross-continent request is either a bug or an attempt to drive
          // heavy upstream OSRM work.
          let totalKm = 0;
          for (let i = 1; i < pts.length; i += 1) {
            // pts are [lon, lat]; existing haversineKm takes (lat1, lon1, lat2, lon2).
            const legKm = haversineKm(pts[i - 1][1], pts[i - 1][0], pts[i][1], pts[i][0]);
            if (legKm > ROUTE_MAX_LEG_KM) return fail('route leg too long');
            totalKm += legKm;
          }
          if (totalKm > ROUTE_MAX_TOTAL_KM) return fail('route too long');
          const coords = clean.join(';');
          const cacheKey = `${profile}|${coords}`;
          const now = Date.now();
          const cached = _routeCache.get(cacheKey);
          if (cached && now - cached.cachedAt <= ROUTE_CACHE_MS) {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(cached.payload));
            return;
          }
          const upstream = `https://routing.openstreetmap.de/routed-${profile}/route/v1/${osrmProfile}/${coords}?overview=full&geometries=geojson&alternatives=false&steps=false`;
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), 12000);
          let osrm;
          try {
            const upstreamRes = await fetch(upstream, {
              signal: controller.signal,
              headers: { 'User-Agent': 'eagleeye-view/dev (local)' },
            });
            if (!upstreamRes.ok) return fail('no route found');
            const ctype = upstreamRes.headers.get('content-type') || '';
            if (!ctype.includes('json')) return fail('no route found');
            const text = await readResponseTextCapped(upstreamRes, ROUTE_MAX_RESPONSE_BYTES);
            osrm = JSON.parse(text);
          } finally {
            clearTimeout(timer);
          }
          const route = osrm?.routes?.[0];
          if (osrm?.code !== 'Ok' || !route?.geometry?.coordinates?.length) return fail('no route found');
          const payload = {
            ok: true,
            profile,
            distanceM: Math.round(route.distance),
            durationS: Math.round(route.duration),
            geometry: route.geometry.coordinates,
          };
          _routeCache.set(cacheKey, { payload, cachedAt: now });
          if (_routeCache.size > 200) _routeCache.delete(_routeCache.keys().next().value);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(payload));
        } catch (e) {
          console.error('[Route Proxy]', e?.message || e);
          fail('route proxy error');
        }
      });
    },
  };
}

export function adsbLolFallbackAnchor(req) {
  const incoming = new URL(req?.url || '', 'http://localhost');
  const latitude = requiredFiniteQueryNumber(incoming.searchParams, 'lat');
  const longitude = requiredFiniteQueryNumber(incoming.searchParams, 'lon');
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) return null;
  if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) return null;
  return { latitude, longitude };
}

async function fetchAdsbLolPointFallback(req) {
  const anchor = adsbLolFallbackAnchor(req);
  if (!anchor) return null;
  const roundedLat = Math.round(anchor.latitude * 4) / 4;
  const roundedLon = Math.round(anchor.longitude * 4) / 4;
  const cacheKey = `${roundedLat.toFixed(2)},${roundedLon.toFixed(2)}`;
  const cached = _adsbLolPointCache.get(cacheKey);
  const now = Date.now();
  if (cached && now - cached.cachedAt < ADSBLOL_POINT_CACHE_MS) {
    return { ...cached, cacheStatus: 'HIT' };
  }

  const request = coalesceProxyRequest(_adsbLolPointInFlight, cacheKey, async () => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);
    try {
      const upstream = await fetch(
        `https://api.adsb.lol/v2/lat/${roundedLat}/lon/${roundedLon}/dist/${ADSBLOL_POINT_RADIUS_NM}`,
        {
          headers: {
            Accept: 'application/json',
            'User-Agent': 'eagleeye-view-adsblol-regional-fallback/1.0',
          },
          signal: controller.signal,
        },
      );
      if (!upstream.ok) throw new Error(`upstream HTTP ${upstream.status}`);
      const payload = await readResponseJsonCapped(upstream, ADSBLOL_POINT_MAX_RESPONSE_BYTES);
      const normalized = normalizeAdsbLolPointResponse(payload);
      const record = {
        body: JSON.stringify(normalized),
        cachedAt: Date.now(),
        count: normalized.states.length,
      };
      _adsbLolPointCache.delete(cacheKey);
      _adsbLolPointCache.set(cacheKey, record);
      while (_adsbLolPointCache.size > ADSBLOL_POINT_CACHE_MAX) {
        _adsbLolPointCache.delete(_adsbLolPointCache.keys().next().value);
      }
      return record;
    } finally {
      clearTimeout(timeoutId);
    }
  });
  try {
    const record = await request.promise;
    return { ...record, cacheStatus: request.shared ? 'INFLIGHT' : 'MISS' };
  } catch (error) {
    if (!request.shared && error?.name !== 'AbortError') {
      console.warn('[adsb.lol Flights Fallback]', error?.message || error);
    }
    return cached ? { ...cached, cacheStatus: 'STALE' } : null;
  }
}

async function serveAdsbLolPointFallback(req, res, requestedMode, reason) {
  const fallback = await fetchAdsbLolPointFallback(req);
  if (!fallback) return false;
  res.writeHead(200, {
    ...buildOpenSkyHeaders({
      cacheStatus: fallback.cacheStatus,
      requestedMode,
      usedMode: 'adsblol-regional',
      reason,
    }),
    'X-Flight-Source': 'adsb.lol',
    'X-Flight-Coverage': `${ADSBLOL_POINT_RADIUS_NM}nm regional fallback`,
    'X-Flight-Count': String(fallback.count),
  });
  res.end(fallback.body);
  return true;
}

function openSkySourceEpochMs(body) {
  try {
    const seconds = Number(JSON.parse(body)?.time);
    return Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : null;
  } catch {
    return null;
  }
}

function openSkySourceIsStale(sourceEpochMs, now = Date.now()) {
  return Number.isFinite(sourceEpochMs)
    && now - sourceEpochMs > OPENSKY_SOURCE_STALE_MS;
}

/**
 * Vite plugin: OpenSky Network proxy with multi-mode auth and response caching.
 *
 * Supports four auth modes controlled by OPENSKY_AUTH_MODE env:
 *   - 'oauth'  (default) — client_credentials bearer token
 *   - 'basic'  — HTTP Basic with OPENSKY_USERNAME / OPENSKY_PASSWORD
 *   - 'auto'   — try OAuth first, fall back to Basic, then anon
 *   - 'anon'   — no credentials
 *
 * Successful responses are cached for OPENSKY_CACHE_MS (~9 s). On
 * upstream failure the proxy serves a stale cached response if available, or
 * a bounded 250 nm adsb.lol point snapshot around the current view anchor.
 *
 * @returns {import('vite').Plugin}
 */
function openSkyProxy() {
  return {
    name: 'opensky-proxy',
    configureServer(server) {
      server.middlewares.use('/api/opensky', async (req, res) => {
        try {
          const requestedMode = normalizeOpenSkyAuthMode(process.env.OPENSKY_AUTH_MODE);
          const now = Date.now();
          const inCooldown = now < _openskyCooldownUntil;
          // Fresh-enough cache (adaptive TTL) OR any cache during a 429
          // cooldown: serve it without touching upstream. Stale-during-cooldown
          // is deliberate (credit governor): last-good planes beat a dead layer.
          if (_openskyCacheBody && (now - _openskyCacheTime < _openskyTtlMs || inCooldown)) {
            if (
              openSkySourceIsStale(_openskyCacheSourceEpochMs, now)
              && await serveAdsbLolPointFallback(
                req,
                res,
                requestedMode,
                'opensky_snapshot_stale_regional_fallback',
              )
            ) {
              return;
            }
            const cachedMeta = _openskyCacheMeta || {
              requestedMode,
              usedMode: 'unknown',
              reason: 'cached',
            };
            const isStale = now - _openskyCacheTime >= _openskyTtlMs;
            res.writeHead(
              _openskyCacheStatus || 200,
              buildOpenSkyHeaders({
                cacheStatus: isStale ? 'STALE' : 'HIT',
                requestedMode: cachedMeta.requestedMode || requestedMode,
                usedMode: cachedMeta.usedMode || 'unknown',
                reason: isStale ? 'rate_limited_serving_stale' : (cachedMeta.reason || 'cached'),
                staleSeconds: isStale ? (now - _openskyCacheTime) / 1000 : undefined,
                retryAfterSeconds: inCooldown ? (_openskyCooldownUntil - now) / 1000 : undefined,
              })
            );
            res.end(_openskyCacheBody);
            return;
          }
          // Cooling down with nothing cached (cold start into a rate limit):
          // synthesize the 429 locally — hammering upstream mid-cooldown can't
          // succeed and just burns goodwill.
          if (inCooldown) {
            if (await serveAdsbLolPointFallback(req, res, requestedMode, 'opensky_cooldown_regional_fallback')) return;
            res.writeHead(429, buildOpenSkyHeaders({
              cacheStatus: 'COOLDOWN',
              requestedMode,
              usedMode: 'none',
              reason: 'rate_limited',
              retryAfterSeconds: (_openskyCooldownUntil - now) / 1000,
            }));
            res.end(JSON.stringify({ error: 'OpenSky rate limited; proxy cooling down.' }));
            return;
          }

          const basicUser = process.env.OPENSKY_USERNAME || '';
          const basicPass = process.env.OPENSKY_PASSWORD || '';
          const hasBasicCreds = Boolean(basicUser && basicPass);
          const headers = { 'Accept': 'application/json' };
          let usedMode = 'anon';
          let reason = 'forced_anonymous';

          if (requestedMode === 'basic') {
            if (hasBasicCreds) {
              headers.Authorization = `Basic ${Buffer.from(`${basicUser}:${basicPass}`).toString('base64')}`;
              usedMode = 'basic';
              reason = 'basic_credentials';
            } else {
              reason = 'missing_basic_creds';
            }
          } else if (requestedMode === 'oauth') {
            const token = await getOpenSkyToken();
            if (token) {
              headers.Authorization = `Bearer ${token}`;
              usedMode = 'oauth';
              reason = 'oauth_token';
            } else {
              reason = 'oauth_invalid_or_missing';
            }
          } else if (requestedMode === 'auto') {
            const token = await getOpenSkyToken();
            if (token) {
              headers.Authorization = `Bearer ${token}`;
              usedMode = 'oauth';
              reason = 'oauth_token';
            } else if (hasBasicCreds) {
              headers.Authorization = `Basic ${Buffer.from(`${basicUser}:${basicPass}`).toString('base64')}`;
              usedMode = 'basic';
              reason = 'oauth_unavailable_fallback_basic';
            } else {
              reason = 'missing_oauth_and_basic_creds';
            }
          }

          let upstream = await fetch('https://opensky-network.org/api/states/all?extended=1', { headers });
          // Auto-mode fallback: if OAuth was rejected, retry with Basic credentials
          if (
            (upstream.status === 401 || upstream.status === 403) &&
            requestedMode === 'auto' &&
            usedMode === 'oauth' &&
            hasBasicCreds
          ) {
            const retryHeaders = {
              Accept: 'application/json',
              Authorization: `Basic ${Buffer.from(`${basicUser}:${basicPass}`).toString('base64')}`,
            };
            upstream = await fetch('https://opensky-network.org/api/states/all?extended=1', { headers: retryHeaders });
            usedMode = 'basic';
            reason = 'oauth_rejected_fallback_basic';
          }

          let body = await upstream.text();
          const sourceEpochMs = upstream.ok ? openSkySourceEpochMs(body) : null;
          if (
            upstream.ok
            && openSkySourceIsStale(sourceEpochMs, now)
            && await serveAdsbLolPointFallback(
              req,
              res,
              requestedMode,
              'opensky_snapshot_stale_regional_fallback',
            )
          ) {
            // Keep the last global snapshot available as a fail-soft cache,
            // but do not label or render it as a fresh live result.
            _openskyCacheBody = body;
            _openskyCacheStatus = upstream.status;
            _openskyCacheTime = now;
            _openskyCacheSourceEpochMs = sourceEpochMs;
            _openskyCacheMeta = { requestedMode, usedMode, reason };
            return;
          }
          if (upstream.status === 429) {
            reason = 'rate_limited';
            // Credit governor: honor OpenSky's retry-after (bounded 30 s … 30 min;
            // 2 min when the header is absent) — no upstream attempts until then.
            const retryAfterSec = Number(upstream.headers.get('x-rate-limit-retry-after-seconds'));
            const cooldownMs = Math.min(
              Math.max(Number.isFinite(retryAfterSec) ? retryAfterSec * 1000 : 120_000, 30_000),
              30 * 60_000
            );
            _openskyCooldownUntil = now + cooldownMs;
            // Serve the last-good body instead of the 429 when we have one —
            // the layer keeps rendering (STALE-cued) instead of dying.
            if (_openskyCacheBody && _openskyCacheStatus === 200) {
              res.writeHead(200, buildOpenSkyHeaders({
                cacheStatus: 'STALE',
                requestedMode,
                usedMode,
                reason: 'rate_limited_serving_stale',
                staleSeconds: (now - _openskyCacheTime) / 1000,
                retryAfterSeconds: cooldownMs / 1000,
              }));
              res.end(_openskyCacheBody);
              return;
            }
          }

          if (!upstream.ok && !_openskyCacheBody) {
            const servedFallback = await serveAdsbLolPointFallback(
              req,
              res,
              requestedMode,
              `opensky_http_${upstream.status}_regional_fallback`,
            );
            if (servedFallback) return;
          }

          if (upstream.status === 401 || upstream.status === 403) {
            if (requestedMode === 'basic' && !hasBasicCreds) {
              body = JSON.stringify({
                error: 'OpenSky auth missing. Basic mode requires OPENSKY_USERNAME and OPENSKY_PASSWORD.',
              });
              reason = 'missing_basic_creds';
            } else if (requestedMode === 'oauth' && usedMode !== 'oauth') {
              body = JSON.stringify({
                error: 'OpenSky auth invalid. OAuth mode requires valid OPENSKY_CLIENT_ID and OPENSKY_CLIENT_SECRET.',
              });
              reason = 'oauth_invalid_or_missing';
            } else if (usedMode === 'basic') {
              body = JSON.stringify({
                error: 'OpenSky auth invalid. Username/password were rejected.',
              });
              reason = 'basic_invalid_credentials';
            } else if (usedMode === 'oauth') {
              body = JSON.stringify({
                error: 'OpenSky auth invalid. OAuth client credentials were rejected.',
              });
              reason = 'oauth_invalid_credentials';
            } else if (requestedMode === 'auto' && !hasBasicCreds) {
              body = JSON.stringify({
                error: 'OpenSky auth missing. Provide basic credentials or valid OAuth client credentials.',
              });
              reason = 'missing_oauth_and_basic_creds';
            } else {
              body = JSON.stringify({
                error: 'OpenSky auth required.',
              });
              reason = 'auth_required';
            }
          }

          // Refine the reason string to reflect the actual outcome
          if (upstream.ok && reason === 'forced_anonymous') {
            reason = 'anonymous_ok';
          } else if (upstream.ok && usedMode === 'basic' && reason === 'basic_credentials') {
            reason = 'basic_ok';
          } else if (upstream.ok && usedMode === 'oauth' && reason === 'oauth_token') {
            reason = 'oauth_ok';
          }

          // Only cache successful responses — error responses (401/403/429/5xx)
          // should not be served from cache on subsequent requests
          if (upstream.ok) {
            _openskyCacheBody = body;
            _openskyCacheStatus = upstream.status;
            _openskyCacheTime = now;
            _openskyCacheSourceEpochMs = sourceEpochMs;
            _openskyCacheMeta = {
              requestedMode,
              usedMode,
              reason,
            };
            // Credit governor: adapt the cache TTL to the remaining daily
            // budget so a continuously-open app stretches its polls instead of
            // exhausting the quota mid-day. Success also clears any cooldown.
            const remaining = Number(upstream.headers.get('x-rate-limit-remaining'));
            _openskyTtlMs = openskyAdaptiveTtlMs(remaining);
            _openskyCooldownUntil = 0;
          }

          res.writeHead(
            upstream.status,
            buildOpenSkyHeaders({
              cacheStatus: 'MISS',
              requestedMode,
              usedMode,
              reason,
            })
          );
          res.end(body);
        } catch (e) {
          console.error('[OpenSky Proxy]', e.message);
          if (_openskyCacheBody) {
            const cachedMeta = _openskyCacheMeta || {
              requestedMode: normalizeOpenSkyAuthMode(process.env.OPENSKY_AUTH_MODE),
              usedMode: 'unknown',
              reason: 'cached_stale',
            };
            res.writeHead(
              _openskyCacheStatus || 200,
              buildOpenSkyHeaders({
                cacheStatus: 'STALE',
                requestedMode: cachedMeta.requestedMode || OPENSKY_AUTH_MODE_DEFAULT,
                usedMode: cachedMeta.usedMode || 'unknown',
                reason: cachedMeta.reason || 'cached_stale',
              })
            );
            res.end(_openskyCacheBody);
            return;
          }
          const requestedMode = normalizeOpenSkyAuthMode(process.env.OPENSKY_AUTH_MODE);
          if (await serveAdsbLolPointFallback(req, res, requestedMode, 'opensky_proxy_error_regional_fallback')) return;
          res.writeHead(
            502,
            buildOpenSkyHeaders({
              cacheStatus: 'MISS',
              requestedMode,
              usedMode: 'error',
              reason: 'proxy_error',
            })
          );
          res.end(JSON.stringify({ error: 'OpenSky proxy error' }));
        }
      });
    },
  };
}

/**
 * Vite plugin: adsb.lol military aircraft proxy with 12 s response cache.
 *
 * Proxies GET /api/adsblol/mil to https://api.adsb.lol/v2/mil. On upstream
 * failure, serves a stale cached response if one exists.
 *
 * @returns {import('vite').Plugin}
 */
function adsbLolProxy() {
  /** @type {string|null} Cached upstream JSON body. */
  let _cache = null;
  /** @type {number} Epoch-ms when the cache was populated. */
  let _cacheAt = 0;
  /** Response cache TTL (ms). */
  const CACHE_MS = 12000;
  return {
    name: 'adsblol-proxy',
    configureServer(server) {
      server.middlewares.use('/api/adsblol/mil', async (req, res) => {
        try {
          const now = Date.now();
          if (_cache && now - _cacheAt < CACHE_MS) {
            res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-ADS-B-Cache': 'HIT' });
            res.end(_cache);
            return;
          }
          const upstream = await fetch('https://api.adsb.lol/v2/mil', {
            headers: { 'User-Agent': 'eagleeye-view-adsblol-proxy/1.0' },
          });
          const body = await upstream.text();
          if (upstream.ok) {
            _cache = body;
            _cacheAt = now;
          }
          res.writeHead(upstream.status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-ADS-B-Cache': 'MISS' });
          res.end(body);
        } catch (e) {
          console.error('[adsb.lol Proxy]', e.message);
          if (_cache) {
            res.writeHead(200, { 'Content-Type': 'application/json', 'X-ADS-B-Cache': 'STALE' });
            res.end(_cache);
            return;
          }
          res.writeHead(502, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'ADS-B proxy error' }));
        }
      });
    },
  };
}

/**
 * Vite plugin: AISStream live vessel cache.
 *
 * AISStream does not support browser CORS and requires a private API key, so
 * the Vite server keeps one backend websocket open and exposes a same-origin
 * JSON snapshot to the Cesium layer.
 */
function aisLiveProxy() {
  function install(middlewares) {
    middlewares.use('/api/ais-live', async (req, res) => {
      try {
        ensureAisStreamConnection();
        const incoming = new URL(req.url || '', 'http://localhost');

        // Track sub-route MUST be handled before the rows snapshot — this
        // mount prefix-matches every subpath, so without this branch
        // /api/ais-live/track would be silently answered with vessel rows.
        if (incoming.pathname === '/track' || incoming.pathname.startsWith('/track/')) {
          const mmsi = String(incoming.searchParams.get('mmsi') || '').trim();
          res.statusCode = /^\d{5,10}$/.test(mmsi) ? 200 : 400;
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.setHeader('Cache-Control', 'no-store');
          if (res.statusCode !== 200) {
            res.end(JSON.stringify({ error: 'mmsi query param required', samples: [] }));
            return;
          }
          res.end(JSON.stringify({
            mmsi,
            samples: readAisTrack(mmsi),
            source: 'AISStream (accumulated since server start)',
            retainedSec: Math.floor(AISSTREAM_STALE_MS / 1000),
          }));
          return;
        }

        const maxRows = clampInt(incoming.searchParams.get('maxRows'), 1, AISSTREAM_CACHE_MAX, AISSTREAM_CACHE_MAX);
        const rows = aisStreamRows(maxRows);

        const feed = aisStreamStatusSnapshot();

        res.statusCode = process.env.AISSTREAM_API_KEY ? 200 : 503;
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.setHeader('Cache-Control', 'no-store');
        res.end(JSON.stringify({
          rows,
          source: 'AISStream',
          status: feed.status,
          error: feed.error,
          refreshing: feed.status !== 'live',
          newestPositionAt: newestAisPositionAt(rows),
          lastMessageAt: feed.lastMessageAt,
          // Honest-failure metadata: how long the feed has been quiet, which
          // recovery attempt we are on, and when the next one lands.
          silentForMs: feed.silentForMs,
          reconnectAttempt: feed.reconnectAttempt,
          nextAttemptAt: feed.nextAttemptAt,
          staleAfterMs: feed.staleAfterMs,
          watchdog: feed.watchdog,
        }));
      } catch (error) {
        res.statusCode = 502;
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.setHeader('Cache-Control', 'no-store');
        res.end(JSON.stringify({ error: error?.message || 'AIS live stream error', rows: [] }));
      }
    });
  }

  return {
    name: 'ais-live-proxy',
    configureServer(server) {
      install(server.middlewares);
      startAisStreamWatchdogTick();
      // Vite restarts the server in-process on a config change while this
      // module's state survives; without teardown each reload stacks another
      // interval and another socket.
      server.httpServer?.on('close', disposeAisStream);
    },
    configurePreviewServer(server) {
      install(server.middlewares);
      startAisStreamWatchdogTick();
      server.httpServer?.on('close', disposeAisStream);
    },
    // Middleware-mode backstop: there is no httpServer to hang 'close' on.
    closeBundle() {
      disposeAisStream();
    },
  };
}

/**
 * Vite plugin: aircraft track-history backfill proxies (PRD WS-F F1/F2).
 *
 * /api/opensky-track?icao24=<hex6> — OpenSky GET /tracks/all (experimental;
 *   own credit bucket, 4 credits per call on the free tier). OAuth via the
 *   shared coalesced token. 60s per-icao cache; 404/429 forwarded so the
 *   client can fall back to its accumulated trail silently.
 * /api/adsblol/trace?hex=<hex> — adsb.lol tar1090 readsb trace
 *   (undocumented but live; no browser CORS, hence this proxy). Up to ~24h
 *   of real history per aircraft. Treat as best-effort; data is ODbL —
 *   credit "adsb.lol (ODbL)" in the UI.
 */
function trackBackfillProxies() {
  const TRACK_CACHE_MS = 60000;
  const TRACK_CACHE_MAX = 200;
  const RESPONSE_CAP_BYTES = 5 * 1024 * 1024;
  /** @type {Map<string, {at:number,status:number,body:string}>} */
  const cache = new Map();

  function cachePut(key, entry) {
    cache.set(key, entry);
    if (cache.size > TRACK_CACHE_MAX) {
      const oldest = [...cache.entries()].sort((a, b) => a[1].at - b[1].at)[0];
      if (oldest) cache.delete(oldest[0]);
    }
  }

  async function proxyJson(res, key, upstreamUrl, headers = {}) {
    const cached = cache.get(key);
    if (cached && Date.now() - cached.at < TRACK_CACHE_MS) {
      res.statusCode = cached.status;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store');
      res.end(cached.body);
      return;
    }
    const upstream = await fetch(upstreamUrl, { headers, signal: AbortSignal.timeout(12000) });
    const { tooLarge, text } = await readCappedResponseText(upstream, RESPONSE_CAP_BYTES);
    let body;
    if (tooLarge) {
      body = JSON.stringify({ error: 'Upstream track response too large' });
    } else if (!upstream.ok) {
      // Sanitize upstream error surface; status code is signal enough
      body = JSON.stringify({ error: `Track source HTTP ${upstream.status}` });
    } else {
      body = text;
    }
    cachePut(key, { at: Date.now(), status: upstream.status, body });
    res.statusCode = upstream.status;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.end(body);
  }

  function install(middlewares) {
    middlewares.use('/api/opensky-track', async (req, res) => {
      try {
        const incoming = new URL(req.url || '', 'http://localhost');
        const icao24 = String(incoming.searchParams.get('icao24') || '').trim().toLowerCase();
        if (!/^[0-9a-f]{6}$/.test(icao24)) {
          res.statusCode = 400;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: 'icao24 must be a 6-char hex string' }));
          return;
        }
        const token = await getOpenSkyToken();
        await proxyJson(
          res,
          `osky:${icao24}`,
          `https://opensky-network.org/api/tracks/all?icao24=${icao24}&time=0`,
          token ? { Authorization: `Bearer ${token}` } : {}
        );
      } catch (error) {
        res.statusCode = 502;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: 'OpenSky track fetch failed' }));
      }
    });

    middlewares.use('/api/adsblol/trace', async (req, res) => {
      try {
        const incoming = new URL(req.url || '', 'http://localhost');
        const hex = String(incoming.searchParams.get('hex') || '').trim().toLowerCase();
        if (!/^[0-9a-f~]{6,7}$/.test(hex)) {
          res.statusCode = 400;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: 'hex must be a 6-7 char hex string' }));
          return;
        }
        await proxyJson(
          res,
          `lol:${hex}`,
          `https://adsb.lol/data/traces/${hex.slice(-2)}/trace_full_${hex}.json`
        );
      } catch (error) {
        res.statusCode = 502;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: 'adsb.lol trace fetch failed' }));
      }
    });
  }

  return {
    name: 'track-backfill-proxies',
    configureServer(server) {
      install(server.middlewares);
    },
    configurePreviewServer(server) {
      install(server.middlewares);
    },
  };
}

/**
 * Load the `ws` constructor once.
 *
 * Node's built-in WebSocket cannot be used here: it has no terminate(), and
 * its close() waits forever for a close frame a black-holed peer never sends
 * (verified in src/data/aisWatchdogTransport.test.mjs). A socket parked in
 * CLOSING keeps holding AISStream's single per-key connection, which is how
 * the reverted watchdog wedged.
 *
 * Loaded lazily rather than imported at the top of this file so a missing
 * optional dependency degrades the vessel feed honestly instead of breaking
 * the whole dev server and build.
 *
 * @returns {Function|null}
 */
function aisWebSocketImpl() {
  if (_aisWebSocketImpl !== undefined) return _aisWebSocketImpl;
  try {
    _aisWebSocketImpl = createRequire(import.meta.url)('ws');
  } catch (error) {
    _aisWebSocketImpl = null;
    console.warn('[AISStream] `ws` is unavailable; the live vessel feed is off.', error?.message || '');
  }
  return _aisWebSocketImpl;
}

/**
 * Resolve the watchdog policy from the environment, once.
 *
 * Read lazily because module evaluation happens before Vite's loadEnv() copies
 * .env into process.env — the reverted watchdog read these at import time and
 * silently ignored every .env value, including its own kill switch.
 *
 * A custom subscription (one harbor, one message type) can be legitimately
 * silent for minutes, so the silence watch only self-arms for the default
 * worldwide subscription. An operator with a narrow filter opts back in by
 * setting AISSTREAM_SILENCE_TIMEOUT_MS to a value sized for that filter; 0 is
 * an explicit kill switch.
 */
function aisWatchdogPolicy() {
  if (_aisWatchdogPolicy) return _aisWatchdogPolicy;
  const customSubscription = Boolean(
    process.env.AISSTREAM_BOUNDING_BOXES || process.env.AISSTREAM_MESSAGE_TYPES,
  );
  const override = parseSilenceTimeoutEnv(
    process.env.AISSTREAM_SILENCE_TIMEOUT_MS,
    (message) => console.warn(message),
  );
  const reportMs = override.kind === 'timeout' ? override.value : AISSTREAM_SILENCE_REPORT_MS;
  _aisWatchdogPolicy = {
    silenceWatch: override.kind === 'off' ? false : (override.kind === 'timeout' || !customSubscription),
    reportMs,
    recycleMs: Math.round(reportMs * AISSTREAM_RECYCLE_RATIO),
    // Overridable so the watchdog can be exercised end-to-end against a local
    // stand-in upstream without opening a connection to AISStream (which
    // allows only one per key).
    url: process.env.AISSTREAM_URL || AISSTREAM_URL,
  };
  return _aisWatchdogPolicy;
}


/**
 * The transport adapter, built on first use and kept for the module lifetime.
 *
 * Never rebuilt: it owns the socket-generation namespace, and a restarted
 * namespace would let a pre-disposal handler act on its successor's socket.
 */
function aisAdapter() {
  if (_aisAdapter) return _aisAdapter;
  _aisAdapter = createAisStreamAdapter({
    createSocket: (url) => {
      const WebSocketCtor = aisWebSocketImpl();
      if (!WebSocketCtor) throw new Error('ws transport unavailable');
      return new WebSocketCtor(url);
    },
    resolveUrl: () => aisWatchdogPolicy().url,
    buildSubscription: aisStreamSubscription,
    ingestEnvelope: ingestAisStreamEnvelope,
    warn: (message) => console.warn(message),
  });
  _aisAdapter.setWatchdogOptions(aisWatchdogBudgets());
  return _aisAdapter;
}

/** Watchdog budgets derived from the resolved environment policy. */
function aisWatchdogBudgets() {
  const policy = aisWatchdogPolicy();
  return {
    staleMs: policy.reportMs,
    recycleAfterMs: policy.recycleMs,
    backoffMs: [...AISSTREAM_BACKOFF_MS],
    downRetryMs: AISSTREAM_DOWN_RETRY_MS,
    authProbeMs: AISSTREAM_AUTH_PROBE_MS,
  };
}

/**
 * Fingerprint the credential so a key change can clear the terminal
 * auth-failed state. Only a truncated digest is kept — never the key.
 */
function aisKeyFingerprint() {
  const key = process.env.AISSTREAM_API_KEY;
  if (!key) return null;
  return createHash('sha256').update(String(key)).digest('hex').slice(0, 12);
}

/**
 * Drive the watchdog once. Called on every /api/ais-live request and on the
 * background interval, so recovery does not depend on browser traffic.
 */
function ensureAisStreamConnection() {
  const adapter = aisAdapter();
  if (_aisNeedsRearm) {
    // Post-dispose re-arm, now that the restarted server's .env is loaded. The
    // adapter keeps its generation namespace across this.
    _aisNeedsRearm = false;
    adapter.setWatchdogOptions(aisWatchdogBudgets());
  }
  const policy = aisWatchdogPolicy();
  adapter.ensure({
    hasKey: Boolean(process.env.AISSTREAM_API_KEY),
    hasTransport: Boolean(aisWebSocketImpl()),
    silenceWatch: policy.silenceWatch,
    keyFingerprint: aisKeyFingerprint(),
  });
}
/** Status metadata for /api/ais-live, safe to call before the first connect. */
function aisStreamStatusSnapshot() {
  const snapshot = _aisAdapter ? _aisAdapter.snapshot() : null;
  if (snapshot) return snapshot;
  return {
    status: process.env.AISSTREAM_API_KEY ? 'idle' : 'missing-key',
    error: process.env.AISSTREAM_API_KEY ? null : 'AISSTREAM_API_KEY is not set',
    lastMessageAt: null,
    silentForMs: null,
    reconnectAttempt: 0,
    nextAttemptAt: null,
    watchdog: 'armed',
    staleAfterMs: AISSTREAM_SILENCE_REPORT_MS,
  };
}

/**
 * Start the background watchdog tick. Unref'd so it never holds the dev server
 * open, and idempotent so a Vite in-process restart cannot stack intervals.
 */
function startAisStreamWatchdogTick() {
  if (_aisStreamTickTimer) return;
  _aisStreamTickTimer = setInterval(() => {
    try {
      ensureAisStreamConnection();
    } catch (error) {
      console.warn('[AISStream] watchdog tick failed', error?.message || '');
    }
  }, AISSTREAM_TICK_MS);
  _aisStreamTickTimer.unref?.();
}

/**
 * Tear down every timer and socket this module owns.
 *
 * Vite restarts the dev server in-process on a config change while module
 * state survives, so without this each reload stacked another interval and
 * another reconnect chain. The cached policy is dropped too, so a restart
 * re-reads .env.
 *
 * The adapter instance itself is deliberately KEPT: it owns the socket
 * generation namespace, which must stay monotonic across restarts so a
 * pre-disposal handler can never collide with a post-disposal socket.
 */
function disposeAisStream() {
  if (_aisStreamTickTimer) {
    clearInterval(_aisStreamTickTimer);
    _aisStreamTickTimer = null;
  }
  if (_aisAdapter) _aisAdapter.dispose();
  // Drop the cached policy and re-arm LAZILY. Re-deriving budgets here would
  // read process.env before the restarted server's loadEnv() has repopulated
  // it, caching the outgoing configuration; the next ensure() runs after that.
  _aisWatchdogPolicy = null;
  _aisNeedsRearm = true;
}

function aisStreamSubscription() {
  return {
    APIKey: process.env.AISSTREAM_API_KEY,
    BoundingBoxes: parseJsonEnv('AISSTREAM_BOUNDING_BOXES', AISSTREAM_DEFAULT_BBOXES),
    FilterMessageTypes: parseCsvOrJsonEnv('AISSTREAM_MESSAGE_TYPES', AISSTREAM_DEFAULT_MESSAGE_TYPES),
  };
}

/**
 * Store one parsed AIS envelope.
 *
 * The return value is the feed's ONLY liveness proof, so it is true strictly
 * when the envelope carried a real AIS record. Malformed frames and error
 * envelopes never reach here — the adapter classifies those — and a JSON
 * object without an MMSI proves nothing about the feed.
 *
 * @param {Object} envelope Parsed, non-error AIS envelope.
 * @returns {boolean} True when an AIS record was recognised.
 */
function ingestAisStreamEnvelope(envelope) {
  // Single shared recognition rule (also used by the adapter's tests), so the
  // liveness predicate that ships is the one under test. An envelope carrying
  // only an MMSI is not proof the feed works.
  if (!isRecognizedAisEnvelope(envelope)) return false;

  const messageType = envelope?.MessageType;
  const message = envelope?.Message?.[messageType] || {};
  const metadata = envelope?.MetaData || envelope?.Metadata || {};
  const mmsi = stringValue(metadata.MMSI ?? message.UserID ?? message.UserId ?? message.Mmsi);
  if (!mmsi) return false;

  if (messageType === 'ShipStaticData' || messageType === 'StaticDataReport') {
    const staticData = {
      name: vesselNameFromAis(metadata, message, _aisStreamStatic.get(mmsi)),
      type: vesselTypeFromAis(message, _aisStreamStatic.get(mmsi)),
      destination: stringValue(message.Destination),
      imo: stringValue(message.ImoNumber ?? message.IMO),
    };
    _aisStreamStatic.set(mmsi, staticData);
    mergeAisStaticIntoLiveVessel(mmsi, staticData);
  }

  const lat = numberValue(metadata.latitude ?? metadata.Latitude ?? message.Latitude);
  const lon = numberValue(metadata.longitude ?? metadata.Longitude ?? message.Longitude);
  // A positionless but well-formed record (static data) is still the feed
  // delivering AIS traffic, so it counts as liveness.
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return true;

  const staticData = _aisStreamStatic.get(mmsi) || {};
  _aisStreamVessels.set(mmsi, {
    lat,
    lon,
    name: vesselNameFromAis(metadata, message, staticData) || `MMSI ${mmsi}`,
    mmsi,
    imo: stringValue(message.ImoNumber ?? message.IMO ?? staticData.imo),
    type: vesselTypeFromAis(message, staticData),
    destination: stringValue(message.Destination ?? staticData.destination),
    speed: numberValue(message.Sog ?? message.SOG),
    course: numberValue(message.Cog ?? message.COG),
    heading: normalizedHeading(message.TrueHeading ?? message.Heading),
    last_position_UTC: normalizeAisTimestamp(metadata.time_utc ?? metadata.TimeUtc),
    // Use the AIS message's own report time, not server ingest wall-clock —
    // trail spacing and dead reckoning depend on true fix epochs.
    last_position_epoch: aisEpochSeconds(metadata.time_utc ?? metadata.TimeUtc),
    _updatedAt: Date.now(),
  });

  appendAisTrackSample(mmsi, lat, lon, aisEpochSeconds(metadata.time_utc ?? metadata.TimeUtc));

  pruneAisStreamCache();
  return true;
}

/**
 * Parses an AISStream UTC timestamp into epoch seconds (fallback: now).
 */
function aisEpochSeconds(value) {
  const ms = Date.parse(normalizeAisTimestamp(value));
  return Number.isFinite(ms) ? Math.floor(ms / 1000) : Math.floor(Date.now() / 1000);
}

/**
 * Appends a thinned position sample to a vessel's track ring buffer.
 * Buffers allocate lazily on the second fix (most MMSIs are seen once);
 * samples are kept only when >=AIS_TRACK_MIN_GAP_SEC and
 * >=AIS_TRACK_MIN_MOVE_M from the previous stored sample, so anchored
 * vessels collapse to a single point.
 */
function appendAisTrackSample(mmsi, lat, lon, epochSec) {
  let track = _aisStreamTracks.get(mmsi);
  if (!track) {
    const pending = _aisStreamTrackPending.get(mmsi);
    if (!pending) {
      _aisStreamTrackPending.set(mmsi, { lat, lon, epochSec });
      return;
    }
    if (epochSec - pending.epochSec < AIS_TRACK_MIN_GAP_SEC) return;
    if (approxMetersBetween(pending.lat, pending.lon, lat, lon) < AIS_TRACK_MIN_MOVE_M) return;
    track = {
      lats: new Float32Array(AIS_TRACK_SAMPLES),
      lons: new Float32Array(AIS_TRACK_SAMPLES),
      times: new Uint32Array(AIS_TRACK_SAMPLES),
      head: 0,
      len: 0,
    };
    _aisStreamTracks.set(mmsi, track);
    _aisStreamTrackPending.delete(mmsi);
    writeAisTrackSample(track, pending.lat, pending.lon, pending.epochSec);
    writeAisTrackSample(track, lat, lon, epochSec);
    return;
  }

  const lastIdx = (track.head - 1 + AIS_TRACK_SAMPLES) % AIS_TRACK_SAMPLES;
  const lastEpoch = track.times[lastIdx];
  if (epochSec - lastEpoch < AIS_TRACK_MIN_GAP_SEC) return;
  if (approxMetersBetween(track.lats[lastIdx], track.lons[lastIdx], lat, lon) < AIS_TRACK_MIN_MOVE_M) return;
  writeAisTrackSample(track, lat, lon, epochSec);
}

function writeAisTrackSample(track, lat, lon, epochSec) {
  track.lats[track.head] = lat;
  track.lons[track.head] = lon;
  track.times[track.head] = epochSec;
  track.head = (track.head + 1) % AIS_TRACK_SAMPLES;
  track.len = Math.min(track.len + 1, AIS_TRACK_SAMPLES);
}

/**
 * Reads a vessel's accumulated track in chronological order.
 * @returns {Array<{lat:number,lon:number,t:number}>}
 */
function readAisTrack(mmsi) {
  const track = _aisStreamTracks.get(mmsi);
  if (!track || !track.len) return [];
  const samples = [];
  const start = (track.head - track.len + AIS_TRACK_SAMPLES) % AIS_TRACK_SAMPLES;
  for (let i = 0; i < track.len; i++) {
    const idx = (start + i) % AIS_TRACK_SAMPLES;
    samples.push({ lat: track.lats[idx], lon: track.lons[idx], t: track.times[idx] });
  }
  return samples;
}

/** Equirectangular distance approximation — plenty for 25m thinning. */
function approxMetersBetween(lat1, lon1, lat2, lon2) {
  const dLat = (lat2 - lat1) * 111320;
  const dLon = (lon2 - lon1) * 111320 * Math.cos(((lat1 + lat2) / 2) * (Math.PI / 180));
  return Math.hypot(dLat, dLon);
}

function mergeAisStaticIntoLiveVessel(mmsi, staticData) {
  const existing = _aisStreamVessels.get(mmsi);
  if (!existing) return;
  if (staticData.name && (!existing.name || existing.name === `MMSI ${mmsi}`)) existing.name = staticData.name;
  if (staticData.type && !existing.type) existing.type = staticData.type;
  if (staticData.destination && !existing.destination) existing.destination = staticData.destination;
  if (staticData.imo && !existing.imo) existing.imo = staticData.imo;
}

function vesselNameFromAis(metadata, message, staticData = {}) {
  return stringValue(
    metadata.ShipName
      ?? message.Name
      ?? message.ShipName
      ?? message.ReportA?.Name
      ?? staticData.name
  );
}

function vesselTypeFromAis(message, staticData = {}) {
  return stringValue(
    message.Type
      ?? message.ShipType
      ?? message.ReportB?.ShipType
      ?? staticData.type
  );
}

function aisStreamRows(maxRows) {
  const cutoff = Date.now() - AISSTREAM_STALE_MS;
  const rows = [];
  for (const row of _aisStreamVessels.values()) {
    if (row._updatedAt >= cutoff) rows.push(row);
  }
  rows.sort((a, b) => b._updatedAt - a._updatedAt);
  return rows.slice(0, maxRows).map(({ _updatedAt, ...row }) => row);
}

function pruneAisStreamCache() {
  const cutoff = Date.now() - AISSTREAM_STALE_MS;
  for (const [mmsi, row] of _aisStreamVessels) {
    if (row._updatedAt < cutoff) {
      _aisStreamVessels.delete(mmsi);
      _aisStreamTracks.delete(mmsi);
      _aisStreamTrackPending.delete(mmsi);
    }
  }
  // Pending single-fix entries for vessels never seen again must not leak
  const pendingCutoffSec = Math.floor(cutoff / 1000);
  for (const [mmsi, pending] of _aisStreamTrackPending) {
    if (pending.epochSec < pendingCutoffSec) _aisStreamTrackPending.delete(mmsi);
  }
  if (_aisStreamVessels.size <= AISSTREAM_CACHE_MAX) return;
  const ordered = [..._aisStreamVessels.entries()].sort((a, b) => a[1]._updatedAt - b[1]._updatedAt);
  for (const [mmsi] of ordered.slice(0, _aisStreamVessels.size - AISSTREAM_CACHE_MAX)) {
    _aisStreamVessels.delete(mmsi);
    _aisStreamTracks.delete(mmsi);
    _aisStreamTrackPending.delete(mmsi);
  }
}

function newestAisPositionAt(rows) {
  return rows[0]?.last_position_UTC || null;
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

function parseJsonEnv(key, fallback) {
  const value = process.env[key];
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    console.warn(`[AISStream] Invalid ${key}; using default.`);
    return fallback;
  }
}

function parseCsvOrJsonEnv(key, fallback) {
  const value = process.env[key];
  if (!value) return fallback;
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : fallback;
  } catch {
    return value.split(',').map((entry) => entry.trim()).filter(Boolean);
  }
}

function clampInt(value, min, max, fallback) {
  const number = Number.parseInt(value, 10);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, number));
}

function stringValue(value) {
  if (value === undefined || value === null) return '';
  return String(value).trim();
}

function numberValue(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function normalizedHeading(value) {
  const heading = numberValue(value);
  return heading !== null && heading >= 0 && heading <= 360 ? heading : null;
}

function normalizeAisTimestamp(value) {
  const text = stringValue(value);
  if (!text) return new Date().toISOString();
  const normalized = text.replace(' +0000 UTC', 'Z').replace(' UTC', 'Z');
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
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
      rocketLaunchesProxy(),
      terrainHeightsProxy(),
      adsbdbProxy(),
      overpassProxy(),
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
