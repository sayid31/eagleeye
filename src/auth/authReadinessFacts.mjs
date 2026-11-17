// src/auth/authReadinessFacts.mjs
/**
 * Counts from the auth database for the readiness checks (authReadiness.mjs):
 * how many env super_admin emails can actually sign in, how many admins rely
 * on a password alone, how many `role.reconcile.blocked` entries exist.
 * Returns numbers only — no email, id or hash leaves this module.
 *
 * @module auth/authReadinessFacts
 */

import fs from 'node:fs';
import { parseEmailList } from './authEnv.mjs';
import { PASSWORD_SET_BY, ROLE_ADMIN, ROLE_SUPER_ADMIN } from './authRoles.mjs';

const GOOGLE = 'google';
const CREDENTIAL = 'credential';

/**
 * @param {{prepare: (sql: string) => {all: (...args: unknown[]) => object[]}}} db Open auth database.
 * @param {string[]} superAdminEmails Normalized env emails.
 * @returns {{available: true, envEmails: number, ready: number, noAccount: number, blocked: number,
 *   passwordOnlyAdmins: number, reconcileBlocked: number}}
 */
export function readinessFactsFromDb(db, superAdminEmails) {
  const emails = [...new Set(superAdminEmails)];
  const marks = emails.map(() => '?').join(', ');
  const rows = db.prepare(`SELECT lower(u.email) AS email, u.role AS role, u.passwordSetBy AS passwordSetBy, u.banned AS banned,
      (SELECT COUNT(*) FROM account a WHERE a.userId = u.id AND a.providerId = ?) AS google,
      (SELECT COUNT(*) FROM account a WHERE a.userId = u.id AND a.providerId = ?) AS credential
    FROM "user" u
    WHERE u.deletedAt IS NULL AND (u.role IN (?, ?)${emails.length ? ` OR lower(u.email) IN (${marks})` : ''})`)
    .all(GOOGLE, CREDENTIAL, ROLE_ADMIN, ROLE_SUPER_ADMIN, ...emails);
  const byEmail = new Map(rows.map((row) => [row.email, row]));
  let ready = 0;
  let noAccount = 0;
  let blocked = 0;
  for (const email of emails) {
    const row = byEmail.get(email);
    if (!row) noAccount += 1;
    else if (Number(row.google) > 0 || (row.passwordSetBy === PASSWORD_SET_BY.cli && Number(row.credential) > 0)) ready += 1;
    else blocked += 1;
  }
  // Deactivated admins cannot sign in, so they do not widen the exposure.
  const passwordOnlyAdmins = rows.filter((row) => !Number(row.banned) && (row.role === ROLE_ADMIN || row.role === ROLE_SUPER_ADMIN) && Number(row.google) === 0 && Number(row.credential) > 0).length;
  const audit = db.prepare("SELECT COUNT(*) AS n FROM audit_log WHERE action = 'role.reconcile.blocked'").all()[0];
  return { available: true, envEmails: emails.length, ready, noAccount, blocked, passwordOnlyAdmins, reconcileBlocked: Number(audit?.n ?? 0) };
}

/**
 * CLI path (`npm run doctor`): open the database file read-only under Node,
 * read the counts, close. A missing or unreadable file is a fact, not a crash.
 * @param {string} file Absolute path of the auth database.
 * @param {string | undefined} superAdminEmailsRaw SUPER_ADMIN_EMAILS as configured.
 * @param {{open?: (file: string) => Promise<object>}} [deps]
 * @returns {Promise<object>} Facts, or `{available: false, reason}`.
 */
export async function readinessFactsFromFile(file, superAdminEmailsRaw, { open } = {}) {
  if (!fs.existsSync(file)) return { available: false, reason: 'missing' };
  let db;
  try {
    if (open) db = await open(file);
    else {
      const { DatabaseSync } = await import('node:sqlite');
      db = new DatabaseSync(file, { readOnly: true });
    }
    return readinessFactsFromDb(db, parseEmailList(superAdminEmailsRaw));
  } catch (error) {
    // e.g. EACCES (file owned by the server account) or a pre-migration schema.
    return { available: false, reason: error?.code || 'unreadable' };
  } finally {
    db?.close?.();
  }
}
