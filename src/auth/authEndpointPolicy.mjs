// src/auth/authEndpointPolicy.mjs
/**
 * Which Better Auth endpoints the outside world may reach (plan/auth/03
 * §allowlist). Better Auth registers many more (`sign-up/email`,
 * `verify-password`, `request-password-reset`, …); every one not listed here is
 * answered 404 before Better Auth sees the request. The path is checked RAW:
 * anything that a router might normalize differently (encoded characters, dot
 * segments, doubled or back slashes) is refused instead of decoded, so
 * `/api/auth/sign-in/%2e%2e/admin/x` can never reach another endpoint. Pure.
 *
 * @module auth/authEndpointPolicy
 */

export const AUTH_BASE_PATH = '/api/auth';

/** Exact `METHOD /path` pairs (path relative to AUTH_BASE_PATH). */
export const AUTH_ENDPOINT_ALLOWLIST = Object.freeze([
  'POST /sign-in/email',
  'POST /sign-out',
  'GET /get-session',
  'POST /change-password',
  'POST /update-user',
  'POST /revoke-other-sessions',
  // Google, for super_admin only (the hooks refuse every other account).
  'POST /sign-in/social',
  'GET /callback/google',
]);

/** Endpoints a signed-in account that must change its password may still call. */
export const PASSWORD_CHANGE_ALLOWED = Object.freeze(['POST /change-password', 'GET /get-session', 'POST /sign-out']);

/**
 * Canonical endpoint of a raw request URL, or null when the URL is not plain.
 * @param {string} rawUrl `req.url` (path + optional query).
 * @returns {string | null} e.g. `/sign-in/email`.
 */
export function canonicalAuthPath(rawUrl) {
  const raw = String(rawUrl ?? '');
  const queryAt = raw.search(/[?#]/);
  const pathname = queryAt < 0 ? raw : raw.slice(0, queryAt);
  if (!pathname.startsWith(`${AUTH_BASE_PATH}/`)) return null;
  if (/[%\\]/.test(pathname) || pathname.includes('//')) return null;
  const rest = pathname.slice(AUTH_BASE_PATH.length);
  if (rest.split('/').some((segment) => segment === '.' || segment === '..')) return null;
  return rest;
}

/**
 * Whether a request may be handed to Better Auth.
 * @param {string} method
 * @param {string} rawUrl
 * @returns {{allowed: true, endpoint: string} | {allowed: false}}
 */
export function authEndpointDecision(method, rawUrl) {
  const path = canonicalAuthPath(rawUrl);
  const endpoint = path === null ? null : `${String(method).toUpperCase()} ${path}`;
  return endpoint && AUTH_ENDPOINT_ALLOWLIST.includes(endpoint) ? { allowed: true, endpoint } : { allowed: false };
}

/**
 * Origin gate for state-changing auth endpoints. Better Auth checks the Origin
 * only when the request already carries cookies, so a cookie-less cross-origin
 * POST to `sign-in/email` or `sign-in/social` would otherwise be accepted.
 * @param {{method: string, headers?: Record<string, string | undefined>, trustedOrigin: string}} input
 * @returns {boolean}
 */
export function authEndpointOriginAllowed({ method, headers = {}, trustedOrigin }) {
  if (method === 'GET' || method === 'HEAD') return true;
  const fetchSite = headers['sec-fetch-site'];
  if (fetchSite && fetchSite !== 'same-origin') return false;
  if (headers.origin) return headers.origin === trustedOrigin;
  try {
    return Boolean(headers.referer) && new URL(headers.referer).origin === trustedOrigin;
  } catch {
    // An unparseable Referer proves nothing about the origin.
    return false;
  }
}
