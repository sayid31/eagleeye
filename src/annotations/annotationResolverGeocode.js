// Moved out of annotationResolver.js (annotationResolverGeocode).

import { approximateDistanceM } from './annotationRingGeometry.js';
import { cacheRead, cacheWrite, negCache } from './annotationResolverCache.js';
import { MIN_DRIFT_FLOOR_KM, PLACES_MAX_DISTANCE_M, geocodeCache, placesCache } from './annotationResolverConstants.js';
import { viewportProximity } from './annotationResolverFootprint.js';
import { pickWorldFromScreen, shortLabel } from './annotationResolverWorld.js';

/**
 * Forward-geocode a place name via Google Geocoding, biased to the current
 * viewport so "the marina" resolves near where the user is looking.
 */
export async function geocodePlace(query, biasRect, signal) {
  const apiKey = window.__GOOGLE_MAPS_API_KEY__ || import.meta.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) return null;

  const cacheKey = `${query.toLowerCase()}|${biasRect || ''}`;
  const cached = cacheRead(geocodeCache, cacheKey);
  if (cached !== undefined) return cached;

  let url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(query)}&key=${apiKey}`;
  if (biasRect) url += `&bounds=${biasRect}`;

  try {
    const response = await fetch(url, { signal });
    const data = await response.json();
    if (data.status !== 'OK' || !data.results?.length) {
      // ZERO_RESULTS is a definitive not-found (cacheable); OVER_QUERY_LIMIT /
      // REQUEST_DENIED / UNKNOWN_ERROR are transient → don't poison the cache.
      negCache(geocodeCache, cacheKey, signal, data?.status === 'ZERO_RESULTS');
      return null;
    }
    const result = data.results[0];
    const place = {
      lat: result.geometry.location.lat,
      lon: result.geometry.location.lng,
      label: shortLabel(result.formatted_address),
      // The CANONICAL name of the resolved feature (e.g. "Mission District",
      // "Texas State Capitol") — used for OSM name-matching instead of the raw
      // utterance, so incidental tokens ("...Texas", "...Austin") can't win.
      primaryName: extractPrimaryName(result),
      types: result.types || [],
      // Geocode viewport (sw/ne box framing the feature), normalized to the Places
      // low/high shape — sizes grounds discs and flyTo framing for geocode anchors.
      viewport: normalizeGeocodeViewport(result.geometry?.bounds || result.geometry?.viewport),
    };
    cacheWrite(geocodeCache, cacheKey, place);
    return place;
  } catch {
    negCache(geocodeCache, cacheKey, signal, false); // network/abort — transient
    return null;
  }
}

/** Geocoding returns {southwest:{lat,lng},northeast:{lat,lng}}; normalize to the Places
 *  {low,high} lat/lng shape the rest of the pipeline (disc sizing, framing) consumes. */
function normalizeGeocodeViewport(vp) {
  const sw = vp?.southwest;
  const ne = vp?.northeast;
  if (![sw?.lat, sw?.lng, ne?.lat, ne?.lng].every(Number.isFinite)) return null;
  return {
    low: { latitude: sw.lat, longitude: sw.lng },
    high: { latitude: ne.lat, longitude: ne.lng },
  };
}

/**
 * View-biased Google Places TEXT SEARCH for a named landmark/POI. Geocoding
 * scatters obscure monument/POI names across the city; a Text Search biased to
 * the view centre lands on the ACTUAL feature near what the user is looking at.
 * Goes through the `/api/google/text-search` proxy (key stays server-side) and
 * returns the closest result, or null on no-match / transient failure. The
 * `viewport` (a lat/lng bounding box framing the place, or null) is carried
 * through so the resolver can SIZE a fallback grounds disc to the real feature.
 * @returns {Promise<null | { lat:number, lon:number, label:string|null, distanceM:number,
 *   viewport:{low:{latitude:number,longitude:number},high:{latitude:number,longitude:number}}|null }>}
 */
export async function placesTextSearch(query, centerLat, centerLon, radiusM, signal) {
  const q = String(query || '').trim();
  if (!q || !Number.isFinite(centerLat) || !Number.isFinite(centerLon)) return null;

  const cacheKey = `${q.toLowerCase()}|${centerLat.toFixed(3)},${centerLon.toFixed(3)}|${radiusM}`;
  const cached = cacheRead(placesCache, cacheKey);
  if (cached !== undefined) return cached;

  const params = new URLSearchParams({
    q,
    lat: String(centerLat),
    lon: String(centerLon),
    radiusM: String(radiusM),
  });
  try {
    const response = await fetch(`/api/google/text-search?${params}`, { signal });
    if (!response.ok) { negCache(placesCache, cacheKey, signal, false); return null; } // transient
    const data = await response.json();
    const hit = Array.isArray(data?.places)
      ? data.places.find((p) => Number.isFinite(p?.latitude) && Number.isFinite(p?.longitude))
      : null;
    if (!hit) { negCache(placesCache, cacheKey, signal, true); return null; } // definitive no-match
    const place = {
      lat: hit.latitude,
      lon: hit.longitude,
      label: hit.name || null,
      distanceM: approximateDistanceM(centerLat, centerLon, hit.latitude, hit.longitude),
      viewport: hit.viewport || null,
      // Entity identity/classification — the proxy already pays for these in its field
      // mask, so keep them: `primaryType`/`types` classify the feature (point-like
      // monument vs compound) and `id` is a stable identity key for future caching/dedup.
      id: hit.id || null,
      primaryType: hit.primaryType || null,
      types: Array.isArray(hit.types) ? hit.types : [],
    };
    cacheWrite(placesCache, cacheKey, place);
    return place;
  } catch {
    negCache(placesCache, cacheKey, signal, false); // network/abort — transient
    return null;
  }
}

/**
 * The canonical name of the geocoded feature: the address component whose own
 * types match the result's feature type (e.g. the `neighborhood` component for a
 * neighborhood result), falling back to the first component / leading label
 * token. This is the user's INTENT, stripped of the trailing admin context that
 * makes the raw utterance match the wrong-scope OSM feature.
 */
function extractPrimaryName(result) {
  const resultTypes = new Set((result.types || []).map((t) => String(t).toLowerCase()));
  const comps = Array.isArray(result.address_components) ? result.address_components : [];
  for (const c of comps) {
    const ct = (c.types || []).map((t) => String(t).toLowerCase());
    if (ct.some((t) => t !== 'political' && resultTypes.has(t))) return c.long_name;
  }
  if (comps[0]?.long_name) return comps[0].long_name;
  return String(result.formatted_address || '').split(',')[0].trim() || null;
}

/**
 * Map the Google geocode `types` to a resolution SCOPE so we fetch the right
 * OSM feature at the right size. Country-agnostic: scope only selects the query
 * strategy; the specific admin level is found by name within `is_in` results.
 */
export function scopeFromTypes(types) {
  const t = new Set((types || []).map((s) => String(s).toLowerCase()));
  if (t.has('country')) return 'country';
  if (t.has('administrative_area_level_1')) return 'state';
  if (t.has('administrative_area_level_2') || t.has('administrative_area_level_3')) return 'county';
  if (t.has('locality') || t.has('postal_town')) return 'city';
  if (t.has('sublocality') || t.has('sublocality_level_1') || t.has('neighborhood')) return 'neighborhood';
  if (t.has('route') || t.has('intersection')) return 'street';
  if (t.has('premise') || t.has('subpremise') || t.has('street_address')) return 'building';
  if (t.has('shopping_mall') || t.has('university') || t.has('hospital') || t.has('airport')
      || t.has('park') || t.has('stadium') || t.has('amusement_park') || t.has('campus')
      || t.has('zoo') || t.has('cemetery') || t.has('tourist_attraction')) return 'compound';
  // Lakes / reservoirs / mountains: compound-sized natural areas (caps their footprint
  // at the 60 km² compound bound instead of leaving 'auto' uncapped).
  if (t.has('natural_feature')) return 'compound';
  return 'auto';
}

/**
 * Broad administrative scope explicitly stated by the ask, or null. Structured
 * entityKind facts take precedence over wording; every kind in today's voice tool
 * schema is non-admin, while the admin cases keep forward-compatible handling for
 * a future schema addition. Geocode result types are deliberately not an input.
 */
export function adminScopeFromAsk(target, entityKind) {
  if (typeof entityKind === 'string' && entityKind.trim()) {
    const kind = entityKind.trim().toLowerCase();
    return kind === 'country' || kind === 'state' || kind === 'county' ? kind : null;
  }

  const ask = String(target || '').trim().toLowerCase();
  if (/\b(?:country|nation)\s+of\s+\S/.test(ask)) return 'country';
  if (/^(?:the\s+)?state\s+of\s+\S/.test(ask)) return 'state';
  if (/\bcounty\s+of\s+\S/.test(ask) || /\bcounty$/.test(ask)) return 'county';
  return null;
}

/**
 * Refine an UNRESOLVED ('auto') scope with the voice model's `entityKind` — the model's
 * statement of what kind of thing the target IS (an entity fact from the conversation,
 * not a render choice). Real geocode types are data and always win; entityKind only
 * fills the gap they leave (Places-sourced anchors never have geocode types, so they
 * are always 'auto' without this). 'point_feature' is handled by the point-first
 * contract (isPointLikeTarget), not by scope. Exported for tests.
 */
export function refineScope(scope, entityKind) {
  if (scope !== 'auto') return scope;
  if (entityKind === 'building') return 'building';
  if (entityKind === 'compound') return 'compound';
  if (entityKind === 'district') return 'neighborhood';
  if (entityKind === 'street') return 'street';
  return scope;
}

/**
 * View-biased Places recovery for a NAME whose geocode missed or landed implausibly
 * far from what the user is looking at — the searchAndFlyTo twin of the recovery
 * inside resolveAnnotationTarget ("the Capitol" → Washington DC while hovering
 * Austin). When there is no geocode, or it sits more than MIN_DRIFT_FLOOR_KM from
 * the view centre, a Places Text Search biased to the view centre is trusted within
 * PLACES_MAX_DISTANCE_M. A near geocode returns null untouched — local hits keep the
 * plain geocode path. Returns the Places hit
 * ({ lat, lon, label, types, viewport, distanceM, … }) or null.
 */
export async function placesNearViewRecovery(viewer, query, geocoded = null, signal = undefined) {
  const center = pickWorldFromScreen(viewer, 0.5, 0.5) || viewportProximity(viewer);
  if (!center) return null;
  const geocodeFar = !geocoded
    || approximateDistanceM(center.lat, center.lon, geocoded.lat, geocoded.lon) / 1000 > MIN_DRIFT_FLOOR_KM;
  if (!geocodeFar) return null;
  const hit = await placesTextSearch(query, center.lat, center.lon, 6000, signal);
  return (hit && hit.distanceM <= PLACES_MAX_DISTANCE_M) ? hit : null;
}
