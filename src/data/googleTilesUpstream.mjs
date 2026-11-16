/**
 * googleTilesUpstream.mjs — request validation for the Google 3D Tiles proxy
 * (src/data/googleTilesProxy.mjs): maps a client path below
 * `/api/google/3dtiles/` onto the one allowed upstream,
 * `https://tile.googleapis.com/v1/3dtiles/`, and builds the keyed URL.
 *
 * Node-only, pure (no I/O), so the allowlist is testable on its own.
 *
 * @module data/googleTilesUpstream
 */

/** The only upstream origin this proxy ever contacts. */
export const GOOGLE_TILES_UPSTREAM_ORIGIN = 'https://tile.googleapis.com';
/** Upstream path prefix every forwarded request lives under. */
export const GOOGLE_TILES_UPSTREAM_PREFIX = '/v1/3dtiles/';

const MAX_REQUEST_URL_LENGTH = 4096;
const MAX_PATH_SEGMENTS = 12;
const MAX_QUERY_PARAMS = 8;
const MAX_QUERY_VALUE_LENGTH = 1024;
// Unreserved URL characters plus base64's `=` and `+` (Google's dataset file
// names are base64). Excludes `/`, `\`, `%`, `:`, `?`, `#` and `@`, so a
// decoded segment can never smuggle a separator, scheme, host or query.
const PATH_SEGMENT_PATTERN = /^[A-Za-z0-9._~=+-]+$/;
const QUERY_NAME_PATTERN = /^[A-Za-z0-9_.-]{1,64}$/;

const reject = (status, error) => ({ ok: false, status, error });

/**
 * Validate a client request URL (relative to the mount path, e.g.
 * `/datasets/CgA/files/abc.glb?session=x`) and map it to the upstream path
 * and forwardable query. Any client-sent `key` parameter is dropped.
 *
 * @param {string} requestUrl - `req.url` after the mount path was stripped.
 * @returns {{ok: true, path: string, query: URLSearchParams}|{ok: false, status: number, error: string}}
 */
export function resolveGoogleTilesUpstream(requestUrl) {
  const raw = String(requestUrl ?? '');
  if (raw.length > MAX_REQUEST_URL_LENGTH) return reject(414, 'request_url_too_long');
  const queryStart = raw.indexOf('?');
  const rawPath = queryStart === -1 ? raw : raw.slice(0, queryStart);
  const rawQuery = queryStart === -1 ? '' : raw.slice(queryStart + 1);
  if (!rawPath.startsWith('/') || rawPath.includes('\\')) return reject(400, 'invalid_tiles_path');

  const rawSegments = rawPath.slice(1).split('/');
  if (rawSegments.length > MAX_PATH_SEGMENTS) return reject(400, 'invalid_tiles_path');
  const segments = [];
  for (const rawSegment of rawSegments) {
    let segment;
    try {
      segment = decodeURIComponent(rawSegment);
    } catch (error) {
      return reject(400, `invalid_tiles_path_encoding:${error?.name || 'URIError'}`);
    }
    if (!PATH_SEGMENT_PATTERN.test(segment) || /^\.+$/.test(segment)) {
      return reject(400, 'invalid_tiles_path');
    }
    segments.push(segment);
  }
  const isRoot = segments.length === 1 && segments[0] === 'root.json';
  const isDatasetFile = segments.length >= 2
    && segments[0] === 'datasets'
    && /\.(json|glb)$/i.test(segments.at(-1));
  if (!isRoot && !isDatasetFile) return reject(404, 'not_a_3dtiles_path');

  const query = new URLSearchParams();
  let count = 0;
  for (const [name, value] of new URLSearchParams(rawQuery)) {
    if (name.toLowerCase() === 'key') continue; // the server owns the key
    count += 1;
    if (count > MAX_QUERY_PARAMS || !QUERY_NAME_PATTERN.test(name) || value.length > MAX_QUERY_VALUE_LENGTH) {
      return reject(400, 'invalid_tiles_query');
    }
    query.append(name, value);
  }
  return { ok: true, path: `${GOOGLE_TILES_UPSTREAM_PREFIX}${segments.join('/')}`, query };
}

/**
 * Build the upstream URL for a validated target, adding the server key.
 * Throws if the result would leave the fixed upstream origin/prefix (defense
 * in depth: `resolveGoogleTilesUpstream` already guarantees it).
 *
 * @param {{path: string, query: URLSearchParams}} target
 * @param {string} apiKey
 * @returns {URL}
 */
export function buildGoogleTilesUpstreamUrl(target, apiKey) {
  const url = new URL(target.path, GOOGLE_TILES_UPSTREAM_ORIGIN);
  for (const [name, value] of target.query) url.searchParams.append(name, value);
  url.searchParams.set('key', apiKey);
  if (url.origin !== GOOGLE_TILES_UPSTREAM_ORIGIN || !url.pathname.startsWith(GOOGLE_TILES_UPSTREAM_PREFIX)) {
    throw new Error(`Refusing Google tiles upstream outside ${GOOGLE_TILES_UPSTREAM_PREFIX}`);
  }
  return url;
}
