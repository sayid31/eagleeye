import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as Cesium from 'cesium';
import { materializeWaypoints, reheightRoad } from './trafficHeights.js';
import {
  SURFACE_DOT_HEIGHT_OFFSET,
  SURFACE_REFINE_MAX_WAIT_MS,
  cancelSurfaceRefine,
  refineRoadToSurface,
  releaseSurfaceHeights,
  roadsNearestFirst,
  scheduleSurfaceRefine,
} from './trafficSurfaceHeights.js';
import { S } from './trafficState.js';

const heightOf = (c) => Cesium.Cartographic.fromCartesian(c).height;
// test-only: a short Jakarta street, three waypoints.
const COORDS = [[106.845, -6.209], [106.846, -6.209], [106.847, -6.210]];
/** A road heighted the way parseRoads does it: cell floor + 3 m. */
const cellRoad = (floor = 20, coords = COORDS) => ({ coords, ...materializeWaypoints(coords, () => floor, null, null, 3) });

test('waypoints move onto the exact surface reading plus the surface offset, in place', () => {
  const road = cellRoad(20);
  const sameArray = road.waypoints;
  const sameFirst = road.waypoints[0];
  const distArray = road.segmentDist;
  const moved = refineRoadToSurface(road, (lat, lng) => (lng === 106.847 ? undefined : 12), SURFACE_DOT_HEIGHT_OFFSET);
  assert.equal(moved, 2);
  assert.deepEqual(road.waypoints.map((w) => Math.round(heightOf(w))), [13, 13, 23], 'no reading keeps the cell height');
  assert.equal(road.waypoints, sameArray);
  assert.equal(road.waypoints[0], sameFirst, 'Cartesian3 mutated, not replaced (dots share it)');
  assert.equal(road.segmentDist, distArray, 'segment distances refreshed in place');
  assert.deepEqual([0, 1, 2].map((i) => Boolean(road.surfaceRefined[i])), [true, true, false]);
});

test('a dot on the surface reading floats 1 m, not the 3 m kept for cell estimates', () => {
  assert.equal(SURFACE_DOT_HEIGHT_OFFSET, 1);
});

test('re-running on unchanged heights writes nothing', () => {
  const road = cellRoad(20);
  refineRoadToSurface(road, () => 12, SURFACE_DOT_HEIGHT_OFFSET);
  assert.equal(refineRoadToSurface(road, () => 12.1, SURFACE_DOT_HEIGHT_OFFSET), 0);
});

test('a late cell floor never overwrites a surface reading', () => {
  const road = cellRoad(20);
  refineRoadToSurface(road, (lat, lng) => (lng === 106.845 ? 12 : undefined), SURFACE_DOT_HEIGHT_OFFSET);
  const moved = reheightRoad(road, () => 30, 3);
  assert.equal(moved, 2, 'only the waypoints without a surface reading take the cell floor');
  assert.deepEqual(road.waypoints.map((w) => Math.round(heightOf(w))), [13, 33, 33]);
});

test('roads are corrected nearest to the camera first', () => {
  const near = cellRoad(20);
  const far = cellRoad(20, [[106.9, -6.3], [106.901, -6.3]]);
  const camera = Cesium.Cartesian3.fromDegrees(106.846, -6.209, 600);
  assert.deepEqual(roadsNearestFirst([far, near], camera), [near, far]);
});

/** Fake viewer whose postRender listeners run when `frame()` is called. */
function fakeViewer({ show = true, tilesLoaded = true, surface = 12 } = {}) {
  const listeners = new Set();
  const globe = { show, tilesLoaded, getHeight: () => surface };
  return {
    globe,
    frame: () => [...listeners].forEach((listener) => listener()),
    listenerCount: () => listeners.size,
    viewer: {
      camera: { positionWC: Cesium.Cartesian3.fromDegrees(106.846, -6.209, 600) },
      scene: {
        globe,
        requestRender() {},
        postRender: { addEventListener(listener) { listeners.add(listener); return () => listeners.delete(listener); } },
      },
    },
  };
}

function withTrafficState(viewer, run) {
  const saved = { viewer: S._viewer, enabled: S._enabled, dots: S._dots };
  S._viewer = viewer;
  S._enabled = true;
  S._dots = [];
  try {
    run();
  } finally {
    cancelSurfaceRefine();
    S._viewer = saved.viewer;
    S._enabled = saved.enabled;
    S._dots = saved.dots;
  }
}

test('the pass waits for the globe tiles, then corrects every road and detaches', () => {
  const fake = fakeViewer({ tilesLoaded: false });
  const road = cellRoad(20);
  withTrafficState(fake.viewer, () => {
    assert.equal(scheduleSurfaceRefine([road], { now: () => 0 }), true);
    fake.frame();
    assert.equal(Math.round(heightOf(road.waypoints[0])), 23, 'tiles still loading: heights untouched');
    fake.globe.tilesLoaded = true;
    fake.frame();
    assert.ok(road.waypoints.every((w) => Math.round(heightOf(w)) === 13));
    assert.equal(fake.listenerCount(), 0, 'a finished pass removes its listener');
  });
});

test('a stuck tile load does not hold the pass back forever', () => {
  const fake = fakeViewer({ tilesLoaded: false });
  const road = cellRoad(20);
  let clock = 0;
  withTrafficState(fake.viewer, () => {
    scheduleSurfaceRefine([road], { now: () => clock });
    clock = SURFACE_REFINE_MAX_WAIT_MS + 1;
    fake.frame();
    assert.equal(Math.round(heightOf(road.waypoints[0])), 13);
  });
});

test('a switch to photoreal hands cached roads back to the cell floor', () => {
  const road = cellRoad(20);
  const untouched = cellRoad(20);
  refineRoadToSurface(road, () => 12, SURFACE_DOT_HEIGHT_OFFSET);
  assert.equal(releaseSurfaceHeights([road, untouched], () => 40), 1, 'only surface-heighted roads are handed back');
  assert.equal(road.surfaceRefined, undefined);
  assert.ok(road.waypoints.every((w) => Math.round(heightOf(w)) === 43));
  assert.ok(untouched.waypoints.every((w) => Math.round(heightOf(w)) === 23));
});

test('photoreal (hidden globe) keeps the cell floor; cancelling stops a pending pass', () => {
  const hidden = fakeViewer({ show: false });
  withTrafficState(hidden.viewer, () => {
    assert.equal(scheduleSurfaceRefine([cellRoad(20)]), false);
  });
  const fake = fakeViewer({ tilesLoaded: false });
  const road = cellRoad(20);
  withTrafficState(fake.viewer, () => {
    scheduleSurfaceRefine([road], { now: () => 0 });
    cancelSurfaceRefine();
    fake.globe.tilesLoaded = true;
    fake.frame();
    assert.equal(Math.round(heightOf(road.waypoints[0])), 23);
    assert.equal(fake.listenerCount(), 0);
  });
});

test('every road render starts the pass and every dot clear cancels it', async () => {
  const { readFileSync } = await import('node:fs');
  const render = readFileSync(new URL('./trafficRender.js', import.meta.url), 'utf8');
  const dots = readFileSync(new URL('./trafficDots.js', import.meta.url), 'utf8');
  assert.match(render, /scheduleSurfaceRefine\(filteredRoads\);/);
  assert.match(dots, /export function clearDots\(\) \{\n  cancelSurfaceRefine\(\);/);
});
