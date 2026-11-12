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
 * Coverage limit (city mode): the app clamps each axis to min(view span,
 * 0.05°). A city tile covers views whose span is at least 0.05° on both axes
 * and whose centre snaps to the same cell; any other view is a different key.
 *
 * Region mode removes that limit: 0.1° tiles on a 0.05° grid. Every app box
 * (≤ 0.05° per axis, centre on the 0.0125° grid) whose centre lies in the
 * region is then fully inside one warm tile of the same query template, which
 * the proxy's COVER path crops for it (~24 ms) — at any altitude.
 *
 * @module data/trafficWarmPlan
 */

import { clampBoundsAroundCenter } from './trafficBounds.js';
import { ROAD_FETCH_TIMEOUT_SEC, buildOverpassQuery } from './trafficOverpassQuery.js';

/** @const {number} Per-axis span (degrees) the app clamps its fetch box to. */
export const WARM_BOX_SPAN_DEG = 0.05;

/** @const {number} Region-mode tile span: twice the app box, so one tile always contains it. */
export const REGION_TILE_SPAN_DEG = 0.1;
/** @const {number} Region-mode grid step: half a tile, so a centre is ≤ 0.025° from a tile centre. */
export const REGION_GRID_STEP_DEG = 0.05;

/**
 * Areas warmed by `--regions` (owner demo routes, 2026-11-12; planpreload.md).
 * Bounds are the city extents whose views must open instantly.
 * @type {Readonly<Record<string, {name: string, south: number, west: number, north: number, east: number}>>}
 */
export const WARM_REGIONS = Object.freeze({
  // Canggu/Tanah Lot west, Sanur east, Mengwi north, Nusa Dua/Uluwatu south.
  'denpasar-badung': { name: 'Denpasar–Badung', south: -8.85, west: 115.08, north: -8.55, east: 115.27 },
  kupang: { name: 'Kupang', south: -10.22, west: 123.55, north: -10.13, east: 123.67 },
  'labuan-bajo': { name: 'Labuan Bajo', south: -8.53, west: 119.86, north: -8.46, east: 119.93 },
});

/**
 * Build the road-query plan for one place.
 *
 * @param {{lat:number, lon:number}} center - Look-at point (degrees); snapped to the app's fetch grid.
 * @param {Object} [opts]
 * @param {boolean} [opts.includeFull=true] - Also plan the tertiary/residential pass (the app only requests it at ≤ 4500 m).
 * @param {number} [opts.spanDeg=WARM_BOX_SPAN_DEG] - Per-axis tile span (region mode uses REGION_TILE_SPAN_DEG).
 * @returns {{bounds:{south:number,west:number,north:number,east:number}, passes:Array<{pass:'major'|'full', query:string}>}|null}
 *   Null when the center is not finite.
 */
export function planWarmTile(center, { includeFull = true, spanDeg = WARM_BOX_SPAN_DEG } = {}) {
  if (!Number.isFinite(center?.lat) || !Number.isFinite(center?.lon)) return null;
  // A donor box wider than the clamp: the clamp keeps WARM_BOX_SPAN_DEG per axis.
  const donor = {
    south: center.lat - 1,
    north: center.lat + 1,
    west: center.lon - 1,
    east: center.lon + 1,
  };
  const bounds = clampBoundsAroundCenter(donor, center, spanDeg);
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

/**
 * Plan a region as 0.1° tiles on a 0.05° grid (see the module comment for why
 * that covers every app view inside it).
 *
 * @param {{name: string, south: number, west: number, north: number, east: number}} region
 * @param {Object} [opts]
 * @param {boolean} [opts.includeFull=true] - Also plan the tertiary/residential pass.
 * @returns {Array<{id:string, name:string, bounds:object, passes:Array<{pass:string, query:string}>}>}
 */
export function planWarmRegion(region, { includeFull = true } = {}) {
  const step = REGION_GRID_STEP_DEG;
  // Integer grid indices avoid float drift across rows/columns.
  const rows = [Math.round(region.south / step), Math.round(region.north / step)];
  const cols = [Math.round(region.west / step), Math.round(region.east / step)];
  const places = [];
  for (let r = rows[0]; r <= rows[1]; r += 1) {
    for (let c = cols[0]; c <= cols[1]; c += 1) {
      places.push({ id: `${region.name}:${r}:${c}`, name: region.name, lat: r * step, lon: c * step });
    }
  }
  return planWarmTiles(places, { includeFull, spanDeg: REGION_TILE_SPAN_DEG });
}
