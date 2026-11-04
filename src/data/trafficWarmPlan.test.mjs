import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { clampBoundsAroundCenter } from './trafficBounds.js';
import { ROAD_FETCH_TIMEOUT_SEC, buildOverpassQuery } from './trafficOverpassQuery.js';
import { planWarmTile, planWarmTiles, WARM_BOX_SPAN_DEG } from './trafficWarmPlan.js';

const JAKARTA = { lat: -6.1754, lon: 106.8271 };

test('the warm box is exactly what the app clamps a wide view to around the same center', () => {
  // The app path: any view at least as wide as the clamp, same look-at point.
  const appView = { south: -6.3, north: -6.0, west: 106.6, east: 107.0 };
  const appBox = clampBoundsAroundCenter(appView, JAKARTA);
  const tile = planWarmTile(JAKARTA);
  assert.deepEqual(tile.bounds, appBox);
  assert.equal(tile.passes[0].query, buildOverpassQuery(
    appBox.south, appBox.west, appBox.north, appBox.east,
    { majorOnly: true, timeoutSec: ROAD_FETCH_TIMEOUT_SEC.major },
  ));
  assert.equal(tile.passes[1].query, buildOverpassQuery(
    appBox.south, appBox.west, appBox.north, appBox.east,
    { majorOnly: false, timeoutSec: ROAD_FETCH_TIMEOUT_SEC.full },
  ));
});

test('two look-at points inside one grid cell plan the same tile', () => {
  const a = planWarmTile({ lat: -6.1754, lon: 106.8271 });
  const b = planWarmTile({ lat: -6.1760, lon: 106.8275 });
  assert.equal(a.passes[0].query, b.passes[0].query);
});

test('the box spans the shared clamp and the passes carry the road-class regexes', () => {
  const { bounds, passes } = planWarmTile(JAKARTA);
  assert.ok(Math.abs((bounds.north - bounds.south) - WARM_BOX_SPAN_DEG) < 1e-9);
  assert.ok(Math.abs((bounds.east - bounds.west) - WARM_BOX_SPAN_DEG) < 1e-9);
  assert.match(passes[0].query, /\[timeout:12\]/);
  assert.match(passes[0].query, /\^\(motorway\|trunk\|primary\|secondary\)\$/);
  assert.match(passes[1].query, /\[timeout:20\]/);
  assert.match(passes[1].query, /tertiary\|residential\|unclassified/);
});

test('includeFull:false plans the major pass only', () => {
  assert.deepEqual(planWarmTile(JAKARTA, { includeFull: false }).passes.map((p) => p.pass), ['major']);
});

test('non-finite centers are skipped and duplicate tiles collapse', () => {
  assert.equal(planWarmTile({ lat: Number.NaN, lon: 1 }), null);
  assert.equal(planWarmTile(null), null);
  const plan = planWarmTiles([
    { id: 'a', name: 'A', ...JAKARTA },
    { id: 'b', name: 'B', lat: -6.1756, lon: 106.8272 },
    { id: 'c', name: 'C', lat: Number.NaN, lon: 0 },
    { id: 'd', name: 'D', lat: 35.6586, lon: 139.7454 },
  ]);
  assert.deepEqual(plan.map((t) => t.id), ['a', 'd']);
});

test('the app fetch path reads the same timeouts this plan uses', () => {
  const src = readFileSync(new URL('./trafficLoad.js', import.meta.url), 'utf8');
  assert.match(src, /timeoutSec: ROAD_FETCH_TIMEOUT_SEC\.major/);
  assert.match(src, /timeoutSec: ROAD_FETCH_TIMEOUT_SEC\.full/);
});
