// Moved out of annotationResolver.js (annotationResolverScope).

import { approximateDistanceM } from './annotationRingGeometry.js';
import * as Cesium from 'cesium';
import { GROUNDS_RADIUS_M, GROUNDS_RADIUS_MAX_M, GROUNDS_RADIUS_MIN_M, SCOPE_AREA_CAP_M2 } from './annotationResolverConstants.js';

/**
 * Synthesize an approximate circular AREA by buffering a label point. Returns a ring
 * marked `synthesized:true` so the renderers draw it "approximate" (dashed/feathered),
 * never as an authoritative boundary (research §8.6 invariant 3). Pure local math — no
 * Overpass call — so it always succeeds and adds no proxy/rate-limit cost.
 * @param {number} lat
 * @param {number} lon
 * @param {number} radiusM
 * @returns {{ring:[number,number][], kind:'area', heightM:null, synthesized:true}}
 */
export function synthesizeBufferedArea(lat, lon, radiusM) {
  const mPerDegLat = 111320;
  const mPerDegLon = mPerDegLat * Math.cos((lat * Math.PI) / 180);
  const ring = [];
  const N = 44;
  for (let i = 0; i <= N; i++) {
    const a = (i / N) * Math.PI * 2;
    ring.push([
      lon + (Math.cos(a) * radiusM) / mPerDegLon,
      lat + (Math.sin(a) * radiusM) / mPerDegLat,
    ]);
  }
  return { ring, kind: 'area', heightM: null, synthesized: true };
}

/**
 * Radius (m) for a synthesized grounds disc, sized to the place's Google Places
 * `viewport` (a lat/lng box) when one is available: half its diagonal, clamped to
 * a sane band. Google never returns a polygon, but the viewport frames the real
 * feature, so this is far better than a blind constant. Falls back to
 * GROUNDS_RADIUS_M when there is no viewport.
 * @param {{low:{latitude:number,longitude:number},high:{latitude:number,longitude:number}}|null} viewport
 */
export function groundsRadiusFromViewport(viewport) {
  const lo = viewport?.low;
  const hi = viewport?.high;
  if (!lo || !hi
    || ![lo.latitude, lo.longitude, hi.latitude, hi.longitude].every(Number.isFinite)) {
    return GROUNDS_RADIUS_M;
  }
  const diagM = approximateDistanceM(lo.latitude, lo.longitude, hi.latitude, hi.longitude);
  const r = diagM / 2;
  if (!Number.isFinite(r) || r <= 0) return GROUNDS_RADIUS_M;
  return Math.max(GROUNDS_RADIUS_MIN_M, Math.min(GROUNDS_RADIUS_MAX_M, r));
}

export function exceedsScopeArea(fp, scope) {
  const cap = SCOPE_AREA_CAP_M2[scope];
  if (!cap) return false;
  return ringAreaM2(fp.ring) > cap;
}

/** Shoelace area (m²) of a [[lon,lat], ...] ring in a local equirectangular projection. */
export function ringAreaM2(ring) {
  if (!Array.isArray(ring) || ring.length < 3) return 0;
  const mLat = 111_320;
  const mLon = mLat * Math.cos(Cesium.Math.toRadians(ring[0][1]));
  let area = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0] * mLon;
    const yi = ring[i][1] * mLat;
    const xj = ring[j][0] * mLon;
    const yj = ring[j][1] * mLat;
    area += xj * yi - xi * yj;
  }
  return Math.abs(area) / 2;
}

/** A target that reads like a fine-grained monument/marker (vs a building/district). */
export function isMonumentLikeQuery(query) {
  return /\b(monument|memorial|statue|sculpture|fountain|cenotaph|obelisk|plaque|bust)\b/i.test(String(query || ''));
}

/** A target that reads like an enclosing GROUNDS / COMPOUND / CAMPUS (e.g. "Texas Capitol grounds")
 *  rather than a single building — used to synthesize a loose-footprint disc when OSM has no real
 *  polygon, instead of failing outright. */
export function isGroundsLikeQuery(query) {
  return /\b(grounds|compound|campus|complex|quad|plaza)\b/i.test(String(query || ''));
}

/**
 * Whether a target is a POINT-LIKE cultural marker (monument/statue/memorial/plaque/…)
 * that must resolve point-first (field test 7 §1). Classification ladder, most
 * authoritative first:
 *   1. the voice model's explicit `entityKind` (an entity fact — trusted both ways),
 *   2. grounds-like wording in the target OR label (area intent) vetoes,
 *   3. the monument wordlist,
 *   4. the Places `types` of the anchored feature (data — present on places-sourced
 *      anchors; 'monument'/'sculpture' are unambiguous point classes).
 */
export function isPointLikeTarget(target, entityKind, placeTypes, label) {
  if (entityKind === 'point_feature') return true;
  if (entityKind) return false; // model asserted an area-like kind (building/compound/…)
  if (isGroundsLikeQuery(target) || isGroundsLikeQuery(label)) return false;
  if (isMonumentLikeQuery(target)) return true;
  const t = new Set((placeTypes || []).map((s) => String(s).toLowerCase()));
  return t.has('monument') || t.has('sculpture');
}

/**
 * Whether an annotation asks for an enclosing GROUNDS / COMPOUND / CAMPUS area. The model
 * often puts the grounds word in the LABEL, not the target ("target: Texas State Capitol,
 * label: Capitol grounds" — field test 8), so both count; an explicit `entityKind` (entity
 * fact) is trusted both ways. Grounds-like asks reach the REAL enclosing-polygon sweep even
 * under `around_the_thing` phrasing — the thing named IS the grounds, so a buffered
 * around-disc would be the wrong shape. Exported for tests.
 */
export function isGroundsLikeAsk(target, label, entityKind) {
  if (entityKind) return entityKind === 'compound';
  return isGroundsLikeQuery(target) || isGroundsLikeQuery(label);
}
