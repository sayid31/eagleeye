// src/data/trafficBounds.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  FETCH_GRID_PITCH_DEG,
  greatCircleKm,
  deriveFetchCenter,
  clampBoundsAroundCenter,
  snapFetchCenter,
} from './trafficBounds.js';

// Downtown Austin — matches the TomTom fixture tile neighbourhood.
const NADIR = { lat: 30.2672, lon: -97.7431 };

test('greatCircleKm sanity: Austin -> ~5 km north', () => {
  const d = greatCircleKm(NADIR.lat, NADIR.lon, NADIR.lat + 0.045, NADIR.lon);
  assert.ok(Math.abs(d - 5.0) < 0.1, `got ${d}`);
});

test('straight-down look: hit ~= nadir -> center unchanged (uses hit)', () => {
  const c = deriveFetchCenter({
    nadirLat: NADIR.lat, nadirLon: NADIR.lon,
    hitLat: NADIR.lat + 0.0001, hitLon: NADIR.lon - 0.0001,
    maxPullKm: 12,
  });
  assert.equal(c.source, 'hit');
  assert.ok(Math.abs(c.lat - (NADIR.lat + 0.0001)) < 1e-9);
  assert.ok(Math.abs(c.lon - (NADIR.lon - 0.0001)) < 1e-9);
});

test('oblique look within 12 km: uses the hit point verbatim', () => {
  const hit = { lat: NADIR.lat + 0.045, lon: NADIR.lon + 0.02 }; // ~5.3 km away
  const c = deriveFetchCenter({
    nadirLat: NADIR.lat, nadirLon: NADIR.lon,
    hitLat: hit.lat, hitLon: hit.lon,
    maxPullKm: 12,
  });
  assert.equal(c.source, 'hit');
  assert.equal(c.lat, hit.lat);
  assert.equal(c.lon, hit.lon);
});

test('horizon gaze: far hit is pulled back to 12 km along the bearing', () => {
  // Hit ~100 km due east of nadir.
  const hit = { lat: NADIR.lat, lon: NADIR.lon + 1.041 };
  assert.ok(greatCircleKm(NADIR.lat, NADIR.lon, hit.lat, hit.lon) > 90, 'precondition: far hit');
  const c = deriveFetchCenter({
    nadirLat: NADIR.lat, nadirLon: NADIR.lon,
    hitLat: hit.lat, hitLon: hit.lon,
    maxPullKm: 12,
  });
  assert.equal(c.source, 'pulled');
  const d = greatCircleKm(NADIR.lat, NADIR.lon, c.lat, c.lon);
  assert.ok(Math.abs(d - 12) < 0.05, `pulled distance ${d} km, expected ~12`);
  // Due-east bearing: latitude stays ~constant, longitude moves east but well
  // short of the hit.
  assert.ok(Math.abs(c.lat - NADIR.lat) < 0.01, `lat drifted: ${c.lat}`);
  assert.ok(c.lon > NADIR.lon && c.lon < hit.lon, `lon not between nadir and hit: ${c.lon}`);
});

test('pull cap is honored for other maxPullKm values', () => {
  const hit = { lat: NADIR.lat + 0.9, lon: NADIR.lon }; // ~100 km north
  const c = deriveFetchCenter({
    nadirLat: NADIR.lat, nadirLon: NADIR.lon,
    hitLat: hit.lat, hitLon: hit.lon,
    maxPullKm: 5,
  });
  assert.equal(c.source, 'pulled');
  const d = greatCircleKm(NADIR.lat, NADIR.lon, c.lat, c.lon);
  assert.ok(Math.abs(d - 5) < 0.05, `pulled distance ${d} km, expected ~5`);
});

test('pickEllipsoid failure (non-finite hit): falls back to the camera nadir', () => {
  for (const [hitLat, hitLon] of [[NaN, NaN], [undefined, undefined], [30.3, undefined]]) {
    const c = deriveFetchCenter({
      nadirLat: NADIR.lat, nadirLon: NADIR.lon,
      hitLat, hitLon,
      maxPullKm: 12,
    });
    assert.equal(c.source, 'nadir');
    assert.equal(c.lat, NADIR.lat);
    assert.equal(c.lon, NADIR.lon);
  }
});

test('span clamp: oversized bounds shrink to maxSpan centered on the snapped center', () => {
  const bounds = { south: 29.5, north: 30.5, west: -98.5, east: -97.5 }; // 1 degree spans
  const center = { lat: NADIR.lat, lon: NADIR.lon };
  const clamped = clampBoundsAroundCenter(bounds, center, 0.05);
  assert.ok(Math.abs((clamped.north - clamped.south) - 0.05) < 1e-12);
  assert.ok(Math.abs((clamped.east - clamped.west) - 0.05) < 1e-12);
  // The box is centered on the GRID point nearest the fetch center, not the
  // fetch center itself — that is what makes the bbox a reusable cache key.
  const snapped = snapFetchCenter(center);
  assert.ok(Math.abs((clamped.north + clamped.south) / 2 - snapped.lat) < 1e-12);
  assert.ok(Math.abs((clamped.east + clamped.west) / 2 - snapped.lon) < 1e-12);
  // And the real look-at point stays well inside the box it fetches for.
  assert.ok(center.lat > clamped.south && center.lat < clamped.north);
  assert.ok(center.lon > clamped.west && center.lon < clamped.east);
});

test('span clamp: small bounds keep their span, recentered', () => {
  const bounds = { south: 30.0, north: 30.02, west: -98.0, east: -97.97 };
  // Deliberately already on the fetch grid, so this case isolates span
  // handling from the snap (both are exact multiples of the pitch).
  const center = { lat: 30.30, lon: -97.70 };
  assert.deepEqual(snapFetchCenter(center), center, 'fixture must stay grid-aligned');
  const clamped = clampBoundsAroundCenter(bounds, center, 0.05);
  assert.ok(Math.abs((clamped.north - clamped.south) - 0.02) < 1e-12);
  assert.ok(Math.abs((clamped.east - clamped.west) - 0.03) < 1e-12);
  assert.ok(Math.abs((clamped.north + clamped.south) / 2 - 30.30) < 1e-12);
  assert.ok(Math.abs((clamped.east + clamped.west) / 2 + 97.70) < 1e-12);
});

test('span clamp is idempotent on already-clamped bounds (loadRoadsForBounds re-clamp)', () => {
  const center = { lat: NADIR.lat, lon: NADIR.lon };
  const once = clampBoundsAroundCenter({ south: 29.5, north: 30.5, west: -98.5, east: -97.5 }, center, 0.05);
  const midpoint = { lat: (once.south + once.north) / 2, lon: (once.west + once.east) / 2 };
  const twice = clampBoundsAroundCenter(once, midpoint, 0.05);
  assert.deepEqual(twice, once);
});

// ---------------------------------------------------------------------------
// Fetch-center grid snap. The bbox IS the Overpass cache key, so these tests
// are about key reuse, not arithmetic for its own sake.
// ---------------------------------------------------------------------------

const VIEW = { south: 30.2, north: 30.3, west: -97.8, east: -97.7 };
const bboxKey = (b) => `${b.south.toFixed(4)},${b.west.toFixed(4)},${b.north.toFixed(4)},${b.east.toFixed(4)}`;

test('snap lands on the grid and is idempotent', () => {
  const snapped = snapFetchCenter({ lat: 30.26715, lon: -97.74312 });
  for (const value of [snapped.lat, snapped.lon]) {
    const steps = value / FETCH_GRID_PITCH_DEG;
    assert.ok(Math.abs(steps - Math.round(steps)) < 1e-9, `${value} is off-grid`);
  }
  assert.deepEqual(snapFetchCenter(snapped), snapped, 're-snapping must not drift');
});

test('snap never moves the center more than half a pitch per axis', () => {
  // Half the pitch is the worst case, and it bounds how far the fetch box can
  // slide off the camera look-at point.
  const half = FETCH_GRID_PITCH_DEG / 2 + 1e-9;
  for (let i = 0; i < 400; i++) {
    const center = { lat: -60 + i * 0.3001, lon: -180 + i * 0.7003 };
    const snapped = snapFetchCenter(center);
    assert.ok(Math.abs(snapped.lat - center.lat) <= half, `lat moved too far at ${center.lat}`);
    assert.ok(Math.abs(snapped.lon - center.lon) <= half, `lon moved too far at ${center.lon}`);
  }
});

test('pans within one grid cell collapse onto a single cache key', () => {
  // The real win: every small pan used to produce a distinct bbox — and
  // therefore a distinct Overpass cache key. Within a cell there is now one.
  const keys = new Set();
  for (let i = 0; i < 12; i++) {
    const center = { lat: 30.25 + i * 0.0004, lon: -97.75 + i * 0.0004 };
    keys.add(bboxKey(clampBoundsAroundCenter(VIEW, center)));
  }
  assert.equal(keys.size, 1, 'a sub-cell pan must reuse the cached tile');
});

test('a drifting pan costs one key per cell crossed, not one per camera move', () => {
  // Crossing a cell boundary SHOULD produce a new key — that is the grid
  // working, not a miss. What matters is that the count tracks cells crossed
  // rather than the number of camera updates.
  const keys = new Set();
  const steps = 24;
  const stepDeg = 0.0004; // ~44 m per update
  for (let i = 0; i < steps; i++) {
    const center = { lat: 30.2672 + i * stepDeg, lon: -97.7431 + i * stepDeg };
    keys.add(bboxKey(clampBoundsAroundCenter(VIEW, center)));
  }
  const travelDeg = (steps - 1) * stepDeg;
  const maxCells = Math.ceil(travelDeg / FETCH_GRID_PITCH_DEG) + 1;
  assert.ok(keys.size <= maxCells, `${keys.size} keys for ${travelDeg.toFixed(4)}deg of travel`);
  assert.ok(keys.size < steps / 3, `expected far fewer than ${steps} keys, got ${keys.size}`);
});

test('a real move still produces a different cache key', () => {
  // The snap must not be so coarse that genuinely different views collide —
  // otherwise it would serve roads for somewhere the user is not looking.
  const near = clampBoundsAroundCenter(VIEW, { lat: 30.2672, lon: -97.7431 });
  const far = clampBoundsAroundCenter(VIEW, { lat: 30.2672 + FETCH_GRID_PITCH_DEG * 2, lon: -97.7431 });
  assert.notEqual(bboxKey(near), bboxKey(far));
});

test('the snapped box still contains the point the camera is looking at', () => {
  for (let i = 0; i < 50; i++) {
    const center = { lat: 30.2672 + i * 0.0017, lon: -97.7431 - i * 0.0023 };
    const box = clampBoundsAroundCenter(VIEW, center, 0.05);
    assert.ok(
      center.lat > box.south && center.lat < box.north
      && center.lon > box.west && center.lon < box.east,
      `look-at point fell outside its own fetch box at ${center.lat},${center.lon}`,
    );
  }
});

test('snap keys are stable strings, not float noise', () => {
  // toFixed(4) on a raw pitch multiple can differ in the last digit between
  // equivalent centers; the quantizer rounds so equal cells give equal keys.
  const a = snapFetchCenter({ lat: 0.0125 * 2399.6, lon: -0.0125 * 1200.4 });
  const b = snapFetchCenter({ lat: 0.0125 * 2400.4, lon: -0.0125 * 1199.6 });
  assert.deepEqual(a, b);
  assert.equal(String(a.lat).length <= 12, true, `unexpected float noise: ${a.lat}`);
});

test('degenerate centers and pitches pass through instead of producing NaN bounds', () => {
  assert.equal(snapFetchCenter(null), null);
  assert.deepEqual(snapFetchCenter({ lat: NaN, lon: 5 }), { lat: NaN, lon: 5 });
  assert.deepEqual(snapFetchCenter({ lat: 30.26715, lon: -97.74312 }, 0), { lat: 30.26715, lon: -97.74312 });
  assert.deepEqual(snapFetchCenter({ lat: 30.26715, lon: -97.74312 }, -1), { lat: 30.26715, lon: -97.74312 });
});

test('the grid is global and seam-free across the equator and antimeridian', () => {
  for (const center of [
    { lat: 0, lon: 0 },
    { lat: -0.004, lon: -0.004 },
    { lat: 0.004, lon: 179.998 },
    { lat: -33.8688, lon: 151.2093 },
  ]) {
    const snapped = snapFetchCenter(center);
    assert.ok(Number.isFinite(snapped.lat) && Number.isFinite(snapped.lon));
    assert.ok(Math.abs(snapped.lat - center.lat) <= FETCH_GRID_PITCH_DEG / 2 + 1e-9);
    assert.ok(Math.abs(snapped.lon - center.lon) <= FETCH_GRID_PITCH_DEG / 2 + 1e-9);
  }
});
