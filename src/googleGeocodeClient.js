// src/googleGeocodeClient.js — browser side of the Google Geocoding proxy.
//
// The Google key lives only on the server (src/data/googleGeocodeProxy.mjs).
// The browser learns just whether the server has one: main.js copies the
// build-time boolean `import.meta.env.GOOGLE_MAPS_PROXY_AVAILABLE` to
// `window.__GOOGLE_MAPS_PROXY_AVAILABLE__` (the window copy is also the hook
// the unit tests stub, since plain Node has no `import.meta.env`).

/** Same-origin Google Geocoding route (forward `address`/`bounds`, reverse `latlng`). */
export const GOOGLE_GEOCODE_PROXY_PATH = '/api/google/geocode';

/**
 * Whether the server has a Google Maps key, so the Google proxies can answer.
 * @returns {boolean}
 */
export function googleMapsProxyAvailable() {
  const flag = globalThis.window?.__GOOGLE_MAPS_PROXY_AVAILABLE__;
  if (flag !== undefined) return flag === true;
  const envFlag = typeof import.meta.env !== 'undefined' ? import.meta.env.GOOGLE_MAPS_PROXY_AVAILABLE : undefined;
  return envFlag === true;
}

/**
 * Same-origin forward-geocode URL.
 * @param {string} address - Place text to geocode.
 * @param {string|null} [bounds] - Optional viewport bias, `"south,west|north,east"`.
 * @returns {string}
 */
export function googleForwardGeocodeUrl(address, bounds = null) {
  const params = new URLSearchParams({ address: String(address) });
  if (bounds) params.set('bounds', String(bounds));
  return `${GOOGLE_GEOCODE_PROXY_PATH}?${params}`;
}

/**
 * Same-origin reverse-geocode URL.
 * @param {number} latitude
 * @param {number} longitude
 * @returns {string}
 */
export function googleReverseGeocodeUrl(latitude, longitude) {
  return `${GOOGLE_GEOCODE_PROXY_PATH}?${new URLSearchParams({ latlng: `${latitude},${longitude}` })}`;
}
