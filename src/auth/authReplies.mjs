// src/auth/authReplies.mjs
/**
 * The few raw HTTP replies the login guard sends itself (JSON, redirect, 404).
 * Every reply is `no-store`: it depends on who is asking.
 *
 * @module auth/authReplies
 */

/**
 * @param {import('node:http').ServerResponse} res
 * @param {number} status
 * @param {object} payload
 * @param {string[]} [setCookies]
 */
export function sendJson(res, status, payload, setCookies = []) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  if (setCookies.length) res.setHeader('Set-Cookie', setCookies);
  res.end(JSON.stringify(payload));
}

/** @param {import('node:http').ServerResponse} res @param {string} location Same-origin path. */
export function redirect(res, location) {
  res.statusCode = 302;
  res.setHeader('Location', location);
  res.setHeader('Cache-Control', 'no-store');
  res.end();
}

/** Plain 404 for a path that is neither a page, an API route nor an allowlisted asset. */
export function sendNotFound(res) {
  res.statusCode = 404;
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end('Tidak ditemukan');
}
