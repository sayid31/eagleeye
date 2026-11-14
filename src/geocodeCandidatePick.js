// Chooses which Nominatim hit a place-name search flies to.
//
// The search sends the camera's view as a ranking bias (so "Sixth Street" means
// the one on screen), but that bias lets a tiny nearby namesake beat the place
// anyone means: "kupang" from Jakarta flew to a street, and from Lampung to a
// village, never to Kota Kupang. A clearly more important city/region (the
// unbiased top hit) wins; streets, landmarks and close calls keep the biased hit.

/** Nominatim place_rank at or above which a hit is a city/region, not a locality. */
const MAJOR_PLACE_MAX_RANK = 16;
/** Smallest importance ratio at which a major place outranks a biased top hit. */
const MAJOR_PLACE_IMPORTANCE_RATIO = 3;

function isMajorPlace(hit) {
  const rank = Number(hit?.place_rank);
  return ['boundary', 'place'].includes(String(hit?.category || hit?.class || ''))
    && Number.isFinite(rank) && rank > 0 && rank <= MAJOR_PLACE_MAX_RANK;
}

/**
 * Whether a viewport-biased top hit is worth cross-checking against the
 * unbiased one: a city/region needs no second opinion, everything else might
 * be a namesake the bias promoted.
 * @param {object} hit
 * @returns {boolean}
 */
export function needsUnbiasedCheck(hit) {
  return !isMajorPlace(hit);
}

function importanceOf(hit) {
  const value = Number(hit?.importance);
  return Number.isFinite(value) ? value : 0;
}

/**
 * Pick the hit to fly to. The first entry is the viewport-biased top hit; the
 * rest are alternatives (the unbiased top hit).
 * @param {Array<object|null>} results Nominatim jsonv2 hits.
 * @returns {object|null}
 */
export function pickGeocodeCandidate(results) {
  if (!Array.isArray(results) || results.length === 0) return null;
  const [top] = results;
  if (!top) return null;
  if (isMajorPlace(top)) return top;
  const topImportance = importanceOf(top);
  let best = null;
  for (const hit of results.slice(1)) {
    if (!hit || !isMajorPlace(hit)) continue;
    if (best === null || importanceOf(hit) > importanceOf(best)) best = hit;
  }
  if (best !== null && importanceOf(best) >= topImportance * MAJOR_PLACE_IMPORTANCE_RATIO) return best;
  return top;
}
