// src/auth/authRoles.mjs
/**
 * Roles of the email+password login, as pure functions (no I/O). Runs in the
 * server and in the browser bundles.
 *
 *  - role `user` | `admin` | `super_admin`, one per account.
 *  - `super_admin` comes ONLY from env (SUPER_ADMIN_EMAILS) AND a proven login
 *    path: a Google account, or a password set by the CLI (`passwordSetBy ===
 *    'cli'`). An admin-created password account whose email is later added to
 *    env is NOT promoted (the admin knows its temporary password).
 *
 * @module auth/authRoles
 */

export const ROLE_USER = 'user';
export const ROLE_ADMIN = 'admin';
export const ROLE_SUPER_ADMIN = 'super_admin';
export const ROLES = Object.freeze([ROLE_USER, ROLE_ADMIN, ROLE_SUPER_ADMIN]);
export const DEFAULT_ROLE = ROLE_USER;

/** Where each role lands after sign-in (and where a wrong-area page sends it). */
export const ROLE_HOME = Object.freeze({ [ROLE_USER]: '/app', [ROLE_ADMIN]: '/admin', [ROLE_SUPER_ADMIN]: '/dev' });
export const LOGIN_PATH = '/login';

/** `passwordSetBy` values: who chose the account's current password. */
export const PASSWORD_SET_BY = Object.freeze({ cli: 'cli', admin: 'admin', self: 'self' });

/**
 * @param {unknown} role
 * @returns {'user' | 'admin' | 'super_admin'} Unknown values (including the
 *   1a spelling `super-admin` and comma lists) fall back to `user`.
 */
export function normalizeRole(role) {
  return ROLES.includes(role) ? role : DEFAULT_ROLE;
}

/** Trim + lower-case, the one email normalization used everywhere. */
export function normalizeEmail(email) {
  return String(email ?? '').trim().toLowerCase();
}

/** @param {unknown} role @returns {boolean} admin or super_admin. */
export function isAdminRole(role) {
  return role === ROLE_ADMIN || role === ROLE_SUPER_ADMIN;
}

/** @param {unknown} role @returns {boolean} */
export function isSuperAdminRole(role) {
  return role === ROLE_SUPER_ADMIN;
}

/**
 * Landing page of a role; no role (signed out) → the login page.
 * @param {unknown} role
 * @returns {string}
 */
export function homeFor(role) {
  if (role === undefined || role === null) return LOGIN_PATH;
  return ROLE_HOME[normalizeRole(role)];
}

/**
 * Whether `email` is reserved for super_admin by env.
 * @param {string} email
 * @param {Iterable<string>} superAdminEmails Lower-cased emails.
 * @returns {boolean}
 */
export function isReservedSuperAdminEmail(email, superAdminEmails) {
  return new Set(superAdminEmails).has(normalizeEmail(email));
}

/**
 * The role an account must have right now.
 *  - email in env AND (Google account OR CLI password) → `super_admin`;
 *  - email in env but an admin/self password and no Google → stored role, never
 *    above `admin` (promotion blocked);
 *  - email not in env but stored `super_admin` → `user`;
 *  - otherwise the normalized stored role.
 * @param {string} email
 * @param {unknown} storedRole
 * @param {Iterable<string>} superAdminEmails
 * @param {{hasGoogleAccount?: boolean, passwordSetBy?: unknown}} [facts]
 * @returns {'user' | 'admin' | 'super_admin'}
 */
export function reconcileRole(email, storedRole, superAdminEmails, { hasGoogleAccount = false, passwordSetBy } = {}) {
  const role = normalizeRole(storedRole);
  if (isReservedSuperAdminEmail(email, superAdminEmails)) {
    if (hasGoogleAccount || passwordSetBy === PASSWORD_SET_BY.cli) return ROLE_SUPER_ADMIN;
    return role === ROLE_SUPER_ADMIN ? DEFAULT_ROLE : role;
  }
  return role === ROLE_SUPER_ADMIN ? DEFAULT_ROLE : role;
}

/**
 * Reconciliation plus what happened, for the resolver's database write + audit.
 * @param {{email: string, role?: unknown}} user
 * @param {Iterable<string>} superAdminEmails
 * @param {{hasGoogleAccount?: boolean, passwordSetBy?: unknown}} facts
 * @returns {{role: string, changed: boolean, event: 'promoted' | 'demoted' | 'blocked' | null}}
 *   `blocked` = env email that may not become super_admin (audit `role.reconcile.blocked`).
 */
export function reconcileAccount(user, superAdminEmails, facts) {
  const role = reconcileRole(user.email, user.role, superAdminEmails, facts);
  const changed = role !== user.role;
  let event = null;
  if (role === ROLE_SUPER_ADMIN && changed) event = 'promoted';
  else if (user.role === ROLE_SUPER_ADMIN && role !== ROLE_SUPER_ADMIN) event = 'demoted';
  else if (role !== ROLE_SUPER_ADMIN && isReservedSuperAdminEmail(user.email, superAdminEmails)) event = 'blocked';
  return { role, changed, event };
}

/**
 * Roles an actor may give an account it creates or edits (super_admin never: env + CLI only).
 * @param {unknown} actorRole
 * @param {unknown} role Requested role.
 * @returns {boolean}
 */
export function isAssignableRole(actorRole, role) {
  if (actorRole === ROLE_SUPER_ADMIN) return role === ROLE_USER || role === ROLE_ADMIN;
  if (actorRole === ROLE_ADMIN) return role === ROLE_USER;
  return false;
}
