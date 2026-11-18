// src/landing/hero-globe.cities.js
/**
 * Real cities the hero globe links with arcs (decorative; the visual carries no text). Coordinates in degrees.
 *
 * @module landing/hero-globe.cities
 */

export const CITIES = Object.freeze({
  jakarta: { lat: -6.2, lon: 106.85 },
  singapore: { lat: 1.35, lon: 103.82 },
  tokyo: { lat: 35.68, lon: 139.69 },
  sydney: { lat: -33.87, lon: 151.21 },
  dubai: { lat: 25.2, lon: 55.27 },
  london: { lat: 51.51, lon: -0.13 },
  newYork: { lat: 40.71, lon: -74.01 },
  sanFrancisco: { lat: 37.77, lon: -122.42 },
  saoPaulo: { lat: -23.55, lon: -46.63 },
  nairobi: { lat: -1.29, lon: 36.82 },
  capeTown: { lat: -33.92, lon: 18.42 },
});

/** City pairs joined by an arc. */
export const ROUTES = Object.freeze([
  ['jakarta', 'tokyo'],
  ['jakarta', 'dubai'],
  ['jakarta', 'sydney'],
  ['singapore', 'nairobi'],
  ['dubai', 'london'],
  ['london', 'newYork'],
  ['newYork', 'sanFrancisco'],
  ['sanFrancisco', 'tokyo'],
  ['newYork', 'saoPaulo'],
  ['nairobi', 'capeTown'],
]);

/** Cities whose marker pulses; the other endpoints keep a still dot. */
export const PULSING = Object.freeze(['jakarta', 'london', 'newYork', 'tokyo']);
