import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as Cesium from 'cesium';
import { batchFallbackHeight, materializeWaypoints, reheightRoad, repositionDotsOnRoads } from './trafficHeights.js';
import { S } from './trafficState.js';

const heightOf = (c) => Cesium.Cartographic.fromCartesian(c).height;
const COORDS = [[110.37, -7.80], [110.38, -7.80], [110.39, -7.81]];

test('batch fallback is the median of the finite heights, null when none', () => {
  assert.equal(batchFallbackHeight([120, null, 100, 140]), 120);
  assert.equal(batchFallbackHeight([100, 110]), 105);
  assert.equal(batchFallbackHeight([null, undefined, NaN]), null);
});

test('materialize: own cell first, then road sample, then batch, then 0; cold flags any fallback', () => {
  const warm = (lat, lng) => (lng === 110.37 ? 130 : null);
  const a = materializeWaypoints(COORDS, warm, null, 125, 3);
  assert.deepEqual(a.waypoints.map((w) => Math.round(heightOf(w))), [133, 128, 128]);
  assert.equal(a.cold, true);
  assert.equal(a.segmentDist.length, 2);
  const b = materializeWaypoints(COORDS, () => null, 90, 125, 3);
  assert.ok(b.waypoints.every((w) => Math.round(heightOf(w)) === 93), 'road sample beats batch');
  const c = materializeWaypoints(COORDS, () => null, null, null, 3);
  assert.ok(c.waypoints.every((w) => Math.round(heightOf(w)) === 3), 'nothing known: ellipsoid');
  assert.equal(materializeWaypoints(COORDS, () => 50, null, null, 3).cold, false);
});

test('re-height moves only resolved waypoints, in place, and refreshes segment distances in place', () => {
  const road = { coords: COORDS, ...materializeWaypoints(COORDS, () => null, null, null, 3) };
  const sameArray = road.waypoints;
  const sameFirst = road.waypoints[0];
  const distArray = road.segmentDist;
  const moved = reheightRoad(road, (lat, lng) => (lng === 110.39 ? null : 140), 3);
  assert.equal(moved, 2);
  assert.equal(road.waypoints, sameArray);
  assert.equal(road.waypoints[0], sameFirst, 'Cartesian3 mutated, not replaced (dots share it)');
  assert.deepEqual(road.waypoints.map((w) => Math.round(heightOf(w))), [143, 143, 3]);
  assert.equal(road.segmentDist, distArray);
  assert.equal(reheightRoad(road, () => 140, 3), 1, 'already-correct waypoints are left alone');
});

test('stopped dots on a re-heighted road are moved; dots on other roads are not', () => {
  const road = { coords: COORDS, ...materializeWaypoints(COORDS, () => 100, null, null, 3) };
  const other = { coords: COORDS, ...materializeWaypoints(COORDS, () => 100, null, null, 3) };
  const point = () => ({ position: null });
  const saved = S._dots;
  S._dots = [
    { road, waypoints: road.waypoints, segIdx: 0, t: 0, point: point() },
    { road: other, waypoints: other.waypoints, segIdx: 0, t: 0, point: point() },
  ];
  try {
    assert.equal(repositionDotsOnRoads(new Set([road])), 1);
    assert.equal(Math.round(heightOf(S._dots[0].point.position)), 103);
    assert.equal(S._dots[1].point.position, null);
  } finally {
    S._dots = saved;
  }
});
