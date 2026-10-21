/**
 * overpassSimplify.mjs — server-side geometry decimation for large Overpass
 * `out geom` payloads, used by overpassCore.mjs before a response reaches the
 * memory cache, the disk cache, or the client.
 *
 * Region/state boundary pivots return multi-MB coastline rings whose fidelity
 * nothing downstream needs (the client re-simplifies for draw); decimating them
 * here is what makes the 32 MB read cap safe to hold.
 *
 * Lives in its own module because it is pure geometry with no cache, network,
 * or filesystem dependency — and because overpassCore.mjs is at its file-size
 * ceiling (see docs/DECISIONS.md 2026-10-22).
 *
 * Node-only (imported by overpassCore.mjs via vite.config.js), never bundled
 * for the browser.
 *
 * @module data/overpassSimplify
 */

/** Only payloads at least this large go through geometry simplification. */
export const OVERPASS_SIMPLIFY_MIN_BYTES = 1_500_000;
/** Only per-element geometry arrays with at least this many points are simplified. */
export const OVERPASS_SIMPLIFY_MIN_POINTS = 1200;
/**
 * Douglas-Peucker tolerance (degrees, ≈44 m of latitude). Region/state boundary
 * rings are drawn at regional camera scale and the client simplifies again for
 * draw, so ~44 m fidelity is invisible; building footprints never reach the
 * point threshold above and pass through untouched.
 */
export const OVERPASS_SIMPLIFY_TOLERANCE_DEG = 0.0004;

/**
 * Iterative Douglas-Peucker on [{lat,lon},...] (planar-degree approx — fine at
 * the ~44 m tolerance used here). Endpoints are always kept.
 *
 * @param {Array<{lat:number,lon:number}>} points Polyline vertices.
 * @param {number} toleranceDeg Max allowed deviation, in degrees.
 * @returns {Array<{lat:number,lon:number}>} Retained vertices, in order.
 */
function douglasPeucker(points, toleranceDeg) {
  const n = points.length;
  if (n <= 2) return points;
  const keep = new Uint8Array(n);
  keep[0] = 1;
  keep[n - 1] = 1;
  const stack = [[0, n - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    if (b - a < 2) continue;
    const ax = points[a].lon;
    const ay = points[a].lat;
    const vx = points[b].lon - ax;
    const vy = points[b].lat - ay;
    const c2 = vx * vx + vy * vy;
    let worst = -1;
    let worstDist = toleranceDeg;
    for (let i = a + 1; i < b; i++) {
      const wx = points[i].lon - ax;
      const wy = points[i].lat - ay;
      let d;
      if (c2 === 0) {
        d = Math.hypot(wx, wy);
      } else {
        const t = Math.max(0, Math.min(1, (vx * wx + vy * wy) / c2));
        d = Math.hypot(wx - t * vx, wy - t * vy);
      }
      if (d > worstDist) {
        worstDist = d;
        worst = i;
      }
    }
    if (worst >= 0) {
      keep[worst] = 1;
      stack.push([a, worst], [worst, b]);
    }
  }
  const out = [];
  for (let i = 0; i < n; i++) if (keep[i]) out.push(points[i]);
  return out;
}

/** Simplify one element's geometry array in place if it is big enough. */
function simplifyElementGeometry(el, minPoints, toleranceDeg) {
  if (Array.isArray(el?.geometry) && el.geometry.length >= minPoints) {
    el.geometry = douglasPeucker(el.geometry, toleranceDeg);
  }
  if (Array.isArray(el?.members)) {
    for (const member of el.members) {
      if (Array.isArray(member?.geometry) && member.geometry.length >= minPoints) {
        member.geometry = douglasPeucker(member.geometry, toleranceDeg);
      }
    }
  }
}

/**
 * Decimate the geometry in a large Overpass response body.
 *
 * Anything unparseable or below the thresholds passes through byte-identical.
 * Exported for tests (opts override thresholds).
 *
 * @param {string} bodyText Raw upstream JSON body.
 * @param {{minBytes?:number,minPoints?:number,toleranceDeg?:number}} [opts]
 * @returns {string} Possibly-simplified JSON body.
 */
export function simplifyOverpassPayloadBody(bodyText, opts = {}) {
  const minBytes = opts.minBytes ?? OVERPASS_SIMPLIFY_MIN_BYTES;
  const minPoints = opts.minPoints ?? OVERPASS_SIMPLIFY_MIN_POINTS;
  const toleranceDeg = opts.toleranceDeg ?? OVERPASS_SIMPLIFY_TOLERANCE_DEG;
  if (typeof bodyText !== 'string' || bodyText.length < minBytes) return bodyText;
  let data;
  try {
    data = JSON.parse(bodyText);
  } catch {
    return bodyText;
  }
  if (!Array.isArray(data?.elements)) return bodyText;
  for (const el of data.elements) simplifyElementGeometry(el, minPoints, toleranceDeg);
  try {
    return JSON.stringify(data);
  } catch {
    return bodyText;
  }
}
