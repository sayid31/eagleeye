// src/auth/authGuard.mjs
/**
 * Pure access decisions for `/api/*` calls and the `/api/me` payload.
 * `authPlugin.mjs` applies them before any proxy runs; page navigations are
 * decided by `pageRoutes.mjs`. Nothing here performs I/O.
 *
 * @module auth/authGuard
 */

import { hasGate, routeMatches } from './apiGates.mjs';
import { homeFor, normalizeRole } from './authRoles.mjs';

/** Sec-Fetch-Site values a same-origin page (or a typed URL) sends. */
const SAME_ORIGIN_FETCH_SITES = new Set(['same-origin', 'none']);
const ROLE_GATE_ERRORS = {
  admin: ['ADMIN_REQUIRED', 'Only admins can access this'],
  super: ['SUPER_ADMIN_REQUIRED', 'Only super admins can access this'],
};

const deny = (status, code, error, extra = {}) => ({ action: 'deny', status, code, error, ...extra });

/**
 * Decision for an `/api/*` call other than `/api/auth/*` and `/api/me`.
 * @param {object} input
 * @param {string} input.method
 * @param {string} input.pathname Raw request path.
 * @param {string[]} input.gates Gates of the registered routes the path reaches (`gatesForPath`).
 * @param {{role: string, capabilities?: object, mustChangePassword?: boolean} | null} input.actor
 * @param {Record<string, string | undefined>} [input.headers]
 * @param {string} input.trustedOrigin
 * @param {(gate: string) => boolean} [input.isKilled] Global kill switch per gate.
 * @returns {{action: 'next'} | {action: 'deny', status: number, code: string, error: string, gate?: string}}
 */
export function apiDecision({ method, pathname, gates, actor, headers = {}, trustedOrigin, isKilled = () => false }) {
  if (!gates.length) return deny(404, 'NOT_FOUND', 'Endpoint does not exist');
  const fetchSite = headers['sec-fetch-site'];
  if (fetchSite && !SAME_ORIGIN_FETCH_SITES.has(fetchSite)) return deny(403, 'CROSS_SITE_REFUSED', 'Request from another site rejected');
  if (!actor) return deny(401, 'AUTH_REQUIRED', 'Login required');
  if (actor.mustChangePassword) return deny(403, 'PASSWORD_CHANGE_REQUIRED', 'Ganti password dulu');
  for (const gate of gates) {
    if (hasGate(actor, gate)) continue;
    if (ROLE_GATE_ERRORS[gate]) return deny(403, ...ROLE_GATE_ERRORS[gate]);
    return deny(403, 'CAPABILITY_REQUIRED', 'Feature not enabled by an admin', { gate });
  }
  const killed = gates.find((gate) => isKilled(gate));
  if (killed) return deny(503, 'FEATURE_DISABLED', 'Feature is currently turned off by the developer', { gate: killed });
  if (method !== 'GET' && method !== 'HEAD') {
    if (headers.origin !== trustedOrigin) return deny(403, 'ORIGIN_NOT_ALLOWED', 'Origin not allowed');
    if (routeMatches(pathname, '/api/admin') && !/^application\/json\b/i.test(String(headers['content-type'] ?? ''))) {
      return deny(415, 'JSON_REQUIRED', 'Content-Type must be application/json');
    }
  }
  return { action: 'next' };
}

/**
 * `/api/me` v2 (plan/auth/04). Never lists missing env names (those are for `npm run doctor`).
 * @param {{configured: boolean, googleSignIn?: boolean,
 *   actor?: {user: {id: string, name: string, email: string}, role: string, mustChangePassword: boolean,
 *   capabilities: {layers: boolean, ai: boolean, premium: boolean}} | null}} input
 * @returns {{configured: boolean, signedIn: boolean, home: string, googleSignIn: boolean, user?: object}}
 */
export function mePayload({ configured, actor = null, googleSignIn = false }) {
  if (!configured || !actor) return { configured: Boolean(configured), signedIn: false, home: homeFor(null), googleSignIn: Boolean(configured && googleSignIn) };
  const role = normalizeRole(actor.role);
  return {
    configured: true,
    signedIn: true,
    user: {
      id: String(actor.user.id),
      name: actor.user.name ?? '',
      email: actor.user.email,
      role,
      mustChangePassword: Boolean(actor.mustChangePassword),
      capabilities: { ...actor.capabilities },
    },
    home: homeFor(role),
    googleSignIn: Boolean(googleSignIn),
  };
}
