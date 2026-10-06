import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  hideIconsUnderPlane,
  iconShouldShow,
  pointInConvexQuad,
  restoreIconsUnderPlane,
} from './cctvPlaneIconOcclusion.js';

const SQUARE = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }];

test('pointInConvexQuad accepts inside points for either winding and rejects outside', () => {
  assert.equal(pointInConvexQuad({ x: 50, y: 50 }, SQUARE), true);
  assert.equal(pointInConvexQuad({ x: 50, y: 50 }, [...SQUARE].reverse()), true);
  assert.equal(pointInConvexQuad({ x: 150, y: 50 }, SQUARE), false);
  assert.equal(pointInConvexQuad({ x: 50, y: -1 }, SQUARE), false);
});

test('pointInConvexQuad handles a skewed (perspective) quad', () => {
  const skew = [{ x: 10, y: 0 }, { x: 90, y: 20 }, { x: 80, y: 100 }, { x: 0, y: 70 }];
  assert.equal(pointInConvexQuad({ x: 45, y: 50 }, skew), true);
  assert.equal(pointInConvexQuad({ x: 95, y: 5 }, skew), false);
});

function makeRecord(id, pos) {
  return { camera: { id }, billboard: { show: true, position: pos } };
}

// Positions are already in "screen" space; the projector is the identity.
const project = (p) => (p.off ? undefined : { x: p.x, y: p.y });
const active = () => ({ frustumPositions: { tl: SQUARE[0], tr: SQUARE[1], br: SQUARE[2], bl: SQUARE[3] } });

test('icons inside the plane quad are hidden; icons outside stay shown', () => {
  const inside = makeRecord('in', { x: 40, y: 40 });
  const outside = makeRecord('out', { x: 400, y: 40 });
  hideIconsUnderPlane({ records: [inside, outside], activeRecord: active(), project });
  assert.equal(inside.billboard.show, false);
  assert.equal(outside.billboard.show, true);
});

test('icons reappear when they leave the quad and when restore runs', () => {
  const r = makeRecord('r', { x: 40, y: 40 });
  hideIconsUnderPlane({ records: [r], activeRecord: active(), project });
  assert.equal(r.billboard.show, false);
  r.billboard.position = { x: 500, y: 500 };
  hideIconsUnderPlane({ records: [r], activeRecord: active(), project });
  assert.equal(r.billboard.show, true);

  r.billboard.position = { x: 40, y: 40 };
  hideIconsUnderPlane({ records: [r], activeRecord: active(), project });
  assert.equal(r.billboard.show, false);
  restoreIconsUnderPlane([r]);
  assert.equal(r.billboard.show, true);
});

test('horizon-culled icons stay hidden after restore; plane state never re-shows them', () => {
  const r = makeRecord('h', { x: 40, y: 40 });
  r.horizonVisible = false;
  r.billboard.show = false;
  hideIconsUnderPlane({ records: [r], activeRecord: active(), project });
  restoreIconsUnderPlane([r]);
  assert.equal(r.billboard.show, false);
  assert.equal(iconShouldShow(r), false);
});

test('with no active plane or an off-screen corner nothing is hidden', () => {
  const r = makeRecord('n', { x: 40, y: 40 });
  hideIconsUnderPlane({ records: [r], activeRecord: null, project });
  assert.equal(r.billboard.show, true);
  const a = active();
  a.frustumPositions.tl = { x: 0, y: 0, off: true };
  hideIconsUnderPlane({ records: [r], activeRecord: a, project });
  assert.equal(r.billboard.show, true);
});
