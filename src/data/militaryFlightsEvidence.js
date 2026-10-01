// Moved out of militaryFlights.js (militaryFlightsEvidence).

import { tr3bAircraftClass } from './tr3bRegistry.js';

/**
 * Map one military aircraft's internal poll record to a plain JSON-safe
 * analyst record (analyst query engine seam) — same shape as the flights
 * layer's mapAnalystRecord, with `military` always true. Pure — no Cesium
 * types, no fetches. Missing/unknown fields are null, never NaN/undefined.
 * adsb.lol carries no origin-country field and this layer has no route
 * enrichment, so originCountry/routeOrigin/routeDestination are always null.
 * @param {string} icao24 - ICAO hex identifier of the aircraft.
 * @param {Object|null|undefined} info - `_flightData` record for this aircraft.
 * @returns {{id: string, icao24: string, callsign: string|null, lat: number|null,
 *   lon: number|null, altitudeM: number|null, speedMps: number|null,
 *   heading: number|null, verticalRateMps: number|null, onGround: boolean,
 *   military: boolean, aircraftClass: string|null, originCountry: null,
 *   operator: string|null, routeOrigin: null, routeDestination: null}}
 */
export function mapAnalystRecord(icao24, info) {
  const num = (v) => (Number.isFinite(v) ? v : null);
  const text = (v) => { const t = String(v ?? '').trim(); return t || null; };
  const callsign = text(info?.callsign);
  return {
    id: callsign || text(info?.registration) || icao24,
    icao24,
    callsign,
    lat: num(info?.rawLat),
    lon: num(info?.rawLon),
    // altitudeFt is the sticky barometric/MSL aviation field — converted to
    // meters here for shape parity with the flights layer.
    altitudeM: Number.isFinite(info?.altitudeFt) ? info.altitudeFt * 0.3048 : null,
    speedMps: num(info?.speedMps),
    heading: num(info?.track),
    verticalRateMps: num(info?.verticalRateMps),
    onGround: info?.onGround === true,
    military: true,
    // A converted contact reports the class it RENDERS as (mirror of
    // flights.js), so an analyst filter/superlative agrees with the triangle.
    aircraftClass: tr3bAircraftClass(icao24, text(info?.klass)),
    originCountry: null,
    operator: text(info?.operator),
    routeOrigin: null,
    routeDestination: null,
  };
}
