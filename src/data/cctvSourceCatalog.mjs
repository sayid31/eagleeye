/**
 * cctvSourceCatalog.mjs — assembles, de-duplicates, caps and caches the merged CCTV source list
 * (bundled file, env, Indonesia-unofficial pack, live open-data packs). One shared refresh at a
 * time; a fully-empty refresh serves the previous catalog instead of blanking the layer. Node-only.
 */

import fs from 'node:fs';
import path from 'node:path';
import { normalizeSourceItem } from './cctvSourceNormalize.mjs';
import { loadAustinSourcesFromOpenData, loadCaltransSourcesFromOpenData, loadTflSourcesFromOpenData } from './cctvOpenDataSources.mjs';

// Config-file paths below were resolved against vite.config.js's own
// module-relative `__dirname` (the repo root, since vite.config.js lives
// there). This module now runs from src/data/, so `process.cwd()` — the repo
// root the dev server is always launched from — is used instead, matching
// the sibling proxy modules' precedent (e.g. celestrakProxy.mjs's cache dir).
const __dirname = process.cwd();

// ---------------------------------------------------------------------------
// CCTV proxy constants and source cache state
// ---------------------------------------------------------------------------
/** Path to the optional static CCTV source list (JSON array). */
const DEFAULT_CCTV_SOURCE_FILE = 'config/cctv_sources.austin.json';

/** UNOFFICIAL — internal-demo-only Indonesia camera pack (see file header
 * comment + DATA_SOURCES.md). Revoke by deleting this file or setting
 * CCTV_INDONESIA_UNOFFICIAL_ENABLED=0 — do not delete this constant/loader
 * without also removing the disclosure in DATA_SOURCES.md/CHANGELOG.md. */
const DEFAULT_CCTV_INDONESIA_UNOFFICIAL_FILE = 'config/cctv_sources.indonesia_unofficial.json';

/** Global cap on total CCTV sources served by the proxy. Also the hard clamp for
 * CCTV_MAX_SOURCES and the size of the per-camera health map. */
export const DEFAULT_CCTV_MAX_SOURCES = 1600;

/** Camera CATALOGS change rarely; 15 min keeps multi-megabyte upstream list refetches (Austin rows.json + 4 Caltrans districts + TfL) infrequent. Frames are fetched per-request and are unaffected. */
const CCTV_SOURCE_CACHE_MS = 15 * 60 * 1000;

/** @type {Array<object>} Cached merged + normalized CCTV source list. */
let _cctvSourceCache = [];

/** @type {number} Epoch-ms when the source cache was last refreshed. */
let _cctvSourceCacheAt = 0;

/** @type {Promise<Array<object>>|null} In-flight refresh, shared by concurrent
 * callers so a post-TTL burst launches ONE refetch, not one per request. */
let _cctvSourceInflight = null;

/**
 * Load CCTV sources from a local JSON file (CCTV_SOURCES_FILE env or default).
 *
 * @returns {Array<object>} Array of raw source objects, or [] on error.
 */
function loadSourcesFromFile() {
  const sourceFile = process.env.CCTV_SOURCES_FILE || DEFAULT_CCTV_SOURCE_FILE;
  const resolved = path.isAbsolute(sourceFile)
    ? sourceFile
    : path.resolve(__dirname, sourceFile);
  try {
    if (!fs.existsSync(resolved)) return [];
    const raw = fs.readFileSync(resolved, 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.warn('[CCTV] failed to read source file:', resolved, error?.message || error);
    return [];
  }
}

/**
 * Load CCTV sources from the CCTV_SOURCES_JSON env variable (inline JSON).
 *
 * @returns {Array<object>} Array of raw source objects, or [] if unset/invalid.
 */
function loadSourcesFromEnv() {
  const raw = process.env.CCTV_SOURCES_JSON;
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * UNOFFICIAL SOURCE PACK — internal demo only, NOT for public/commercial
 * deployment. Loads a small, hardcoded set of Indonesian city cameras whose
 * HLS manifest URLs were reverse-engineered via manual browser network
 * inspection of public city-government CCTV portals (Jakarta Smart City,
 * Bandung Dishub ATCS, Denpasar ATCS). There is no formal data-sharing
 * agreement with any of these city governments. See
 * config/cctv_sources.indonesia_unofficial.json (per-camera `license` field)
 * and DATA_SOURCES.md for the full disclosure.
 *
 * Deliberately independent of loadSourcesFromFile()/CCTV_SOURCES_FILE so it
 * can never flip `needsLiveSources` off and silently disable the
 * Austin/Caltrans/TfL live open-data packs in refreshCctvSources().
 *
 * Revocation levers (either is sufficient):
 *   - set CCTV_INDONESIA_UNOFFICIAL_ENABLED=0
 *   - delete config/cctv_sources.indonesia_unofficial.json (or the file
 *     pointed to by CCTV_INDONESIA_UNOFFICIAL_FILE)
 *
 * @returns {Array<object>} Array of raw source objects, or [] if disabled/missing/invalid.
 */
function loadIndonesiaUnofficialSources() {
  const enabled = String(process.env.CCTV_INDONESIA_UNOFFICIAL_ENABLED || '1').trim() !== '0';
  if (!enabled) return [];
  const sourceFile = process.env.CCTV_INDONESIA_UNOFFICIAL_FILE || DEFAULT_CCTV_INDONESIA_UNOFFICIAL_FILE;
  const resolved = path.isAbsolute(sourceFile)
    ? sourceFile
    : path.resolve(__dirname, sourceFile);
  try {
    if (!fs.existsSync(resolved)) return [];
    const raw = fs.readFileSync(resolved, 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.warn('[CCTV] failed to read Indonesia unofficial source file:', resolved, error?.message || error);
    return [];
  }
}

/**
 * Assemble and cache the merged CCTV source list.
 *
 * Merges sources from three origins (Austin Open Data, local file,
 * env variable), deduplicates by ID, applies the global max cap, and
 * caches for CCTV_SOURCE_CACHE_MS.
 *
 * @returns {Promise<Array<object>>} Deduplicated, capped source list.
 */
export async function getCctvSources() {
  const now = Date.now();
  if (_cctvSourceCache.length && now - _cctvSourceCacheAt <= CCTV_SOURCE_CACHE_MS) {
    return _cctvSourceCache;
  }
  // Single-flight: a burst of requests arriving past the TTL shares ONE refresh
  // instead of each launching the full multi-provider refetch. The `.finally`
  // clears the ref so the next post-TTL cycle starts fresh.
  if (_cctvSourceInflight) return _cctvSourceInflight;
  _cctvSourceInflight = refreshCctvSources().finally(() => { _cctvSourceInflight = null; });
  return _cctvSourceInflight;
}

/**
 * Assemble and cache the merged CCTV source list from file/env + live packs.
 * Always resolves (loaders self-catch to []); on a fully-empty refresh with a
 * good prior catalog it serves stale rather than blanking the CCTV layer.
 *
 * @returns {Promise<Array<object>>} Deduplicated, capped source list.
 */
async function refreshCctvSources() {
  const fromFile = loadSourcesFromFile();
  const fromEnv = loadSourcesFromEnv();
  // UNOFFICIAL — internal demo only; always loaded independent of the
  // needsLiveSources gate below so it never disables the Austin/Caltrans/TfL
  // live packs. See loadIndonesiaUnofficialSources() for revocation levers.
  const fromIndonesiaUnofficial = loadIndonesiaUnofficialSources();

  const forceAustin = String(process.env.CCTV_FORCE_AUSTIN || '').trim() === '1';
  const preferAustin = String(process.env.CCTV_PREFER_AUSTIN || '1').trim() !== '0';
  // Live open-data packs (Austin + Caltrans + TfL) load unless a file/env pack
  // is configured and live packs aren't forced — same gate that governed the
  // Austin-only fetch, now governing all three. Each pack fails independently.
  const needsLiveSources = forceAustin || ((fromFile.length + fromEnv.length) === 0 && preferAustin);
  const tflEnabled = String(process.env.CCTV_TFL_ENABLED || '1').trim() !== '0';

  let fromAustin = [];
  let fromCaltrans = [];
  let fromTfl = [];
  if (needsLiveSources) {
    const [austinResult, caltransResult, tflResult] = await Promise.allSettled([
      loadAustinSourcesFromOpenData(),
      loadCaltransSourcesFromOpenData(),
      tflEnabled ? loadTflSourcesFromOpenData() : Promise.resolve([]),
    ]);
    fromAustin = austinResult.status === 'fulfilled' ? austinResult.value : [];
    fromCaltrans = caltransResult.status === 'fulfilled' ? caltransResult.value : [];
    fromTfl = tflResult.status === 'fulfilled' ? tflResult.value : [];
  }
  // Live sources first so file/env overrides win on duplicate IDs (Map last-write).
  const merged = [...fromAustin, ...fromCaltrans, ...fromTfl, ...fromFile, ...fromEnv, ...fromIndonesiaUnofficial];

  // Deduplicate by camera ID (last-write wins because of Map.set)
  const byId = new Map();
  for (const item of merged) {
    if (!item || typeof item !== 'object') continue;
    const normalized = normalizeSourceItem(item);
    if (!normalized.id) continue;
    byId.set(normalized.id, normalized);
  }

  const mergedSources = Array.from(byId.values());
  const maxRaw = Number(process.env.CCTV_MAX_SOURCES || DEFAULT_CCTV_MAX_SOURCES);
  const maxCount = Number.isFinite(maxRaw) ? Math.max(8, Math.min(DEFAULT_CCTV_MAX_SOURCES, Math.floor(maxRaw))) : DEFAULT_CCTV_MAX_SOURCES;
  if (mergedSources.length > maxCount) {
    console.warn(`[CCTV] source catalog ${mergedSources.length} exceeds cap ${maxCount}; keeping the first ${maxCount} (raise CCTV_MAX_SOURCES or lower a per-pack cap to change which).`);
  }
  const capped = mergedSources.length > maxCount ? mergedSources.slice(0, maxCount) : mergedSources;
  if (capped.length > 0 || _cctvSourceCache.length === 0) {
    _cctvSourceCache = capped;
  } else {
    // Every source came back empty (all live packs timed out / upstream outage)
    // but a good catalog is already cached — serve it stale rather than blanking
    // every CCTV route. Advancing the timestamp waits one TTL before retrying,
    // which (with single-flight) bounds load on a persistently-down upstream.
    console.warn(`[CCTV] source refresh returned empty; serving ${_cctvSourceCache.length} stale cameras`);
  }
  _cctvSourceCacheAt = Date.now();
  return _cctvSourceCache;
}
