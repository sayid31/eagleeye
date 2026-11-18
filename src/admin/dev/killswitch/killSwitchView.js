// src/admin/dev/killswitch/killSwitchView.js
/**
 * View-model of the Kill switch page: per-gate rows (state, who/when/why), the confirm-dialog configuration for a
 * requested change and the PUT body. Pure; the server validates the same rules (killSwitchCore.mjs).
 *
 * @module admin/dev/killswitch/killSwitchView
 */
import { GATE_COPY, KILL_SWITCH_COPY as T } from '../../../copy/id/system.js';
import { MIN_KILL_REASON_LENGTH } from '../killSwitchCore.mjs';
import { formatAbsolute, formatRelative } from '../lib/timeView.js';

export { MIN_KILL_REASON_LENGTH };

/** Gate label; unknown gates read as their key. */
export const gateLabel = (gate) => GATE_COPY[gate]?.label ?? gate;

/**
 * @param {{gate: string, killed: boolean, reason: string | null, updatedAt: number | null,
 *   updatedBy: {id: string, emailMasked: string | null} | null}} row One entry of `GET /api/admin/kill-switches`.
 * @param {number} now
 * @returns {{gate: string, label: string, stops: string, killed: boolean, status: 'ok' | 'error', statusLabel: string,
 *   switchLabel: string, lastChange: string, reason: string | null, absolute: string | null}}
 */
export function gateRow(row, now) {
  const label = gateLabel(row.gate);
  const changed = Number.isFinite(row.updatedAt);
  const who = row.updatedBy?.emailMasked ?? row.updatedBy?.id ?? T.lastChange.unknownActor;
  return {
    gate: row.gate,
    label,
    stops: GATE_COPY[row.gate]?.stops ?? '',
    killed: row.killed === true,
    status: row.killed ? 'error' : 'ok',
    statusLabel: row.killed ? T.off : T.on,
    switchLabel: T.switchLabel(label),
    lastChange: changed ? T.lastChange.by(who, formatRelative(row.updatedAt, now)) : T.lastChange.never,
    reason: changed && row.reason ? T.lastChange.reason(row.reason) : null,
    absolute: changed ? formatAbsolute(row.updatedAt, { now }) : null,
  };
}

/** @param {object[]} switches @param {number} now */
export const gateRows = (switches, now) => switches.map((row) => gateRow(row, now));

/**
 * How many gates are on, and which are off (for the overview card).
 * @param {{gate: string, killed: boolean}[]} switches
 * @returns {{total: number, on: number, off: string[]}}
 */
export function gateTally(switches) {
  const off = switches.filter((row) => row.killed).map((row) => gateLabel(row.gate));
  return { total: switches.length, on: switches.length - off.length, off };
}

/**
 * Confirm-dialog props for turning `change.gate` off (`killed: true`) or back on.
 * @param {{gate: string, killed: boolean}} change `killed` is the state being requested.
 */
export function dialogConfig({ gate, killed }) {
  const label = gateLabel(gate);
  const copy = T.dialog;
  return {
    title: killed ? copy.offTitle(label) : copy.onTitle(label),
    impact: killed ? copy.offImpact(GATE_COPY[gate]?.stops ?? '') : copy.onImpact(label),
    actionLabel: killed ? copy.offAction : copy.onAction,
    destructive: killed,
    reason: killed
      ? { label: copy.reasonOff, required: true, minLength: MIN_KILL_REASON_LENGTH }
      : { label: copy.reasonOn, required: false },
    password: { label: copy.password, description: copy.passwordHint, required: false },
  };
}

/** Body of `PUT /api/admin/kill-switches` from the requested change and what the dialog collected. */
export function updateBody({ gate, killed }, { reason, password }) {
  return { gate, killed, reason: String(reason ?? '').trim(), currentPassword: password ?? '' };
}

/**
 * Toast after a successful PUT: success wording, or the audit-failed warning (the change itself is saved).
 * @param {{switch: {gate: string, killed: boolean}, audit: string}} result
 * @returns {{kind: 'success' | 'warning', text: string}}
 */
export function savedToast(result) {
  const label = gateLabel(result.switch.gate);
  if (result.audit !== 'written') return { kind: 'warning', text: T.toast.auditFailed };
  return { kind: 'success', text: result.switch.killed ? T.toast.off(label) : T.toast.on(label) };
}
