// Moved out of militaryFlights.js (militaryFlightsApi).

import { _activeUpdateControllers } from './militaryFlightsState.js';

export function _abortActiveUpdates() {
  for (const controller of _activeUpdateControllers) controller.abort();
  _activeUpdateControllers.clear();
}

/**
 * Coerce a value to a finite number, returning null if not possible.
 * Handles both numeric and string inputs (e.g. API fields that may arrive as strings).
 * @param {*} value - Raw value from the API response
 * @returns {number|null} Finite number or null
 */
export function _toFiniteNumber(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const n = Number.parseFloat(value.trim());
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/**
 * Safely convert a value to a trimmed string, defaulting to '' for falsy inputs.
 * @param {*} value - Raw value to stringify
 * @returns {string} Trimmed string
 */
export function _toCleanText(value) {
  return String(value || '').trim();
}

/**
 * Format an altitude value in feet for display, with fallback text.
 * @param {number|null|undefined} altitudeFt - Barometric altitude in feet
 * @returns {string} Formatted altitude string (e.g. "35000 ft" or "Alt unknown")
 */
export function _formatAltitude(altitudeFt) {
  if (!Number.isFinite(altitudeFt)) return 'Alt tidak diketahui';
  return `${Math.round(altitudeFt)} ft`;
}

export function _normalizeTrackedIcao(candidate) {
  const normalized = String(candidate ?? '').trim().toLowerCase();
  return normalized || null;
}

export function _isUsableMilitaryAircraft(aircraft) {
  if (!aircraft || Array.isArray(aircraft) || typeof aircraft !== 'object') return false;
  if (typeof aircraft.hex !== 'string' || !_normalizeTrackedIcao(aircraft.hex)) return false;
  return Number.isFinite(_toFiniteNumber(aircraft.lon))
    && Number.isFinite(_toFiniteNumber(aircraft.lat));
}
