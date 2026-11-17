// src/auth/accountBootstrap.mjs
/**
 * Owner-only operations run from the CLI (`npm run auth:set-password`,
 * `npm run auth:unlock`), i.e. by whoever controls the server's files — the
 * emergency path when Google sign-in is not configured or unreachable.
 *
 * `setSuperAdminPassword` is the only way a password-signing-in super_admin
 * exists: the email must be in SUPER_ADMIN_EMAILS and the password is marked
 * `passwordSetBy = 'cli'`, which `reconcileRole` requires for promotion.
 *
 * @module auth/accountBootstrap
 */

import { DEFAULT_CAPABILITIES, serializeCapabilities } from './authCapabilities.mjs';
import { PASSWORD_SET_BY, ROLE_SUPER_ADMIN, isReservedSuperAdminEmail, normalizeEmail } from './authRoles.mjs';
import { createAccountQueries } from './accountQueries.mjs';
import { validatePassword } from './passwordPolicy.mjs';

/**
 * @param {object} deps
 * @param {{$context: Promise<object>}} deps.auth
 * @param {string[]} deps.superAdminEmails
 * @param {{write: Function}} deps.audit
 * @param {{clearUser: Function, clearEmail: Function}} deps.throttle
 */
export function createAccountBootstrap({ auth, superAdminEmails, audit, throttle }) {
  const queries = createAccountQueries(() => auth.$context);

  /**
   * Create the env super_admin account or replace its password.
   * @param {string} rawEmail
   * @param {string} password
   * @returns {Promise<{ok: true, created: boolean, userId: string, audit: string} | {ok: false, code: string, reason?: string}>}
   */
  async function setSuperAdminPassword(rawEmail, password) {
    const email = normalizeEmail(rawEmail);
    if (!isReservedSuperAdminEmail(email, superAdminEmails)) return { ok: false, code: 'NOT_A_SUPER_ADMIN_EMAIL' };
    const existing = await queries.findByEmail(email);
    const verdict = validatePassword(password, { email, name: existing?.user?.name, role: ROLE_SUPER_ADMIN });
    if (!verdict.ok) return { ok: false, code: verdict.code, reason: verdict.reason };
    const flags = { role: ROLE_SUPER_ADMIN, banned: false, mustChangePassword: false, passwordSetBy: PASSWORD_SET_BY.cli, failedLoginCount: 0, throttleUntil: null };
    let user = existing?.user;
    if (user) {
      await queries.setPassword(user.id, password);
      await queries.update(user.id, flags);
      await queries.revokeSessions(user.id);
    } else {
      user = await queries.createWithPassword({
        email, name: email.split('@')[0], emailVerified: false, capabilities: serializeCapabilities(DEFAULT_CAPABILITIES), ...flags,
      }, password);
    }
    await throttle.clearEmail(email);
    const result = await audit.write({ action: 'bootstrap.super_admin', targetId: user.id, targetEmail: email, summary: existing ? 'password replaced (cli)' : 'account created (cli)' });
    return { ok: true, created: !existing?.user, userId: user.id, audit: result.ok ? 'written' : 'failed' };
  }

  /**
   * Clear the sign-in throttle of an email (account counter and unknown-email counter).
   * @param {string} rawEmail
   * @returns {Promise<{ok: true, found: boolean, audit: string}>}
   */
  async function unlock(rawEmail) {
    const email = normalizeEmail(rawEmail);
    const existing = await queries.findByEmail(email);
    if (existing?.user) await throttle.clearUser(existing.user.id);
    await throttle.clearEmail(email);
    const result = await audit.write({ action: 'auth.unlock', targetId: existing?.user?.id, targetEmail: email, summary: 'cli' });
    return { ok: true, found: Boolean(existing?.user), audit: result.ok ? 'written' : 'failed' };
  }

  return { setSuperAdminPassword, unlock };
}
