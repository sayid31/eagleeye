// src/auth/authRoles.mjs
/**
 * Roles, account status and the permission matrix of the shared login, as
 * pure functions (no I/O). Runs in the server and in the browser bundle.
 *
 *  - role `user` | `admin` | `super-admin`; status `pending` | `active` | `banned`.
 *  - super-admin comes from env (SUPER_ADMIN_EMAILS) only, so the owner can
 *    never be locked out by a database edit, and removing an email from env
 *    removes the role on the next request.
 *
 * @module auth/authRoles
 */

export const ROLES = Object.freeze(['user', 'admin', 'super-admin']);
export const STATUSES = Object.freeze(['pending', 'active', 'banned']);
export const DEFAULT_ROLE = 'user';
export const DEFAULT_STATUS = 'pending';

/**
 * @param {unknown} role
 * @returns {'user' | 'admin' | 'super-admin'} Unknown values fall back to `user` (least privilege).
 */
export function normalizeRole(role) {
  return ROLES.includes(role) ? role : DEFAULT_ROLE;
}

/**
 * @param {unknown} status
 * @returns {'pending' | 'active' | 'banned'} Unknown values fall back to `pending` (no data access).
 */
export function normalizeStatus(status) {
  return STATUSES.includes(status) ? status : DEFAULT_STATUS;
}

const normalizeEmail = (email) => String(email ?? '').trim().toLowerCase();

/**
 * The role an account must have right now, given the env super-admin list.
 * Env email → `super-admin`; a stored `super-admin` no longer in env → `user`;
 * anything else keeps its (normalized) stored role.
 * @param {string} email
 * @param {unknown} storedRole
 * @param {Iterable<string>} superAdminEmails Lower-cased emails.
 * @returns {'user' | 'admin' | 'super-admin'}
 */
export function reconcileRole(email, storedRole, superAdminEmails) {
  const supers = new Set(superAdminEmails);
  if (supers.has(normalizeEmail(email))) return 'super-admin';
  const role = normalizeRole(storedRole);
  return role === 'super-admin' ? DEFAULT_ROLE : role;
}

/**
 * Role + status an account must have; an env super-admin is always `active`.
 * @param {{email: string, role?: unknown, status?: unknown}} user
 * @param {Iterable<string>} superAdminEmails
 * @returns {{role: string, status: string, changed: boolean}} `changed` = the stored values differ.
 */
export function reconcileAccount(user, superAdminEmails) {
  const role = reconcileRole(user.email, user.role, superAdminEmails);
  const status = role === 'super-admin' ? 'active' : normalizeStatus(user.status);
  return { role, status, changed: role !== user.role || status !== user.status };
}

/**
 * Role + status for a brand-new account: env super-admins start active, everyone
 * else starts as a pending `user` — whatever a client tried to send.
 * @param {string} email
 * @param {Iterable<string>} superAdminEmails
 * @returns {{role: string, status: string}}
 */
export function initialAccount(email, superAdminEmails) {
  return new Set(superAdminEmails).has(normalizeEmail(email))
    ? { role: 'super-admin', status: 'active' }
    : { role: DEFAULT_ROLE, status: DEFAULT_STATUS };
}

/** @param {unknown} role @returns {boolean} */
export function isAdminRole(role) {
  return role === 'admin' || role === 'super-admin';
}

/** @param {{role?: string, status?: string} | null | undefined} actor @returns {boolean} */
export function canUseDataApis(actor) {
  return actor?.status === 'active';
}

/** @param {{role?: string, status?: string} | null | undefined} actor @returns {boolean} */
export function canAccessAdmin(actor) {
  return canUseDataApis(actor) && isAdminRole(actor.role);
}

/** @param {{role?: string, status?: string} | null | undefined} actor @returns {boolean} */
export function canManageKeys(actor) {
  return canUseDataApis(actor) && actor.role === 'super-admin';
}
