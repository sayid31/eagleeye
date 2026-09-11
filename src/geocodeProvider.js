// src/geocodeProvider.js — forward-geocode provider switch (2026-09).
//
// Google Maps Geocoding requires a billing-enabled Cloud project (credit
// card). Nominatim (OpenStreetMap) needs no key at all. This module is the
// single switch point between them: `forwardGeocode()` is the only export
// consumed by callers (src/locations.js's searchAndFlyTo, src/voice/
// gevActions.js's resolveRadioLocation) — set GEOCODE_PROVIDER=google (with
// GOOGLE_MAPS_API_KEY configured) to flip back; every downstream consumer
// keeps working unmodified because both providers are normalized to the same
// { lat, lng, label, types, viewport } shape, with `types` translated into
// the Google vocabulary that src/locations.js's geocodeNavigationMode()/
// placeFramingViewport()/regionFramingPlan() already understand.
//
// NOTE ON `import.meta.env`: under the actual test runtime (plain Node, via
// scripts/run-unit-tests.mjs) `import.meta.env` is `undefined` — every read
// below short-circuits on `window.__X__ ||` first, exactly like the existing
// Google call sites this module replaces.

import * as Cesium from 'cesium';

/**
 * Which provider answers forwardGeocode(). Defaults to Nominatim (no key
 * required). Unlike the GOOGLE_MAPS_API_KEY reads elsewhere, this default is
 * the common case (tests rarely override it), so the `import.meta.env` read
 * needs an explicit `typeof` guard rather than relying on a stubbed
 * `window.__X__` short-circuit: under the plain-Node test runtime,
 * `import.meta.env` itself is `undefined`, and `undefined.GEOCODE_PROVIDER`
 * throws rather than evaluating to `undefined`.
 */
function activeProvider() {
  const envValue = typeof import.meta.env !== 'undefined' ? import.meta.env.GEOCODE_PROVIDER : undefined;
  const raw = window.__GEOCODE_PROVIDER__ || envValue || 'nominatim';
  const normalized = String(raw).trim().toLowerCase();
  return normalized === 'google' ? 'google' : 'nominatim';
}

/**
 * Which provider forwardGeocode() will use right now — exported so callers
 * can gate provider-specific side effects (e.g. attribution credits) on the
 * actual provider, without duplicating the env/window read.
 * @returns {'google'|'nominatim'}
 */
export function activeGeocodeProvider() {
  return activeProvider();
}

/**
 * Current camera view rectangle in plain degrees — provider-agnostic input to
 * a geocode viewport bias. Each provider formats this its own way (Google's
 * `bounds=lat,lng|lat,lng`, Nominatim's `viewbox=lon,lat,lon,lat`), so this
 * helper stays a plain data shape rather than a pre-formatted string. Kept
 * local (not imported from annotationResolver.js's `viewportBias`) so this
 * module has no dependency on the annotation subsystem.
 */
export function viewerRectDegrees(viewer) {
  try {
    const rect = viewer?.camera?.computeViewRectangle?.();
    if (!rect) return null;
    const south = Cesium.Math.toDegrees(rect.south);
    const west = Cesium.Math.toDegrees(rect.west);
    const north = Cesium.Math.toDegrees(rect.north);
    const east = Cesium.Math.toDegrees(rect.east);
    if (![south, west, north, east].every(Number.isFinite)) return null;
    return { south, west, north, east };
  } catch {
    return null;
  }
}

/**
 * Geocode a place name with Google's Geocoding API — the pre-existing
 * behavior, unchanged, kept as the `GEOCODE_PROVIDER=google` reversion path.
 */
async function geocodeWithGoogle(query, { viewportBias, signal } = {}) {
  const envKey = typeof import.meta.env !== 'undefined' ? import.meta.env.GOOGLE_MAPS_API_KEY : undefined;
  const apiKey = window.__GOOGLE_MAPS_API_KEY__ || envKey;
  if (!apiKey) throw new Error('No Google Maps API key available for geocoding');

  let url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(query)}&key=${apiKey}`;
  if (viewportBias) {
    const { south, west, north, east } = viewportBias;
    url += `&bounds=${south.toFixed(4)},${west.toFixed(4)}|${north.toFixed(4)},${east.toFixed(4)}`;
  }
  const response = await fetch(url, { signal });
  const data = await response.json();
  const result = (data.status === 'OK' && data.results?.length) ? data.results[0] : null;
  if (!result) return null;
  return {
    lat: result.geometry.location.lat,
    lng: result.geometry.location.lng,
    label: result.formatted_address || query,
    types: result.types || [],
    viewport: result.geometry.bounds || result.geometry.viewport || null,
  };
}

/**
 * Map a Nominatim result's `addresstype`/`class`/`place_rank` to the Google
 * `types[]` vocabulary that geocodeNavigationMode() already switches on.
 * Only needs to be right enough to select the correct navigation-mode
 * bucket — it does not reproduce Google's full taxonomy.
 *
 * Rank reference (nominatim.org/release-docs/latest/customize/Ranking/):
 * country=4, state/region=5-9, county=10-12, city/town/village=13-16,
 * suburb/neighbourhood=17-24, street=26-27, POI/building=30.
 */
export function nominatimTypesToGoogle(hit) {
  const rank = Number(hit?.place_rank);
  const addressType = String(hit?.addresstype || '').toLowerCase();
  const cls = String(hit?.class || '').toLowerCase();

  if (rank === 4 || addressType === 'country') return ['country'];
  if (rank >= 5 && rank <= 9) return ['administrative_area_level_1'];
  if (rank >= 10 && rank <= 12) return ['administrative_area_level_2'];
  if ((rank >= 13 && rank <= 16) || ['city', 'town', 'village'].includes(addressType)) {
    return ['locality'];
  }
  if ((rank >= 17 && rank <= 24) || ['suburb', 'neighbourhood'].includes(addressType)) {
    return ['neighborhood'];
  }
  if (cls === 'highway') return ['route'];
  if (
    cls === 'leisure'
    || cls === 'natural'
    || ['university', 'airport', 'stadium'].includes(addressType)
  ) {
    return ['park'];
  }
  return [];
}

/** Nominatim's `[min_lat, max_lat, min_lon, max_lon]` string array → the
 *  {southwest,northeast} shape flyToViewportBounds/viewportMetrics expect. */
export function nominatimBoundingBoxToViewport(boundingbox) {
  if (!Array.isArray(boundingbox) || boundingbox.length !== 4) return null;
  const [minLat, maxLat, minLon, maxLon] = boundingbox.map(Number);
  if (![minLat, maxLat, minLon, maxLon].every(Number.isFinite)) return null;
  return {
    southwest: { lat: minLat, lng: minLon },
    northeast: { lat: maxLat, lng: maxLon },
  };
}

/**
 * Geocode a place name via the server-side Nominatim proxy (/api/nominatim/
 * search — see vite.config.js's nominatimSearchProxy(), which owns the
 * required User-Agent header and the ≥1100ms request spacing Nominatim's
 * usage policy requires). No API key needed.
 */
async function geocodeWithNominatim(query, { viewportBias, signal } = {}) {
  const params = new URLSearchParams({ q: query });
  if (viewportBias) {
    const { south, west, north, east } = viewportBias;
    // Nominatim's viewbox is lon,lat,lon,lat (top-left, bottom-right) and is a
    // ranking bias only unless bounded=1 is set — we deliberately leave it
    // unbounded so a real match outside the current view is not excluded,
    // mirroring Google's `bounds` being a bias too.
    params.set('viewbox', `${west},${north},${east},${south}`);
  }
  const response = await fetch(`/api/nominatim/search?${params}`, { signal });
  if (!response.ok) return null;
  const results = await response.json();
  const hit = Array.isArray(results) ? results[0] : null;
  if (!hit) return null;
  const lat = Number(hit.lat);
  const lng = Number(hit.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return {
    lat,
    lng,
    label: hit.display_name || query,
    types: nominatimTypesToGoogle(hit),
    viewport: nominatimBoundingBoxToViewport(hit.boundingbox),
  };
}

/**
 * Forward-geocode a place name through whichever provider is active
 * (GEOCODE_PROVIDER, default 'nominatim'). Returns
 * `{ lat, lng, label, types, viewport }` — the same shape either provider
 * would have produced under the pre-existing Google-only code — or `null`
 * when nothing matched.
 *
 * @param {string} query
 * @param {{viewportBias?: {south:number,west:number,north:number,east:number}|null, signal?: AbortSignal}} [options]
 */
export async function forwardGeocode(query, options = {}) {
  const geocode = activeProvider() === 'google' ? geocodeWithGoogle : geocodeWithNominatim;
  return geocode(query, options);
}
