// src/geocodeProviderSelect.js
/**
 * Which forward-geocode provider answers (src/geocodeProvider.js). Pure.
 *
 * @module geocodeProviderSelect
 */

/**
 * Google only when it is requested (`GEOCODE_PROVIDER=google`) AND the Google
 * proxy can answer for this account — the server has a key and the account
 * holds the `premium` toggle (main.js and src/app-access/accessEffects.js
 * clear `window.__GOOGLE_MAPS_PROXY_AVAILABLE__` otherwise). Anything else uses
 * keyless Nominatim, so search keeps working without `premium`.
 * @param {{requested?: string | null, googleAvailable?: boolean}} [input]
 * @returns {'google' | 'nominatim'}
 */
export function selectGeocodeProvider({ requested, googleAvailable = false } = {}) {
  const wantsGoogle = String(requested || 'nominatim').trim().toLowerCase() === 'google';
  return wantsGoogle && googleAvailable === true ? 'google' : 'nominatim';
}
