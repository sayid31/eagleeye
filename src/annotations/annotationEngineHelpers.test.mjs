// Pure helpers extracted from annotationEngine.js.
// Run with: npm test   (node --test)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  appendDistance,
  cleanLabel,
  composeRouteLabel,
  computeAlpha,
  FADE_MS,
  failResult,
  formatDistance,
  greatCircleM,
  normalizeMode,
  normalizeType,
  pendingAnimation,
  ringRange,
  ringsEqual,
  round5,
  specTargets,
  VIEWPORT_ASSIST_RANGE_CAP_M,
  viewportRange,
  wait,
} from './annotationEngineHelpers.js';

test('wait resolves after the requested delay', async () => {
  const start = Date.now();
  await wait(10);
  assert.ok(Date.now() - start >= 8); // small slack for timer jitter
});

test('ringsEqual matches identical rings within epsilon', () => {
  assert.equal(ringsEqual([[0, 0], [1, 1]], [[0, 0], [1, 1]]), true);
  assert.equal(ringsEqual([[0, 0], [1, 1]], [[0, 0], [1, 1.001]]), false);
});

test('ringsEqual rejects mismatched lengths', () => {
  assert.equal(ringsEqual([[0, 0]], [[0, 0], [1, 1]]), false);
});

test('ringsEqual treats null/undefined rings as zero-length', () => {
  assert.equal(ringsEqual(null, undefined), true);
  assert.equal(ringsEqual(null, [[0, 0]]), false);
});

test('specTargets reads route waypoints', () => {
  const spec = { type: 'route', points: [{ target: 'A' }, { name: 'B' }, {}] };
  assert.deepEqual(specTargets(spec), ['A', 'B']);
});

test('specTargets reads arrow endpoints', () => {
  const spec = { type: 'arrow', target: 'A', toTarget: 'B' };
  assert.deepEqual(specTargets(spec), ['A', 'B']);
});

test('specTargets falls back to a single target for other types', () => {
  assert.deepEqual(specTargets({ type: 'pin', target: 'A' }), ['A']);
  assert.deepEqual(specTargets({ type: 'pin' }), []);
});

test('failResult derives targets from the spec when none are given', () => {
  const result = failResult({ type: 'pin', target: 'Alamo' }, 'not found');
  assert.equal(result.ok, false);
  assert.equal(result.label, 'Alamo');
  assert.deepEqual(result.failedTargets, ['Alamo']);
  assert.equal(result.error, 'not found');
});

test('failResult prefers explicit failedTargets over derived ones', () => {
  const result = failResult({ type: 'arrow', target: 'A', toTarget: 'B' }, 'err', ['B']);
  assert.deepEqual(result.failedTargets, ['B']);
});

test('normalizeType maps synonyms to canonical type buckets', () => {
  assert.equal(normalizeType('polygon'), 'area');
  assert.equal(normalizeType('path'), 'route');
  assert.equal(normalizeType('connector'), 'arrow');
  assert.equal(normalizeType('callout'), 'label');
  assert.equal(normalizeType('marker'), 'pin');
  assert.equal(normalizeType('unknown-thing'), 'highlight');
});

test('computeAlpha fades in over the first 260ms', () => {
  const anno = { bornAt: 1000, ttlMs: null, expiring: false };
  assert.equal(computeAlpha(anno, 1000), 0);
  assert.equal(computeAlpha(anno, 1260), 1);
});

test('computeAlpha fades out toward 0 past the TTL fadeStart and flips expiring', () => {
  const anno = { bornAt: 0, createdAt: 0, ttlMs: 1000, expiring: false };
  const alpha = computeAlpha(anno, 1000 + FADE_MS); // fully past fade window
  assert.equal(alpha, 0);
  assert.equal(anno.expiring, true);
});

test('pendingAnimation is true while fading in', () => {
  assert.equal(pendingAnimation({ bornAt: 1000, expiring: false, ttlMs: null }, 1100), true);
});

test('pendingAnimation is false once persistent and settled', () => {
  assert.equal(pendingAnimation({ bornAt: 0, expiring: false, ttlMs: null }, 10_000), false);
});

test('pendingAnimation is true while a TTL fade is still ahead', () => {
  const anno = { bornAt: 0, createdAt: 0, ttlMs: 5000, expiring: false };
  assert.equal(pendingAnimation(anno, 4900), true);
});

test('viewportRange returns null without both corners', () => {
  assert.equal(viewportRange(null), null);
  assert.equal(viewportRange({ low: { longitude: 0, latitude: 0 } }), null);
});

test('viewportRange caps at VIEWPORT_ASSIST_RANGE_CAP_M for a huge box', () => {
  const vp = {
    low: { longitude: -20, latitude: -20 },
    high: { longitude: 20, latitude: 20 },
  };
  assert.equal(viewportRange(vp), VIEWPORT_ASSIST_RANGE_CAP_M);
});

test('viewportRange floors at 300m for a tiny box', () => {
  const vp = {
    low: { longitude: 0, latitude: 0 },
    high: { longitude: 0.00001, latitude: 0.00001 },
  };
  assert.equal(viewportRange(vp), 300);
});

test('ringRange floors at 300m for a small ring', () => {
  const ring = [[0, 0], [0.0001, 0], [0.0001, 0.0001], [0, 0.0001]];
  assert.equal(ringRange(ring), 300);
});

test('cleanLabel trims and truncates to 80 chars', () => {
  assert.equal(cleanLabel('  Alamo  '), 'Alamo');
  assert.equal(cleanLabel(''), null);
  assert.equal(cleanLabel('x'.repeat(100)).length, 80);
});

test('round5 rounds to 5 decimal places', () => {
  assert.equal(round5(30.1234567), 30.12346);
  assert.equal(round5(NaN), null);
});

test('normalizeMode maps synonyms to car/bike/foot', () => {
  assert.equal(normalizeMode('driving'), 'car');
  assert.equal(normalizeMode('cycling'), 'bike');
  assert.equal(normalizeMode('anything-else'), 'foot');
});

test('greatCircleM is zero for identical points and positive otherwise', () => {
  const a = { lat: 30, lon: -97 };
  assert.equal(greatCircleM(a, a), 0);
  assert.ok(greatCircleM(a, { lat: 31, lon: -97 }) > 0);
});

test('formatDistance formats meters under 1km and km above', () => {
  assert.equal(formatDistance(450), '450 m');
  assert.equal(formatDistance(2500), '2.5 km');
  assert.equal(formatDistance(15000), '15 km');
  assert.equal(formatDistance(NaN), null);
});

test('composeRouteLabel appends distance/duration for a real route', () => {
  const label = composeRouteLabel('Downtown', 1200, 900, 'car', false);
  assert.match(label, /Downtown — 1\.2 km · 15 min drive/);
});

test('composeRouteLabel marks a fallback straight-line with no travel time', () => {
  const label = composeRouteLabel('Downtown', 500, null, 'foot', true);
  assert.match(label, /direct line \(no route\)/);
});

test('appendDistance appends a formatted distance to a base label', () => {
  assert.equal(appendDistance('Route', 1000), 'Route — 1.0 km');
  assert.equal(appendDistance('Route', NaN), 'Route');
});
