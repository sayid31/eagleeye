// src/data/detectionLabelGeometry.test.mjs — pure label-placement helpers
// behind the Universal Detection Overlay's per-frame paint.
//
// Locks:
//   - semanticPriority ranks tracked > military > CAM/VEH/AIR/SAT/SEA > default;
//   - buildLabelPlacements rejects a corner that clips the viewport or
//     collides with a reserved HUD rectangle, same as before this file's
//     CCTV-plane-quad addition;
//   - buildLabelPlacements (2026-09 fix): rejects a corner whose CARD
//     rectangle overlaps the active CCTV monitor plane's on-screen quad,
//     even when the bracket ANCHOR point that corner is computed from sits
//     outside that quad — this is the exact gap the merged screen-space-quad
//     fix left open (field report: VEH-XXXX label cards still rendered
//     inside the CCTV plane's rectangle because only the anchor point, never
//     the card's own placed rectangle, was ever tested against the plane);
//   - with no active plane (empty occlusionScreenQuads), placement behavior
//     is unchanged from before this fix (regression guard);
//   - plateScaleForBackdrop interpolates between 1 (ground) and
//     SKY_PLATE_SCALE (sky).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildLabelPlacements,
  clampDetectionValue,
  detectionKey,
  plateScaleForBackdrop,
  semanticPriority,
} from './detectionLabelGeometry.js';
import { SKY_PLATE_SCALE } from '../overlays/worldOverlayTokens.js';

const WIDTH = 400;
const HEIGHT = 400;
// A keyhole large enough that every placement in these tests keeps full
// radial alpha — these tests are about the plane-quad/HUD-rect gates, not
// the keyhole feather.
const OPEN_KEYHOLE = { centerX: WIDTH / 2, centerY: HEIGHT / 2, radius: 100_000, featherPx: 0 };
const CARD = { w: 30, h: 20, primaryX: 10, microX: 20, baseline: 15 };
// Axis-aligned screen quad spanning [100,200] x [100,200], in the same
// tl/tr/br/bl winding order `projectPlaneScreenQuad` produces.
const PLANE_QUAD = [
  { x: 100, y: 100 },
  { x: 200, y: 100 },
  { x: 200, y: 200 },
  { x: 100, y: 200 },
];

test('clampDetectionValue clamps to [min, max]', () => {
  assert.equal(clampDetectionValue(5, 0, 10), 5);
  assert.equal(clampDetectionValue(-5, 0, 10), 0);
  assert.equal(clampDetectionValue(15, 0, 10), 10);
});

test('detectionKey composes layerId:sourceId, defaulting a missing layerId', () => {
  assert.equal(detectionKey('traffic', 'veh-1'), 'traffic:veh-1');
  assert.equal(detectionKey('', 42), 'unknown:42');
  assert.equal(detectionKey(undefined, 'x'), 'unknown:x');
});

test('semanticPriority: tracked objects always outrank everything else', () => {
  assert.equal(semanticPriority({ skipLabel: true, tier: 'military' }), 1000);
});

test('semanticPriority: military tier outranks type-based scores', () => {
  assert.equal(semanticPriority({ tier: 'military', type: 'VEH' }), 120);
});

test('semanticPriority: type ranking is CAM > VEH > AIR > SAT/SEA > default', () => {
  assert.equal(semanticPriority({ type: 'CAM' }), 50);
  assert.equal(semanticPriority({ type: 'VEH' }), 35);
  assert.equal(semanticPriority({ type: 'AIR' }), 30);
  assert.equal(semanticPriority({ type: 'SAT' }), 25);
  assert.equal(semanticPriority({ type: 'SEA' }), 25);
  assert.equal(semanticPriority({ type: 'UNK' }), 10);
});

test('buildLabelPlacements: with no plane and no HUD rects, all 4 corners survive when they fit the viewport', () => {
  const placements = buildLabelPlacements(200, 200, 5, 5, CARD, WIDTH, HEIGHT, OPEN_KEYHOLE);
  assert.equal(placements.length, 4);
  const corners = placements.map((p) => p.corner).sort();
  assert.deepEqual(corners, ['NE', 'NW', 'SE', 'SW']);
});

test('buildLabelPlacements: rejects a corner clipping the viewport edge', () => {
  // Anchored near the top-left corner — NW and SW would push the card off
  // the left edge (cardX < margin).
  const placements = buildLabelPlacements(10, 10, 5, 5, CARD, WIDTH, HEIGHT, OPEN_KEYHOLE);
  const corners = placements.map((p) => p.corner);
  assert.ok(!corners.includes('NW'));
  assert.ok(!corners.includes('SW'));
});

test('buildLabelPlacements: rejects a corner whose card rect collides with a reserved HUD rectangle', () => {
  // SE placement's card lands at cardX=sx+halfW+gapX=213, cardY=sy+halfH+gapY=217
  // — put a HUD rectangle right on top of that.
  const occlusionRects = [{ x: 200, y: 200, w: 100, h: 100 }];
  const withRect = buildLabelPlacements(200, 200, 5, 5, CARD, WIDTH, HEIGHT, OPEN_KEYHOLE, occlusionRects);
  const withoutRect = buildLabelPlacements(200, 200, 5, 5, CARD, WIDTH, HEIGHT, OPEN_KEYHOLE, []);
  assert.ok(!withRect.some((p) => p.corner === 'SE'));
  assert.ok(withoutRect.some((p) => p.corner === 'SE'));
});

// ── CCTV monitor-plane card masking (2026-09 field report: VEH-XXXX label
// cards still rendered inside the plane after the screen-quad fix) ──
//
// Anchor (sx, sy) = (90, 90), halfW/halfH = 5 — the bracket rect [85,85]-
// [95,95] and the anchor point itself sit entirely OUTSIDE PLANE_QUAD
// [100,100]-[200,200], so the earlier point-only masking in detection.js
// would never have caught this object at all. But the SE corner's CARD
// rect (cardX = 90+5+8 = 103, cardY = 90+5+12 = 107, sized 30x20) lands at
// [103,107]-[133,127] — squarely inside the plane's quad. NE/NW/SW corners'
// cards all land clear of it (verified by their coordinates below).
test('buildLabelPlacements: rejects the one corner whose card overlaps the CCTV plane, even though the bracket anchor is outside the plane entirely', () => {
  const placements = buildLabelPlacements(90, 90, 5, 5, CARD, WIDTH, HEIGHT, OPEN_KEYHOLE, [], [PLANE_QUAD]);
  const corners = placements.map((p) => p.corner).sort();
  assert.deepEqual(corners, ['NE', 'NW', 'SW'], 'SE is the only corner whose card overlaps the plane');
  for (const placement of placements) {
    assert.equal(placement.corner === 'SE', false);
  }
});

test('buildLabelPlacements: with no active plane (empty occlusionScreenQuads), the same anchor keeps all 4 corners (regression guard)', () => {
  const placements = buildLabelPlacements(90, 90, 5, 5, CARD, WIDTH, HEIGHT, OPEN_KEYHOLE, [], []);
  const corners = placements.map((p) => p.corner).sort();
  assert.deepEqual(corners, ['NE', 'NW', 'SE', 'SW']);
});

test('buildLabelPlacements: a card entirely clear of the plane on every corner keeps all 4 placements', () => {
  // Anchored far from PLANE_QUAD — no corner's card can reach it.
  const placements = buildLabelPlacements(350, 350, 5, 5, CARD, WIDTH, HEIGHT, OPEN_KEYHOLE, [], [PLANE_QUAD]);
  assert.equal(placements.length, 4);
});

test('buildLabelPlacements: every candidate corner overlapping the plane means zero placements survive (caller must drop the label entirely)', () => {
  // Anchored inside PLANE_QUAD itself — every corner's card stays near the
  // anchor and overlaps the plane.
  const placements = buildLabelPlacements(150, 150, 5, 5, CARD, WIDTH, HEIGHT, OPEN_KEYHOLE, [], [PLANE_QUAD]);
  assert.equal(placements.length, 0);
});

test('plateScaleForBackdrop: 1 on the ground, SKY_PLATE_SCALE in open sky, linear between', () => {
  assert.equal(plateScaleForBackdrop(0), 1);
  // Float arithmetic (1 + (0.22 - 1) * 1) lands a hair off 0.22 exactly —
  // assert the formula's intent, not bit-for-bit equality.
  assert.ok(Math.abs(plateScaleForBackdrop(1) - SKY_PLATE_SCALE) < 1e-9);
  const half = plateScaleForBackdrop(0.5);
  assert.ok(half > Math.min(1, SKY_PLATE_SCALE) && half < Math.max(1, SKY_PLATE_SCALE));
});
