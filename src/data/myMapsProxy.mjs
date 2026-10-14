/**
 * myMapsProxy.mjs — Vite dev/preview plugin serving the allowlisted Google
 * My Maps datasets (src/data/myMapsSources.mjs) as JSON Lines point features.
 *
 * Node-only (imported by vite.config.js), never bundled for the browser.
 * Upstream: https://www.google.com/maps/d/kml?mid=<id>&forcekml=1 (public share).
 *
 * Route: GET /api/mymaps/<dataset>  → application/x-ndjson, one Feature per line.
 * The dataset name selects an allowlisted list of map ids; nothing in the
 * request ever reaches the upstream URL. The cache is the quota guard:
 * 6 h TTL, single-flight refresh, serve-stale on upstream failure.
 */

import { MYMAPS_DATASETS, myMapsKmlUrl } from './myMapsSources.mjs';
import { featuresToJsonLines, parseMyMapsKml } from './myMapsKml.mjs';

export const MYMAPS_TTL_MS = 6 * 3600_000;
/** Upstream KML above this is refused (the two source documents are ~58 KB each). */
export const MYMAPS_MAX_KML_BYTES = 2 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 20_000;
const USER_AGENT = 'Mozilla/5.0 (compatible; GodsEyeView/1.0)';

/**
 * Fetch and merge every document of one allowlisted dataset.
 * @param {string} dataset - Key of MYMAPS_DATASETS.
 * @param {{fetchFn?: typeof fetch}} [options]
 * @returns {Promise<object[]>} Point features; throws when any document fails or the result is empty.
 */
export async function loadMyMapsDataset(dataset, { fetchFn = fetch } = {}) {
  const documents = MYMAPS_DATASETS[dataset];
  if (!documents) throw new Error(`unknown My Maps dataset ${dataset}`);
  const features = [];
  for (const { mid, kind } of documents) {
    const res = await fetchFn(myMapsKmlUrl(mid), {
      headers: { 'User-Agent': USER_AGENT },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`${kind} map answered HTTP ${res.status}`);
    const text = await res.text();
    if (text.length > MYMAPS_MAX_KML_BYTES) throw new Error(`${kind} map is larger than ${MYMAPS_MAX_KML_BYTES} bytes`);
    if (!/<kml[\s>]/.test(text)) throw new Error(`${kind} map did not return KML`);
    for (const feature of parseMyMapsKml(text, kind)) features.push(feature);
  }
  if (features.length === 0) throw new Error(`dataset ${dataset} parsed to zero features`);
  return features;
}

/**
 * Cached loader: TTL, single-flight refresh, stale-on-failure.
 * @param {{fetchFn?: typeof fetch, now?: () => number, ttlMs?: number}} [options]
 * @returns {(dataset: string) => Promise<{body: string, stale: boolean}|null>} null for an unknown dataset.
 */
export function createMyMapsCache({ fetchFn = fetch, now = Date.now, ttlMs = MYMAPS_TTL_MS } = {}) {
  /** @type {Map<string, {at: number, body: string}>} */
  const entries = new Map();
  /** @type {Map<string, Promise<{at: number, body: string}|null>>} */
  const inflight = new Map();

  return async function get(dataset) {
    if (!Object.hasOwn(MYMAPS_DATASETS, dataset)) return null;
    const cached = entries.get(dataset);
    if (cached && now() - cached.at < ttlMs) return { body: cached.body, stale: false };
    if (!inflight.has(dataset)) {
      const refresh = loadMyMapsDataset(dataset, { fetchFn })
        .then((features) => {
          const entry = { at: now(), body: featuresToJsonLines(features) };
          entries.set(dataset, entry);
          return entry;
        })
        .catch((err) => {
          console.warn(`[mymaps-proxy] ${dataset} refresh failed (${err?.message || err})${cached ? ' — serving stale cache' : ''}`);
          return null;
        })
        .finally(() => { inflight.delete(dataset); });
      inflight.set(dataset, refresh);
    }
    const fresh = await inflight.get(dataset);
    if (fresh) return { body: fresh.body, stale: false };
    if (cached) return { body: cached.body, stale: true };
    throw new Error('upstream unavailable and no cache');
  };
}

/**
 * @returns {import('vite').Plugin}
 */
export function myMapsProxy() {
  const get = createMyMapsCache();
  const handler = async (req, res) => {
    const send = (status, body, type = 'application/json') => {
      if (res.headersSent) return;
      res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store' });
      res.end(body);
    };
    if (req.method !== 'GET') { send(405, JSON.stringify({ error: 'method not allowed' })); return; }
    const dataset = String(req.url || '').split('?')[0].replace(/^\/|\.geojsonl$/g, '');
    try {
      const result = await get(dataset);
      if (!result) { send(404, JSON.stringify({ error: 'unknown dataset' })); return; }
      send(200, result.body, 'application/x-ndjson; charset=utf-8');
    } catch (err) {
      console.warn('[mymaps-proxy] error:', err?.message || err);
      send(502, JSON.stringify({ error: 'my maps fetch failed and no cache available' }));
    }
  };
  return {
    name: 'mymaps-proxy',
    configureServer(server) { server.middlewares.use('/api/mymaps', handler); },
    configurePreviewServer(server) { server.middlewares.use('/api/mymaps', handler); },
  };
}
