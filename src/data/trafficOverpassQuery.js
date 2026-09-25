/**
 * @file Pure Overpass QL query construction for the traffic layer.
 *
 * Kept separate from `traffic.js` so the query-string shape (highway class
 * regex, bbox ordering, timeout) can be unit-tested without any Cesium or
 * fetch/proxy dependency.
 *
 * @module data/trafficOverpassQuery
 */

/** @const {string} Proxy endpoint for Overpass API queries */
export const OVERPASS_URL = '/api/overpass';

/**
 * Build an Overpass QL query string to fetch road ways within a bounding box.
 *
 * The query uses a highway tag regex filter. When `majorOnly` is true, only
 * motorway/trunk/primary/secondary are included; otherwise all drivable road
 * classes are fetched. The `out geom qt;` suffix returns inline geometry
 * (lat/lon per node) sorted by quadtile for faster server response.
 *
 * @param {number} south - Southern latitude bound (degrees).
 * @param {number} west  - Western longitude bound (degrees).
 * @param {number} north - Northern latitude bound (degrees).
 * @param {number} east  - Eastern longitude bound (degrees).
 * @param {Object}  [opts]
 * @param {boolean} [opts.majorOnly=false] - Restrict to major highway classes only.
 * @param {number}  [opts.timeoutSec=25]   - Overpass server-side timeout.
 * @returns {string} Overpass QL query body.
 */
export function buildOverpassQuery(south, west, north, east, { majorOnly = false, timeoutSec = 25 } = {}) {
  // Regex matches the OSM `highway` tag value against allowed road types
  const regex = majorOnly
    ? '^(motorway|trunk|primary|secondary)$'
    : '^(motorway|trunk|primary|secondary|tertiary|residential|unclassified)$';
  return `[out:json][timeout:${timeoutSec}];(way["highway"~"${regex}"](${south},${west},${north},${east}););out geom qt;`;
}
