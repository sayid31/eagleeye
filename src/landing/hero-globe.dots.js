// src/landing/hero-globe.dots.js
/**
 * The dot-matrix Earth: lattice points split into land and ocean, each as a flat unit-vector buffer.
 *
 * @module landing/hero-globe.dots
 */

import { isLand } from './hero-globe.landMask.js';
import { latLonToVec, latticePoints } from './hero-globe.math.js';

function toBuffer(points) {
  const buffer = new Float32Array(points.length * 3);
  points.forEach(([lat, lon], index) => buffer.set(latLonToVec(lat, lon), index * 3));
  return buffer;
}

/**
 * @param {{ width: number, height: number, cells: Uint8Array }} mask decoded land mask
 * @param {number} spacing lattice spacing in degrees
 * @returns {{ land: Float32Array, ocean: Float32Array }} x, y, z per dot, three floats each
 */
export function splitDots(mask, spacing) {
  const land = [];
  const ocean = [];
  for (const point of latticePoints(spacing)) (isLand(mask, point[0], point[1]) ? land : ocean).push(point);
  return { land: toBuffer(land), ocean: toBuffer(ocean) };
}
