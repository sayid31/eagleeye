import { approximateDistanceM, ringCentroid } from './annotationRingGeometry.js';
import { lookupNaturalRegionOutline } from '../data/naturalEarthRegions.js';
import { NATURAL_EARTH_CREDIT, registerDynamicCredit } from '../data/dataCredits.js';
import { lookupNeighborhoodRing } from '../data/neighborhoodPolygons.js';
import { AROUND_LANDMARK_RADIUS_M, MIN_DRIFT_FLOOR_KM, NEIGHBORHOOD_RADIUS_M, PLACES_MAX_DISTANCE_M, VIEWPORT_DRIFT_FACTOR } from './annotationResolverConstants.js';
import { fetchEnclosingArea, fetchFootprint, fetchLocalMonument, viewportBias, viewportProximity } from './annotationResolverFootprint.js';
import { adminScopeFromAsk, geocodePlace, placesTextSearch, refineScope, scopeFromTypes } from './annotationResolverGeocode.js';
import { fetchAdminArea, fetchStreet, isRateLimitedOutcome } from './annotationResolverOverpass.js';
import { exceedsScopeArea, groundsRadiusFromViewport, isGroundsLikeAsk, isGroundsLikeQuery, isMonumentLikeQuery, isPointLikeTarget, synthesizeBufferedArea } from './annotationResolverScope.js';
import { pickWorldFromScreen, sampleGroundHeight } from './annotationResolverWorld.js';

export { selectFootprint, viewportBias } from './annotationResolverFootprint.js';
export { placesNearViewRecovery, refineScope } from './annotationResolverGeocode.js';
export { isRateLimitedOutcome } from './annotationResolverOverpass.js';
export { isGroundsLikeAsk } from './annotationResolverScope.js';
export { resolveRegionRingForQuery } from './annotationResolverWorld.js';

/**
 * Resolve a single annotation target to a normalized world anchor.
 *
 * @param {object} opts
 * @param {Cesium.Viewer} opts.viewer
 * @param {string} [opts.target]      Place name to geocode.
 * @param {number} [opts.latitude]    Explicit latitude (wins over target).
 * @param {number} [opts.longitude]   Explicit longitude.
 * @param {boolean} [opts.footprint]  Try to trace the real OSM outline ring.
 * @param {string} [opts.entityKind]  Voice model's entity FACT ('building'|'compound'|
 *                                    'district'|'street'|'point_feature') — refines scope
 *                                    routing and the point-first contract; never a style choice.
 * @param {boolean} [opts.deferFootprint]  Progressive mode: return the anchor immediately
 *                                    (ring:null) plus a `resolveOutline()` continuation the
 *                                    caller runs AFTER drawing, upgrading the mark in place.
 * @returns {Promise<null | {
 *   lon: number, lat: number, height: number,
 *   ring: Array<[number, number]> | null,
 *   label: string | null, source: string,
 *   viewport: object | null,
 *   resolveOutline?: () => Promise<undefined | null | { rateLimited: true, retryAfterMs: number | null }
 *     | { ring, footprintKind, buildingHeight, synthesized, lat, lon, height }>,
 * }>}
 */
export async function resolveAnnotationTarget({
  viewer, target, latitude, longitude, footprint = false, intent = 'the_thing',
  entityKind = null, labelHint = null, deferFootprint = false, screenX, screenY, signal,
}) {
  let lon = Number(longitude);
  let lat = Number(latitude);
  let label = null;
  let source = 'coordinate';
  let geocodeTypes = [];
  let geocodePrimary = null;
  // The Places `viewport` (lat/lng box framing the resolved place), captured when a
  // Places Text Search anchors the target. Used downstream to SIZE a fallback grounds
  // disc to the real feature instead of a blind GROUNDS_RADIUS_M constant.
  let placeViewport = null;
  // Canonical Places display name + `types` of the anchored feature — the Places
  // analogue of geocodePrimary/geocodeTypes: the name feeds OSM matching stripped of
  // locality suffixes; the types classify the entity (point-like vs area-like).
  let placesPrimary = null;
  let placeTypes = [];
  // Instrumentation (logged once per target at the end): which sources were tried and what they returned.
  const trace = { query: String(target || '').trim(), places: 'skipped', geocode: 'none', osmSnap: 'skipped' };
  // Guard bypass is an ASK-SIDE fact. A returned admin type can be a wrong match
  // ("the Texas Capitol" → the state), so geocode types must never grant it.
  const bypassNearViewGuards = Boolean(adminScopeFromAsk(target, entityKind));

  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    const query = String(target || '').trim();
    if (query) {
      const center = pickWorldFromScreen(viewer, 0.5, 0.5) || viewportProximity(viewer);
      // Monument / grounds names scatter under Geocoding — try a view-biased Places Text Search FIRST.
      // A hit near the view centre is trusted (skips the proximity gate, like the osm-local snap); on a
      // miss we fall through to geocode + fetchLocalMonument below. The model's entityKind counts too:
      // a point_feature by fact ("Heroes of the Alamo" — no monument word) deserves the same path.
      if (center && (isMonumentLikeQuery(query) || isGroundsLikeQuery(query) || entityKind === 'point_feature')) {
        const placeHit = await placesTextSearch(query, center.lat, center.lon, 6000, signal);
        if (placeHit) {
          trace.places = `${placeHit.lat.toFixed(5)},${placeHit.lon.toFixed(5)}`;
          if (placeHit.distanceM <= PLACES_MAX_DISTANCE_M) {
            lat = placeHit.lat;
            lon = placeHit.lon;
            label = placeHit.label;
            placeViewport = placeHit.viewport || null;
            placesPrimary = placeHit.label;
            placeTypes = placeHit.types || [];
            source = 'places';
          }
        } else {
          trace.places = 'miss';
        }
      }
      if (source !== 'places') {
        const geocoded = await geocodePlace(query, viewportBias(viewer), signal);
        if (geocoded) {
          lat = geocoded.lat;
          lon = geocoded.lon;
          label = geocoded.label;
          geocodeTypes = geocoded.types || [];
          geocodePrimary = geocoded.primaryName || null;
          placeViewport = geocoded.viewport || null;
          source = 'geocode';
          trace.geocode = `${geocoded.lat.toFixed(5)},${geocoded.lon.toFixed(5)}`;
        }
        // RECOVERY: a plain landmark ("the Capitol") can Geocode to a FAR city (Washington DC) that the
        // proximity gate would then reject as an honest miss — but the user means the one they're
        // LOOKING AT. If the geocode missed or landed far from the view centre, try a view-biased
        // Places Text Search; a hit within the trust bound overrides + skips the gate. Local geocodes
        // (neighborhoods, nearby buildings) are NOT far, so they keep the geocode + scope/polygon path.
        if (center && trace.places === 'skipped' && !bypassNearViewGuards) {
          let geocodeFar = source !== 'geocode';
          if (source === 'geocode' && approximateDistanceM(center.lat, center.lon, lat, lon) / 1000 > MIN_DRIFT_FLOOR_KM) {
            geocodeFar = true;
          }
          if (geocodeFar) {
            const placeHit = await placesTextSearch(query, center.lat, center.lon, 6000, signal);
            if (placeHit && placeHit.distanceM <= PLACES_MAX_DISTANCE_M) {
              lat = placeHit.lat;
              lon = placeHit.lon;
              label = placeHit.label;
              placeViewport = placeHit.viewport || null;
              placesPrimary = placeHit.label;
              placeTypes = placeHit.types || [];
              geocodeTypes = [];
              geocodePrimary = null;
              source = 'places';
              trace.places = `${placeHit.lat.toFixed(5)},${placeHit.lon.toFixed(5)} (recovery)`;
            } else {
              trace.places = placeHit ? 'far-ignored' : 'miss';
            }
          }
        }
      }
    }
  }

  // Pixel fallback: the agent pointed at the viewport screenshot but the place
  // could not be named/geocoded. Convert the normalized pixel back into a world
  // coordinate via the depth-aware pick cascade, so the mark is STILL
  // world-anchored (it persists and occludes like any other) rather than a
  // transient frame-bound overlay.
  if ((!Number.isFinite(lat) || !Number.isFinite(lon))
      && Number.isFinite(Number(screenX)) && Number.isFinite(Number(screenY))) {
    const picked = pickWorldFromScreen(viewer, Number(screenX), Number(screenY));
    if (picked) {
      lat = picked.lat;
      lon = picked.lon;
      source = 'pixel';
    }
  }

  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;

  // Monument/memorial/statue names geocode unreliably — Google scatters them across the city (e.g.
  // several Texas Capitol monuments landed blocks-to-miles apart, looking "all over the map"). When
  // the target reads like a monument AND the anchor came from a NAME, snap to the actual OSM feature
  // near what the user is LOOKING AT (screen-centre), not the scattered geocode point. A hit becomes
  // an 'osm-local' anchor (near the view by construction, so it skips the proximity gate below).
  if (source === 'geocode' && (isMonumentLikeQuery(target) || entityKind === 'point_feature')) {
    const center = pickWorldFromScreen(viewer, 0.5, 0.5) || viewportProximity(viewer);
    if (center) {
      const mon = await fetchLocalMonument(center.lat, center.lon, target, signal);
      if (mon) {
        lat = mon.lat;
        lon = mon.lon;
        label = label || mon.label;
        source = 'osm-local';
        trace.osmSnap = 'hit';
      } else {
        trace.osmSnap = 'miss';
      }
    }
  }

  // Whether this anchor came from geocoding a NAME (vs. explicit coords / pixel / osm-local). Only
  // name-geocoded anchors are subject to the proximity gate below — coords/pixels/local are trusted.
  const fromGeocode = source === 'geocode';

  // Proximity gate — on the ANCHOR: a NAME that resolved implausibly far from what's currently on
  // screen is almost always a wrong geocoder match (e.g. "Texas Capitol grounds" → a west-Texas
  // admin region ~250 km away). Reject it — an honest "couldn't find it" beats a misleading
  // blob/point off in another region. Zoom-relative + floored so it only fires on egregious drift:
  // zoomed out, far-but-visible places still pass; zoomed way in, nearby landmarks stay safe.
  // Explicit coords / pixel picks / places / osm-local skip this (fromGeocode === false). The
  // footprint resolution below re-checks its own recentered centroid against the same bound — a
  // polygon that would drag a good anchor out of plausibility is dropped (the mark stays an
  // honest point) rather than rejecting the whole annotation.
  const vpGate = viewportProximity(viewer);
  const gateDrift = (gLat, gLon) => {
    if (!vpGate) return null; // no camera info → pass
    const driftKm = approximateDistanceM(vpGate.lat, vpGate.lon, gLat, gLon) / 1000;
    const limitKm = Math.max(VIEWPORT_DRIFT_FACTOR * vpGate.radiusKm, MIN_DRIFT_FLOOR_KM);
    return driftKm > limitKm ? { driftKm, limitKm } : null;
  };
  if (fromGeocode && !bypassNearViewGuards) {
    const drift = gateDrift(lat, lon);
    if (drift) {
      if (trace.query) {
        console.log(
          `[Resolver] "${trace.query}": places=${trace.places} geocode=${trace.geocode} `
          + `osmSnap=${trace.osmSnap} → FINAL source=rejected (proximity gate, ${drift.driftKm.toFixed(0)}km > ${drift.limitKm.toFixed(0)}km)`,
        );
      }
      return null;
    }
  }

  // OSM name-matching key: the resolved feature's CANONICAL name when we have one — the
  // geocoder's primary component, else the Places hit's own display name — falling back to
  // the user's words. Canonical names strip the trailing locality ("Tejano Monument", not
  // "…, Austin"), so incidental city/state tokens can't win the footprint scoring (the
  // Thompson-Austin bug, field test 7). A POI's canonical name can be a bare street number,
  // so anything without letters falls through.
  const usablePrimary = geocodePrimary && /[a-z]/i.test(geocodePrimary) ? geocodePrimary : null;
  const usablePlaces = placesPrimary && /[a-z]/i.test(placesPrimary) ? placesPrimary : null;
  const matchName = usablePrimary || usablePlaces || String(target || '').trim();
  // Scope-route on the geocoder's type so we fetch the RIGHT OSM feature at the right size:
  // an admin boundary for a city/state, the enclosing compound for a mall/campus, a single
  // building for a premise. The voice model's entityKind (an entity FACT) refines an
  // unresolved 'auto' scope only — real geocode types always win.
  const baseScope = refineScope(scopeFromTypes(geocodeTypes), entityKind);
  // Point-like targets (monuments/statues/memorials/…) resolve POINT-FIRST: only an
  // (almost) exactly-named, monument-scale polygon may replace the point; a nearby polygon
  // sharing locality words must not (docs/field-test-rootcause-2026-06-30.md §1).
  const pointLike = isPointLikeTarget(target, entityKind, placeTypes, labelHint);
  // Grounds/compound asks (target OR label wording, or entityKind fact) go outline-first:
  // they reach the real enclosing-polygon sweep even under `around_the_thing` phrasing.
  const groundsLike = isGroundsLikeAsk(target, labelHint, entityKind);

  /**
   * Resolve the footprint/outline for this (already-gated) anchor. Reads the outer locals
   * but never mutates them — tri-state result:
   *   - a complete outline patch `{ ring, footprintKind, buildingHeight, synthesized,
   *     lat, lon, height }` whose lat/lon is the ring centroid, re-checked against the
   *     proximity gate;
   *   - `null` — DEFINITIVELY no polygon (keep the honest point; never retry);
   *   - `undefined` — TRANSIENT upstream failure (timeout / network blip) — a re-run may
   *     yet find the outline, and the /api/overpass proxy caches late completions so the
   *     retry is nearly free (progressive callers back off and re-invoke).
   *   - `{ rateLimited:true, retryAfterMs }` — an HTTP throttle that progressive callers
   *     retry only once, no sooner than both Retry-After and their normal ladder allow.
   * The inline path awaits it right here; progressive callers (deferFootprint) invoke it
   * AFTER the anchor mark is drawn and upgrade the mark in place.
   */
  const resolveOutline = async () => {
    let scope = baseScope;
    const isAdmin = scope === 'country' || scope === 'state' || scope === 'county' || scope === 'city';
    const around = intent === 'around_the_thing';
    // FIRST rung: bundled Natural Earth physical region (Alps, Rockies, Sahara,
    // Gulf of Mexico …) — deterministic, OFFLINE, instant; mirrors the
    // neighborhood-pack rung's philosophy. Two guards: (1) the ASK must NAME a
    // curated region (exact/alias match, no fuzzy stealing — "Zilker Park"
    // can never land here); (2) the geocoded anchor must fall INSIDE the
    // matched ring (ray-cast) — disambiguating duplicate upstream names (US
    // vs Spanish "Sierra Nevada") and blocking a wrong-place geocode from
    // dressing itself in a range-sized ring. Range-scale geometry deliberately
    // BYPASSES the compound/building scope caps and the centroid drift bound
    // below: the region IS the asked scope ("outline the Alps"), the 60 km²
    // compound cap is for campuses (the meadow bug,
    // docs/voice-engine-evaluation-2026-07-23.md §3), and a continental ring's
    // centroid legitimately sits far from any anchor. Admin and street scopes
    // are excluded — "Texas" must keep resolving as an admin boundary.
    if (!isAdmin && scope !== 'street' && !around) {
      const ne = await lookupNaturalRegionOutline(target, lat, lon).catch(() => null);
      if (ne) {
        registerDynamicCredit(viewer, NATURAL_EARTH_CREDIT);
        const neCentroid = ringCentroid(ne.ring);
        return {
          ring: ne.ring,
          footprintKind: 'area',
          buildingHeight: null,
          synthesized: false,
          naturalRegion: ne.name,
          lat: neCentroid?.lat ?? lat,
          lon: neCentroid?.lon ?? lon,
          height: sampleGroundHeight(viewer, neCentroid?.lon ?? lon, neCentroid?.lat ?? lat),
        };
      }
    }
    let fp = null;
    if (around && !groundsLike && !isAdmin && scope !== 'street' && scope !== 'neighborhood') {
      // "the area AROUND <landmark>" → a buffered zone on the centroid, not the exact
      // footprint (research §3d / §8.5). Only for POI/building scopes — a city's or
      // street's "around" is ill-defined, a neighborhood already synthesizes, and a
      // GROUNDS-like ask must not short-circuit here: the model phrases "the Capitol
      // grounds" as around_the_thing, but the grounds ARE the thing — the real enclosing
      // polygon (below) beats a 400 m disc (field test 8's "spherical round one").
      fp = synthesizeBufferedArea(lat, lon, AROUND_LANDMARK_RADIUS_M);
    } else if (isAdmin) {
      // Pure admin: only an admin boundary is correct — never fall back to a
      // building/landuse (a city is never a single building).
      fp = await fetchAdminArea(lat, lon, matchName, scope, signal);
    } else if (scope === 'neighborhood') {
      // FIRST: a bundled neighborhood polygon (reliable, deterministic, OFFLINE — no live
      // Overpass). Covered neighborhoods (e.g. SF: Chinatown/Marina/Mission/Presidio)
      // resolve here instantly to a REAL boundary, sidestepping the slow/flaky live-Overpass
      // path that times out and falls back to points (see docs/field-test-2-analysis.md).
      const ext = await lookupNeighborhoodRing(lat, lon, matchName);
      if (ext) fp = { ring: ext.ring, kind: 'area', heightM: null };
      // Else fall through to the OSM admin/place → named-landuse → synthesis ladder. Each
      // returns a footprint, null (definitively no polygon), or undefined (transient
      // upstream failure). Synthesize a blob (the "Mission" problem, research §3b) ONLY
      // when BOTH sources DEFINITIVELY have no polygon — never on a transient blip.
      if (!fp) {
        let adminFp = await fetchAdminArea(lat, lon, matchName, scope, signal);
        // A neighborhood whose canonical name carries a city suffix ("Presidio of San
        // Francisco") can match the CITY admin; treat an oversized admin as a DEFINITIVE
        // no-neighborhood-polygon so it still falls through to the named-landuse path.
        if (adminFp && exceedsScopeArea(adminFp, scope)) adminFp = null;
        if (adminFp) {
          fp = adminFp;
        } else if (adminFp === null) {
          // Admin/place DEFINITIVELY has no neighborhood polygon → try a NAMED landuse, district-
          // sized (the Presidio, via the STRICT ≥0.3 km² gate).
          const footFp = await fetchFootprint(lat, lon, matchName, scope, signal, 'strict');
          if (footFp) {
            fp = footFp;
          } else if (footFp === null) {
            // Strict found no district-sized named area. Before drawing a buffered blob, try a
            // LOOSE footprint — a smaller named leisure/landuse polygon (e.g. Fort Mason, a
            // 0.26 km² NPS park that the strict 0.3 km² floor rejects but Google mis-types as a
            // "neighborhood") is a real outline and beats a disc. Name-match scoring keeps it from
            // grabbing a building; the scope cap below rejects anything oversized.
            const looseFp = await fetchFootprint(lat, lon, matchName, scope, signal, 'loose');
            if (looseFp && looseFp.kind !== 'building') fp = looseFp;
            else if (looseFp === null) fp = synthesizeBufferedArea(lat, lon, NEIGHBORHOOD_RADIUS_M);
            else if (looseFp === undefined) fp = undefined; // transient → honest point, retryable
            // a building (wrong feature) → leave fp null (honest point) rather than a
            // misleading blob — a re-run would only return the same cached building.
          } else {
            fp = undefined; // transient strict lookup → honest point, retryable
          }
        } else {
          // adminFp === undefined (transient in the HIGHER-priority admin/place leg): do NOT
          // fall through to a lower-priority landuse — a real boundary that was momentarily
          // unavailable must not be replaced by a lesser polygon. Honest point, retryable.
          fp = undefined;
        }
      }
    } else if (scope === 'street') {
      // Street → best-available AREA: a same-named district, else a buffered
      // corridor ribbon along the centerline (always works), never a building.
      fp = await fetchStreet(lat, lon, matchName, signal);
    } else {
      // compound / building / park / generic POI → the footprint resolver
      // (which classifies building-vs-area and stitches compound multipolygons).
      // Point-like targets use the strict 'point' selection: exact-ish name + monument
      // scale, else no polygon at all — the honest point beats a locality-word match.
      fp = await fetchFootprint(lat, lon, matchName, scope, signal, pointLike ? 'point' : 'loose');
      // A "grounds/compound/campus" phrase ("Texas Capitol grounds") names an ENCLOSING area. The
      // primary footprint above returns the BUILDING (the dome) or null — neither is the grounds. The
      // real enclosing polygon (e.g. "Capitol Square", leisure=park) IS in OSM but only surfaces via a
      // radius sweep for NAMED non-building polygons, taking the SMALLEST that geometrically contains
      // the point (research docs/compound-containment-research.md §1.4–1.5). So when a grounds-like
      // query produced a building or no polygon, prefer that REAL enclosing outline; fall to a
      // synthesized disc only when OSM DEFINITIVELY has none.
      if (groundsLike && (fp === null || fp?.kind === 'building')) {
        const area = await fetchEnclosingArea(lat, lon, signal, matchName);
        if (area) {
          fp = area; // real grounds polygon (synthesized:false) — beats both the dome and a disc
          // It's a grounds/compound feature (already capped at SCOPE_AREA_CAP_M2.compound inside
          // fetchEnclosingArea). The geocoder may have typed the POI as `building` (the user pointed
          // at the dome), so validate against the COMPOUND cap below, not the tighter building one.
          scope = 'compound';
        } else if (area === null) {
          // OSM definitively has no enclosing polygon → loose dotted-disc footprint (the same
          // approximate-area treatment neighborhoods get), sized from the place viewport when
          // available (Places or geocode), else GROUNDS_RADIUS_M. A grounds ask never keeps the
          // bare BUILDING either: the dome is the exact feature, not the grounds — and under
          // progressive dedup an identical building ring would collapse into the building mark
          // and eat its caption. Never on `area === undefined` (transient — a retry may yet
          // find the real outline).
          fp = synthesizeBufferedArea(lat, lon, groundsRadiusFromViewport(placeViewport));
        } else if (fp?.kind === 'building') {
          // Transient sweep failure with only the building in hand → honest point +
          // RETRYABLE (the backoff retry / a re-narration re-runs the sweep), never the
          // wrong exact-building shape.
          fp = undefined;
        }
      }
    }
    // Scope sanity: reject a real footprint whose area is wildly wrong for the asked
    // scope (a building/compound/neighborhood intent must never draw a state-sized
    // blob). Synthesized discs are deliberately sized and exempt.
    if (fp && !fp.synthesized && Array.isArray(fp.ring) && fp.ring.length >= 3 && exceedsScopeArea(fp, scope)) {
      fp = null;
    }
    if (isRateLimitedOutcome(fp)) return fp;
    if (fp === undefined) return undefined; // TRANSIENT — a backoff retry may still find it
    if (!fp || !Array.isArray(fp.ring) || fp.ring.length < 3) return null;
    const centroid = ringCentroid(fp.ring);
    if (!centroid) return null;
    // Same drift bound as the anchor gate: a polygon whose centroid would drag a good
    // anchor out of plausibility is the wrong feature — drop it, keep the point.
    if (fromGeocode && !bypassNearViewGuards && gateDrift(centroid.lat, centroid.lon)) return null;
    return {
      ring: fp.ring,
      footprintKind: fp.kind,
      buildingHeight: fp.heightM,
      synthesized: Boolean(fp.synthesized),
      lat: centroid.lat,
      lon: centroid.lon,
      height: sampleGroundHeight(viewer, centroid.lon, centroid.lat),
    };
  };

  let ring = null;
  let footprintKind = null; // 'building' | 'area'
  let buildingHeight = null; // meters, only for buildings
  let synthesized = false; // true = buffered/approximate area, render dashed/feathered
  if (footprint && !deferFootprint) {
    const fp = await resolveOutline();
    if (fp && !isRateLimitedOutcome(fp)) {
      ring = fp.ring;
      footprintKind = fp.footprintKind;
      buildingHeight = fp.buildingHeight;
      synthesized = fp.synthesized;
      // Re-center the anchor on the resolved footprint centroid.
      lat = fp.lat;
      lon = fp.lon;
      source = 'footprint';
    }
  }

  const height = sampleGroundHeight(viewer, lon, lat);
  // One concise line per target so the resolution path is visible in the browser console.
  if (trace.query) {
    console.log(
      `[Resolver] "${trace.query}": places=${trace.places} geocode=${trace.geocode} `
      + `osmSnap=${trace.osmSnap} → FINAL source=${source} ${lat.toFixed(5)},${lon.toFixed(5)}`
      + (footprint && deferFootprint ? ' (outline pending)' : ''),
    );
  }
  return {
    lon,
    lat,
    height,
    ring,
    footprintKind,
    buildingHeight,
    label,
    source,
    synthesized,
    viewport: placeViewport,
    ...(footprint && deferFootprint ? { resolveOutline } : {}),
  };
}
