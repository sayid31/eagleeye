// src/app-access/capabilityDenial.js
/**
 * Server refusals that mean "this feature is off for you" → what the map does
 * about it. Two codes count (src/auth/authGuard.mjs):
 *  - 403 `CAPABILITY_REQUIRED` — the account lacks the toggle (revoked mid-session);
 *  - 503 `FEATURE_DISABLED`   — a developer kill switch turned the gate off for everyone.
 * Either one locks that feature client-side once, with a toast, instead of
 * letting pollers retry into the same refusal. Pure.
 *
 * @module app-access/capabilityDenial
 */

import { CAPABILITY_GATES } from './capabilityRoutes.js';
import { HUD_SUMMARY_UNCONFIGURED_CODE } from '../hudSummaryResponse.js';

/** UI label of each toggle (same words as the admin's Pengguna page). */
export const CAPABILITY_LABELS = Object.freeze({
  layers: 'Layer data',
  ai: 'Voice & AI',
  premium: 'Peta premium & search',
});

/** Tooltip on every locked control. */
export const LOCKED_TOOLTIP = 'Belum diizinkan admin';

/** Why a gate is locked: off in the account at boot, revoked mid-session, or killed globally. */
export const LOCK_KINDS = Object.freeze(['plan', 'revoked', 'killed']);

const DENIAL_CODES = Object.freeze({
  CAPABILITY_REQUIRED: { status: 403, kind: 'revoked' },
  FEATURE_DISABLED: { status: 503, kind: 'killed' },
});

/**
 * A capability refusal, or null for any other response.
 * @param {number} status HTTP status.
 * @param {unknown} body Parsed JSON body (`{error, message, gate}`).
 * @param {string | null} [routeGate] Gate of the requested route, used when the body names none.
 * @returns {{gate: 'layers' | 'ai' | 'premium', kind: 'revoked' | 'killed'} | null}
 */
export function readCapabilityDenial(status, body, routeGate = null) {
  const code = body && typeof body === 'object' ? body.error : null;
  const known = typeof code === 'string' && Object.hasOwn(DENIAL_CODES, code) ? DENIAL_CODES[code] : null;
  if (!known || known.status !== status) return null;
  const gate = CAPABILITY_GATES.includes(body.gate) ? body.gate : routeGate;
  return CAPABILITY_GATES.includes(gate) ? { gate, kind: known.kind } : null;
}

/**
 * Toast text when a feature is locked during the session.
 * @param {{gate: string, kind: string}} denial
 * @returns {string}
 */
export function denialToast({ gate, kind }) {
  const label = CAPABILITY_LABELS[gate] ?? 'Fitur';
  return kind === 'killed'
    ? `${label} sedang dimatikan developer — dinonaktifkan di halaman ini.`
    : `${label} tidak lagi diizinkan admin — dinonaktifkan di halaman ini.`;
}

/**
 * The response the map gets, without a network call, for a request to a
 * locked gate. The HUD summary receives its own "not configured" shape so it
 * quietly keeps its locally composed line instead of logging a failure every
 * 15 s; every other caller sees the same refusal the server would send.
 * @param {string} path Request pathname.
 * @param {string} gate
 * @param {string} kind A LOCK_KINDS value.
 * @returns {{status: number, body: object}}
 */
export function lockedResponseFor(path, gate, kind) {
  if (path === '/api/openai/hud-summary') {
    return { status: 200, body: { configured: false, code: HUD_SUMMARY_UNCONFIGURED_CODE, error: null, summary: null } };
  }
  return kind === 'killed'
    ? { status: 503, body: { error: 'FEATURE_DISABLED', message: 'Fitur sedang dimatikan oleh developer', gate } }
    : { status: 403, body: { error: 'CAPABILITY_REQUIRED', message: LOCKED_TOOLTIP, gate } };
}
