// Pure geometry/matching helpers extracted from annotationResolver.js.
// Run with: npm test   (node --test)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  approximateAreaM2,
  approximateDistanceM,
  bufferCorridor,
  buildRingComponents,
  closeRing,
  douglasPeucker,
  elementCoordinates,
  endpointGapM,
  largestByArea,
  normalizedWords,
  pointInPolygon,
  ringCentroid,
  ringSpanM,
  simplifyRing,
  stitchLine,
  stitchRing,
  wordOverlap,
} from './annotationRingGeometry.js';

test('stitchLine chains segments sharing endpoints into one polyline', () => {
  const a = [[0, 0], [1, 0]];
  const b = [[1, 0], [2, 0]];
  const line = stitchLine([a, b]);
  assert.deepEqual(line, [[0, 0], [1, 0], [2, 0]]);
});

test('stitchLine reverses a segment that connects tail-to-tail', () => {
  const a = [[0, 0], [1, 0]];
  const b = [[2, 0], [1, 0]]; // reversed order, shares [1,0] at its tail
  const line = stitchLine([a, b]);
  assert.deepEqual(line, [[0, 0], [1, 0], [2, 0]]);
});

test('bufferCorridor produces a closed ring around a centerline', () => {
  const line = [[-97.74, 30.27], [-97.73, 30.27]];
  const ring = bufferCorridor(line, 10);
  assert.ok(ring.length >= 4);
  // First and last vertex close the ring.
  assert.deepEqual(ring[0], ring[ring.length - 1]);
});

test('simplifyRing leaves small rings untouched', () => {
  const ring = [[0, 0], [1, 0], [1, 1], [0, 1]];
  assert.equal(simplifyRing(ring, 10), ring);
});

test('douglasPeucker keeps endpoints and drops near-collinear points', () => {
  const points = [[0, 0], [1, 0.0001], [2, 0], [3, 5]];
  const out = douglasPeucker(points, 0.01);
  assert.deepEqual(out[0], [0, 0]);
  assert.deepEqual(out[out.length - 1], [3, 5]);
  assert.ok(out.length <= points.length);
});

test('elementCoordinates reads inline way geometry directly', () => {
  const el = { geometry: [{ lat: 1, lon: 2 }, { lat: 3, lon: 4 }] };
  assert.deepEqual(elementCoordinates(el), el.geometry);
});

test('elementCoordinates filters non-finite points from inline geometry', () => {
  const el = { geometry: [{ lat: 1, lon: 2 }, { lat: NaN, lon: 4 }, { lat: 5, lon: 6 }] };
  assert.deepEqual(elementCoordinates(el), [{ lat: 1, lon: 2 }, { lat: 5, lon: 6 }]);
});

test('elementCoordinates stitches relation outer-way members into one ring', () => {
  // Small-degree square (~110m per side) so the stitched chain's endpoint gap
  // falls within stitchRing's seam-bridging tolerance and isn't rejected as
  // an incomplete relation.
  const el = {
    members: [
      { role: 'outer', geometry: [{ lat: 0, lon: 0 }, { lat: 0, lon: 0.001 }, { lat: 0.001, lon: 0.001 }] },
      { role: 'outer', geometry: [{ lat: 0.001, lon: 0.001 }, { lat: 0.001, lon: 0 }, { lat: 0, lon: 0 }] },
    ],
  };
  const coords = elementCoordinates(el);
  assert.ok(coords.length >= 3);
});

test('stitchRing returns [] for no ways', () => {
  assert.deepEqual(stitchRing([]), []);
});

test('stitchRing closes a two-way square outline', () => {
  const ways = [
    [{ lat: 0, lon: 0 }, { lat: 0, lon: 1 }, { lat: 1, lon: 1 }],
    [{ lat: 1, lon: 1 }, { lat: 1, lon: 0 }, { lat: 0, lon: 0 }],
  ];
  const ring = stitchRing(ways);
  assert.ok(ring.length >= 4);
});

test('largestByArea picks the component with the greater projected area', () => {
  const small = [{ lat: 0, lon: 0 }, { lat: 0, lon: 0.001 }, { lat: 0.001, lon: 0.001 }];
  const big = [{ lat: 0, lon: 0 }, { lat: 0, lon: 1 }, { lat: 1, lon: 1 }, { lat: 1, lon: 0 }];
  assert.equal(largestByArea([small, big]), big);
});

test('ringSpanM measures the bounding-box diagonal in metres', () => {
  const chain = [{ lat: 0, lon: 0 }, { lat: 0.01, lon: 0.01 }];
  const span = ringSpanM(chain);
  assert.ok(span > 1000 && span < 2000); // ~0.01deg ~ 1.1km per axis
});

test('buildRingComponents chains matching endpoints into one component', () => {
  const ways = [
    [{ lat: 0, lon: 0 }, { lat: 0, lon: 1 }],
    [{ lat: 0, lon: 1 }, { lat: 1, lon: 1 }],
  ];
  const components = buildRingComponents(ways);
  assert.equal(components.length, 1);
  assert.equal(components[0].length, 3);
});

test('buildRingComponents keeps disjoint ways as separate components', () => {
  const ways = [
    [{ lat: 0, lon: 0 }, { lat: 0, lon: 1 }],
    [{ lat: 10, lon: 10 }, { lat: 11, lon: 11 }],
  ];
  assert.equal(buildRingComponents(ways).length, 2);
});

test('endpointGapM is zero for an already-closed chain', () => {
  const chain = [{ lat: 0, lon: 0 }, { lat: 1, lon: 1 }, { lat: 0, lon: 0 }];
  assert.equal(endpointGapM(chain), 0);
});

test('endpointGapM is Infinity for a chain with fewer than 2 points', () => {
  assert.equal(endpointGapM([{ lat: 0, lon: 0 }]), Infinity);
});

test('closeRing appends the start point when the ring is open', () => {
  const ring = [[0, 0], [1, 0], [1, 1]];
  assert.deepEqual(closeRing(ring), [[0, 0], [1, 0], [1, 1], [0, 0]]);
});

test('closeRing is a no-op when already closed', () => {
  const ring = [[0, 0], [1, 0], [1, 1], [0, 0]];
  assert.deepEqual(closeRing(ring), ring);
});

test('ringCentroid averages vertex coordinates', () => {
  // Ring entries are [lon, lat] pairs.
  const ring = [[0, 0], [2, 0], [2, 2], [0, 2]];
  const c = ringCentroid(ring);
  assert.equal(c.lat, 1);
  assert.equal(c.lon, 1);
});

test('ringCentroid returns null for a degenerate ring', () => {
  assert.equal(ringCentroid([[0, 0], [1, 1]]), null);
});

test('approximateAreaM2 is zero for fewer than 3 coordinates', () => {
  assert.equal(approximateAreaM2([{ lat: 0, lon: 0 }, { lat: 1, lon: 1 }]), 0);
});

test('approximateAreaM2 computes a positive area for a real polygon', () => {
  const coords = [
    { lat: 30.27, lon: -97.74 },
    { lat: 30.27, lon: -97.739 },
    { lat: 30.271, lon: -97.739 },
    { lat: 30.271, lon: -97.74 },
  ];
  assert.ok(approximateAreaM2(coords) > 0);
});

test('approximateDistanceM is zero for identical points', () => {
  assert.equal(approximateDistanceM(30, -97, 30, -97), 0);
});

test('pointInPolygon detects containment via ray casting', () => {
  const square = [
    { lat: 0, lon: 0 }, { lat: 0, lon: 2 }, { lat: 2, lon: 2 }, { lat: 2, lon: 0 },
  ];
  assert.equal(pointInPolygon(1, 1, square), true);
  assert.equal(pointInPolygon(5, 5, square), false);
});

test('normalizedWords lowercases, strips punctuation, and drops short tokens', () => {
  const words = normalizedWords('The Alamo, TX!');
  assert.ok(words.has('the'));
  assert.ok(words.has('alamo'));
  assert.ok(!words.has('tx')); // length <= 2 filtered out
});

test('wordOverlap counts words present in both sets', () => {
  const left = new Set(['texas', 'capitol', 'grounds']);
  const right = new Set(['texas', 'capitol']);
  assert.equal(wordOverlap(left, right), 2);
});
