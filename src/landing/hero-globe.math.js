// src/landing/hero-globe.math.js
/**
 * Sphere maths of the hero globe: unit vectors, view rotation, orthographic projection, great-circle arcs and the
 * latitude-ring dot lattice. Pure, no DOM.
 *
 * @module landing/hero-globe.math
 */

const DEG = Math.PI / 180;

/**
 * Unit vector of a lat/lon (degrees): +y north pole, +z toward the viewer at lon 0, +x east.
 * @returns {[number, number, number]}
 */
export function latLonToVec(lat, lon) {
  const cosLat = Math.cos(lat * DEG);
  return [cosLat * Math.sin(lon * DEG), Math.sin(lat * DEG), cosLat * Math.cos(lon * DEG)];
}

/**
 * Spin about the polar axis by `yaw` (radians, positive moves features to the right), then tilt the north pole toward
 * the viewer by `tilt`. Writes into `out` to stay allocation-free in the frame loop.
 * @param {ArrayLike<number>} v
 * @param {number} yaw
 * @param {number} tilt
 * @param {number[]} [out]
 */
export function rotateView(v, yaw, tilt, out = [0, 0, 0]) {
  const cy = Math.cos(yaw);
  const sy = Math.sin(yaw);
  const x = v[0] * cy + v[2] * sy;
  const z = -v[0] * sy + v[2] * cy;
  const ct = Math.cos(tilt);
  const st = Math.sin(tilt);
  out[0] = x;
  out[1] = v[1] * ct - z * st;
  out[2] = v[1] * st + z * ct;
  return out;
}

/** Orthographic projection of a view-space vector to canvas px: `[x, y]`; `v[2]` is the depth (>0 faces the viewer). */
export function project(v, cx, cy, radius) {
  return [cx + v[0] * radius, cy - v[1] * radius];
}

/** Angle between two unit vectors, radians. */
export function angleBetween(a, b) {
  return Math.acos(Math.min(1, Math.max(-1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2])));
}

/**
 * Point at fraction `t` (0..1) of the great circle a→b, raised above the surface by `lift * sin(pi t)` so a route
 * reads as an arc rather than a line pressed into the globe.
 * @returns {[number, number, number]} length 1 at t = 0 and 1; up to 1 + lift in between
 */
export function arcPoint(a, b, t, lift = 0) {
  const omega = angleBetween(a, b);
  const sin = Math.sin(omega);
  const wa = sin < 1e-9 ? 1 - t : Math.sin((1 - t) * omega) / sin;
  const wb = sin < 1e-9 ? t : Math.sin(t * omega) / sin;
  const scale = 1 + lift * Math.sin(Math.PI * t);
  return [(a[0] * wa + b[0] * wb) * scale, (a[1] * wa + b[1] * wb) * scale, (a[2] * wa + b[2] * wb) * scale];
}

/**
 * Evenly spaced lattice of lat/lon points: latitude rings `spacing` degrees apart, each ring holding as many points as
 * keep the along-ring spacing near `spacing`, odd rings offset by half a step so the dots read as a staggered matrix.
 * @param {number} spacing degrees
 * @returns {Array<[number, number]>} `[lat, lon]`
 */
export function latticePoints(spacing) {
  const rings = Math.max(1, Math.round(180 / spacing));
  const points = [];
  for (let i = 0; i < rings; i++) {
    const lat = -90 + ((i + 0.5) * 180) / rings;
    const count = Math.max(1, Math.round((360 * Math.cos(lat * DEG)) / spacing));
    const offset = i % 2 ? 0.5 : 0;
    for (let j = 0; j < count; j++) points.push([lat, ((j + offset) * 360) / count - 180]);
  }
  return points;
}
