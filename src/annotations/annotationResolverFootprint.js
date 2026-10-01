// Moved out of annotationResolver.js (annotationResolverFootprint).

import { approximateAreaM2, approximateDistanceM, closeRing, elementCoordinates, normalizedWords, pointInPolygon, ringCentroid, wordOverlap } from './annotationRingGeometry.js';
import * as Cesium from 'cesium';
import { cacheRead, cacheWrite, negCache } from './annotationResolverCache.js';
import { ENCLOSING_RADIUS_M, MONUMENT_RADIUS_M, POINTLIKE_AREA_CAP_M2, SCOPE_AREA_CAP_M2, enclosingAreaCache, footprintCache, monumentCache, monumentInflight } from './annotationResolverConstants.js';
import { isRateLimitedOutcome, overpassJson } from './annotationResolverOverpass.js';
import { ringAreaM2 } from './annotationResolverScope.js';

/**
 * Fetch the best-matching OSM polygon near a point and classify it as a single
 * `building` (small footprint, gets extruded into a volume) or an `area` (a
 * named district / campus / compound / park, draped as a flat outline).
 *
 * Buildings are searched in a tight radius; areas use a wide radius because a
 * named compound like the Presidio (~6 km²) has its boundary nodes well over a
 * kilometre from the geocoded centroid. `out geom` returns full geometry for any
 * way/relation with a node inside the radius. NAMED water bodies (lakes /
 * reservoirs, `natural=water`) are first-class candidates: without them the true
 * feature for "Lady Bird Lake" is never in the set and a shoreline park NAMED
 * AFTER the lake wins on word overlap instead (field test 9).
 *
 * Selection `mode`:
 *   'loose'  — default word-overlap scoring (generic POIs/compounds).
 *   'strict' — named, non-building, district-sized areas only (neighborhood fallback).
 *   'point'  — point-like targets: (almost) exactly-named, monument-scale polygons only.
 *
 * @returns {Promise<null | { ring: Array<[number,number]>, kind: 'building'|'area', heightM: number|null }>}
 */
export async function fetchFootprint(lat, lon, query, scope, signal, mode = 'loose') {
  // The resolution MODE changes what counts as a match, so it must be part of the
  // key — otherwise a loose lookup's building could be returned for a strict
  // neighborhood (or point-like) lookup at the same rounded coord/name, or vice-versa.
  const cacheKey = `fp|${mode}|${lat.toFixed(5)},${lon.toFixed(5)}|${query.toLowerCase()}`;
  const cachedFp = cacheRead(footprintCache, cacheKey);
  if (cachedFp !== undefined) return cachedFp;

  // `out geom` (not `out tags geom`) so relation members come back WITH their
  // way geometry — needed to trace multipolygon compounds like the Presidio.
  const overpassQuery = `
    [out:json][timeout:25];
    (
      way(around:320,${lat},${lon})["building"];
      relation(around:320,${lat},${lon})["building"];
      way(around:1800,${lat},${lon})["landuse"];
      relation(around:1800,${lat},${lon})["landuse"];
      way(around:1800,${lat},${lon})["leisure"];
      relation(around:1800,${lat},${lon})["leisure"];
      way(around:1800,${lat},${lon})["aeroway"="aerodrome"];
      relation(around:1800,${lat},${lon})["aeroway"="aerodrome"];
      way(around:1800,${lat},${lon})["natural"="water"]["name"];
      relation(around:1800,${lat},${lon})["natural"="water"]["name"]["type"="multipolygon"];
      way(around:1200,${lat},${lon})["shop"="mall"];
      relation(around:1200,${lat},${lon})["shop"="mall"];
      way(around:800,${lat},${lon})["amenity"];
      way(around:800,${lat},${lon})["tourism"];
    );
    out geom;
  `;

  const elements = await overpassJson(overpassQuery, 12000, signal);
  if (isRateLimitedOutcome(elements)) return elements;
  if (elements === null || signal?.aborted) return undefined;
  const fp = selectFootprint(elements, lat, lon, query, mode);
  if (fp) {
    cacheWrite(footprintCache, cacheKey, fp); // positive footprint — always cacheable
    return fp;
  }
  negCache(footprintCache, cacheKey, signal, true); // got a response, no match → definitive
  return null;
}

/**
 * Find the REAL enclosing "grounds / compound / campus" polygon containing a point
 * — the smallest NAMED, NON-building `leisure` / `landuse` / `boundary` / `amenity`
 * / `natural=water` polygon that geometrically CONTAINS it. (Water is in the sweep
 * because a lake asked for as a compound — "Lady Bird Lake", entityKind:compound —
 * anchors IN the water; without the tag it could never match.) This is "one level
 * up" the spatial
 * hierarchy from a building (e.g. the Texas Capitol dome → "Capitol Square",
 * leisure=park). OSM has no deterministic "parent polygon" call and the canonical
 * compound name is rarely what the user utters ("grounds", not "Capitol Square"),
 * so SELECTION is by containment → smallest area, with a name-match only as a
 * tiebreak BONUS (never a filter). See docs/compound-containment-research.md §1.4–1.5.
 *
 * Modeled on fetchLocalMonument: a 12 s fail-fast (an enrichment, not worth blocking
 * narration — and narration no longer waits on it since outlines went progressive, so
 * the budget can absorb a slow Overpass mirror instead of stranding the mark a point),
 * and the result cached by ~1 km coord bucket so a whole grounds batch costs ONE
 * query. Follows the file's tri-state convention:
 *   - `{ ring, kind:'area', heightM:null }` (synthesized:false — a REAL footprint),
 *   - `null` on a DEFINITIVE no-enclosing-polygon (got a response, nothing contained), or
 *   - `undefined` on a TRANSIENT Overpass failure (timeout / network — a retry may yet find it).
 *
 * @returns {Promise<undefined | null | { ring: Array<[number,number]>, kind: 'area', heightM: null }>}
 */
export async function fetchEnclosingArea(lat, lon, signal, query = '') {
  const cacheKey = `${lat.toFixed(2)},${lon.toFixed(2)}`; // ~1 km buckets — grounds annotations share one
  const cached = cacheRead(enclosingAreaCache, cacheKey);
  if (cached !== undefined) return cached;

  // Named non-building polygons near the point. `out geom` returns inline geometry so it
  // stitches with elementCoordinates/stitchRing (multipolygon outers). Buildings are EXCLUDED
  // in JS below (a tag filter can't drop a relation whose members include a building).
  const q = `
    [out:json][timeout:25];
    (
      way(around:${ENCLOSING_RADIUS_M},${lat},${lon})["leisure"]["name"];
      relation(around:${ENCLOSING_RADIUS_M},${lat},${lon})["leisure"]["name"]["type"="multipolygon"];
      way(around:${ENCLOSING_RADIUS_M},${lat},${lon})["landuse"]["name"];
      relation(around:${ENCLOSING_RADIUS_M},${lat},${lon})["landuse"]["name"]["type"="multipolygon"];
      way(around:${ENCLOSING_RADIUS_M},${lat},${lon})["boundary"]["name"];
      relation(around:${ENCLOSING_RADIUS_M},${lat},${lon})["boundary"]["name"];
      way(around:${ENCLOSING_RADIUS_M},${lat},${lon})["amenity"]["name"];
      relation(around:${ENCLOSING_RADIUS_M},${lat},${lon})["amenity"]["name"]["type"="multipolygon"];
      way(around:${ENCLOSING_RADIUS_M},${lat},${lon})["natural"="water"]["name"];
      relation(around:${ENCLOSING_RADIUS_M},${lat},${lon})["natural"="water"]["name"]["type"="multipolygon"];
    );
    out geom;
  `;
  // Fail-fast budget: an opportunistic enrichment, not worth blocking on a hung Overpass —
  // but generous enough (12 s ≈ the footprint fetch budget) that an ordinary slow mirror
  // doesn't strand a grounds mark as a point. overpassJson returns null on a transient
  // failure (timeout/502).
  const elements = await overpassJson(q, 12000, signal);
  if (isRateLimitedOutcome(elements)) return elements;
  if (elements === null) return undefined; // transient upstream failure (vs [] = definitive no-match)

  const queryWords = normalizedWords(query);
  let best = null; // smallest CONTAINING candidate
  let bestArea = Infinity;
  let bestNameMatch = false;
  for (const el of elements) {
    if (el.tags?.building) continue; // exclude buildings (the exact feature, never the grounds)
    const coords = elementCoordinates(el);
    if (coords.length < 3) continue;
    if (!pointInPolygon(lon, lat, coords)) continue; // require genuine containment
    const ringLonLat = closeRing(coords.map((p) => [p.lon, p.lat]));
    const areaM2 = ringAreaM2(ringLonLat);
    if (areaM2 <= 0) continue;
    if (areaM2 > SCOPE_AREA_CAP_M2.compound) continue; // too big to be "the compound"
    // Name-match is a TIEBREAK BONUS, not a filter: at (near-)equal area, prefer a candidate the
    // user's words actually name. Smallest-area still dominates — containment + min-area is what
    // makes the Capitol land on "Capitol Square" even though the user said "grounds".
    const nameWords = normalizedWords([
      el.tags?.name, el.tags?.['name:en'], el.tags?.official_name, el.tags?.alt_name,
    ].filter(Boolean).join(' '));
    const nameMatch = wordOverlap(queryWords, nameWords) > 0;
    const better = areaM2 < bestArea * 0.999
      || (areaM2 <= bestArea * 1.05 && nameMatch && !bestNameMatch); // near-tie: name-match wins
    if (better) {
      best = { ring: ringLonLat, kind: 'area', heightM: null };
      bestArea = areaM2;
      bestNameMatch = nameMatch;
    }
  }

  // Cache on ANY definitive outcome (a real footprint OR a clean no-match) so a whole grounds batch
  // makes at most ONE call. A transient (`undefined`) already returned above without caching.
  if (best) { cacheWrite(enclosingAreaCache, cacheKey, best); return best; }
  negCache(enclosingAreaCache, cacheKey, signal, true); // got a response, nothing contained → definitive
  return null;
}

export async function fetchLocalMonument(lat, lon, query, signal) {
  const centerKey = `${lat.toFixed(2)},${lon.toFixed(2)}`; // ~1 km buckets — grounds monuments share one
  let features = cacheRead(monumentCache, centerKey);
  if (features === undefined) {
    // One sweep per bucket even under the engine's CONCURRENT batch resolution: every
    // monument in an annotate() batch awaits the same in-flight promise. The shared fetch
    // deliberately ignores the callers' abort signals (it is bounded by its own 6 s
    // timeout, and one caller's clear() must not kill the others' snap).
    let pending = monumentInflight.get(centerKey);
    if (!pending) {
      const q = `
        [out:json][timeout:20];
        (
          nwr(around:${MONUMENT_RADIUS_M},${lat},${lon})["historic"~"memorial|monument|statue|tomb"];
          nwr(around:${MONUMENT_RADIUS_M},${lat},${lon})["tourism"="artwork"]["name"];
          nwr(around:${MONUMENT_RADIUS_M},${lat},${lon})["memorial"]["name"];
        );
        out center tags;
      `;
      // Short timeout + fail-fast: this is an opportunistic snap, not worth blocking narration
      // on a slow/overloaded Overpass. overpassJson returns null on a transient failure.
      pending = overpassJson(q, 6000)
        .then((elements) => {
          if (elements === null || isRateLimitedOutcome(elements)) return null; // transient — NEVER cached (a poisoned bucket
          // would silently disable the snap for the whole session, field test 7 §1)
          const feats = [];
          for (const el of elements) {
            const name = el.tags?.name || el.tags?.['name:en'] || el.tags?.official_name || el.tags?.alt_name;
            if (!name) continue;
            const p = Number.isFinite(el.lat) ? { lat: el.lat, lon: el.lon }
              : (el.center ? { lat: el.center.lat, lon: el.center.lon } : null);
            if (!p) continue;
            feats.push({ name, lat: p.lat, lon: p.lon, words: normalizedWords(name) });
          }
          // Definitive outcome (Overpass answered, possibly with zero features) → cacheable.
          cacheWrite(monumentCache, centerKey, feats);
          return feats;
        })
        .finally(() => monumentInflight.delete(centerKey));
      monumentInflight.set(centerKey, pending);
    }
    features = await pending;
    if (features === null) return null; // transient sweep failure → keep the geocode anchor, retry next call
  }
  if (!features.length) return null;
  const qWords = normalizedWords(query);
  if (!qWords.size) return null;
  // Best match: the feature whose name is MOSTLY covered by the query (so "Tejano Monument"
  // doesn't match "Texas African American History Memorial", and a bare "the monument" matches
  // nothing). completeness = how much of the feature name the query accounts for.
  let best = null;
  let bestScore = 0;
  for (const f of features) {
    const overlap = wordOverlap(f.words, qWords);
    if (!overlap) continue;
    const completeness = f.words.size ? overlap / f.words.size : 0;
    if (completeness < 0.6) continue;
    const score = overlap * 10 + completeness;
    if (score > bestScore) { bestScore = score; best = f; }
  }
  return best ? { lat: best.lat, lon: best.lon, label: best.name } : null;
}

/**
 * Pick the best OSM polygon for a query from raw Overpass elements. `mode` selects the
 * acceptance contract ('loose' | 'strict' | 'point' — see fetchFootprint). Exported for
 * the unit tests, which pin the mode contracts with fixtures captured from live data.
 */
export function selectFootprint(elements, targetLat, targetLon, query, mode = 'loose') {
  const requireName = mode === 'strict';
  const queryWords = normalizedWords(query);
  let best = null;
  let bestScore = -Infinity;

  for (const element of elements) {
    const coords = elementCoordinates(element);
    if (coords.length < 3) continue;

    const tags = element.tags || {};
    const isBuilding = Boolean(tags.building);
    const areaM2 = approximateAreaM2(coords);

    const nameWords = normalizedWords([
      tags.name, tags['name:en'], tags.official_name, tags.alt_name, tags.short_name,
    ].filter(Boolean).join(' '));
    const nameOverlap = wordOverlap(queryWords, nameWords);
    // How completely the query covers this feature's name (1.0 ≈ exact match).
    const completeness = nameWords.size ? nameOverlap / nameWords.size : 0;
    const named = nameOverlap > 0;
    // Admin/neighborhood fallback (requireName): accept only a NAMED, non-building
    // AREA of district size (≥0.3 km², e.g. the Presidio's landuse). A neighborhood
    // is never a single building or a tiny parcel, so a building named "Mission ..."
    // or a 0.01 km² lot must not stand in for it — better an honest labeled point.
    if (requireName && (!named || isBuilding || areaM2 < 300_000)) continue;
    // Point-like contract: a polygon may stand in for a monument/statue/memorial ONLY
    // when it clearly IS that feature — most of the query names it (intentCoverage) AND
    // the query accounts for most of ITS name (completeness) AND it is monument-scale.
    // Bare word overlap must not qualify: "Thompson Austin" shares only the locality
    // token with "Tejano Monument, Austin" and outscored everything under loose scoring
    // (field test 7 §1). No qualifying polygon → null → the honest point anchor stays.
    if (mode === 'point') {
      const intentCoverage = queryWords.size ? nameOverlap / queryWords.size : 0;
      if (!named || intentCoverage < 0.5 || completeness < 0.6) continue;
      if (areaM2 > POINTLIKE_AREA_CAP_M2) continue;
    }

    // Size gating: buildings are small; areas can be large but only when named
    // (so "Presidio" can match a 6 km² compound without grabbing a whole city).
    if (isBuilding) {
      if (areaM2 < 40 || areaM2 > 400_000) continue;
    } else {
      if (areaM2 < 200) continue;
      if (!named && areaM2 > 600_000) continue;
      if (named && areaM2 > 80_000_000) continue;
    }

    const contains = pointInPolygon(targetLon, targetLat, coords);
    const centroid = ringCentroid(coords.map((p) => [p.lon, p.lat]));
    const distanceM = centroid
      ? approximateDistanceM(targetLat, targetLon, centroid.lat, centroid.lon)
      : 9999;

    // Name match dominates; completeness breaks ties so the feature literally
    // named "Presidio" beats a building that merely contains the word. Size is
    // only a mild tiebreak now (no hard penalty against large named areas).
    let score = nameOverlap * 1000
      + completeness * 600
      + (contains ? 450 : 0)
      - distanceM * 0.25
      - Math.sqrt(areaM2) * 0.05;

    // With no name match at all, prefer a precise building over a vague blob.
    if (!named && isBuilding && contains) score += 250;

    if (score > bestScore) {
      bestScore = score;
      best = {
        ring: closeRing(coords.map((p) => [p.lon, p.lat])),
        kind: isBuilding ? 'building' : 'area',
        heightM: isBuilding ? buildingHeightFromTags(tags, areaM2) : null,
      };
    }
  }

  return best;
}

/** Estimate a building's height (m) from OSM tags, falling back to footprint size. */
function buildingHeightFromTags(tags, areaM2) {
  const explicit = parseMeters(tags.height || tags['building:height']);
  if (explicit) return explicit;
  const levels = Number.parseFloat(tags['building:levels']);
  const roof = parseMeters(tags['roof:height']) || 0;
  if (Number.isFinite(levels) && levels > 0) return levels * 3.3 + roof;
  const side = Math.sqrt(Math.max(1, areaM2));
  return Math.max(10, Math.min(70, side * 0.6));
}

function parseMeters(value) {
  if (value == null) return 0;
  const n = Number.parseFloat(String(value).replace(',', '.'));
  if (!Number.isFinite(n) || n <= 0) return 0;
  return /\b(ft|feet|foot)\b/i.test(String(value)) ? n * 0.3048 : n;
}

// --- viewer helpers ---------------------------------------------------------

/**
 * Current view rectangle as a Google `bounds` string `swLat,swLng|neLat,neLng`,
 * used to bias geocoding toward what the user is looking at.
 */
/**
 * The current view as a center + radius (km), feeding the geocode proximity gate: a named place
 * that resolved much farther than this radius from center is rejected as a wrong match.
 *
 * Center is the CAMERA SUBPOINT (its lon/lat), not the view-rectangle center — the subpoint is
 * always available, whereas computeViewRectangle() returns undefined exactly when the user is in
 * the common low/oblique view with the horizon in frame (which is when the bad geocodes bite).
 * Radius is scaled from camera height (a generous proxy for how much ground is on screen), with a
 * floor so a super-zoomed-in view doesn't over-reject genuinely nearby places.
 */
export function viewportProximity(viewer) {
  try {
    const carto = viewer?.camera?.positionCartographic;
    if (!carto) return null;
    const lat = Cesium.Math.toDegrees(carto.latitude);
    const lon = Cesium.Math.toDegrees(carto.longitude);
    const radiusKm = Math.max((carto.height / 1000) * 3, 5);
    if (![lat, lon, radiusKm].every(Number.isFinite)) return null;
    return { lat, lon, radiusKm };
  } catch {
    return null;
  }
}

/** Exported for searchAndFlyTo (src/locations.js), which shares this bias. */
export function viewportBias(viewer) {
  try {
    const rect = viewer?.camera?.computeViewRectangle?.();
    if (!rect) return null;
    const swLat = Cesium.Math.toDegrees(rect.south).toFixed(4);
    const swLng = Cesium.Math.toDegrees(rect.west).toFixed(4);
    const neLat = Cesium.Math.toDegrees(rect.north).toFixed(4);
    const neLng = Cesium.Math.toDegrees(rect.east).toFixed(4);
    if ([swLat, swLng, neLat, neLng].some((v) => v === 'NaN')) return null;
    return `${swLat},${swLng}|${neLat},${neLng}`;
  } catch {
    return null;
  }
}
