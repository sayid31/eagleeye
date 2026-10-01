// Moved out of annotationResolver.js (annotationResolverConstants).



/**
 * Annotation target resolver.
 *
 * The voice agent points things out by NAME (preferred) or explicit lat/lng.
 * Research takeaway: vision models are unreliable at counting pixels on
 * photoreal/oblique imagery, so we never ask the model to box pixels — we
 * resolve a place name to a real-world coordinate (and, when useful, a real
 * OSM footprint ring) and anchor the annotation in world space. That makes the
 * annotation persist correctly as the camera moves and occlude naturally.
 *
 * This mirrors the geocode + Overpass-footprint patterns already used by
 * `src/locations.js` (searchAndFlyTo / resolveBuildingBounds) but returns the
 * raw geometry ring instead of a bounding box, which is what an outline needs.
 */

export const geocodeCache = new Map();

export const footprintCache = new Map();

export const monumentCache = new Map(); // OSM monuments/memorials near a view center, keyed by rounded coord

export const enclosingAreaCache = new Map(); // smallest enclosing named non-building polygon, keyed by ~1km coord bucket

// Cache entries are { value, at }. Positive results live indefinitely; negative
// (not-found) results expire after this TTL so one bad moment doesn't poison a key
// for the whole session.
export const NEG_CACHE_TTL_MS = 60_000;

// Upper area bound (m²) per scope. A resolved footprint bigger than its scope's
// cap is the wrong feature (e.g. a whole city returned for a neighborhood), so we
// drop it rather than draw a misleading blob. state / country / auto / street have
// no cap (they are legitimately large or capped elsewhere).
export const SCOPE_AREA_CAP_M2 = {
  building: 0.6e6, // 0.6 km²
  compound: 60e6, // 60 km² (Presidio ≈ 6 km²; a mall ≈ 0.2 km²)
  neighborhood: 80e6, // 80 km²
  city: 9e9, // 9,000 km²
  county: 1.2e11, // 120,000 km²
};

// Proximity gate tolerances (see the gate in resolveAnnotationTarget). A geocoded anchor more
// than VIEWPORT_DRIFT_FACTOR × the on-screen viewport radius away — but never less than
// MIN_DRIFT_FLOOR_KM — is treated as a wrong match and rejected. The factor keeps it zoom-aware
// (far-but-visible places pass when zoomed out); the floor avoids over-rejecting nearby places
// when zoomed way in. The area cap alone can't catch this: admin scopes (state/country) are
// uncapped, so a landmark that mis-geocodes to an admin region traces an uncapped blob.
export const VIEWPORT_DRIFT_FACTOR = 8;

export const MIN_DRIFT_FLOOR_KM = 50;

// A view-biased Places Text Search hit is trusted only when it lands within this many metres of the
// view centre — a sanity bound so a stray cross-city Text Search result can't anchor far from what
// the user is looking at (it falls back to the geocode + osm-snap path instead). Generous enough to
// cover a large compound's monuments seen from an oblique view (Text Search is biased to 6 km here).
export const PLACES_MAX_DISTANCE_M = 8000;

// Synthesis radii (m) per osm-place-resolution-research.md §8.5. Used when OSM has only
// a label point (most US neighborhoods) or the user asks for the area AROUND a landmark.
export const NEIGHBORHOOD_RADIUS_M = 750; // urban-neighborhood blob (600–900 m band)

export const AROUND_LANDMARK_RADIUS_M = 400; // "the area around X" — a few blocks (300–500 m)

export const GROUNDS_RADIUS_M = 300; // "X grounds/compound/campus" loose disc when OSM has no polygon

export const GROUNDS_RADIUS_MIN_M = 150; // viewport-derived grounds disc is clamped to this band so a tiny

export const GROUNDS_RADIUS_MAX_M = 1200; // place can't shrink to a dot, nor a city-wide viewport balloon

export const placesCache = new Map(); // Text Search hits, keyed by query + rounded view centre

export const ENCLOSING_RADIUS_M = 600; // sweep this far for an enclosing named non-building polygon

export const MONUMENT_RADIUS_M = 2500; // search this far from the view centre for a named monument

/**
 * Find the actual OSM monument/memorial/statue NEAR a view centre, name-matched. Google geocodes
 * these obscure names unreliably (it scatters several Capitol-grounds monuments across the city),
 * so for a monument-like target we anchor on what the user is LOOKING AT and snap to the real
 * feature. The Overpass result set is cached by rounded centre, so a whole batch of monuments on
 * one set of grounds costs a SINGLE query. Returns {lat, lon, label} on a name match, else null
 * (no match, or a transient/timed-out Overpass) → the caller keeps the geocode point.
 */
export const monumentInflight = new Map(); // centerKey → in-flight sweep promise (batch dedup)

// Point-like footprint ceiling: big enough for the large DC-style memorial complexes
// (Lincoln Memorial ≈ 7k m², WWII / 9-11 Memorial plazas ≈ 30k m²), far too small for
// the park/campus that CONTAINS a monument (Golden Gate Park ≈ 4.1M m²).
export const POINTLIKE_AREA_CAP_M2 = 60_000;
