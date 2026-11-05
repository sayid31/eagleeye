// src/admin/auth/adminSession.mjs
/**
 * Stateless signed tokens + cookie helpers for admin login.
 *
 * Tokens are `base64url(json).base64url(hmac-sha256)`. Each carries a `kind`
 * so the short-lived OAuth "pending" token can never be replayed as a session.
 *
 * @module admin/auth/adminSession
 */
import { createHmac, timingSafeEqual } from 'node:crypto';

export const SESSION_COOKIE = 'gev_admin_session';
export const PENDING_COOKIE = 'gev_admin_oauth';

const sign = (body, secret) => createHmac('sha256', secret).update(body).digest('base64url');

/**
 * Constant-time string comparison.
 * @param {string} a
 * @param {string} b
 * @returns {boolean}
 */
export function safeEqual(a, b) {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  return left.length === right.length && timingSafeEqual(left, right);
}

/**
 * @param {object} claims Extra claims (e.g. `email`, `state`).
 * @param {{kind: string, secret: string, ttlMs: number, now?: number}} options
 * @returns {string}
 */
export function createToken(claims, { kind, secret, ttlMs, now = Date.now() }) {
  const body = Buffer.from(JSON.stringify({ ...claims, kind, iat: now, exp: now + ttlMs })).toString('base64url');
  return `${body}.${sign(body, secret)}`;
}

/**
 * @param {string | undefined} token
 * @param {{kind: string, secret: string, now?: number}} options
 * @returns {object | null} Claims, or null when forged, expired, malformed or of another kind.
 */
export function verifyToken(token, { kind, secret, now = Date.now() }) {
  const parts = typeof token === 'string' ? token.split('.') : [];
  if (parts.length !== 2 || !safeEqual(parts[1], sign(parts[0], secret))) return null;
  let claims;
  try {
    claims = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  if (!claims || claims.kind !== kind || !(claims.exp > now)) return null;
  return claims;
}

/**
 * @param {string | undefined} header Raw Cookie header.
 * @returns {Record<string, string>}
 */
export function parseCookies(header) {
  const jar = {};
  for (const pair of String(header ?? '').split(';')) {
    const at = pair.indexOf('=');
    if (at > 0) jar[pair.slice(0, at).trim()] = pair.slice(at + 1).trim();
  }
  return jar;
}

/**
 * Builds a Set-Cookie value. HttpOnly always; `maxAgeSec: 0` deletes the cookie.
 * @param {string} name
 * @param {string} value
 * @param {{maxAgeSec: number, secure: boolean, sameSite: 'Strict' | 'Lax'}} options
 * @returns {string}
 */
export function serializeCookie(name, value, { maxAgeSec, secure, sameSite }) {
  return [`${name}=${value}`, 'Path=/', 'HttpOnly', `SameSite=${sameSite}`, `Max-Age=${maxAgeSec}`, secure ? 'Secure' : null]
    .filter(Boolean)
    .join('; ');
}
