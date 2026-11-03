/**
 * @file Pure planning for the Overpass road-cache warm-up script.
 *
 * `scripts/warm-overpass-cache.mjs` pre-fetches the road tiles of frequently
 * visited places through the dev server's own `/api/overpass` proxy, so the
 * first visit is a disk-cache DISK hit instead of a ~45 s mirror queue. A warm
 * entry only helps if its query text is byte-identical to what the app sends
 * (the proxy keys on the normalized query body), so this module builds the
 * boxes with the app's own `clampBoundsAroundCenter` + `buildOverpassQuery`
 * and the shared timeouts — never a re-implementation.
 *
 * Coverage limit: the app clamps each axis to min(view span, 0.05°). The plan
 * covers views whose span is at least 0.05° on both axes (a ~5.5 km box, the
 * common case at the altitudes traffic runs); a tighter low-altitude view asks
 * for a smaller box and is a different cache key.
 *
 * @module data/trafficWarmPlan
 */

import { clampBoundsAroundCenter } from './trafficBounds.js';
import { ROAD_FETCH_TIMEOUT_SEC, buildOverpassQuery } from './trafficOverpassQuery.js';

/** @const {number} Per-axis span (degrees) the app clamps its fetch box to. */
export const WARM_BOX_SPAN_DEG = 0.05;

/**
 * Build the road-query plan for one place.
 *
 * @param {{lat:number, lon:number}} center - Look-at point (degrees); snapped to the app's fetch grid.
 * @param {Object} [opts]
 * @param {boolean} [opts.includeFull=true] - Also plan the tertiary/residential pass (the app only requests it at ≤ 4500 m).
 * @returns {{bounds:{south:number,west:number,north:number,east:number}, passes:Array<{pass:'major'|'full', query:string}>}|null}
 *   Null when the center is not finite.
 */
export function planWarmTile(center, { includeFull = true } = {}) {
  if (!Number.isFinite(center?.lat) || !Number.isFinite(center?.lon)) return null;
  // A donor box wider than the clamp: the clamp keeps WARM_BOX_SPAN_DEG per axis.
  const donor = {
    south: center.lat - 1,
    north: center.lat + 1,
    west: center.lon - 1,
    east: center.lon + 1,
  };
  const bounds = clampBoundsAroundCenter(donor, center, WARM_BOX_SPAN_DEG);
  const build = (majorOnly, timeoutSec) => (
    buildOverpassQuery(bounds.south, bounds.west, bounds.north, bounds.east, { majorOnly, timeoutSec })
  );
  const passes = [{ pass: 'major', query: build(true, ROAD_FETCH_TIMEOUT_SEC.major) }];
  if (includeFull) passes.push({ pass: 'full', query: build(false, ROAD_FETCH_TIMEOUT_SEC.full) });
  return { bounds, passes };
}

/**
 * Plan every named place, dropping duplicates that snap to the same tile.
 *
 * @param {Array<{id:string, name:string, lat:number, lon:number}>} places
 * @param {Object} [opts] - Forwarded to {@link planWarmTile}.
 * @returns {Array<{id:string, name:string, bounds:object, passes:Array<{pass:string, query:string}>}>}
 */
export function planWarmTiles(places, opts) {
  const seen = new Set();
  const plan = [];
  for (const place of places || []) {
    const tile = planWarmTile(place, opts);
    if (!tile) continue;
    const key = tile.passes[0].query;
    if (seen.has(key)) continue;
    seen.add(key);
    plan.push({ id: place.id, name: place.name, ...tile });
  }
  return plan;
}
