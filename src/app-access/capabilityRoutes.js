// src/app-access/capabilityRoutes.js
/**
 * Which per-user toggle a same-origin `/api/*` request needs, as the browser
 * sees it (plan/auth/01 §Izin). Mirrors the server's `registerApiRoute` gates
 * for the three capability toggles only — the server stays the enforcement;
 * this table lets the map skip calls it would be refused and name the
 * feature a refusal belongs to. `capabilityRoutes.test.mjs` keeps it in step
 * with the server registrations. Pure.
 *
 * @module app-access/capabilityRoutes
 */

import { routeMatches } from '../auth/apiGates.mjs';

/** The toggles a user account can lack (the `capabilities` keys). */
export const CAPABILITY_GATES = Object.freeze(['layers', 'ai', 'premium']);

/** Route prefix → capability toggle, for every toggle-gated route the map calls. */
export const CAPABILITY_ROUTE_GATES = Object.freeze({
  '/api/opensky': 'layers',
  '/api/opensky-track': 'layers',
  '/api/adsblol': 'layers',
  '/api/adsbdb': 'layers',
  '/api/ais-live': 'layers',
  '/api/celestrak': 'layers',
  '/api/launches': 'layers',
  '/api/firms': 'layers',
  '/api/gbfs': 'layers',
  '/api/cctv': 'layers',
  '/api/radio': 'layers',
  '/api/tomtom': 'layers',
  '/api/overpass': 'layers',
  '/api/military-installations': 'layers',
  '/api/mymaps': 'layers',
  '/api/regional-brief': 'layers',
  '/api/live': 'ai',
  '/api/voice/usage': 'ai',
  '/api/voice/judge': 'ai',
  '/api/openai': 'ai',
  '/api/route': 'ai',
  '/api/google': 'premium',
});

const ROUTES = Object.entries(CAPABILITY_ROUTE_GATES);

/**
 * Pathname of a same-origin request, or null for another origin / junk input.
 * @param {string | URL | {url?: string}} input A `fetch` input.
 * @param {string} origin The page origin.
 * @returns {string | null}
 */
export function sameOriginPath(input, origin) {
  const raw = typeof input === 'string' ? input : input?.url ?? (input instanceof URL ? input.href : null);
  if (typeof raw !== 'string' || !raw) return null;
  let url;
  try {
    url = new URL(raw, origin);
  } catch {
    // Not a URL the browser could fetch either; nothing to gate.
    return null;
  }
  return url.origin === new URL(origin).origin ? url.pathname : null;
}

/**
 * The capability toggle a request needs, or null when it needs none (open
 * routes, other origins, non-API paths).
 * @param {string | URL | {url?: string}} input
 * @param {string} origin
 * @returns {'layers' | 'ai' | 'premium' | null}
 */
export function capabilityGateFor(input, origin) {
  const path = sameOriginPath(input, origin);
  if (!path) return null;
  const hit = ROUTES.find(([prefix]) => routeMatches(path, prefix));
  return hit ? hit[1] : null;
}
