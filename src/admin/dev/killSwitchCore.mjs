// src/admin/dev/killSwitchCore.mjs
/**
 * Boundary validation of `PUT /api/admin/kill-switches`. Pure.
 *
 * Body: `{gate, killed, reason, currentPassword?}`. A reason is required to
 * switch a gate OFF (it is what the audit row and the next reader see); turning
 * it back on may omit it. `currentPassword` is checked by the account service
 * (a Google-only super_admin with a sign-in < 10 min old may omit it).
 *
 * @module admin/dev/killSwitchCore
 */

import { KILLABLE_GATES } from '../../auth/apiGates.mjs';
import { MAX_KILL_REASON_LENGTH } from '../../auth/killSwitchStore.mjs';

export const MIN_KILL_REASON_LENGTH = 3;
/** Generous cap: a password field is never this long, a pasted blob is refused. */
export const MAX_PASSWORD_INPUT_LENGTH = 1024;

const invalid = (field) => ({ ok: false, code: 'INVALID_INPUT', field });

/**
 * @param {unknown} body Parsed JSON body.
 * @returns {{ok: true, value: {gate: string, killed: boolean, reason: string, currentPassword: string}}
 *   | {ok: false, code: 'INVALID_INPUT', field: string}}
 */
export function parseKillSwitchUpdate(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return invalid('body');
  const { gate, killed, reason = '', currentPassword = '' } = body;
  if (!KILLABLE_GATES.includes(gate)) return invalid('gate');
  if (typeof killed !== 'boolean') return invalid('killed');
  if (typeof reason !== 'string') return invalid('reason');
  const text = reason.trim();
  if (text.length > MAX_KILL_REASON_LENGTH || (killed && text.length < MIN_KILL_REASON_LENGTH)) return invalid('reason');
  if (typeof currentPassword !== 'string' || currentPassword.length > MAX_PASSWORD_INPUT_LENGTH) return invalid('currentPassword');
  return { ok: true, value: { gate, killed, reason: text, currentPassword } };
}

/**
 * Audit summary of one switch change (no secret; the reason is operator text, capped by the store).
 * @param {{gate: string, killed: boolean, reason: string}} change
 * @returns {string}
 */
export function killSwitchAuditSummary({ gate, killed, reason }) {
  return `${gate} ${killed ? 'off' : 'on'}${reason ? `: ${reason}` : ''}`;
}
