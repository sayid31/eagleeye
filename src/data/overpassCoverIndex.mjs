// src/data/overpassCoverIndex.mjs
/**
 * Serve a road query from a cached tile that CONTAINS its bbox.
 *
 * The Overpass cache key is the exact query text, so a cached 0.05° tile (the
 * warm-up script's size, or any high-altitude fetch) could never answer the
 * 0.025° request a low-altitude view makes for the same streets — that went
 * upstream and waited on the public mirrors (9–60 s, often 429/502). This
 * index remembers, per query TEMPLATE (the query with its bbox blanked), which
 * cached bboxes exist; a miss whose bbox sits inside one of them is answered
 * by cropping that tile's ways to the requested bbox.
 *
 * Road-class queries only (`isOverpassRoadQuery`): their `out geom` ways carry
 * the geometry the crop needs, and roads are what the traffic layer asks for.
 * The disk records store no query text, so tiles cached before this index
 * existed are indexed lazily, the next time their exact key is hit.
 *
 * @module data/overpassCoverIndex
 */

import { isOverpassRoadQuery, overpassQueryText } from './overpassDiskCache.mjs';

const NUM = '-?\\d+(?:\\.\\d+)?(?:e-?\\d+)?';
const BBOX_RE = new RegExp(`\\((${NUM}),(${NUM}),(${NUM}),(${NUM})\\)`, 'gi');
const EPS = 1e-9;

/** Default cap on remembered tiles; the oldest are dropped first. */
export const COVER_INDEX_MAX_ENTRIES = 5000;

/**
 * Split a normalized road query into its template and bbox.
 * @param {string} cacheKey Proxy cache key (encoded `data=` form body) or plain QL.
 * @returns {{template: string, bbox: {south: number, west: number, north: number, east: number}}|null}
 *   Null for non-road queries or anything without exactly one bbox.
 */
export function parseCoverKey(cacheKey) {
  const text = overpassQueryText(cacheKey);
  if (!isOverpassRoadQuery(text)) return null;
  const matches = [...text.matchAll(BBOX_RE)];
  if (matches.length !== 1) return null;
  const [whole, s, w, n, e] = matches[0];
  const bbox = { south: Number(s), west: Number(w), north: Number(n), east: Number(e) };
  if (!Object.values(bbox).every(Number.isFinite) || bbox.south >= bbox.north || bbox.west >= bbox.east) return null;
  return { template: text.replace(whole, '(BBOX)'), bbox };
}

/** Whether `outer` fully contains `inner` (degrees, with float tolerance). */
export function bboxContains(outer, inner) {
  return outer.south <= inner.south + EPS && outer.west <= inner.west + EPS
    && outer.north >= inner.north - EPS && outer.east >= inner.east - EPS;
}

const area = (b) => (b.north - b.south) * (b.east - b.west);

/** Liang–Barsky: does segment p→q touch the rectangle? (x = lon, y = lat) */
function segmentTouchesBox(p, q, box) {
  let t0 = 0;
  let t1 = 1;
  const dx = q.lon - p.lon;
  const dy = q.lat - p.lat;
  const edges = [
    [-dx, p.lon - box.west], [dx, box.east - p.lon],
    [-dy, p.lat - box.south], [dy, box.north - p.lat],
  ];
  for (const [pk, qk] of edges) {
    if (pk === 0) {
      if (qk < 0) return false;
    } else {
      const t = qk / pk;
      if (pk < 0) { if (t > t1) return false; if (t > t0) t0 = t; } else { if (t < t0) return false; if (t < t1) t1 = t; }
    }
  }
  return true;
}

/** Whether a way's `out geom` geometry touches the bbox (a point inside or a crossing segment). */
export function wayTouchesBox(geometry, box) {
  if (!Array.isArray(geometry) || geometry.length === 0) return false;
  if (geometry.length === 1) return segmentTouchesBox(geometry[0], geometry[0], box);
  for (let i = 0; i < geometry.length - 1; i++) {
    if (segmentTouchesBox(geometry[i], geometry[i + 1], box)) return true;
  }
  return false;
}

/**
 * Crop an Overpass JSON response to a bbox: keeps every way whose geometry
 * touches it (the same rule the Overpass bbox filter applies to ways) and
 * drops the rest. Non-way elements are dropped: road queries return ways only.
 * @param {string} bodyText Raw Overpass JSON.
 * @param {{south: number, west: number, north: number, east: number}} bbox
 * @returns {string|null} Cropped JSON, or null when the body is not a usable result.
 */
export function cropOverpassBody(bodyText, bbox) {
  let data;
  try { data = JSON.parse(bodyText); } catch { return null; }
  if (!data || !Array.isArray(data.elements)) return null;
  const elements = data.elements.filter((el) => el?.type === 'way' && wayTouchesBox(el.geometry, bbox));
  return JSON.stringify({ ...data, elements });
}

/**
 * In-memory cover index with injected persistence.
 * @param {{
 *   load?: () => Array<{key: string, cachedAt: number}>|null,
 *   save?: (entries: Array<{key: string, cachedAt: number}>) => void,
 *   ttlFor?: (cacheKey: string) => number,
 *   now?: () => number,
 *   maxEntries?: number,
 *   saveDelayMs?: number,
 * }} [deps]
 */
export function createOverpassCoverIndex({
  load = () => null,
  save = () => {},
  ttlFor = () => Infinity,
  now = Date.now,
  maxEntries = COVER_INDEX_MAX_ENTRIES,
  saveDelayMs = 2000,
} = {}) {
  /** key → {cachedAt, template, bbox}; Map order = insertion order = age. */
  const entries = new Map();
  let saveTimer = null;

  const add = (key, cachedAt) => {
    const parsed = parseCoverKey(key);
    if (!parsed || !Number.isFinite(cachedAt)) return false;
    entries.delete(key);
    entries.set(key, { cachedAt, ...parsed });
    while (entries.size > maxEntries) entries.delete(entries.keys().next().value);
    return true;
  };
  const scheduleSave = () => {
    if (saveTimer) return;
    saveTimer = setTimeout(() => {
      saveTimer = null;
      try {
        save([...entries].map(([key, e]) => ({ key, cachedAt: e.cachedAt })));
      } catch (error) {
        console.warn('[Overpass Cover] index save failed:', error?.message || error);
      }
    }, saveDelayMs);
    saveTimer.unref?.();
  };

  for (const row of load() || []) add(row?.key, row?.cachedAt);

  return {
    /** Remember a cached road tile. @returns {boolean} Whether it was indexable. */
    record(key, cachedAt) {
      const ok = add(key, cachedAt);
      if (ok) scheduleSave();
      return ok;
    },
    /** Forget a tile (e.g. its disk file is gone). */
    forget(key) {
      if (entries.delete(key)) scheduleSave();
    },
    /**
     * Cached keys whose bbox contains the request's, same template, still within
     * their TTL — smallest area first (least cropping, freshest geometry ties).
     * @param {string} key Normalized request query.
     * @returns {string[]}
     */
    candidates(key) {
      const wanted = parseCoverKey(key);
      if (!wanted) return [];
      const at = now();
      return [...entries]
        .filter(([k, e]) => k !== key && e.template === wanted.template && bboxContains(e.bbox, wanted.bbox)
          && at - e.cachedAt <= ttlFor(k))
        .sort((a, b) => area(a[1].bbox) - area(b[1].bbox) || b[1].cachedAt - a[1].cachedAt)
        .map(([k]) => k);
    },
    get size() { return entries.size; },
  };
}

/**
 * Answer a request from the smallest cached tile that contains it.
 * @param {ReturnType<typeof createOverpassCoverIndex>} index
 * @param {string} key Normalized request query.
 * @param {(coverKey: string) => Promise<object|null>} readPayload Disk/memory read honouring the tile's TTL.
 * @returns {Promise<object|null>} A payload with the cropped body, or null.
 */
export async function serveFromCover(index, key, readPayload) {
  const wanted = parseCoverKey(key);
  if (!wanted) return null;
  for (const coverKey of index.candidates(key)) {
    const payload = await readPayload(coverKey);
    if (!payload || payload.status !== 200) {
      if (!payload) index.forget(coverKey);
      continue;
    }
    const body = cropOverpassBody(payload.body, wanted.bbox);
    if (body === null) continue;
    return { ...payload, body };
  }
  return null;
}
