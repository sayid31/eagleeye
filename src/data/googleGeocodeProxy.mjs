/**
 * googleGeocodeProxy.mjs — same-origin Google Geocoding proxy that keeps
 * GOOGLE_MAPS_API_KEY server-side.
 *
 * Node-only (imported by vite.config.js), never bundled for the browser.
 * `GET /api/google/geocode?address=<text>[&bounds=<s,w|n,e>]` forward-geocodes;
 * `GET /api/google/geocode?latlng=<lat,lng>` reverse-geocodes. The server
 * validates the parameters, forwards only those to the fixed Geocoding
 * endpoint with `key` from the environment, and answers with Google's own
 * `{ status, results }` shape (Google's free-text `error_message` is dropped).
 * Without a configured key the route answers 503 `NOT_CONFIGURED` and never
 * contacts Google. Throttled by the same opt-in Google limiter as Places
 * (`GEV_RATELIMIT_GOOGLE_PER_MIN`).
 *
 * @module data/googleGeocodeProxy
 */

import { enforceOptInRateLimit, googleRateLimiter, readResponseTextCapped } from '../server/proxyInfra.mjs';
import { redactSecret } from '../server/redactSecret.mjs';
import { registerApiRoute } from '../auth/apiRouteRegistry.mjs';

/** Same-origin mount path of the geocoding proxy. */
export const GOOGLE_GEOCODE_ROUTE = '/api/google/geocode';
/** The only upstream this proxy ever contacts. */
export const GOOGLE_GEOCODE_UPSTREAM = 'https://maps.googleapis.com/maps/api/geocode/json';
/** Longest accepted forward-geocode query. */
export const GOOGLE_GEOCODE_MAX_ADDRESS_LENGTH = 256;
const MAX_RESPONSE_BYTES = 1024 * 1024;
const UPSTREAM_TIMEOUT_MS = 8000;
const NUMBER = '\\s*(-?\\d{1,3}(?:\\.\\d+)?)\\s*';
const LAT_LNG_PATTERN = new RegExp(`^${NUMBER},${NUMBER}$`);
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/;

/** Parse `"lat,lng"` into a range-checked pair, or null. */
function parseLatLng(text) {
  const match = LAT_LNG_PATTERN.exec(String(text));
  if (!match) return null;
  const lat = Number(match[1]);
  const lng = Number(match[2]);
  if (!(Math.abs(lat) <= 90) || !(Math.abs(lng) <= 180)) return null;
  return { lat, lng };
}

const invalid = (error) => ({ ok: false, error });

/**
 * Validate the client query and build the parameters forwarded to Google
 * (without the key). Exactly one of `address` / `latlng` is required;
 * `bounds` is only valid with `address`.
 *
 * @param {string} requestUrl - `req.url` after the mount path was stripped.
 * @returns {{ok: true, mode: 'forward'|'reverse', params: URLSearchParams}|{ok: false, error: string}}
 */
export function parseGoogleGeocodeQuery(requestUrl) {
  const search = new URL(String(requestUrl ?? ''), 'http://localhost').searchParams;
  const address = String(search.get('address') ?? '').trim();
  const latlng = search.get('latlng');
  const bounds = search.get('bounds');
  if (address && latlng !== null) return invalid('address and latlng are mutually exclusive');

  if (latlng !== null) {
    if (bounds !== null) return invalid('bounds is only valid with address');
    const point = parseLatLng(latlng);
    if (!point) return invalid('latlng must be "lat,lng" within range');
    return { ok: true, mode: 'reverse', params: new URLSearchParams({ latlng: `${point.lat},${point.lng}` }) };
  }

  if (!address) return invalid('A non-empty address or latlng is required');
  if (address.length > GOOGLE_GEOCODE_MAX_ADDRESS_LENGTH || CONTROL_CHARS.test(address)) {
    return invalid(`address must be at most ${GOOGLE_GEOCODE_MAX_ADDRESS_LENGTH} printable characters`);
  }
  const params = new URLSearchParams({ address });
  if (bounds !== null) {
    const corners = String(bounds).split('|');
    const southWest = corners.length === 2 ? parseLatLng(corners[0]) : null;
    const northEast = corners.length === 2 ? parseLatLng(corners[1]) : null;
    if (!southWest || !northEast) return invalid('bounds must be "south,west|north,east" within range');
    params.set('bounds', `${southWest.lat},${southWest.lng}|${northEast.lat},${northEast.lng}`);
  }
  return { ok: true, mode: 'forward', params };
}

function sendJson(res, status, payload) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(payload));
}

/**
 * Create the request handler behind `/api/google/geocode`.
 *
 * @param {object} [options]
 * @param {typeof fetch} [options.fetchImpl] - Upstream fetch (tests inject a stub).
 * @param {() => (string|undefined)} [options.getApiKey] - Reads the key per request.
 * @param {{warn: Function}} [options.logger]
 * @param {() => (((key: string) => boolean)|null)} [options.getRateLimiter] - Defaults to the
 *   shared opt-in Google limiter (`GEV_RATELIMIT_GOOGLE_PER_MIN`, also used by Places).
 * @returns {(req: import('http').IncomingMessage, res: import('http').ServerResponse) => Promise<void>}
 */
export function createGoogleGeocodeHandler({
  fetchImpl = (...args) => globalThis.fetch(...args),
  getApiKey = () => process.env.GOOGLE_MAPS_API_KEY,
  logger = console,
  getRateLimiter = googleRateLimiter,
} = {}) {
  return async function handleGoogleGeocode(req, res) {
    if (req.method !== 'GET') {
      sendJson(res, 405, { status: 'INVALID_REQUEST', error: 'Method not allowed', results: [] });
      return;
    }
    const parsed = parseGoogleGeocodeQuery(req.url);
    if (!parsed.ok) {
      sendJson(res, 400, { status: 'INVALID_REQUEST', error: parsed.error, results: [] });
      return;
    }
    // A missing key costs nothing upstream, so it resolves before the limiter.
    const apiKey = String(getApiKey() ?? '').trim();
    if (!apiKey) {
      sendJson(res, 503, { status: 'NOT_CONFIGURED', error: 'google_maps_key_not_configured', results: [] });
      return;
    }
    if (!enforceOptInRateLimit(getRateLimiter(), req, res)) return;

    const upstreamUrl = new URL(GOOGLE_GEOCODE_UPSTREAM);
    for (const [name, value] of parsed.params) upstreamUrl.searchParams.set(name, value);
    upstreamUrl.searchParams.set('key', apiKey);

    try {
      const upstream = await fetchImpl(upstreamUrl, {
        redirect: 'error',
        signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
      });
      if (!upstream.ok) {
        await upstream.body?.cancel?.();
        logger.warn(`[google-geocode-proxy] ${parsed.mode} upstream HTTP ${upstream.status}`);
        sendJson(res, 502, { status: 'UPSTREAM_ERROR', error: `Google Geocoding HTTP ${upstream.status}`, results: [] });
        return;
      }
      const data = JSON.parse(await readResponseTextCapped(upstream, MAX_RESPONSE_BYTES));
      sendJson(res, 200, {
        status: typeof data?.status === 'string' ? data.status : 'UNKNOWN_ERROR',
        results: Array.isArray(data?.results) ? data.results : [],
      });
    } catch (error) {
      logger.warn(`[google-geocode-proxy] ${parsed.mode} request failed: ${redactSecret(error?.message || error, apiKey)}`);
      sendJson(res, 502, { status: 'UPSTREAM_ERROR', error: 'Google Geocoding is temporarily unavailable', results: [] });
    }
  };
}

/**
 * Vite plugin: mount the Google Geocoding proxy on the dev and preview servers.
 *
 * @param {Parameters<typeof createGoogleGeocodeHandler>[0]} [options]
 * @returns {import('vite').Plugin}
 */
export function googleGeocodeProxy(options = {}) {
  const install = (middlewares) => registerApiRoute(middlewares, GOOGLE_GEOCODE_ROUTE, 'premium', createGoogleGeocodeHandler(options));
  return {
    name: 'google-geocode-proxy',
    configureServer(server) {
      install(server.middlewares);
    },
    configurePreviewServer(server) {
      install(server.middlewares);
    },
  };
}
