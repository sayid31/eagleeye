// src/auth/apiGates.mjs
/**
 * Gates of the `/api/*` routes (plan/auth/01 §Izin): every route declares one
 * when it is registered (`registerApiRoute`, apiRouteRegistry.mjs), and the
 * login guard refuses a request whose actor lacks it. Pure.
 *
 *  - `layers` | `ai` | `premium` — the account's capability toggle of that name;
 *  - `open`  — any signed-in account (no toggle);
 *  - `admin` — admin or super_admin; `super` — super_admin only.
 *
 * @module auth/apiGates
 */

import { effectiveCapabilities } from './authCapabilities.mjs';
import { ROLE_SUPER_ADMIN, isAdminRole } from './authRoles.mjs';

export const API_GATES = Object.freeze(['layers', 'ai', 'premium', 'open', 'admin', 'super']);
/** Least to most restrictive (used only to name one gate when several match). */
const GATE_STRICTNESS = ['open', 'layers', 'ai', 'premium', 'admin', 'super'];
/** Gates a global kill switch may turn off (the paid/provider-backed ones). */
export const KILLABLE_GATES = Object.freeze(['layers', 'ai', 'premium']);

/**
 * Gate of every `/api/admin/*` route prefix (plan/auth/04). Registering an
 * admin prefix with a different gate throws; a prefix missing here may only be
 * registered as `super`. W-C / W-E fill the handlers of the stub entries.
 */
export const ADMIN_API_PERMISSIONS = Object.freeze({
  '/api/admin/users': 'admin',
  '/api/admin/login-log': 'admin',
  '/api/admin/audit': 'admin',
  '/api/admin/kill-switches': 'super',
  '/api/admin/keys': 'super',
  '/api/admin/voice': 'super',
  '/api/admin/log': 'super',
  '/api/admin/health': 'super',
});

const ADMIN_PREFIX = '/api/admin';

/**
 * Connect's own prefix rule, so the gate is decided on exactly the route the
 * request will reach: case-insensitive, and the prefix must end the path or be
 * followed by `/` or `.` (Connect routes `/api/x.json` to `use('/api/x')`).
 * @param {string} pathname Raw (not decoded) request path.
 * @param {string} prefix
 * @returns {boolean}
 */
export function routeMatches(pathname, prefix) {
  const path = String(pathname).toLowerCase();
  const route = prefix.toLowerCase();
  if (!path.startsWith(route)) return false;
  const next = path[route.length];
  return next === undefined || next === '/' || next === '.';
}

/**
 * Gates of every registered route the request path reaches. More than one is
 * possible when a handler falls through (`next()`) to a later one; the guard
 * requires all of them.
 * @param {string} pathname
 * @param {Iterable<{prefix: string, gate: string}>} routes
 * @returns {string[]} Empty when no route serves the path.
 */
export function gatesForPath(pathname, routes) {
  const gates = new Set();
  for (const route of routes) if (routeMatches(pathname, route.prefix)) gates.add(route.gate);
  return [...gates];
}

/**
 * The single gate a path resolves to (the strictest when several match), or null.
 * @param {string} pathname
 * @param {Iterable<{prefix: string, gate: string}>} routes
 * @returns {string | null}
 */
export function gateForPath(pathname, routes) {
  const gates = gatesForPath(pathname, routes);
  if (!gates.length) return null;
  return gates.sort((a, b) => GATE_STRICTNESS.indexOf(b) - GATE_STRICTNESS.indexOf(a))[0];
}

/**
 * Whether the signed-in account passes a gate.
 * @param {{role?: string, capabilities?: unknown} | null | undefined} actor
 * @param {string} gate
 * @returns {boolean}
 */
export function hasGate(actor, gate) {
  if (!actor) return false;
  switch (gate) {
    case 'open': return true;
    case 'admin': return isAdminRole(actor.role);
    case 'super': return actor.role === ROLE_SUPER_ADMIN;
    case 'layers':
    case 'ai':
    case 'premium': return effectiveCapabilities(actor)[gate] === true;
    default: return false;
  }
}

/**
 * The gate a route prefix must be registered with; throws on anything else.
 * @param {string} prefix
 * @param {string} gate
 * @returns {string} The gate.
 */
export function assertRouteGate(prefix, gate) {
  if (typeof prefix !== 'string' || !routeMatches(prefix, '/api') || prefix === '/api' || prefix.endsWith('/')) {
    throw new Error(`registerApiRoute: "${prefix}" is not an /api/<name> prefix`);
  }
  if (!API_GATES.includes(gate)) {
    throw new Error(`registerApiRoute: route ${prefix} has no valid gate (got "${gate}"; expected one of ${API_GATES.join('|')})`);
  }
  if (routeMatches(prefix, ADMIN_PREFIX)) {
    const declared = Object.entries(ADMIN_API_PERMISSIONS).find(([admin]) => routeMatches(prefix, admin))?.[1] ?? 'super';
    if (gate !== declared) throw new Error(`registerApiRoute: admin route ${prefix} must use gate "${declared}" (ADMIN_API_PERMISSIONS), got "${gate}"`);
  }
  return gate;
}

/**
 * Kill-switch hook point: a reader of the global per-gate switches (W-E stores
 * them; until then nothing is switched off). Non-killable gates always pass.
 * @param {() => Record<string, boolean> | null | undefined} [read]
 * @returns {(gate: string) => boolean} true = this gate is switched off for everyone.
 */
export function createKillSwitchCheck(read = () => ({})) {
  return (gate) => KILLABLE_GATES.includes(gate) && read()?.[gate] === true;
}
