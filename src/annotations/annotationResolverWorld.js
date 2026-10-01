// Moved out of annotationResolver.js (annotationResolverWorld).

import * as Cesium from 'cesium';
import { isPickedWorldPosition } from '../data/scenePick.js';
import { findNaturalRegion } from '../data/naturalEarthRegions.js';
import { geocodePlace, scopeFromTypes } from './annotationResolverGeocode.js';
import { fetchAdminArea } from './annotationResolverOverpass.js';

/**
 * Convert a NORMALIZED screen point (x,y in [0,1] of the current viewport) into
 * a world lon/lat using the depth-aware pick cascade — the inverse of the
 * project-to-screen used by the renderers. This is the "point at the pixel"
 * fallback: the agent indicates a spot in the viewport screenshot when it can't
 * name the place, and we anchor the mark to the actual world point under it.
 */
export function pickWorldFromScreen(viewer, nx, ny) {
  const scene = viewer?.scene;
  if (!scene) return null;
  const canvas = scene.canvas;
  const w = canvas.clientWidth || canvas.width || 0;
  const h = canvas.clientHeight || canvas.height || 0;
  if (!w || !h) return null;
  const px = Math.max(0, Math.min(1, nx)) * w;
  const py = Math.max(0, Math.min(1, ny)) * h;
  const pos = new Cesium.Cartesian2(px, py);

  // Each stage is validated before it is accepted: a depth pick over empty sky
  // can return a NaN or centre-of-the-earth Cartesian, and converting one of
  // those throws inside Cesium. A degenerate pick IS a missed pick, so it falls
  // through to the next stage and ultimately to the caller's null.
  let cart = null;
  if (scene.pickPositionSupported && typeof scene.pickPosition === 'function') {
    try { cart = scene.pickPosition(pos); } catch { cart = null; }
  }
  if (!isPickedWorldPosition(cart) && typeof viewer.camera.pickEllipsoid === 'function') {
    try { cart = viewer.camera.pickEllipsoid(pos, Cesium.Ellipsoid.WGS84); } catch { cart = null; }
  }
  if (!isPickedWorldPosition(cart) && typeof viewer.camera.getPickRay === 'function') {
    try {
      const ray = viewer.camera.getPickRay(pos);
      cart = ray ? (scene.globe?.pick(ray, scene) || null) : null;
    } catch { cart = null; }
  }
  if (!isPickedWorldPosition(cart)) return null;
  const carto = Cesium.Cartographic.fromCartesian(cart);
  if (!carto) return null;
  return {
    lat: Cesium.Math.toDegrees(carto.latitude),
    lon: Cesium.Math.toDegrees(carto.longitude),
  };
}

/**
 * Best-effort ground height at a coordinate. The Cesium globe is hidden behind
 * the Google 3D tiles, so we try to clamp onto the photoreal tile surface; if
 * the tiles for that spot aren't loaded we fall back to the ellipsoid (0).
 */
export function sampleGroundHeight(viewer, lon, lat) {
  const scene = viewer?.scene;
  if (!scene) return 0;
  try {
    if (scene.clampToHeightSupported && typeof scene.clampToHeight === 'function') {
      const carto = Cesium.Cartographic.fromDegrees(lon, lat);
      const surface = Cesium.Cartographic.toCartesian(carto);
      const clamped = scene.clampToHeight(surface);
      if (clamped) {
        const h = Cesium.Cartographic.fromCartesian(clamped).height;
        if (Number.isFinite(h)) return h;
      }
    }
  } catch {
    /* tiles not ready — fall through */
  }
  const globeHeight = scene.globe?.getHeight?.(Cesium.Cartographic.fromDegrees(lon, lat));
  return Number.isFinite(globeHeight) && globeHeight > 0 ? globeHeight : 0;
}

export function shortLabel(formattedAddress) {
  if (!formattedAddress) return null;
  return String(formattedAddress).split(',')[0].trim() || null;
}

/**
 * Region ring for ANALYST queries ("how many flights over Texas / the Alps") —
 * a name-only entry point that reuses this module's boundary machinery
 * without the annotation pipeline. Natural Earth pack first (offline,
 * instant; largest-area match is correct for a global name-only ask), then
 * geocode + admin boundary for states/countries/counties (Tier A disk-cached
 * Overpass, so repeat asks are instant). Returns null when the name doesn't
 * resolve to a region-like boundary — the analyst engine reports that
 * honestly rather than silently scoping to nothing.
 *
 * @param {string} name  e.g. "Texas", "the Alps", "France", "Gulf of Mexico"
 * @param {AbortSignal} [signal]
 * @returns {Promise<{name:string, ring:Array<[number,number]>}|null>}
 */
export async function resolveRegionRingForQuery(name, signal) {
  const q = String(name || '').trim();
  if (!q) return null;
  const ne = await findNaturalRegion(q).catch(() => null);
  if (ne?.polygons?.length) {
    // Largest ring carries the query scope; multi-ring regions (Andes) keep
    // their main cordillera — good enough for containment counting.
    const ring = [...ne.polygons].sort((a, b) => b.length - a.length)[0];
    if (ring?.length >= 3) return { name: ne.name, ring };
  }
  const geo = await geocodePlace(q, null, signal).catch(() => null);
  if (!geo) return null;
  const scope = scopeFromTypes(geo.types);
  if (!['country', 'state', 'county', 'city'].includes(scope)) return null;
  const fp = await fetchAdminArea(geo.lat, geo.lon, q, scope, signal).catch(() => null);
  if (fp?.ring?.length >= 3) return { name: q, ring: fp.ring };
  return null;
}
