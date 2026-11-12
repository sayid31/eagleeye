// Region warm-up (planpreload.md, 2026-11-12): the owner's demo flies to
// Denpasar–Badung, Kupang and Labuan Bajo. These prove, with the proxy's own
// sanitizer and COVER matcher, that every box the app can ask for there is
// served from one warm tile — so a visit never waits for Overpass.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WARM_REGIONS, planWarmRegion, REGION_TILE_SPAN_DEG } from './trafficWarmPlan.js';
import { clampBoundsAroundCenter } from './trafficBounds.js';
import { ROAD_FETCH_TIMEOUT_SEC, buildOverpassQuery } from './trafficOverpassQuery.js';
import { sanitizeOverpassBody } from './overpassCore.mjs';
import { bboxContains, parseCoverKey } from './overpassCoverIndex.mjs';

const cacheKey = (query) => {
  const sanitized = sanitizeOverpassBody(`data=${encodeURIComponent(query)}`);
  assert.equal(sanitized.ok, true, sanitized.error);
  return sanitized.body;
};

/** The box + query the app builds for a view of `spanDeg` centred at `center`. */
function appKeys(center, spanDeg) {
  const view = { south: center.lat - spanDeg / 2, north: center.lat + spanDeg / 2, west: center.lon - spanDeg / 2, east: center.lon + spanDeg / 2 };
  const b = clampBoundsAroundCenter(view, center, 0.05);
  return ['major', 'full'].map((pass) => cacheKey(buildOverpassQuery(b.south, b.west, b.north, b.east, {
    majorOnly: pass === 'major', timeoutSec: ROAD_FETCH_TIMEOUT_SEC[pass],
  })));
}

test('every app view inside a demo region is contained in one warm tile of the same template', () => {
  for (const [id, region] of Object.entries(WARM_REGIONS)) {
    const warm = planWarmRegion(region).flatMap((tile) => tile.passes.map((p) => parseCoverKey(cacheKey(p.query))));
    assert.ok(warm.every(Boolean), `${id}: every warm query is a COVER-able road query`);
    let checked = 0;
    // App centres snap to the 0.0125° grid; sweep that grid over the region.
    for (let lat = Math.ceil(region.south / 0.0125) * 0.0125; lat <= region.north; lat += 0.0125) {
      for (let lon = Math.ceil(region.west / 0.0125) * 0.0125; lon <= region.east; lon += 0.0125) {
        for (const span of [0.05, 0.03125, 0.0125]) {
          for (const key of appKeys({ lat, lon }, span)) {
            const wanted = parseCoverKey(key);
            assert.ok(
              warm.some((tile) => tile.template === wanted.template && bboxContains(tile.bbox, wanted.bbox)),
              `${id}: no warm tile covers ${JSON.stringify(wanted.bbox)}`,
            );
            checked += 1;
          }
        }
      }
    }
    assert.ok(checked > 20, `${id}: swept ${checked} app boxes`);
  }
});

test('the demo plan is small enough to warm politely', () => {
  const tiles = Object.values(WARM_REGIONS).flatMap((region) => planWarmRegion(region));
  assert.equal(tiles.length, 43);
  assert.ok(tiles.every((t) => t.passes.length === 2));
  assert.ok(tiles.every((t) => Math.abs((t.bounds.north - t.bounds.south) - REGION_TILE_SPAN_DEG) < 1e-9));
  assert.equal(planWarmRegion(WARM_REGIONS.kupang, { includeFull: false }).every((t) => t.passes.length === 1), true);
});
