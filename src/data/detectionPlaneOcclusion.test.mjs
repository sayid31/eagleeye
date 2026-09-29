// src/data/detectionPlaneOcclusion.test.mjs — pure ray-vs-finite-rectangle
// occlusion math backing the Universal Detection Overlay's CCTV-plane check
// (see detectionPlaneOcclusion.js's header for the full rationale).
//
// Locks:
//   - a target directly behind the plane and within its rectangular bounds
//     is occluded;
//   - a target behind the plane's infinite extension but OUTSIDE its finite
//     halfWidth/halfHeight bounds is NOT occluded (it's a rectangle, not an
//     infinite plane);
//   - a target in front of the plane (nearer than the plane along the ray)
//     is never occluded, regardless of lateral position;
//   - a grazing ray (|dir·normal| below GRAZING_DOT_MIN) is never treated as
//     occluded, even if the naive intersection math would place a hit inside
//     bounds — avoids numerically unstable false positives;
//   - isOccludedByAnyPlane short-circuits correctly across multiple planes,
//     and an empty planes array never occludes anything.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as Cesium from 'cesium';
import { isPointOccludedByPlane, isOccludedByAnyPlane } from './detectionPlaneOcclusion.js';

const c3 = (x, y, z) => new Cesium.Cartesian3(x, y, z);

// A simple axis-aligned plane: centered at (0, 10, 0), facing back toward
// the observer along -Y (normal = (0, -1, 0)), 4m wide (X) x 2m tall (Z).
const PLANE = {
  center: c3(0, 10, 0),
  normal: c3(0, -1, 0),
  right: c3(1, 0, 0),
  up: c3(0, 0, 1),
  halfWidth: 2,
  halfHeight: 1,
};

const OBSERVER = c3(0, 0, 0);

test('target directly behind the plane, within bounds, is occluded', () => {
  const target = c3(0, 20, 0); // straight through the plane center
  assert.equal(isPointOccludedByPlane(OBSERVER, target, PLANE), true);
});

test('target behind the plane but laterally outside halfWidth is not occluded', () => {
  // Ray to (5, 20, 0) crosses the plane's Y=10 slice at X=2.5 — outside halfWidth=2.
  const target = c3(5, 20, 0);
  assert.equal(isPointOccludedByPlane(OBSERVER, target, PLANE), false);
});

test('target behind the plane but vertically outside halfHeight is not occluded', () => {
  // Ray to (0, 20, 3) crosses Y=10 at Z=1.5 — outside halfHeight=1.
  const target = c3(0, 20, 3);
  assert.equal(isPointOccludedByPlane(OBSERVER, target, PLANE), false);
});

test('target in front of the plane (nearer than the plane) is never occluded', () => {
  const target = c3(0, 5, 0); // halfway to the plane, never reaches it
  assert.equal(isPointOccludedByPlane(OBSERVER, target, PLANE), false);
});

test('target exactly at the plane distance is not occluded (t >= targetDistance guard)', () => {
  const target = c3(0, 10, 0); // the object IS the plane's position, not behind it
  assert.equal(isPointOccludedByPlane(OBSERVER, target, PLANE), false);
});

test('plane behind the observer (t <= 0) never occludes a target in front', () => {
  const behindObserver = { ...PLANE, center: c3(0, -10, 0) };
  const target = c3(0, 20, 0);
  assert.equal(isPointOccludedByPlane(OBSERVER, target, behindObserver), false);
});

test('grazing ray (nearly parallel to the plane) is never treated as occluded', () => {
  // Ray nearly parallel to the plane (along X, barely dipping in Y) — even
  // though a naive unguarded solve might place a hit near the plane, the
  // near-zero |dir·normal| must short-circuit to "not occluded".
  const grazingTarget = c3(1000, 10.001, 0);
  assert.equal(isPointOccludedByPlane(OBSERVER, grazingTarget, PLANE), false);
});

test('coincident observer/target (zero-length ray) is not occluded', () => {
  assert.equal(isPointOccludedByPlane(OBSERVER, c3(0, 0, 0), PLANE), false);
});

test('isOccludedByAnyPlane: empty planes array never occludes', () => {
  assert.equal(isOccludedByAnyPlane(OBSERVER, c3(0, 20, 0), []), false);
});

test('isOccludedByAnyPlane: short-circuits true on the first occluding plane', () => {
  const missPlane = { ...PLANE, center: c3(100, 100, 100) }; // nowhere near the ray
  const hitPlane = PLANE;
  const target = c3(0, 20, 0);
  assert.equal(isOccludedByAnyPlane(OBSERVER, target, [missPlane, hitPlane]), true);
});

test('isOccludedByAnyPlane: false when no plane in the list occludes', () => {
  const missPlaneA = { ...PLANE, center: c3(100, 100, 100) };
  const missPlaneB = { ...PLANE, center: c3(-100, -100, -100) };
  const target = c3(0, 20, 0);
  assert.equal(isOccludedByAnyPlane(OBSERVER, target, [missPlaneA, missPlaneB]), false);
});
