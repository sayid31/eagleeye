// src/app-access/capabilityFetchGuard.js
/**
 * The one shared fetch path every map feature goes through: wraps
 * `window.fetch` so that
 *  1. a request to a locked gate is answered locally (no network, no 403 in
 *     the console, no poll loop hammering the server), and
 *  2. a real 403 `CAPABILITY_REQUIRED` / 503 `FEATURE_DISABLED` from a gated
 *     route is reported once through `onDenied`, which locks the feature.
 * Requests to open routes and other origins pass through untouched; only
 * 403/503 replies of gated routes are inspected (a cloned body).
 *
 * @module app-access/capabilityFetchGuard
 */

import { capabilityGateFor, sameOriginPath } from './capabilityRoutes.js';
import { lockedResponseFor, readCapabilityDenial } from './capabilityDenial.js';

/**
 * Parse a refusal body; a non-JSON body is simply not a capability refusal.
 * @param {Response} response A clone.
 * @returns {Promise<unknown>}
 */
async function jsonBodyOf(response) {
  if (!/json/i.test(response.headers.get('content-type') ?? '')) return null;
  try {
    return await response.json();
  } catch (error) {
    console.warn(`[access] unreadable ${response.status} body: ${error.message}`);
    return null;
  }
}

/**
 * @param {object} params
 * @param {(gate: string) => string | null} params.lockKindOf Lock kind of a gate, or null when usable.
 * @param {(denial: {gate: string, kind: string}) => void} params.onDenied
 * @param {{fetch: Function, location?: {origin: string}}} [params.target] Defaults to `window`.
 * @param {typeof Response} [params.ResponseImpl]
 * @returns {() => void} Restores the previous `fetch`.
 */
export function installCapabilityFetchGuard({ lockKindOf, onDenied, target = globalThis, ResponseImpl = globalThis.Response }) {
  const original = target.fetch;
  if (typeof original !== 'function') return () => {};
  const origin = () => target.location?.origin ?? 'http://localhost';

  async function guardedFetch(input, init) {
    const gate = capabilityGateFor(input, origin());
    const lockKind = gate ? lockKindOf(gate) : null;
    if (lockKind) {
      const { status, body } = lockedResponseFor(sameOriginPath(input, origin()), gate, lockKind);
      return new ResponseImpl(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
    }
    const response = await original.call(target, input, init);
    if (gate && (response.status === 403 || response.status === 503)) {
      const denial = readCapabilityDenial(response.status, await jsonBodyOf(response.clone()), gate);
      if (denial) onDenied(denial);
    }
    return response;
  }

  target.fetch = guardedFetch;
  return () => {
    if (target.fetch === guardedFetch) target.fetch = original;
  };
}
