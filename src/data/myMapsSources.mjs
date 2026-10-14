/**
 * Allowlist of the Google My Maps documents the console may read at runtime.
 * The proxy never accepts a client-supplied map id: a request names one of the
 * keys below and the upstream URL is built here, so the route cannot be used
 * as an open relay. Both maps are publicly shared (anyone with the link) and
 * are fetched live, never bundled — see DATA_SOURCES.md.
 */

/** Public KML export endpoint of a shared My Maps document. */
export const MYMAPS_KML_ENDPOINT = 'https://www.google.com/maps/d/kml';

/** @typedef {{mid: string, kind: 'shelter'|'siren'}} MyMapsDocument */

/** @type {Readonly<Record<string, ReadonlyArray<MyMapsDocument>>>} */
export const MYMAPS_DATASETS = Object.freeze({
  'sumbar-tsunami': Object.freeze([
    // "Sebaran Shelter" — 58 vertical-evacuation / shelter buildings, West Sumatra.
    Object.freeze({ mid: '1BE9I42pGlF73qEg04hzFCJ_1D9L570A', kind: 'shelter' }),
    // "Sebaran Sirine Tsunami di Sumatera Barat" — 86 tsunami sirens.
    Object.freeze({ mid: '1PAp9VQu7FdRdgTUVkybuhn7etHuJCj4', kind: 'siren' }),
  ]),
});

/**
 * Build the KML export URL for one allowlisted document.
 * @param {string} mid - Map id taken from MYMAPS_DATASETS, never from a request.
 * @returns {string}
 */
export function myMapsKmlUrl(mid) {
  return `${MYMAPS_KML_ENDPOINT}?mid=${encodeURIComponent(mid)}&forcekml=1`;
}
