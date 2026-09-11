/**
 * @module hudLocality
 * @description The locality half of the HUD summary line — either "NEAR <landmark>"
 * or the "SECTOR <lat/lon>" fallback.
 *
 * Split out of `hud.js` purely so it is unit-testable: `hud.js` pulls in the `mgrs`
 * CommonJS package, which Vite resolves but plain Node cannot import by named export.
 */

/**
 * Maximum distance to a curated POI that still reads as "NEAR" it.
 *
 * The 2026-08-20 QA hunt found the HUD announcing NEAR SACRE-COEUR (PARIS) 2470KM
 * while parked over Moscow, and NEAR LINCOLN MEMORIAL 962KM over Chicago — the old
 * bound was 2,500 km, roughly a continent. The POI catalogue only covers eight
 * cities, so anywhere else on Earth matched whichever landmark happened to be
 * closest and reported an absurd distance as if it were a locality. That pass
 * landed on 150 km ("metro scale").
 *
 * A 2026-09 report found the same failure mode still reachable at 150 km: a
 * camera over Kawah Ijen (East Java) read NEAR PURA ULUN DANU BERATAN (DENPASAR)
 * 102KM — a real POI, but a 102 km reading is not "near" anything by ordinary
 * language, it's a different island region. Adding the eight Indonesian cities'
 * POIs (see CITY_POIS in locations.js) made the catalogue sparser and more
 * spread out per city than the original eight (Denpasar's own POIs span up to
 * ~50 km, e.g. Kuta to Pura Ulun Danu Beratan), so the wide 150 km bound started
 * matching across neighbouring regions instead of within one.
 *
 * 50 km was chosen by computing, for every catalogued city, the worst-case
 * distance from that city's own view-bounds corners to its own nearest POI —
 * the largest such value across all 16 cities (original eight plus the eight
 * Indonesian additions) was 39.1 km (Dubai). 50 km keeps every city's
 * legitimate in-view NEAR match intact with headroom, while rejecting the
 * 102 km Kawah Ijen/Denpasar false positive and anything of similar scale.
 */
export const NEAR_POI_MAX_KM = 50;

/**
 * Format one hemisphere-tagged coordinate, e.g. `21.33N` / `157.80W`.
 * @param {number} value Signed decimal degrees.
 * @param {string} positive Suffix when the value is >= 0.
 * @param {string} negative Suffix when the value is < 0.
 * @returns {string}
 */
function coordinateTag(value, positive, negative) {
  return `${Math.abs(value).toFixed(2)}${value >= 0 ? positive : negative}`;
}

/**
 * Build the locality tag for the HUD summary line.
 *
 * @param {{poi: string, city: string, distKm: number}|null|undefined} nearest
 *   Closest catalogued POI with its great-circle distance, or null when the
 *   catalogue is empty.
 * @param {number} latDeg Camera latitude in decimal degrees.
 * @param {number} lonDeg Camera longitude in decimal degrees.
 * @returns {string} `NEAR <POI> (<CITY>) <N>KM` within the bound (inclusive),
 *   otherwise `SECTOR <lat> <lon>`.
 */
export function composeLocalityTag(nearest, latDeg, lonDeg) {
  const distKm = Number(nearest?.distKm);
  if (nearest && Number.isFinite(distKm) && distKm <= NEAR_POI_MAX_KM) {
    return `NEAR ${String(nearest.poi).toUpperCase()} (${String(nearest.city).toUpperCase()}) ${Math.round(distKm)}KM`;
  }
  return `SECTOR ${coordinateTag(latDeg, 'N', 'S')} ${coordinateTag(lonDeg, 'E', 'W')}`;
}
