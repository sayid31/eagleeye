// Moved out of annotationResolver.js (annotationResolverOverpass).

import { approximateAreaM2, bufferCorridor, closeRing, elementCoordinates, normalizedWords, pointInPolygon, simplifyRing, stitchLine, wordOverlap } from './annotationRingGeometry.js';
import { cacheRead, cacheWrite, linkAbort, negCache } from './annotationResolverCache.js';
import { footprintCache } from './annotationResolverConstants.js';
import { exceedsScopeArea } from './annotationResolverScope.js';

/** True when an HTTP-200 Overpass body actually signals a runtime FAILURE (server-side
 *  timeout / out-of-memory) via its `remark` — a transient error, not an authoritative
 *  empty result, so callers must not cache it as a definitive not-found. */
function overpassHasError(data) {
  const remark = String(data?.remark || '').toLowerCase();
  return remark.includes('runtime error') || remark.includes('timed out') || remark.includes('out of memory');
}

/** A distinct Overpass throttle result that must not enter the ordinary transient ladder. */
export function isRateLimitedOutcome(value) {
  return value?.rateLimited === true;
}

/** Parse Retry-After seconds or an HTTP date into a non-negative millisecond delay. */
function parseRetryAfterMs(value) {
  if (value == null || String(value).trim() === '') return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.ceil(seconds * 1000);
  const at = Date.parse(String(value));
  return Number.isFinite(at) ? Math.max(0, at - Date.now()) : null;
}

/** POST an Overpass QL query and return elements, a transient null, or a throttle object. */
export async function overpassJson(query, timeoutMs = 14000, signal) {
  const controller = new AbortController();
  const detach = linkAbort(controller, signal);
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch('/api/overpass', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `data=${encodeURIComponent(query)}`,
      signal: controller.signal,
    });
    const retryAfter = res.headers?.get?.('Retry-After');
    if (res.status === 429 || (res.status === 503 && retryAfter != null)) {
      return { rateLimited: true, retryAfterMs: parseRetryAfterMs(retryAfter) };
    }
    if (!res.ok) return null;
    const data = await res.json();
    if (overpassHasError(data)) return null; // 200 with a body-level timeout/error → transient
    return Array.isArray(data?.elements) ? data.elements : null;
  } catch {
    return null;
  } finally {
    window.clearTimeout(timer);
    detach();
  }
}

/**
 * Resolve an administrative boundary (country/state/county/city/neighborhood).
 * `is_in(point)` returns every admin area containing the point at all levels;
 * we pick the one whose NAME best matches the query (country-agnostic — no need
 * to know each country's admin_level mapping), pivot it to its relation, and
 * simplify the outline so even a state/country draws cleanly.
 */
export async function fetchAdminArea(lat, lon, query, scope, signal) {
  // Scope changes both the name-matching bias and the fallback strategy (only
  // neighborhood runs the place=/named-landuse fallback), so it must be in the key —
  // else a city-scope definitive null would suppress a later neighborhood lookup's
  // fetchPlaceArea recovery at the same rounded point.
  const cacheKey = `admin|${scope}|${lat.toFixed(4)},${lon.toFixed(4)}|${query.toLowerCase()}`;
  const cachedFp = cacheRead(footprintCache, cacheKey);
  if (cachedFp !== undefined) return cachedFp;

  const candidates = await overpassJson(
    `[out:json][timeout:25];is_in(${lat},${lon})->.a;area.a["boundary"="administrative"]["admin_level"];out tags;`,
    14000,
    signal,
  );
  if (isRateLimitedOutcome(candidates)) return candidates;
  if (!candidates) return undefined; // transient upstream failure (vs null = definitive miss)

  const queryWords = normalizedWords(query);
  const scored = [];
  for (const el of candidates) {
    if (el.type !== 'area' || !el.tags) continue;
    // Match against the FULL name set (incl. official_name) so the query can still hit a
    // verbose official name — but score COMPLETENESS against the CORE name only. A long
    // official_name ("City and County of San Francisco") otherwise DILUTES the real
    // boundary's completeness and lets a less-specific duplicate ("San Francisco County")
    // win — which then has no backing relation and collapses the whole resolution to a dot.
    const coreWords = normalizedWords([el.tags.name, el.tags['name:en']].filter(Boolean).join(' '));
    const fullWords = normalizedWords([el.tags.name, el.tags['name:en'], el.tags.official_name].filter(Boolean).join(' '));
    const overlap = wordOverlap(queryWords, fullWords);
    if (!overlap) continue;
    const intentCoverage = queryWords.size ? overlap / queryWords.size : 0;
    // The matched admin area must BE (most of) what the user named — not just share an
    // incidental token ("Texas" inside "Texas State Capitol"). Require ≥ half the
    // canonical-name words, so a wrong-scope admin (the state) is rejected and the
    // footprint fallback gets a chance instead.
    if (intentCoverage < 0.5) continue;
    const coreOverlap = wordOverlap(queryWords, coreWords);
    const completeness = coreWords.size ? coreOverlap / coreWords.size : 0;
    // Exact-name bonus: the candidate whose CORE name set EQUALS the query is the real
    // one (decisively outranks a "<name> County" style duplicate).
    const exactName = coreWords.size === queryWords.size && coreOverlap === queryWords.size;
    const level = Number(el.tags.admin_level) || 99;
    // Bias toward the scope's specificity: city/neighborhood prefer the MORE specific
    // (higher admin_level) match; state/country prefer the broader one.
    let levelBias;
    if (scope === 'city' || scope === 'neighborhood') levelBias = level * 14;
    else if (scope === 'county') levelBias = -Math.abs(level - 6) * 14;
    else levelBias = -level * 14;
    const score = intentCoverage * 1200 + completeness * 500 + (exactName ? 900 : 0) + levelBias;
    scored.push({ el, score, coverage: intentCoverage });
  }
  // Deterministic order: score desc, then ascending OSM id. Overpass mirrors don't
  // guarantee element order, so without the id tiebreak a score tie could resolve
  // differently per mirror (breaks the "same name → same geometry" invariant).
  scored.sort((a, b) => (b.score - a.score) || (a.el.id - b.el.id));

  const best = scored.length ? scored[0].el : null;
  const bestCoverage = scored.length ? scored[0].coverage : 0;

  // For a neighborhood, a place= polygon is the correct source. Try it whenever there
  // is NO admin match OR the admin only PARTIALLY covers the query — a small city can
  // satisfy a city-suffixed neighborhood ("Berkeley" for "Downtown Berkeley") at 0.5
  // coverage and slip under the area cap, so never accept such a partial admin
  // without first trying the place= polygon (and a named landuse via the caller).
  if (scope === 'neighborhood' && (!best || bestCoverage < 0.8)) {
    const place = await fetchPlaceArea(lat, lon, query, signal);
    if (isRateLimitedOutcome(place)) return place;
    if (place) { cacheWrite(footprintCache, cacheKey, place); return place; }
    if (place === undefined) return undefined; // transient place= lookup → don't cache, retry
    // Definitively no place polygon. Do NOT return a partial-match admin (likely the
    // wrong-scope city); let the caller try a named landuse / honest point.
    negCache(footprintCache, cacheKey, signal, true);
    return null;
  }
  if (!best) {
    negCache(footprintCache, cacheKey, signal, true); // got candidates, none matched → definitive
    return null;
  }

  // Walk candidates best-first until one pivots to a usable admin RELATION. The top
  // scorer can be a duplicate admin AREA with no backing relation (OSM's
  // "San Francisco County" duplicate); fall through to the next rather than giving up.
  // Cap at the top 4 so a pathological is_in (many overlapping admins) can't issue dozens
  // of pivots.
  let transient = false;
  for (const cand of scored.slice(0, 4)) {
    // Client budget must OUTLAST the QL timeout (25 s) + proxy transit: aborting at
    // 16 s turned finishable region pivots (Sicilia's dense coastline) into permanent
    // "transients" — every retry died the same death (field test 2026-07-23). The
    // outline is progressive, so a long budget blocks nothing; repeats are disk-cached.
    const relEls = await overpassJson(`[out:json][timeout:25];area(${cand.el.id})->.x;rel(pivot.x);out geom;`, 28000, signal);
    if (isRateLimitedOutcome(relEls)) return relEls;
    if (relEls === null) { transient = true; break; } // network blip — don't definitively fail
    const relEl = relEls.find((e) => e.type === 'relation');
    if (!relEl) continue; // no relation backing this area — try the next candidate
    const coords = elementCoordinates(relEl);
    if (coords.length < 3) continue; // incomplete geometry — try the next

    let ring = closeRing(coords.map((p) => [p.lon, p.lat]));
    // Simplify: tight for small neighborhoods, looser for states/countries.
    const tolM = scope === 'neighborhood' ? 6 : scope === 'city' ? 12 : scope === 'county' ? 40 : 120;
    ring = simplifyRing(ring, tolM);
    const fp = { ring, kind: 'area', heightM: null };

    // Scope sanity BEFORE caching: a city-suffixed neighborhood name ("Downtown San
    // Francisco") can match the CITY admin. Caching an oversized ring would poison the
    // key and skip the place= fallback forever.
    if (exceedsScopeArea(fp, scope)) {
      if (scope === 'neighborhood') {
        const place = await fetchPlaceArea(lat, lon, query, signal);
        if (isRateLimitedOutcome(place)) return place;
        if (place) { cacheWrite(footprintCache, cacheKey, place); return place; }
        if (place === undefined) return undefined; // transient place= lookup → retry
        negCache(footprintCache, cacheKey, signal, true);
        return null;
      }
      continue; // oversized for this scope — try the next candidate
    }

    cacheWrite(footprintCache, cacheKey, fp);
    return fp;
  }
  // No candidate pivoted to a usable in-scope relation.
  if (transient) return undefined; // network blip during a pivot → don't cache, retry
  // For a neighborhood, an admin match may exist (so the early place= fallback above was
  // skipped) yet fail to yield a usable relation. Consult place= BEFORE declaring a
  // definitive miss, so a null return truly means "no admin AND no place polygon" — the
  // caller relies on that to gate named-landuse fallback / synthesis.
  if (scope === 'neighborhood') {
    const place = await fetchPlaceArea(lat, lon, query, signal);
    if (isRateLimitedOutcome(place)) return place;
    if (place) { cacheWrite(footprintCache, cacheKey, place); return place; }
    if (place === undefined) return undefined; // transient place= lookup → retry
  }
  negCache(footprintCache, cacheKey, signal, true);
  return null;
}

/**
 * Neighborhood fallback: OSM often tags neighborhoods as `place=` areas/relations
 * rather than admin boundaries. Query those near the point and match the canonical
 * name (area-capped so a "neighborhood" never grabs a whole city).
 */
async function fetchPlaceArea(lat, lon, query, signal) {
  const queryWords = normalizedWords(query);
  const els = await overpassJson(
    `[out:json][timeout:20];(`
    + `way(around:1500,${lat},${lon})["place"~"neighbourhood|suburb|quarter|borough"]["name"];`
    + `relation(around:1500,${lat},${lon})["place"~"neighbourhood|suburb|quarter|borough"]["name"];`
    + `relation(around:1500,${lat},${lon})["boundary"="place"]["name"];`
    + `);out tags geom;`,
    14000,
    signal,
  );
  if (isRateLimitedOutcome(els)) return els;
  if (els === null) return undefined; // transient upstream failure (vs [] = no match)
  let bestRing = null;
  let bestScore = 0;
  for (const el of els) {
    const coords = elementCoordinates(el);
    if (coords.length < 3) continue;
    const tags = el.tags || {};
    const nameWords = normalizedWords([tags.name, tags['name:en']].filter(Boolean).join(' '));
    const overlap = wordOverlap(queryWords, nameWords);
    if (!overlap) continue;
    // The OSM place name is usually just the neighborhood ("Downtown", "Chinatown")
    // while the query carries a city suffix ("Downtown San Francisco"). Match on how
    // fully the query covers the FEATURE'S name (not the query) — so a one-word place
    // whose name the query fully contains still wins — then prefer containment.
    const nameCoverage = nameWords.size ? overlap / nameWords.size : 0;
    if (nameCoverage < 0.6) continue;
    if (approximateAreaM2(coords) > 80_000_000) continue; // a neighborhood isn't a city
    const score = nameCoverage * 1000 + (pointInPolygon(lon, lat, coords) ? 400 : 0) + overlap * 50;
    if (score > bestScore) { bestScore = score; bestRing = closeRing(coords.map((p) => [p.lon, p.lat])); }
  }
  return bestRing ? { ring: bestRing, kind: 'area', heightM: null } : null;
}

/**
 * Street → best-available AREA, with graceful degradation:
 *   Tier C — a same-named district / commercial area near the street.
 *   Tier F — buffer the matching street centerline into a corridor ribbon.
 * Always returns an area (or null), never a building.
 */
export async function fetchStreet(lat, lon, query, signal) {
  const cacheKey = `street|${lat.toFixed(4)},${lon.toFixed(4)}|${query.toLowerCase()}`;
  const cachedFp = cacheRead(footprintCache, cacheKey);
  if (cachedFp !== undefined) return cachedFp;
  const queryWords = normalizedWords(query);

  // Tier C — a same-named district / quarter / named commercial area.
  const areaEls = await overpassJson(
    `[out:json][timeout:20];(`
    + `way(around:450,${lat},${lon})["place"~"quarter|neighbourhood|suburb|city_block"];`
    + `relation(around:450,${lat},${lon})["place"~"quarter|neighbourhood|suburb"];`
    + `way(around:450,${lat},${lon})["landuse"~"commercial|retail"]["name"];`
    + `relation(around:450,${lat},${lon})["landuse"~"commercial|retail"]["name"]["type"="multipolygon"];`
    + `);out tags geom;`,
    14000,
    signal,
  );
  if (isRateLimitedOutcome(areaEls)) return areaEls;
  if (areaEls) {
    let bestRing = null;
    let bestScore = 0;
    for (const el of areaEls) {
      const coords = elementCoordinates(el);
      if (coords.length < 3) continue;
      const tags = el.tags || {};
      const nameWords = normalizedWords([tags.name, tags['name:en']].filter(Boolean).join(' '));
      const overlap = wordOverlap(queryWords, nameWords);
      if (!overlap) continue;
      if (approximateAreaM2(coords) > 2_000_000) continue; // a street isn't a whole suburb
      const score = overlap * 1000 + (pointInPolygon(lon, lat, coords) ? 300 : 0);
      if (score > bestScore) { bestScore = score; bestRing = closeRing(coords.map((p) => [p.lon, p.lat])); }
    }
    if (bestRing) {
      const fp = { ring: bestRing, kind: 'area', heightM: null };
      cacheWrite(footprintCache, cacheKey, fp);
      return fp;
    }
  }

  // Tier F — buffer the matching centerline into a corridor ribbon (workhorse).
  const wayEls = await overpassJson(`[out:json][timeout:20];way(around:320,${lat},${lon})["highway"]["name"];out geom;`, 14000, signal);
  if (isRateLimitedOutcome(wayEls)) return wayEls;
  if (wayEls) {
    const segments = [];
    for (const el of wayEls) {
      const tags = el.tags || {};
      const nameWords = normalizedWords([tags.name, tags['name:en']].filter(Boolean).join(' '));
      if (!wordOverlap(queryWords, nameWords)) continue;
      const geom = (el.geometry || []).filter((p) => Number.isFinite(p?.lat) && Number.isFinite(p?.lon));
      if (geom.length >= 2) segments.push(geom.map((p) => [p.lon, p.lat]));
    }
    if (segments.length) {
      const line = stitchLine(segments);
      if (line.length >= 2) {
        const fp = { ring: bufferCorridor(line, 11), kind: 'area', heightM: null };
        cacheWrite(footprintCache, cacheKey, fp);
        return fp;
      }
    }
  }
  // Definitive only if BOTH tier queries actually returned data; a null from
  // either is a transient upstream failure we should not cache — and should
  // report as TRANSIENT (undefined) so the deferred-outline retry re-runs it.
  const definitive = areaEls !== null && wayEls !== null;
  negCache(footprintCache, cacheKey, signal, definitive);
  return definitive ? null : undefined;
}
