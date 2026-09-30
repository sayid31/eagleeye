// Pure angle/distance/number helpers moved out of cctv.js (no layer state).

import * as Cesium from 'cesium';

/**
 * Converts degrees to radians.
 * @param {number} deg
 * @returns {number}
 */
export function toRad(deg) {
  return Cesium.Math.toRadians(deg);
}

/**
 * Normalizes a heading angle to the [0, 360) range.
 * @param {number} deg
 * @returns {number}
 */
export function normalizeHeading(deg) {
  let v = deg % 360;
  if (v < 0) v += 360;
  return v;
}

/**
 * Clamps a value to [min, max].
 * @param {number} value
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

/**
 * Normalizes an angle to the (-180, 180] range.
 * @param {number} deg
 * @returns {number}
 */
function normalizeSignedAngle(deg) {
  let value = deg % 360;
  if (value > 180) value -= 360;
  if (value <= -180) value += 360;
  return value;
}

/**
 * Returns the absolute angular difference between two headings in degrees.
 * @param {number} aDeg
 * @param {number} bDeg
 * @returns {number} Value in [0, 180].
 */
function angularDeltaAbs(aDeg, bDeg) {
  return Math.abs(normalizeSignedAngle(aDeg - bDeg));
}

/**
 * Coerces a value to a finite number or returns the fallback.
 * @param {*} value
 * @param {number} [fallback=NaN]
 * @returns {number}
 */
export function safeNumber(value, fallback = NaN) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Derives a deterministic heading from a camera ID string via a simple hash.
 * Produces one of 16 evenly-spaced headings (0, 22.5, 45, ..., 337.5).
 * @param {string} id
 * @returns {number} Heading in degrees [0, 360).
 */
export function headingFromId(id) {
  const text = String(id || '');
  let acc = 0;
  for (let i = 0; i < text.length; i++) {
    acc = (acc * 33 + text.charCodeAt(i)) >>> 0;
  }
  return normalizeHeading((acc % 16) * 22.5);
}

/**
 * Rounds a value to the nearest multiple of `step`.
 * @param {number} value
 * @param {number} [step=0.1]
 * @returns {number}
 */
export function quantize(value, step = 0.1) {
  return Math.round(value / step) * step;
}

/**
 * Converts north/east metre offsets to lat/lon degree deltas at a given latitude.
 * Uses the equirectangular approximation (111320 m/deg).
 * @param {number} latDeg - Reference latitude (degrees).
 * @param {number} northMeters - Offset northward (metres).
 * @param {number} eastMeters - Offset eastward (metres).
 * @returns {{ latOffset: number, lonOffset: number }} Degree deltas.
 */
export function offsetDegrees(latDeg, northMeters, eastMeters) {
  const latOffset = northMeters / 111320;
  const lonDivisor = Math.max(0.15, Math.cos(toRad(latDeg)));
  const lonOffset = eastMeters / (111320 * lonDivisor);
  return { latOffset, lonOffset };
}

/**
 * Computes the great-circle distance between two points using the haversine formula.
 * @param {number} lat1 - Latitude of point 1 (degrees).
 * @param {number} lon1 - Longitude of point 1 (degrees).
 * @param {number} lat2 - Latitude of point 2 (degrees).
 * @param {number} lon2 - Longitude of point 2 (degrees).
 * @returns {number} Distance in kilometres.
 */
export function haversineKm(lat1, lon1, lat2, lon2) {
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Computes the area of a circular sector (camera FOV wedge).
 * @param {number} rangeM - Radius in metres.
 * @param {number} fovDeg - Field of view in degrees.
 * @returns {number} Area in km^2.
 */
export function sectorAreaKm2(rangeM, fovDeg) {
  const theta = toRad(clamp(fovDeg, 12, 170));
  const areaM2 = 0.5 * rangeM * rangeM * theta;
  return areaM2 / 1_000_000;
}
