// src/landing/legacyShareRedirect.js
/**
 * Old share links point at `/#lat=…&lon=…` (and debug links at `/?welcome=` or
 * `/?trafficDebug=`). Now that `/` is the landing page, those visits belong to
 * the map at `/app`; a normal landing visit (no hash, or an in-page anchor such
 * as `#sumber`) stays put.
 *
 * @module landing/legacyShareRedirect
 */

/** Where the map console lives. */
export const APP_PATH = '/app';

/** Query params the map reads at boot (firstRunExperience, trafficConstants). */
export const APP_QUERY_PARAMS = Object.freeze(['welcome', 'trafficDebug']);

/**
 * True when `hash` carries map share state. Mirrors the acceptance rule of
 * `ShareLinkManager.parseInitialHash` in src/sharelink.js: the hash is a
 * URLSearchParams string with finite `lat` and `lon`.
 * @param {string} hash `location.hash`, with or without the leading `#`
 * @returns {boolean}
 */
export function isShareStateHash(hash) {
  const body = typeof hash === 'string' ? hash.replace(/^#/, '') : '';
  if (!body) return false;
  const params = new URLSearchParams(body);
  if (!params.has('lat') || !params.has('lon')) return false;
  return Number.isFinite(parseFloat(params.get('lat'))) && Number.isFinite(parseFloat(params.get('lon')));
}

/**
 * True when `search` carries a query param the map console reads at boot.
 * @param {string} search `location.search`, with or without the leading `?`
 * @returns {boolean}
 */
export function hasAppQueryParam(search) {
  const params = new URLSearchParams(typeof search === 'string' ? search : '');
  return APP_QUERY_PARAMS.some((name) => params.has(name));
}

/**
 * Target for `location.replace` when the visit is a legacy map link, else `null`.
 * Query and hash are forwarded unchanged so the map restores the shared view.
 * @param {{search?: string, hash?: string}} location
 * @returns {string | null}
 */
export function legacyAppRedirect({ search = '', hash = '' } = {}) {
  if (!isShareStateHash(hash) && !hasAppQueryParam(search)) return null;
  return `${APP_PATH}${search}${hash}`;
}
