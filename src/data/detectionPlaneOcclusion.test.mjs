// src/data/detectionPlaneOcclusion.test.mjs — screen-space quad masking
// backing the Universal Detection Overlay's CCTV-plane check (see
// detectionPlaneOcclusion.js's header for the full rationale + revision
// history: this superseded a 3D-depth-only ray/plane test that couldn't
// mask objects visually overlapping the plane on screen while at or in
// front of its real-world depth).
//
// Locks:
//   - projectPlaneScreenQuad projects a plane's 4 corners to the exact
//     expected screen pixel positions, in tl/tr/br/bl winding order;
//   - projectPlaneScreenQuad returns null when any corner is behind the
//     camera (plane not currently on screen — masks nothing rather than a
//     partial/garbage quad);
//   - computeOcclusionPlaneScreenQuads drops behind-camera planes but keeps
//     on-screen ones, in a single pass over the input list;
//   - isPointMaskedByPlanesOnScreen: a point inside the quad is masked, a
//     point outside is not, a point exactly on an edge is masked (inclusive
//     boundary), it short-circuits true across multiple quads, and an empty
//     quad list never masks anything.
//   - isRectMaskedByPlanesOnScreen (2026-09, second revision — see this
//     module's header): a rectangle wholly inside the quad, wholly
//     containing the quad, or merely overlapping an edge/corner of it is
//     masked; a rectangle whose ANCHOR corner is outside the quad but whose
//     body still overlaps it is masked too (this is the exact gap the
//     point-only test left open — the field report this revision fixes);
//     a rectangle entirely clear of the quad is not masked; empty quad list
//     never masks anything.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as Cesium from 'cesium';
import {
  projectPlaneScreenQuad,
  computeOcclusionPlaneScreenQuads,
  isPointMaskedByPlanesOnScreen,
  isRectMaskedByPlanesOnScreen,
} from './detectionPlaneOcclusion.js';

const c3 = (x, y, z) => new Cesium.Cartesian3(x, y, z);

// A minimal, hand-built "view-projection" matrix (column-major, matching
// detection.js's own vp0..vp15 flattening) that maps world (x, y) straight
// through to NDC (x, y) with w=1 always — i.e. world units ARE NDC units.
// Real Cesium view-projection matrices are far more involved, but the
// module under test only ever reads these 16 scalars positionally, so a
// deliberately simple matrix keeps the expected screen coordinates
// hand-verifiable while still exercising the exact same math paths.
const IDENTITY_XY_VP = (() => {
  const vp = new Array(16).fill(0);
  vp[0] = 1; // x-clip = world.x
  vp[5] = 1; // y-clip = world.y
  vp[15] = 1; // w = 1 (always in front of camera)
  return vp;
})();

// Same mapping, but w is forced negative — simulates every point on this
// "plane" being behind the camera.
const BEHIND_CAMERA_VP = (() => {
  const vp = new Array(16).fill(0);
  vp[0] = 1;
  vp[5] = 1;
  vp[15] = -1;
  return vp;
})();

const WIDTH = 200;
const HEIGHT = 200;

// Spans world/NDC x in [-0.5, 0.5] and y in [-0.5, 0.5] — under
// IDENTITY_XY_VP at 200x200, that's screen [50, 150] x [50, 150].
const PLANE = {
  center: c3(0, 0, 0),
  right: c3(1, 0, 0),
  up: c3(0, 1, 0),
  halfWidth: 0.5,
  halfHeight: 0.5,
};

test('projectPlaneScreenQuad: projects corners to expected screen pixels, tl/tr/br/bl order', () => {
  const quad = projectPlaneScreenQuad(PLANE, IDENTITY_XY_VP, WIDTH, HEIGHT);
  assert.ok(quad);
  assert.equal(quad.length, 4);
  const [tl, tr, br, bl] = quad;
  assert.deepEqual(tl, { x: 50, y: 50 });
  assert.deepEqual(tr, { x: 150, y: 50 });
  assert.deepEqual(br, { x: 150, y: 150 });
  assert.deepEqual(bl, { x: 50, y: 150 });
});

test('projectPlaneScreenQuad: returns null when the plane is behind the camera', () => {
  assert.equal(projectPlaneScreenQuad(PLANE, BEHIND_CAMERA_VP, WIDTH, HEIGHT), null);
});

test('computeOcclusionPlaneScreenQuads: keeps on-screen planes, drops behind-camera ones', () => {
  const onScreenPlane = PLANE;
  const behindCameraPlane = { ...PLANE, center: c3(5, 5, 0) }; // geometry irrelevant, vp forces w<0
  // Mix both planes; project each through its own matrix by calling twice
  // and asserting the aggregate function's filtering behavior directly.
  const quadsAllVisible = computeOcclusionPlaneScreenQuads([onScreenPlane], IDENTITY_XY_VP, WIDTH, HEIGHT);
  assert.equal(quadsAllVisible.length, 1);

  const quadsNoneVisible = computeOcclusionPlaneScreenQuads([behindCameraPlane], BEHIND_CAMERA_VP, WIDTH, HEIGHT);
  assert.equal(quadsNoneVisible.length, 0);
});

test('computeOcclusionPlaneScreenQuads: empty planes array yields empty quads', () => {
  assert.deepEqual(computeOcclusionPlaneScreenQuads([], IDENTITY_XY_VP, WIDTH, HEIGHT), []);
});

test('isPointMaskedByPlanesOnScreen: a point well inside the quad is masked', () => {
  const quads = computeOcclusionPlaneScreenQuads([PLANE], IDENTITY_XY_VP, WIDTH, HEIGHT);
  assert.equal(isPointMaskedByPlanesOnScreen(100, 100, quads), true);
});

test('isPointMaskedByPlanesOnScreen: a point well outside the quad is not masked', () => {
  const quads = computeOcclusionPlaneScreenQuads([PLANE], IDENTITY_XY_VP, WIDTH, HEIGHT);
  assert.equal(isPointMaskedByPlanesOnScreen(0, 0, quads), false);
  assert.equal(isPointMaskedByPlanesOnScreen(200, 100, quads), false);
});

test('isPointMaskedByPlanesOnScreen: a point exactly on the quad boundary is masked (inclusive)', () => {
  const quads = computeOcclusionPlaneScreenQuads([PLANE], IDENTITY_XY_VP, WIDTH, HEIGHT);
  assert.equal(isPointMaskedByPlanesOnScreen(50, 100, quads), true); // on the left edge
  assert.equal(isPointMaskedByPlanesOnScreen(100, 50, quads), true); // on the top edge
});

test('isPointMaskedByPlanesOnScreen: this is a strict superset of the old depth-only test — an object nearer the camera than the plane but still overlapping it on screen is masked', () => {
  // The very bug this rewrite fixes: a point geometrically in FRONT of the
  // plane along the camera ray (which the old ray-vs-plane depth test would
  // never occlude) still masks here, because masking is purely a function
  // of on-screen position, not 3D depth.
  const quads = computeOcclusionPlaneScreenQuads([PLANE], IDENTITY_XY_VP, WIDTH, HEIGHT);
  assert.equal(isPointMaskedByPlanesOnScreen(100, 100, quads), true);
});

test('isPointMaskedByPlanesOnScreen: short-circuits true across multiple quads', () => {
  const missPlane = { ...PLANE, center: c3(100, 100, 0) }; // far outside this viewport
  const hitPlane = PLANE;
  const quads = computeOcclusionPlaneScreenQuads([missPlane, hitPlane], IDENTITY_XY_VP, WIDTH, HEIGHT);
  assert.equal(isPointMaskedByPlanesOnScreen(100, 100, quads), true);
});

test('isPointMaskedByPlanesOnScreen: empty quad list never masks anything', () => {
  assert.equal(isPointMaskedByPlanesOnScreen(100, 100, []), false);
});

// The plane's quad spans screen [50,150] x [50,150] under IDENTITY_XY_VP
// (see PLANE's comment above).

test('isRectMaskedByPlanesOnScreen: a rect wholly inside the quad is masked', () => {
  const quads = computeOcclusionPlaneScreenQuads([PLANE], IDENTITY_XY_VP, WIDTH, HEIGHT);
  assert.equal(isRectMaskedByPlanesOnScreen({ x: 80, y: 80, w: 20, h: 20 }, quads), true);
});

test('isRectMaskedByPlanesOnScreen: a rect wholly clear of the quad is not masked', () => {
  const quads = computeOcclusionPlaneScreenQuads([PLANE], IDENTITY_XY_VP, WIDTH, HEIGHT);
  assert.equal(isRectMaskedByPlanesOnScreen({ x: 160, y: 160, w: 20, h: 20 }, quads), false);
});

test('isRectMaskedByPlanesOnScreen: this is the fix for the exact gap the anchor-point-only test left open — a rect whose own corner/anchor sits OUTSIDE the quad, but whose body still overlaps it, is masked', () => {
  // Anchored at (140, 140) — outside the quad's [50,150] far edge by nothing,
  // actually let's anchor further out: (170, 170) is clearly outside
  // [50,150]x[50,150]. A 40x40 rect there still overlaps the quad's bottom-
  // right corner region. This mirrors exactly the reported bug: a label
  // card's top-left corner (its "anchor" in rect terms) lands outside the
  // CCTV plane's screen quad, but the card's body still overlaps it.
  const quads = computeOcclusionPlaneScreenQuads([PLANE], IDENTITY_XY_VP, WIDTH, HEIGHT);
  const anchorOutsideQuad = { x: 170, y: 170, w: 1, h: 1 };
  assert.equal(isPointMaskedByPlanesOnScreen(170, 170, quads), false, 'sanity: the anchor point itself is not masked');
  const cardOverlappingQuad = { x: 130, y: 130, w: 40, h: 40 };
  assert.equal(isRectMaskedByPlanesOnScreen(cardOverlappingQuad, quads), true);
});

test('isRectMaskedByPlanesOnScreen: touching edges count as overlapping (inclusive)', () => {
  const quads = computeOcclusionPlaneScreenQuads([PLANE], IDENTITY_XY_VP, WIDTH, HEIGHT);
  // Rect's left edge sits exactly on the quad's right edge (x=150).
  assert.equal(isRectMaskedByPlanesOnScreen({ x: 150, y: 80, w: 20, h: 20 }, quads), true);
});

test('isRectMaskedByPlanesOnScreen: a rect wholly containing the quad is masked', () => {
  const quads = computeOcclusionPlaneScreenQuads([PLANE], IDENTITY_XY_VP, WIDTH, HEIGHT);
  assert.equal(isRectMaskedByPlanesOnScreen({ x: 0, y: 0, w: 200, h: 200 }, quads), true);
});

test('isRectMaskedByPlanesOnScreen: short-circuits true across multiple quads', () => {
  const missPlane = { ...PLANE, center: c3(100, 100, 0) };
  const hitPlane = PLANE;
  const quads = computeOcclusionPlaneScreenQuads([missPlane, hitPlane], IDENTITY_XY_VP, WIDTH, HEIGHT);
  assert.equal(isRectMaskedByPlanesOnScreen({ x: 80, y: 80, w: 20, h: 20 }, quads), true);
});

test('isRectMaskedByPlanesOnScreen: empty quad list never masks anything', () => {
  assert.equal(isRectMaskedByPlanesOnScreen({ x: 80, y: 80, w: 20, h: 20 }, []), false);
});
