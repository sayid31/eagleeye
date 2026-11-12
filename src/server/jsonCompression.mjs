/**
 * jsonCompression.mjs — gzip-aware JSON responses for dev-server proxy routes.
 *
 * Vite's dev middleware stack (which is also what pm2 runs in production, see
 * ecosystem.config.cjs) has no compression. A multi-MB JSON snapshot that is
 * instant on localhost then has to cross the origin's uplink uncompressed
 * behind a reverse proxy — /api/ais-live at 12k rows was ~2.8 MB / 17 s
 * there, past the client's fetch timeout. JSON vessel rows compress ~6x.
 */
import { promisify } from 'node:util';
import { gzip } from 'node:zlib';

const gzipAsync = promisify(gzip);

/** Bodies below this size are sent as-is; gzip framing would not pay off. */
export const MIN_COMPRESS_BYTES = 1024;

/**
 * Pick the response encoding from an Accept-Encoding header.
 * Only gzip is offered: brotli's default quality is too slow for a per-poll
 * multi-MB body, and every browser accepts gzip.
 * @param {string|string[]|undefined} acceptEncoding
 * @returns {'gzip'|'identity'}
 */
export function negotiateJsonEncoding(acceptEncoding) {
  const header = Array.isArray(acceptEncoding) ? acceptEncoding.join(',') : String(acceptEncoding || '');
  for (const part of header.split(',')) {
    const [token, ...params] = part.trim().toLowerCase().split(';');
    if (token !== 'gzip' && token !== '*') continue;
    const q = params.map((p) => p.trim()).find((p) => p.startsWith('q='));
    if (q && !(Number(q.slice(2)) > 0)) continue;
    return 'gzip';
  }
  return 'identity';
}

/**
 * Send `payload` as JSON, gzip-compressed when the client accepts it and the
 * body is large enough. A compression failure falls back to the plain body
 * (logged) rather than failing a request whose data is fine.
 * @param {import('node:http').IncomingMessage} req
 * @param {import('node:http').ServerResponse} res
 * @param {number} statusCode
 * @param {unknown} payload
 * @param {Record<string,string>} [headers] Extra headers (e.g. Cache-Control).
 * @returns {Promise<void>}
 */
export function sendJson(req, res, statusCode, payload, headers = {}) {
  return sendBody(req, res, statusCode, JSON.stringify(payload), {
    'Content-Type': 'application/json; charset=utf-8', ...headers,
  });
}

/**
 * Send an already-serialized body (e.g. a cached Overpass JSON string) with
 * the same gzip negotiation as `sendJson`. `headers` must carry Content-Type.
 * @param {import('node:http').IncomingMessage} req
 * @param {import('node:http').ServerResponse} res
 * @param {number} statusCode
 * @param {string|Buffer} text
 * @param {Record<string,string>} headers
 * @returns {Promise<void>}
 */
export async function sendBody(req, res, statusCode, text, headers) {
  const body = Buffer.isBuffer(text) ? text : Buffer.from(String(text ?? ''), 'utf8');
  let encoded = body;
  let encoding = 'identity';
  if (body.length >= MIN_COMPRESS_BYTES && negotiateJsonEncoding(req.headers?.['accept-encoding']) === 'gzip') {
    try {
      encoded = await gzipAsync(body);
      encoding = 'gzip';
    } catch (error) {
      console.warn(`[json-compression] gzip failed for ${req.url || 'request'}; sending uncompressed`, error?.message || '');
    }
  }
  res.statusCode = statusCode;
  for (const [name, value] of Object.entries(headers)) res.setHeader(name, value);
  res.setHeader('Vary', 'Accept-Encoding');
  if (encoding === 'gzip') res.setHeader('Content-Encoding', 'gzip');
  res.setHeader('Content-Length', String(encoded.length));
  res.end(encoded);
}
