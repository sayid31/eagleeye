/**
 * overpassDiskCache.mjs — the disk layer of the Overpass response cache: the
 * per-query-class TTLs, the content-addressed file path, and the read/write
 * primitives overpassCore.mjs and overpassProxy.mjs use for their disk-hit and
 * serve-stale paths.
 *
 * Lives in its own module because it is the only part of the Overpass machinery
 * that touches a filesystem — the split takes all three `node:` imports with it
 * and leaves the core purely fetch/mirror-rotation/sanitisation — and because
 * overpassCore.mjs was over its file-size ceiling, the same reason
 * overpassSimplify.mjs and overpassDiskBudget.mjs were extracted before it.
 *
 * Node-only (imported by overpassCore.mjs via vite.config.js), never bundled
 * for the browser.
 *
 * @module data/overpassDiskCache
 */

import { promises as fsp } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { noteOverpassDiskWrite } from './overpassDiskBudget.mjs';

/** Disk-cache TTL for Overpass responses (ms) — 7 days. */
const OVERPASS_DISK_TTL_MS = 7 * 86_400_000;
/**
 * Disk-cache TTL for ROAD-class queries (the traffic layer's `highway`
 * selector) — 60 days. The road graph changes on construction timescales, not
 * weekly (see docs/DECISIONS.md 2026-10-21).
 */
const OVERPASS_ROAD_DISK_TTL_MS = 60 * 86_400_000;
/**
 * Disk-cache TTL for BOUNDARY-class queries (is_in / admin-relation pivots) — 30
 * days. Admin boundaries change ≈never, and their pivots are the most expensive
 * queries the app issues (multi-MB coastline geometry, 10–25 s on public mirrors —
 * field test 2026-07-23: outline latency + the Sicily miss). Keeping them a month
 * means each boundary is fetched roughly once per machine, ever.
 */
const OVERPASS_BOUNDARY_DISK_TTL_MS = 30 * 86_400_000;
/** Disk-cache directory for Overpass responses. */
const OVERPASS_DISK_DIR = path.join(process.cwd(), '.gev-cache', 'overpass');

/**
 * Whether a normalized Overpass query is BOUNDARY-class (admin `is_in` lookups
 * and area→relation pivots) — the static, expensive geometry that earns the
 * 30-day disk TTL. The enclosing-compound sweep and road fetches keep the
 * default TTL. Exported for tests.
 */
export function isOverpassBoundaryQuery(cacheKey) {
  return /is_in\s*\(|\bpivot\b/i.test(String(cacheKey || ''));
}

/**
 * Whether a normalized Overpass query is ROAD-class — the traffic layer's
 * `highway` selector. Road geometry is as static as admin boundaries in
 * practice, so it earns a long disk TTL of its own. Exported for tests.
 */
export function isOverpassRoadQuery(cacheKey) {
  return /\[\s*["']?highway["']?\s*[~=]/.test(String(cacheKey || ''));
}

/**
 * Disk TTL for a query: boundary geometry keeps for a month, roads for two,
 * everything else 7 days. Boundary is checked first — a query that is both
 * (an admin pivot that also filters roads) is the expensive one to refetch.
 */
export function overpassDiskTtlMs(cacheKey) {
  if (isOverpassBoundaryQuery(cacheKey)) return OVERPASS_BOUNDARY_DISK_TTL_MS;
  if (isOverpassRoadQuery(cacheKey)) return OVERPASS_ROAD_DISK_TTL_MS;
  return OVERPASS_DISK_TTL_MS;
}

/** Normalized Overpass query -> stable disk-cache file path. */
function overpassDiskPath(cacheKey, dir = OVERPASS_DISK_DIR) {
  return path.join(dir, `${createHash('sha1').update(cacheKey).digest('hex')}.json`);
}

/**
 * Read a disk-cached Overpass payload. maxAgeMs Infinity = any age (the
 * serve-stale path when every mirror is down).
 * @param {string} cacheKey Normalized query body.
 * @param {number} maxAgeMs Max acceptable age, or Infinity for any.
 * @param {{dir?:string}} [opts] Test seam for the cache directory.
 * @returns {Promise<?Object>} Payload with cachedAt, or null.
 */
export async function readOverpassDisk(cacheKey, maxAgeMs, opts = {}) {
  try {
    const raw = await fsp.readFile(overpassDiskPath(cacheKey, opts.dir), 'utf8');
    const payload = JSON.parse(raw);
    if (!payload || typeof payload.body !== 'string' || !Number.isFinite(payload.cachedAt)) return null;
    if (Date.now() - payload.cachedAt > maxAgeMs) return null;
    return payload;
  } catch {
    return null;
  }
}

/**
 * Fire-and-forget disk write for a successful Overpass payload, which also
 * drives the periodic size sweep — nothing else deletes from this directory,
 * so the budget has to ride along with the writes that grow it.
 *
 * @param {string} cacheKey Normalized query body.
 * @param {Object} payload Response payload to persist.
 * @param {{dir?:string,every?:number,budgetBytes?:number}} [opts] Test seams.
 * @returns {Promise} Resolves once the write and any sweep have settled.
 */
export function writeOverpassDisk(cacheKey, payload, opts = {}) {
  const { dir = OVERPASS_DISK_DIR } = opts;
  return fsp.mkdir(dir, { recursive: true })
    .then(() => fsp.writeFile(overpassDiskPath(cacheKey, dir), JSON.stringify(payload)))
    .then(() => noteOverpassDiskWrite(dir, opts))
    .catch((err) => console.warn('[Overpass Proxy] disk cache write failed:', err?.message || err));
}
