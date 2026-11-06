// src/server/sameOrigin.mjs
/**
 * Gate for browser-posted routes that are not owner-only (the map has no
 * login): the request must come from this app's own page — exact same Origin
 * as the Host it was sent to — and carry a JSON body, which a cross-site form
 * cannot send without a CORS preflight this server never answers.
 *
 * @module server/sameOrigin
 */

/** @param {{headers?: Record<string, string | undefined>}} req */
export function isSameOriginJson(req) {
  const host = req.headers?.host;
  const origin = req.headers?.origin;
  if (!host || !origin) return false;
  const sameOrigin = origin === `http://${host}` || origin === `https://${host}`;
  return sameOrigin && /^application\/json\b/i.test(String(req.headers?.['content-type'] ?? ''));
}
