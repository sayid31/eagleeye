// src/data/traffic.roadHeight.test.mjs — per-waypoint road height (2026-09).
//
// The original parseRoads() sampled terrain height ONCE at each road's first
// vertex and applied that single height to every waypoint on the road. Along
// any road that crosses varying terrain/building height, later waypoints
// rendered at the wrong elevation — dots drifting into buildings (owner
// screenshot: Denpasar street-level, dots floating over rooftops). This now
// warms the shared ground-floor cache (groundFloor.js/meshFloorSampler.js,
// the same infra flights.js already relies on) for every waypoint up front
// and reads each waypoint's own cell.
//
// Split from traffic.test.mjs (which is scoped to feed-status/presentation
// logic) to keep both files under the 400-line test budget (Rule 8).
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import * as Cesium from 'cesium';
import { parseRoads, _setViewerForTest, DOT_HEIGHT_OFFSET, MAX_WAYPOINTS_PER_ROAD } from './traffic.js';
import {
  cachedGroundFloor, setMeshFloorPreferred, _clearMeshFloorCellsForTest,
  reportMeshFloorCell,
} from './groundFloor.js';

/** Builds a minimal Overpass `way` element with an inline geometry array. */
function way({ coords, tags = {} } = {}) {
  return {
    type: 'way',
    tags,
    geometry: coords.map(([lon, lat]) => ({ lon, lat })),
  };
}

/** Ellipsoidal height Cartesian3.fromDegrees would have used to reach `h`. */
function heightOf(cartesian) {
  return Cesium.Cartographic.fromCartesian(cartesian, Cesium.Ellipsoid.WGS84).height;
}

beforeEach(() => {
  _clearMeshFloorCellsForTest();
  setMeshFloorPreferred(true);
  _setViewerForTest(null);
});

test('a two-waypoint road reads each waypoint from its OWN cell, not the first vertex', async () => {
  // Cells ~0.01deg apart (~1.1 km) so coarseFloorCoord (3-decimal grid) keeps
  // them distinct.
  const a = [-97.7431, 30.2672];
  const b = [-97.7331, 30.2772];
  reportMeshFloorCell(a[1], a[0], 100);
  reportMeshFloorCell(b[1], b[0], 250); // a building/rise the old code would have missed

  const roads = await parseRoads({ elements: [way({ coords: [a, b] })] });
  assert.equal(roads.length, 1);
  const [wpA, wpB] = roads[0].waypoints;
  assert.ok(Math.abs(heightOf(wpA) - (100 + DOT_HEIGHT_OFFSET)) < 0.05,
    `first waypoint should sit on its own 100m cell, got ${heightOf(wpA)}`);
  assert.ok(Math.abs(heightOf(wpB) - (250 + DOT_HEIGHT_OFFSET)) < 0.05,
    `second waypoint should sit on ITS 250m cell, not the first vertex's, got ${heightOf(wpB)}`);
});

test('a cold cache (nothing warmed, no viewer) falls back to today\'s baseHeight=0 behavior', async () => {
  const coords = [[-97.61, 30.11], [-97.60, 30.12], [-97.59, 30.13]];
  const roads = await parseRoads({ elements: [way({ coords })] });
  assert.equal(roads.length, 1);
  for (const wp of roads[0].waypoints) {
    assert.ok(Math.abs(heightOf(wp) - DOT_HEIGHT_OFFSET) < 0.05,
      'no viewer + no warm cell: height stays at the original baseHeight(0) + offset');
  }
});

test('a waypoint whose cell never resolves falls back to the road\'s baseHeight, not 0', async () => {
  const sampled = [-97.50, 30.20];
  const unresolved = [-97.51, 30.21];
  reportMeshFloorCell(sampled[1], sampled[0], 42); // only the first vertex's cell is warm
  const viewer = {
    scene: {
      sampleHeightSupported: true,
      sampleHeight: () => 42, // mirrors the mesh cell above — the road's baseHeight
    },
    camera: { positionCartographic: { latitude: 0, longitude: 0 } },
  };
  _setViewerForTest(viewer);
  try {
    const roads = await parseRoads({ elements: [way({ coords: [sampled, unresolved] })] });
    const [wpSampled, wpUnresolved] = roads[0].waypoints;
    assert.ok(Math.abs(heightOf(wpSampled) - (42 + DOT_HEIGHT_OFFSET)) < 0.05);
    assert.ok(Math.abs(heightOf(wpUnresolved) - (42 + DOT_HEIGHT_OFFSET)) < 0.05,
      'the unresolved cell degrades to baseHeight (42), never a bare 0');
  } finally {
    _setViewerForTest(null);
  }
});

test('MAX_WAYPOINTS_PER_ROAD sub-sampling and oneway/type parsing are unaffected by the restructure', async () => {
  const long = Array.from({ length: 200 }, (_, i) => [-97 + i * 0.001, 30 + i * 0.001]);
  const roads = await parseRoads({
    elements: [way({
      coords: long,
      tags: { highway: 'primary', oneway: 'yes' },
    })],
  });
  assert.equal(roads.length, 1);
  assert.ok(roads[0].coords.length <= MAX_WAYPOINTS_PER_ROAD + 1,
    'sub-sampling still caps the road at ~MAX_WAYPOINTS_PER_ROAD vertices (+1 for the preserved endpoint)');
  assert.equal(roads[0].type, 'primary');
  assert.equal(roads[0].oneway, 1);
  // Endpoint preservation: the original last coordinate must survive simplification.
  const lastCoord = roads[0].coords[roads[0].coords.length - 1];
  assert.deepEqual(lastCoord, long[long.length - 1]);
});

test('a way with fewer than 2 geometry points, or a non-way element, is skipped', async () => {
  const roads = await parseRoads({
    elements: [
      { type: 'way', geometry: [{ lon: 0, lat: 0 }] }, // too short
      { type: 'node', geometry: [{ lon: 0, lat: 0 }, { lon: 1, lat: 1 }] }, // wrong type
      way({ coords: [[0, 0], [1, 1]] }), // valid
    ],
  });
  assert.equal(roads.length, 1);
});

test('empty/missing overpass data returns an empty array without warming anything', async () => {
  assert.deepEqual(await parseRoads(null), []);
  assert.deepEqual(await parseRoads({}), []);
  assert.deepEqual(await parseRoads({ elements: [] }), []);
});
