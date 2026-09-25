/**
 * @file Pure horizon-occlusion helpers for the FIRMS fire layer.
 *
 * The Cesium globe is hidden in this app (Google 3D Tiles render the planet),
 * so nothing writes far-side depth — and fire sprites are additionally
 * always-on-top (`disableDepthTestDistance: INFINITY`). Without an explicit
 * occluder pass, fires on the opposite side of the Earth would shine through
 * the planet at tilted mid-altitude views. Same pattern as the flights/CCTV
 * layers' `EllipsoidalOccluder` passes.
 *
 * Extracted from `firmsHeatmap.js` — pure Cesium math, no layer closure state.
 * @module data/firmsHorizonCull
 */
import * as Cesium from 'cesium';
import { fireAnchorHeight } from './fireAnchors.js';

/**
 * Anchors below this height get a separate LIFTED point for occlusion tests
 * (never for rendering). Mirrors the flights layer's `cullPosition` idiom
 * (`renderAltitudeM < 10` → test at 12 m): `fireAnchorHeight` is ground floor
 * + lift, and in negative-geoid coastal regions that lands a few tens of
 * metres BELOW the WGS84 ellipsoid — EllipsoidalOccluder then judges such a
 * point "beyond the horizon" while its true-surface neighbours stay visible,
 * so near-limb fires would blink out for a datum reason.
 */
const CULL_LIFT_THRESHOLD_M = 10;
/** Height of the lifted occlusion-test point (flights uses the same 12 m). */
const CULL_LIFT_M = 12;

/**
 * Lazily-cached Cartesian3 anchor at the shared ground floor (DEM/mesh cell
 * + lift) when the floor is warm, else ellipsoid height 0 (owner field
 * finding 2026-07-21: height-0 anchors read as buried under high terrain at
 * close/oblique zoom). Warm-cache read only — floors are warmed in batch by
 * renderDetections for the close band; everything else (cell-band context
 * registrations, detectable objects) just rides whatever is already warm.
 * Fires are static and floor cells latch, so each detection re-allocates at
 * most once per floor state (cold 0 → warm DEM). Rendering stays depth-test
 * free either way (contacts are ALWAYS visible — never below the surface,
 * slightly above is fine).
 * @param {Object} fire - Detection record.
 * @returns {Cesium.Cartesian3}
 */
export function firePosition(fire) {
  const height = fireAnchorHeight(fire.lat, fire.lon);
  if (!fire.position || fire.positionHeight !== height) {
    fire.position = Cesium.Cartesian3.fromDegrees(fire.lon, fire.lat, height);
    fire.positionHeight = height;
  }
  return fire.position;
}

/**
 * Occlusion-test anchor for one detection. Returns the render position
 * outright for anchors comfortably above the ellipsoid (the common case) and
 * a lazily-cached lifted point otherwise — see CULL_LIFT_THRESHOLD_M. This
 * NEVER feeds rendering: the datum-correct anchor from {@link firePosition}
 * is what the sprite and the card are drawn at.
 * @param {Object} fire - Detection record.
 * @returns {Cesium.Cartesian3}
 */
export function fireCullPosition(fire) {
  const position = firePosition(fire);
  if (fire.positionHeight >= CULL_LIFT_THRESHOLD_M) return position;
  if (!fire.cullPosition) {
    fire.cullPosition = Cesium.Cartesian3.fromDegrees(fire.lon, fire.lat, CULL_LIFT_M);
  }
  return fire.cullPosition;
}

/**
 * Occlusion-test anchor for an aggregated heat cell. Cell centers are built at
 * height 0 (exactly on the ellipsoid), which the occluder treats as a limb
 * boundary case, so they get the same lift as sub-ellipsoid fire anchors.
 * @param {number} lon - Cell center longitude in degrees.
 * @param {number} lat - Cell center latitude in degrees.
 * @returns {Cesium.Cartesian3}
 */
export function cellCullPosition(lon, lat) {
  return Cesium.Cartesian3.fromDegrees(lon, lat, CULL_LIFT_M);
}

/**
 * Horizon-cull a billboard collection against an ellipsoid occluder.
 *
 * Pure and allocation-free: reads `billboard.position`, writes `billboard.show`
 * only when it actually flips (assigning `show` dirties the collection's vertex
 * buffer). Accepts any `{length, get(i)}` shape so it is unit-testable without
 * a WebGL scene.
 *
 * @param {?{length: number, get: function(number): (Object|undefined)}} billboards
 *   Billboard collection (or collection-shaped stub).
 * @param {?{isPointVisible: function(Object): boolean}} occluder Horizon occluder.
 * @param {?Array<Cesium.Cartesian3>} [cullPositions=null] Index-aligned lifted
 *   occlusion-test anchors (see {@link fireCullPosition}); falls back to the
 *   billboard's own render position wherever an entry is absent.
 * @returns {number} Count of billboards left visible (0 when nothing to test).
 */
export function applyHorizonCull(billboards, occluder, cullPositions = null) {
  if (!billboards || typeof billboards.get !== 'function') return 0;
  if (typeof occluder?.isPointVisible !== 'function') return 0;
  const total = Number(billboards.length) || 0;
  let visibleCount = 0;
  for (let i = 0; i < total; i += 1) {
    const billboard = billboards.get(i);
    if (!billboard) continue;
    const point = (cullPositions && cullPositions[i]) || billboard.position;
    const visible = occluder.isPointVisible(point) === true;
    if (billboard.show !== visible) billboard.show = visible;
    if (visible) visibleCount += 1;
  }
  return visibleCount;
}
