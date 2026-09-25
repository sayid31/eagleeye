import { keyholeLabelAlphaFromGeometry } from '../celestialRing.js';
import { rectIntersectsAny } from './detectionDraw.js';
import { SKY_PLATE_SCALE } from '../overlays/worldOverlayTokens.js';

/**
 * Pure label-placement and priority helpers behind the Universal Detection
 * Overlay's per-frame paint (`_drawOverlay` in `detection.js`).
 *
 * Extracted from `detection.js` (Wave 1 split program, item #18) — mechanical
 * relocation of already-pure functions, zero behavior change. Every function
 * here takes its inputs as explicit parameters and never touches the
 * `detection.js` module-level `_mode`/`_theme`/`_ctx`/`_densityPct`/etc.
 * state — same purity standard applied to the `radio.js`, `satellites.js`,
 * and `militaryAwareness.js` splits (see `satelliteTleLookup.js`,
 * `militaryAwarenessPredicates.js`).
 *
 * `_drawScanlines`, `_drawModeBanner`, `_drawSparseFocusRing`,
 * `_stashCallout`, `_paintCalloutLane`, `_modeForDensity`, and
 * `_materializeCandidate` stayed behind despite living in the same region of
 * the file: each reads `detection.js` module state directly (theme, canvas
 * context, mode, suspend flags, the pooled callout buffer, or the cached
 * `_charWidth`/`_densityPct`), so none clears this module's no-module-state
 * bar. `_materializeCandidate` in particular calls `buildLabelPlacements`
 * below but stays in `detection.js` itself because it reads `_charWidth`.
 *
 * None of these five had any consumer outside `detection.js` at the time of
 * this split (verified by grep across `src/**\/*.{js,mjs}`), so nothing is
 * re-exported from `detection.js` for external callers — only the internal
 * call sites in `detection.js` were repointed to import from here.
 *
 * @module detectionLabelGeometry
 */

/**
 * Clamps a numeric value between min and max (inclusive).
 * @param {number} value - The value to clamp.
 * @param {number} min - Lower bound.
 * @param {number} max - Upper bound.
 * @returns {number} The clamped value.
 */
export function clampDetectionValue(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

/**
 * Builds the stable identity key used by the label arbiter and the cohort
 * builders to dedupe/track one detectable object across frames.
 * @param {string} layerId - Owning data layer id.
 * @param {string|number} sourceId - Layer-local source identifier.
 * @returns {string} `${layerId}:${sourceId}` key.
 */
export function detectionKey(layerId, sourceId) {
  return `${layerId || 'unknown'}:${String(sourceId)}`;
}

/**
 * Scores a detectable object's placement/selection priority — higher wins
 * ties in the bounded cohort builder. Tracked (skipLabel) objects always
 * outrank labeled ones; military tier and camera/vehicle/aircraft types rank
 * above the generic default.
 * @param {{skipLabel?: boolean, tier?: string, type?: string}} obj - Detectable object.
 * @returns {number} Priority score (higher = more important).
 */
export function semanticPriority(obj) {
  if (obj.skipLabel) return 1000;
  if (obj.tier === 'military') return 120;
  if (obj.type === 'CAM') return 50;
  if (obj.type === 'VEH') return 35;
  if (obj.type === 'AIR') return 30;
  if (obj.type === 'SAT') return 25;
  if (obj.type === 'SEA') return 25;
  return 10;
}

/**
 * Tries the four corner positions (NE, NW, SE, SW) around a bracket for a
 * label card, in that priority order, rejecting any that would clip the
 * viewport, collide with a reserved HUD rectangle, or fall fully outside the
 * keyhole's radial fade. Returns every corner that survives — the caller
 * picks based on stability/incumbency, not just the first hit.
 * @param {number} sx - Bracket center screen X.
 * @param {number} sy - Bracket center screen Y.
 * @param {number} halfW - Bracket half-width.
 * @param {number} halfH - Bracket half-height.
 * @param {{w:number,h:number,primaryX:number,microX:number,baseline:number}} card - Card geometry from `measureTrackLabel`.
 * @param {number} width - Canvas width in pixels.
 * @param {number} height - Canvas height in pixels.
 * @param {{centerX:number,centerY:number,radius:number,featherPx:number}} keyhole - Frame keyhole geometry.
 * @param {Array<{x:number,y:number,w:number,h:number}>} [occlusionRects=[]] - Reserved HUD rectangles.
 * @returns {Array<Object>} Surviving corner placements, each with lead-line and text-baseline geometry.
 */
export function buildLabelPlacements(
  sx,
  sy,
  halfW,
  halfH,
  card,
  width,
  height,
  keyhole,
  occlusionRects = [],
) {
  const gapX = 8;
  const gapY = 12;
  const margin = 4;
  const raw = [
    {
      corner: 'NE',
      cardX: sx + halfW + gapX,
      cardY: sy - halfH - gapY - card.h,
      leadFromX: sx + halfW,
      leadFromY: sy - halfH,
      leadToSide: 'SW',
    },
    {
      corner: 'NW',
      cardX: sx - halfW - gapX - card.w,
      cardY: sy - halfH - gapY - card.h,
      leadFromX: sx - halfW,
      leadFromY: sy - halfH,
      leadToSide: 'SE',
    },
    {
      corner: 'SE',
      cardX: sx + halfW + gapX,
      cardY: sy + halfH + gapY,
      leadFromX: sx + halfW,
      leadFromY: sy + halfH,
      leadToSide: 'NW',
    },
    {
      corner: 'SW',
      cardX: sx - halfW - gapX - card.w,
      cardY: sy + halfH + gapY,
      leadFromX: sx - halfW,
      leadFromY: sy + halfH,
      leadToSide: 'NE',
    },
  ];

  const placements = [];
  for (const placement of raw) {
    const { cardX, cardY } = placement;
    if (cardX < margin || cardY < margin || cardX + card.w > width - margin || cardY + card.h > height - margin) {
      continue;
    }
    const cardRect = { x: cardX, y: cardY, w: card.w, h: card.h };
    if (rectIntersectsAny(cardRect, occlusionRects)) continue;
    const leadToX = placement.leadToSide.endsWith('E') ? cardX + card.w : cardX;
    const leadToY = placement.leadToSide.startsWith('S') ? cardY + card.h : cardY;
    const centerX = cardX + card.w * 0.5;
    const centerY = cardY + card.h * 0.5;
    const radialAlpha = keyholeLabelAlphaFromGeometry(centerX, centerY, keyhole);
    if (radialAlpha <= 0) continue;
    placements.push({
      ...placement,
      leadToX,
      leadToY,
      centerX,
      centerY,
      keyholeAlpha: radialAlpha,
      rect: cardRect,
      primaryX: cardX + card.primaryX,
      microX: cardX + card.microX,
      baseline: cardY + card.baseline,
    });
  }
  return placements;
}

/**
 * Scale a callout's plate for what sits behind it. Ground keeps the full
 * per-theme plate; sky feathers down to `SKY_PLATE_SCALE` of it, because the
 * plate's whole job — holding small mono text off busy sunlit imagery — does
 * not exist against an empty horizon. See `SKY_PLATE_SCALE` for the taste call.
 * @param {number} skyFactor - 0 (ground behind) … 1 (sky behind).
 * @returns {number} Multiplier applied to the plate fill only.
 */
export function plateScaleForBackdrop(skyFactor) {
  return 1 + (SKY_PLATE_SCALE - 1) * skyFactor;
}
