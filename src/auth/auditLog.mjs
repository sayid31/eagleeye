// src/auth/auditLog.mjs
/**
 * `audit_log` writer for account management (plan/auth/06 §Audit log).
 * Append-only: no API updates or deletes rows. Entries are written AFTER the
 * action succeeded (Better Auth's internal writes cannot share a transaction
 * with ours); a failed write is reported on the console with the action and
 * target id and returned to the caller, never swallowed. Entries hold ids,
 * a masked email and codes — never a password, token or full address.
 *
 * @module auth/auditLog
 */

import { AUDIT_LOG_MODEL } from './authSchema.mjs';

export const AUDIT_ACTIONS = Object.freeze([
  'user.create', 'user.update', 'user.capabilities', 'user.deactivate', 'user.activate', 'user.password.reset',
  'user.sessions.revoke', 'user.delete', 'role.set', 'role.reconcile', 'role.reconcile.blocked', 'killswitch.update',
  'keys.update', 'bootstrap.super_admin', 'auth.unlock',
]);
const MAX_SUMMARY_LENGTH = 200;

/**
 * `budi.santoso@example.test` → `b***@example.test`.
 * @param {string | null | undefined} email
 * @returns {string | null}
 */
export function maskEmail(email) {
  const value = String(email ?? '').trim().toLowerCase();
  const at = value.lastIndexOf('@');
  if (at < 1) return value ? '***' : null;
  return `${value[0]}***${value.slice(at)}`;
}

/**
 * @param {{action: string, actor?: {id?: string, role?: string} | null, targetType?: string, targetId?: string,
 *   targetEmail?: string, summary?: string, meta?: object, ip?: string}} entry
 * @param {() => Date} [now]
 * @returns {object} An audit_log row.
 */
export function auditEntry(entry, now = () => new Date()) {
  if (!AUDIT_ACTIONS.includes(entry.action)) throw new Error(`audit_log: unknown action "${entry.action}"`);
  return {
    createdAt: now(),
    actorId: entry.actor?.id ? String(entry.actor.id) : null,
    actorRole: entry.actor?.role ?? null,
    action: entry.action,
    targetType: entry.targetType ?? (entry.targetId ? 'user' : null),
    targetId: entry.targetId ? String(entry.targetId) : null,
    targetEmailMasked: maskEmail(entry.targetEmail),
    summary: entry.summary ? String(entry.summary).slice(0, MAX_SUMMARY_LENGTH) : null,
    meta: entry.meta ? JSON.stringify(entry.meta) : null,
    ip: entry.ip ?? null,
  };
}

/**
 * @param {{getContext: () => Promise<object>, error?: (message: string) => void}} deps
 * @returns {{write: (entry: object) => Promise<{ok: true} | {ok: false, error: string}>}}
 */
export function createAuditWriter({ getContext, error = (message) => console.error(message) }) {
  return {
    async write(entry) {
      try {
        const ctx = await getContext();
        await ctx.adapter.create({ model: AUDIT_LOG_MODEL, data: auditEntry(entry) });
        return { ok: true };
      } catch (failure) {
        const reason = failure?.code || failure?.message || 'unknown error';
        error(`[audit] write failed for ${entry?.action ?? '?'} target ${entry?.targetId ?? '-'}: ${reason}`);
        return { ok: false, error: reason };
      }
    },
  };
}
