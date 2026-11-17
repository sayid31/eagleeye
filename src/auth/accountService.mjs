// src/auth/accountService.mjs
/**
 * Account management for `/admin` and `/dev` (plan/auth/04): the ONLY path
 * from an HTTP route to Better Auth's internal adapter. Every method takes the
 * signed-in actor (the guard's `req.gevActor`), asks `authorizeUserAction`
 * first, then writes, then appends the audit entry.
 *
 * Every method resolves to `{ok: true, …, audit: 'written' | 'failed'}` or
 * `{ok: false, status, code}` (codes from plan/auth/04: TARGET_FORBIDDEN,
 * TARGET_IS_SUPER_ADMIN, CANNOT_ACT_ON_SELF, ROLE_NOT_ASSIGNABLE, EMAIL_TAKEN,
 * SUPER_ADMIN_EMAIL_RESERVED, PASSWORD_WEAK, REAUTH_FAILED, …). Unexpected
 * storage errors are thrown with context. A temporary password appears in a
 * result exactly once (`tempPassword`), never in a log or audit row.
 *
 * @module auth/accountService
 */

import { DEFAULT_CAPABILITIES, serializeCapabilities } from './authCapabilities.mjs';
import { authorizeUserAction } from './authHierarchy.mjs';
import { PASSWORD_SET_BY, ROLES, ROLE_SUPER_ADMIN, ROLE_USER, isReservedSuperAdminEmail, normalizeEmail } from './authRoles.mjs';
import { clampPage, createAccountQueries, publicUser } from './accountQueries.mjs';
import { generatePassword, validatePassword } from './passwordPolicy.mjs';

/** A Google-only super_admin (no password to confirm) must have signed in this recently to change roles. */
export const REAUTH_FRESH_MS = 10 * 60 * 1000;
export const MAX_NAME_LENGTH = 80;
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const STATUS = {
  // Acting on yourself is a malformed request (the UI never offers it), not a permission question.
  ADMIN_REQUIRED: 403, TARGET_FORBIDDEN: 403, TARGET_IS_SUPER_ADMIN: 403, CANNOT_ACT_ON_SELF: 400, ROLE_NOT_ASSIGNABLE: 403,
  REAUTH_FAILED: 403, REAUTH_REQUIRED: 403, NOT_FOUND: 404, EMAIL_TAKEN: 409, SUPER_ADMIN_EMAIL_RESERVED: 409,
  PASSWORD_WEAK: 400, INVALID_INPUT: 400, CONFIRM_EMAIL_MISMATCH: 400, UNKNOWN_ACTION: 400,
};

const fail = (code, extra = {}) => ({ ok: false, status: STATUS[code] ?? 400, code, ...extra });
const actorOf = (actor) => ({ id: String(actor?.user?.id ?? actor?.id ?? ''), role: actor?.role, email: actor?.user?.email ?? actor?.email, sessionCreatedAt: actor?.session?.createdAt });
const cleanName = (name) => (typeof name === 'string' ? name.trim() : '');

/**
 * @param {object} deps
 * @param {{$context: Promise<object>}} deps.auth Better Auth instance.
 * @param {string[]} deps.superAdminEmails
 * @param {{write: (entry: object) => Promise<{ok: boolean}>}} deps.audit From createAuditWriter.
 * @param {{recordFailure: (email: string) => Promise<unknown>, clearUser: (id: string) => Promise<void>}} deps.throttle
 * @param {() => number} [deps.now]
 */
export function createAccountService({ auth, superAdminEmails, audit, throttle, now = () => Date.now() }) {
  const queries = createAccountQueries(() => auth.$context);
  const reserved = (email) => isReservedSuperAdminEmail(email, superAdminEmails);

  async function record(actor, action, target, summary, meta) {
    const result = await audit.write({ action, actor, targetId: target?.id, targetEmail: target?.email, summary, meta });
    return result.ok ? 'written' : 'failed';
  }

  /** Load a live target and authorize one action on it. */
  async function authorized(rawActor, id, action) {
    const actor = actorOf(rawActor);
    const found = await queries.findLive(id);
    if (!found) return { error: fail('NOT_FOUND') };
    const verdict = authorizeUserAction(actor, found.user, action);
    return verdict.ok ? { actor, ...found } : { error: fail(verdict.code) };
  }

  async function emailProblem(email, exceptId) {
    if (!EMAIL.test(email)) return fail('INVALID_INPUT', { field: 'email' });
    if (reserved(email)) return fail('SUPER_ADMIN_EMAIL_RESERVED');
    const existing = await queries.findByEmail(email);
    return existing?.user && existing.user.id !== exceptId ? fail('EMAIL_TAKEN') : null;
  }

  /** `{password}` or `{generate: true}` → a validated password (and whether it was generated). */
  function choosePassword({ password, generate }, identity) {
    const value = generate === true ? generatePassword() : password;
    const verdict = validatePassword(value, identity);
    return verdict.ok ? { value, generated: generate === true } : { error: fail('PASSWORD_WEAK', { reason: verdict.reason, min: verdict.min }) };
  }

  async function reauthenticate(actor, currentPassword) {
    const found = await queries.findLive(actor.id);
    const verdict = found ? await queries.verifyPassword(found.accounts, currentPassword) : false;
    if (verdict === true) return null;
    if (verdict === null) {
      const signedInAt = actor.sessionCreatedAt ? new Date(actor.sessionCreatedAt).getTime() : 0;
      return now() - signedInAt <= REAUTH_FRESH_MS ? null : fail('REAUTH_REQUIRED');
    }
    await throttle.recordFailure(actor.email);
    return fail('REAUTH_FAILED');
  }

  return {
    /** Page of accounts the actor may see (admins: users only; tombstones never). */
    async listUsers(rawActor, { q, status, role, limit, offset } = {}) {
      const actor = actorOf(rawActor);
      if (!authorizeUserAction(actor, { id: '', role: ROLE_USER }, 'view').ok) return fail('ADMIN_REQUIRED');
      const visible = actor.role === ROLE_SUPER_ADMIN ? [...ROLES] : [ROLE_USER];
      const roles = role ? visible.filter((item) => item === role) : visible;
      const page = clampPage({ limit, offset });
      if (!roles.length) return { ok: true, users: [], total: 0, ...page };
      const { users, total } = await queries.list({ q, status, roles, ...page });
      return { ok: true, users: users.map((user) => publicUser(user, now())), total, ...page };
    },

    /** One account the actor may view. */
    async getUser(rawActor, id) {
      const { error, user } = await authorized(rawActor, id, 'view');
      return error ?? { ok: true, user: publicUser(user, now()) };
    },

    /** Create an account (+ credential) — `{email, name, role?, capabilities?, password? | generate: true}`. */
    async createUser(rawActor, input = {}) {
      const actor = actorOf(rawActor);
      const role = input.role ?? ROLE_USER;
      const verdict = authorizeUserAction(actor, { role }, 'create');
      if (!verdict.ok) return fail(verdict.code);
      const email = normalizeEmail(input.email);
      const name = cleanName(input.name);
      if (!name || name.length > MAX_NAME_LENGTH) return fail('INVALID_INPUT', { field: 'name' });
      const problem = await emailProblem(email);
      if (problem) return problem;
      const password = choosePassword(input, { email, name, role });
      if (password.error) return password.error;
      const user = await queries.createWithPassword({
        email, name, emailVerified: false, role, banned: false, mustChangePassword: true, passwordSetBy: PASSWORD_SET_BY.admin,
        capabilities: serializeCapabilities(input.capabilities ?? DEFAULT_CAPABILITIES), failedLoginCount: 0, createdBy: actor.id,
      }, password.value);
      const auditState = await record(actor, 'user.create', user, `role ${role}`);
      return { ok: true, user: publicUser(user, now()), ...(password.generated ? { tempPassword: password.value } : {}), audit: auditState };
    },

    /** `{name?, email?, capabilities?}`; an email change signs the account out everywhere. */
    async updateUser(rawActor, id, input = {}) {
      const checks = [['name', 'updateName'], ['email', 'updateEmail'], ['capabilities', 'setCapabilities']].filter(([field]) => input[field] !== undefined);
      if (!checks.length) return fail('INVALID_INPUT');
      let target;
      for (const [, action] of checks) {
        target = await authorized(rawActor, id, action);
        if (target.error) return target.error;
      }
      const { actor, user } = target;
      const patch = {};
      if (input.name !== undefined) {
        patch.name = cleanName(input.name);
        if (!patch.name || patch.name.length > MAX_NAME_LENGTH) return fail('INVALID_INPUT', { field: 'name' });
      }
      if (input.email !== undefined) {
        patch.email = normalizeEmail(input.email);
        const problem = await emailProblem(patch.email, user.id);
        if (problem) return problem;
      }
      if (input.capabilities !== undefined) patch.capabilities = serializeCapabilities(input.capabilities);
      const updated = await queries.update(user.id, patch);
      if (patch.email && patch.email !== user.email) await queries.revokeSessions(user.id);
      const action = Object.keys(patch).length === 1 && patch.capabilities ? 'user.capabilities' : 'user.update';
      const auditState = await record(actor, action, user, `fields ${Object.keys(patch).join(',')}`);
      return { ok: true, user: publicUser(updated, now()), audit: auditState };
    },

    /** Deactivate: `banned` + every session revoked (refused within one request). */
    async deactivate(rawActor, id) {
      const { error, actor, user } = await authorized(rawActor, id, 'deactivate');
      if (error) return error;
      await queries.update(user.id, { banned: true });
      await queries.revokeSessions(user.id);
      return { ok: true, audit: await record(actor, 'user.deactivate', user) };
    },

    /** Reactivate a deactivated account. */
    async activate(rawActor, id) {
      const { error, actor, user } = await authorized(rawActor, id, 'activate');
      if (error) return error;
      await queries.update(user.id, { banned: false });
      return { ok: true, audit: await record(actor, 'user.activate', user) };
    },

    /** Admin password reset: must change at next sign-in, sessions revoked, throttle cleared. */
    async setPassword(rawActor, id, input = {}) {
      const { error, actor, user } = await authorized(rawActor, id, 'resetPassword');
      if (error) return error;
      const password = choosePassword(input, { email: user.email, name: user.name, role: user.role });
      if (password.error) return password.error;
      await queries.setPassword(user.id, password.value);
      await queries.update(user.id, { mustChangePassword: true, passwordSetBy: PASSWORD_SET_BY.admin, failedLoginCount: 0, throttleUntil: null });
      await queries.revokeSessions(user.id);
      const auditState = await record(actor, 'user.password.reset', user);
      return { ok: true, ...(password.generated ? { tempPassword: password.value } : {}), audit: auditState };
    },

    /** Sign an account out of every device (an account may do this to itself). */
    async revokeSessions(rawActor, id) {
      const { error, actor, user } = await authorized(rawActor, id, 'revokeSessions');
      if (error) return error;
      await queries.revokeSessions(user.id);
      return { ok: true, audit: await record(actor, 'user.sessions.revoke', user) };
    },

    /** Tombstone delete; `confirmEmail` must equal the account's email. */
    async deleteUser(rawActor, id, { confirmEmail } = {}) {
      const { error, actor, user } = await authorized(rawActor, id, 'delete');
      if (error) return error;
      if (normalizeEmail(confirmEmail) !== user.email) return fail('CONFIRM_EMAIL_MISMATCH');
      await queries.tombstone(user.id);
      return { ok: true, audit: await record(actor, 'user.delete', user) };
    },

    /** super_admin only: user ↔ admin, confirmed by the actor's password (or a fresh Google sign-in). */
    async setRole(rawActor, id, { role, currentPassword } = {}) {
      const { error, actor, user } = await authorized(rawActor, id, 'setRole');
      if (error) return error;
      if (!authorizeUserAction(actor, { role }, 'create').ok) return fail('ROLE_NOT_ASSIGNABLE');
      const reauth = await reauthenticate(actor, currentPassword);
      if (reauth) return reauth;
      // The stored hash does not reveal the length: a new admin always picks a fresh ≥15-character password.
      const patch = role === 'admin' && user.role !== 'admin' ? { role, mustChangePassword: true } : { role };
      const updated = await queries.update(user.id, patch);
      await queries.revokeSessions(user.id);
      const auditState = await record(actor, 'role.set', user, `${user.role} → ${role}`);
      return { ok: true, user: publicUser(updated, now()), audit: auditState };
    },
  };
}
