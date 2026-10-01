// Moved out of flights.js (flightsApi).

import * as Cesium from 'cesium';
import { routePlausible } from './routePlausible.js';
import { API_URL } from './flightsConstants.js';
import { S, _activeUpdateControllers, _scratchCarto } from './flightsState.js';

export function _abortActiveUpdates() {
  for (const controller of _activeUpdateControllers) controller.abort();
  _activeUpdateControllers.clear();
}

export function _flightApiUrl(viewer) {
  const cartographic = viewer?.camera?.positionCartographic;
  if (!cartographic) return API_URL;
  const latitude = Cesium.Math.toDegrees(cartographic.latitude);
  const longitude = Cesium.Math.toDegrees(cartographic.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return API_URL;
  const params = new URLSearchParams({
    lat: latitude.toFixed(4),
    lon: longitude.toFixed(4),
  });
  return `${API_URL}?${params}`;
}

/**
 * Normalize a value to a trimmed lowercase string.
 * @param {*} value - Any value (typically a header string or null).
 * @returns {string} Lowercase trimmed string, or '' if falsy.
 */
export function _toLowerText(value) {
  return String(value || '').trim().toLowerCase();
}

/**
 * Normalize a value to a trimmed string. A whitespace-only field ("   ") is
 * truthy, so every label chain must trim FIRST and then fall through.
 * @param {*} value - Any value (typically a metadata string or null).
 * @returns {string} Trimmed string, or '' if falsy.
 */
export function _toCleanText(value) {
  return String(value || '').trim();
}

/**
 * The layer's ONE label convention: spoken callsign → tail registration → raw
 * ICAO hex. Mirrors militaryFlights.js so the same aircraft reads identically
 * in both layers.
 *
 * Registration is aircraft IDENTITY, not route, so unlike the origin/destination
 * line it is NOT plausibility-gated — an adsbdb tail number describes the
 * airframe itself and cannot go stale the way a leg can.
 *
 * This is a DISPLAY string only. Identity everywhere in this layer is `icao24`
 * (the `_billboards`/`_flightData` key, the `sourceId` detection declutter hashes,
 * the `id` that trackById/Context cohorts resolve) — never the label.
 * @param {string} icao24 - ICAO 24-bit transponder address (the identity key).
 * @param {Object|null|undefined} info - `_flightData` record for this aircraft.
 * @returns {string} Display label; never empty.
 */
export function _contactLabel(icao24, info) {
  return _toCleanText(info?.callsign) || _toCleanText(info?.registration) || icao24;
}

/**
 * Map OpenSky proxy response headers into a human-readable auth error string.
 * The Vite proxy forwards `x-opensky-auth-mode-used` and `x-opensky-auth-reason`
 * headers so the client can display a meaningful diagnostic.
 * @param {object} params
 * @param {string} params.detail  - Error body text from the proxy, if any.
 * @param {string} params.authMode - Normalized auth mode header value.
 * @param {string} params.authReason - Normalized auth reason header value.
 * @returns {string} Concise error description for UI display.
 */
export function _deriveOpenSkyAuthError({ detail, authMode, authReason }) {
  const reason = _toLowerText(authReason);
  const mode = _toLowerText(authMode);

  if (reason === 'oauth_invalid_or_missing') {
    return 'OpenSky OAuth client missing/invalid';
  }
  if (reason === 'oauth_invalid_credentials') {
    return 'OpenSky OAuth rejected credentials';
  }
  if (reason === 'basic_invalid_credentials') {
    return 'OpenSky username/password rejected';
  }
  if (reason === 'missing_basic_creds' || reason === 'missing_oauth_and_basic_creds') {
    return 'OpenSky auth missing';
  }
  if (reason === 'auth_required') {
    return 'OpenSky auth required';
  }
  if (reason.startsWith('oauth_') || reason.startsWith('basic_')) {
    return 'OpenSky auth invalid';
  }
  if (reason === 'forced_anonymous' || mode === 'anon') {
    return 'OpenSky auth required';
  }
  if (detail) return detail;
  return 'OpenSky auth failed';
}

export function _normalizeTrackedIcao(candidate) {
  const normalized = String(candidate ?? '').trim().toLowerCase();
  return normalized || null;
}

export function _isUsableOpenSkyState(state) {
  if (!Array.isArray(state) || typeof state[0] !== 'string' || !_normalizeTrackedIcao(state[0])) {
    return false;
  }
  return Number.isFinite(state[5]) && Number.isFinite(state[6]);
}

/** Plausibility check anchored to the plane's billboard position (coarse is
 *  fine here — this gates a LABEL, and it must not touch the tracked frame
 *  cache). Missing data → true (never hide what we can't judge). */
export function _routeIsPlausible(icao24, route) {
  const info = S._flightData.get(icao24);
  const bb = S._billboards.get(icao24);
  if (!info || !bb || !bb.position) return true;
  const carto = Cesium.Cartographic.fromCartesian(bb.position, Cesium.Ellipsoid.WGS84, _scratchCarto);
  if (!carto) return true;
  return routePlausible({
    latDeg: Cesium.Math.toDegrees(carto.latitude),
    lonDeg: Cesium.Math.toDegrees(carto.longitude),
    altitudeM: info.altitude ?? null,
    verticalRateMps: info.verticalRate ?? null,
    origin: route.origin,
    destination: route.destination,
  });
}
