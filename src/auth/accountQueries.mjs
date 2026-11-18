// src/auth/accountQueries.mjs
/**
 * Storage operations behind `accountService.mjs`, on Better Auth's internal
 * adapter. No authorization here — callers (the service, the CLI) decide who
 * may do what; nothing outside those two imports this module.
 *
 * @module auth/accountQueries
 */

import { runWithTransaction } from '@better-auth/core/context';
import { normalizeCapabilities } from './authCapabilities.mjs';
import { normalizeEmail, normalizeRole } from './authRoles.mjs';

export const CREDENTIAL_PROVIDER = 'credential';
export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;
export const TOMBSTONE_NAME = 'Deleted user';
const TOMBSTONE_DOMAIN = 'deleted.invalid';

/**
 * Public shape of an account (never a password hash, token or throttle internals beyond a flag).
 * @param {object} user Better Auth user row.
 * @param {number} [now]
 * @returns {object}
 */
export function publicUser(user, now = Date.now()) {
  const until = user.throttleUntil ? new Date(user.throttleUntil).getTime() : 0;
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: normalizeRole(user.role),
    active: !(user.banned === true || user.banned === 1),
    capabilities: normalizeCapabilities(user.capabilities),
    mustChangePassword: user.mustChangePassword === true || user.mustChangePassword === 1,
    throttled: until > now,
    createdAt: user.createdAt,
    createdBy: user.createdBy ?? null,
  };
}

/** @param {{limit?: unknown, offset?: unknown}} page @returns {{limit: number, offset: number}} */
export function clampPage({ limit, offset } = {}) {
  const size = Number.parseInt(limit, 10);
  const start = Number.parseInt(offset, 10);
  return {
    limit: Number.isFinite(size) && size > 0 ? Math.min(size, MAX_PAGE_SIZE) : DEFAULT_PAGE_SIZE,
    offset: Number.isFinite(start) && start > 0 ? start : 0,
  };
}

/**
 * @param {() => Promise<object>} getContext Resolves Better Auth's `$context`.
 */
export function createAccountQueries(getContext) {
  /** Live (not tombstoned) account by id, with its linked accounts. */
  async function findLive(id) {
    const ctx = await getContext();
    const user = await ctx.internalAdapter.findUserById(String(id));
    if (!user || user.deletedAt) return null;
    const accounts = await ctx.internalAdapter.findAccounts(user.id);
    return { user, accounts };
  }

  async function findByEmail(email) {
    const ctx = await getContext();
    return ctx.internalAdapter.findUserByEmail(normalizeEmail(email), { includeAccounts: true });
  }

  /** User row + credential account in one transaction (a half-created account cannot remain). */
  async function createWithPassword(data, password) {
    const ctx = await getContext();
    const hash = await ctx.password.hash(password);
    return runWithTransaction(ctx.adapter, async () => {
      const user = await ctx.internalAdapter.createUser({ ...data, email: normalizeEmail(data.email) });
      if (!user) throw new Error('user row was not created');
      await ctx.internalAdapter.linkAccount({ providerId: CREDENTIAL_PROVIDER, accountId: user.id, userId: user.id, password: hash });
      return user;
    });
  }

  /** Set a password, creating the credential row when the account has none (1a Google accounts). */
  async function setPassword(userId, password) {
    const ctx = await getContext();
    const hash = await ctx.password.hash(password);
    const accounts = await ctx.internalAdapter.findAccounts(userId);
    if (accounts.some((account) => account.providerId === CREDENTIAL_PROVIDER)) await ctx.internalAdapter.updatePassword(userId, hash);
    else await ctx.internalAdapter.linkAccount({ providerId: CREDENTIAL_PROVIDER, accountId: userId, userId, password: hash });
  }

  async function verifyPassword(accounts, password) {
    const credential = accounts.find((account) => account.providerId === CREDENTIAL_PROVIDER);
    if (!credential?.password) return null;
    const ctx = await getContext();
    return ctx.password.verify({ hash: credential.password, password: String(password ?? '') });
  }

  async function update(userId, patch) {
    const ctx = await getContext();
    return ctx.internalAdapter.updateUser(userId, patch);
  }

  async function revokeSessions(userId) {
    const ctx = await getContext();
    await ctx.internalAdapter.deleteUserSessions(userId);
  }

  /** Scrub PII, free the email, drop sign-in methods and sessions; logs stay. */
  async function tombstone(userId) {
    const ctx = await getContext();
    await update(userId, {
      name: TOMBSTONE_NAME, email: `deleted+${userId}@${TOMBSTONE_DOMAIN}`, emailVerified: false, image: null,
      banned: true, deletedAt: new Date(), capabilities: JSON.stringify(normalizeCapabilities(null)),
    });
    await ctx.internalAdapter.deleteAccounts(userId);
    await ctx.internalAdapter.deleteUserSessions(userId);
  }

  /**
   * Page of live accounts. `roles` limits the roles returned (admins see users only).
   * @param {{q?: string, status?: 'active' | 'inactive', roles: string[], limit: number, offset: number}} filter
   */
  async function list({ q, status, roles, limit, offset }) {
    const ctx = await getContext();
    const where = [{ field: 'deletedAt', value: null }, { field: 'role', operator: 'in', value: roles }];
    if (status === 'active') where.push({ field: 'banned', value: false });
    if (status === 'inactive') where.push({ field: 'banned', value: true });
    const term = String(q ?? '').trim().toLowerCase();
    if (term) where.push({ field: 'email', operator: 'contains', value: term, connector: 'OR' }, { field: 'name', operator: 'contains', value: term, connector: 'OR' });
    const [users, total] = await Promise.all([
      ctx.internalAdapter.listUsers(limit, offset, { field: 'createdAt', direction: 'desc' }, where),
      ctx.internalAdapter.countTotalUsers(where),
    ]);
    return { users, total };
  }

  return { findLive, findByEmail, createWithPassword, setPassword, verifyPassword, update, revokeSessions, tombstone, list };
}
