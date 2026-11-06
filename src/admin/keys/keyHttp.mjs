// src/admin/keys/keyHttp.mjs
/**
 * HTTP helpers for the /admin → API Keys routes.
 * @module admin/keys/keyHttp
 */

const MAX_BODY_BYTES = 8192;

/** JSON response that is never cached and never framed (clickjacking a same-origin save). */
export function respondNoStore(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Content-Security-Policy', "frame-ancestors 'none'");
  res.end(JSON.stringify(payload));
}

/**
 * Read a small request body; resolves `null` when it is over the limit.
 * @returns {Promise<string | null>}
 */
export function readSmallBody(req, maxBytes = MAX_BODY_BYTES) {
  return new Promise((resolve, reject) => {
    let body = '';
    let overflowed = false;
    req.on('data', (chunk) => {
      if (overflowed) return;
      body += chunk;
      if (body.length > maxBytes) {
        overflowed = true;
        req.destroy();
        resolve(null);
      }
    });
    req.on('end', () => { if (!overflowed) resolve(body); });
    req.on('error', (error) => { if (!overflowed) reject(error); });
  });
}

/** Names only — never a value — for the audit trail. */
export function summarize(result) {
  return result.ok
    ? { saved: result.saved, removed: result.removed }
    : { httpStatus: result.httpStatus };
}
