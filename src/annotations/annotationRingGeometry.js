import * as Cesium from 'cesium';

/**
 * @file Pure ring/geometry math for the annotation resolver: polyline
 * stitching, corridor buffering, Douglas–Peucker simplification, OSM
 * relation-way stitching into closed rings, and small planar-geometry
 * helpers (area, distance, point-in-polygon, word-overlap matching).
 *
 * Split out of `annotationResolver.js` — every function here is already
 * pure (no closure over resolver module state, no network/Cesium-viewer
 * dependency beyond the `Cesium.Math` trig helpers), following the
 * pure-helper extraction pattern used across `src/data/*.js`.
 *
 * @module annotations/annotationRingGeometry
 */

/** Chain street way-segments into one contiguous polyline by endpoint matching. */
export function stitchLine(segments) {
  const same = (a, b) => approximateDistanceM(a[1], a[0], b[1], b[0]) < 2;
  const remaining = segments.map((s) => s.slice());
  let line = remaining.shift();
  let advanced = true;
  while (advanced && remaining.length) {
    advanced = false;
    for (let i = 0; i < remaining.length; i++) {
      const s = remaining[i];
      if (same(line[line.length - 1], s[0])) line = line.concat(s.slice(1));
      else if (same(line[line.length - 1], s[s.length - 1])) line = line.concat(s.slice(0, -1).reverse());
      else if (same(line[0], s[s.length - 1])) line = s.slice(0, -1).concat(line);
      else if (same(line[0], s[0])) line = s.slice(1).reverse().concat(line);
      else continue;
      remaining.splice(i, 1);
      advanced = true;
      break;
    }
  }
  return line;
}

/** Offset a centerline into a closed corridor ring (~2*halfWidthM wide). */
export function bufferCorridor(line, halfWidthM) {
  const lat0 = line[0][1];
  const mLon = 111320 * Math.cos((lat0 * Math.PI) / 180);
  const mLat = 111320;
  const P = line.map(([lon, lat]) => [lon * mLon, lat * mLat]);
  const left = [];
  const right = [];
  for (let i = 0; i < P.length; i++) {
    const a = P[Math.max(0, i - 1)];
    const b = P[Math.min(P.length - 1, i + 1)];
    let dx = b[0] - a[0];
    let dy = b[1] - a[1];
    const len = Math.hypot(dx, dy) || 1;
    dx /= len; dy /= len;
    const nx = -dy;
    const ny = dx;
    left.push([P[i][0] + nx * halfWidthM, P[i][1] + ny * halfWidthM]);
    right.push([P[i][0] - nx * halfWidthM, P[i][1] - ny * halfWidthM]);
  }
  const ring = [...left, ...right.reverse(), left[0]];
  return ring.map(([x, y]) => [x / mLon, y / mLat]);
}

/** Douglas–Peucker ring simplification with a metres tolerance. Pre-decimates
 *  very large rings (state/country) to keep the recursion shallow. */
export function simplifyRing(ring, tolM) {
  if (ring.length <= 24) return ring;
  let pts = ring;
  // Hard-cap the input to Douglas-Peucker so a pathological 50k-point country
  // boundary can't dominate a frame, even with the iterative implementation.
  if (pts.length > 4000) {
    const step = Math.ceil(pts.length / 4000);
    pts = pts.filter((_, i) => i % step === 0 || i === ring.length - 1);
  }
  const lat0 = pts[0][1];
  const tol = tolM / (111320 * Math.cos((lat0 * Math.PI) / 180));
  const out = douglasPeucker(pts, tol);
  return out.length >= 4 ? out : ring;
}

export function douglasPeucker(points, tol) {
  const n = points.length;
  if (n < 3) return points.slice();
  // Iterative, index-based (no per-call array slicing / recursion), so a large
  // state/country boundary can't blow the call stack or thrash GC and freeze the
  // main thread during a voice turn.
  const keep = new Uint8Array(n);
  keep[0] = 1;
  keep[n - 1] = 1;
  const stack = [[0, n - 1]];
  while (stack.length) {
    const seg = stack.pop();
    const first = seg[0];
    const last = seg[1];
    let index = -1;
    let maxD = 0;
    const a = points[first];
    const b = points[last];
    for (let i = first + 1; i < last; i += 1) {
      const dist = perpDistance(points[i], a, b);
      if (dist > maxD) { maxD = dist; index = i; }
    }
    if (maxD > tol && index > first) {
      keep[index] = 1;
      stack.push([first, index]);
      stack.push([index, last]);
    }
  }
  const out = [];
  for (let i = 0; i < n; i += 1) if (keep[i]) out.push(points[i]);
  return out;
}

export function perpDistance(p, a, b) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return Math.hypot(p[0] - a[0], p[1] - a[1]);
  let t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

export function elementCoordinates(element) {
  if (Array.isArray(element.geometry)) {
    return element.geometry.filter((p) => Number.isFinite(p?.lat) && Number.isFinite(p?.lon));
  }
  if (!Array.isArray(element.members)) return [];
  // For a multipolygon relation the boundary is split across several outer
  // ways (the Presidio has 8), so chain them into one ring by matching
  // endpoints rather than taking a single segment.
  const outerWays = element.members
    .filter((m) => (m.role === 'outer' || !m.role) && Array.isArray(m.geometry))
    .map((m) => m.geometry.filter((p) => Number.isFinite(p?.lat) && Number.isFinite(p?.lon)))
    .filter((w) => w.length >= 2);
  return stitchRing(outerWays);
}

/**
 * Stitch relation outer ways into a footprint ring. Builds ALL connected
 * components (a multipolygon outer boundary is split across several ways), then
 * returns the largest component whose endpoints actually meet — a true closed
 * ring. If no component closes cleanly, it accepts the largest only when the
 * endpoint gap is small relative to its own span (a minor seam); otherwise the
 * relation geometry is incomplete and it returns [] rather than fabricate a
 * straight chord across the gap (the reported bay-spanning blob).
 */
export function stitchRing(ways) {
  if (!ways.length) return [];
  const components = buildRingComponents(ways);
  if (!components.length) return [];

  const CLOSE_TOL_M = 30; // endpoints within 30 m → a genuinely closed ring
  const closed = components.filter((c) => endpointGapM(c) <= CLOSE_TOL_M);
  if (closed.length) {
    // Pick by projected AREA, not vertex count — a small, highly-detailed island
    // must not beat the large simple mainland. (For a disjoint multipolygon this
    // returns only the largest closed outer ring; full multi-ring rendering is a
    // renderer change tracked separately.)
    return largestByArea(closed);
  }

  // Nothing closes exactly. Bridge a seam ONLY when the gap is BOTH a small
  // fraction of the feature's own span (so half a compound's boundary missing is
  // rejected) AND under a hard absolute ceiling (so a state/country can never get a
  // kilometres-long chord — the bay blob). A complete relation closes at ~0; a
  // genuine seam (e.g. the Presidio's ~few-hundred-m coastline gap) bridges; a
  // truly incomplete relation is rejected → point fallback.
  const largest = largestByArea(components);
  const allow = Math.min(ringSpanM(largest) * 0.15, 1200);
  return endpointGapM(largest) <= allow ? largest : [];
}

/** Largest component by projected area (each component is an array of {lat,lon}). */
export function largestByArea(components) {
  let best = components[0];
  let bestArea = approximateAreaM2(best);
  for (let i = 1; i < components.length; i += 1) {
    const area = approximateAreaM2(components[i]);
    if (area > bestArea) { bestArea = area; best = components[i]; }
  }
  return best;
}

/** Rough diameter (m) of a chain's bounding box. */
export function ringSpanM(chain) {
  let minLat = Infinity; let maxLat = -Infinity; let minLon = Infinity; let maxLon = -Infinity;
  for (const p of chain) {
    if (p.lat < minLat) minLat = p.lat;
    if (p.lat > maxLat) maxLat = p.lat;
    if (p.lon < minLon) minLon = p.lon;
    if (p.lon > maxLon) maxLon = p.lon;
  }
  return approximateDistanceM(minLat, minLon, maxLat, maxLon);
}

/** Chain ways into maximal connected components by endpoint matching. */
export function buildRingComponents(ways) {
  const same = (a, b) => Math.abs(a.lon - b.lon) < 1e-7 && Math.abs(a.lat - b.lat) < 1e-7;
  const remaining = ways.map((w) => w.slice());
  const components = [];
  while (remaining.length) {
    let chain = remaining.shift();
    let grew = true;
    while (grew) {
      grew = false;
      const head = chain[0];
      const tail = chain[chain.length - 1];
      for (let i = 0; i < remaining.length; i += 1) {
        const w = remaining[i];
        const ws = w[0];
        const we = w[w.length - 1];
        if (same(tail, ws)) chain = chain.concat(w.slice(1));
        else if (same(tail, we)) chain = chain.concat(w.slice(0, -1).reverse());
        else if (same(head, we)) chain = w.slice(0, -1).concat(chain);
        else if (same(head, ws)) chain = w.slice(1).reverse().concat(chain);
        else continue;
        remaining.splice(i, 1);
        grew = true;
        break;
      }
    }
    components.push(chain);
  }
  return components;
}

/** Great-circle distance (m) between a chain's first and last vertex. */
export function endpointGapM(chain) {
  if (!chain || chain.length < 2) return Infinity;
  const a = chain[0];
  const b = chain[chain.length - 1];
  return approximateDistanceM(a.lat, a.lon, b.lat, b.lon);
}

export function closeRing(ring) {
  if (ring.length < 3) return ring;
  const [fx, fy] = ring[0];
  const [lx, ly] = ring[ring.length - 1];
  if (fx !== lx || fy !== ly) ring.push([fx, fy]);
  return ring;
}

export function ringCentroid(ring) {
  if (!ring || ring.length < 3) return null;
  let sumLat = 0;
  let sumLon = 0;
  for (const [lon, lat] of ring) {
    sumLat += lat;
    sumLon += lon;
  }
  return { lat: sumLat / ring.length, lon: sumLon / ring.length };
}

export function approximateAreaM2(coords) {
  // Shoelace in a local equirectangular projection (good enough for buildings).
  if (coords.length < 3) return 0;
  const lat0 = coords[0].lat;
  const mPerDegLat = 111_320;
  const mPerDegLon = mPerDegLat * Math.cos(Cesium.Math.toRadians(lat0));
  let area = 0;
  for (let i = 0, j = coords.length - 1; i < coords.length; j = i++) {
    const xi = coords[i].lon * mPerDegLon;
    const yi = coords[i].lat * mPerDegLat;
    const xj = coords[j].lon * mPerDegLon;
    const yj = coords[j].lat * mPerDegLat;
    area += xj * yi - xi * yj;
  }
  return Math.abs(area) / 2;
}

export function approximateDistanceM(latA, lonA, latB, lonB) {
  const latScale = 111_320;
  const lonScale = latScale * Math.cos(Cesium.Math.toRadians((latA + latB) / 2));
  return Math.hypot((latB - latA) * latScale, (lonB - lonA) * lonScale);
}

export function pointInPolygon(lon, lat, coords) {
  let inside = false;
  for (let i = 0, j = coords.length - 1; i < coords.length; j = i++) {
    const a = coords[i];
    const b = coords[j];
    const intersects = ((a.lat > lat) !== (b.lat > lat))
      && (lon < (b.lon - a.lon) * (lat - a.lat) / ((b.lat - a.lat) || Number.EPSILON) + a.lon);
    if (intersects) inside = !inside;
  }
  return inside;
}

export function normalizedWords(value) {
  return new Set(String(value || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter((word) => word.length > 2));
}

export function wordOverlap(left, right) {
  let matches = 0;
  for (const word of left) {
    if (right.has(word)) matches++;
  }
  return matches;
}
