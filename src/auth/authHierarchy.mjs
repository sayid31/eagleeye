// src/auth/authHierarchy.mjs
/**
 * The single authorization point for account management (plan/auth/01
 * §Hierarki). Better Auth never looks at the TARGET's role; every service
 * method in `accountService.mjs` asks `authorizeUserAction` first. Pure.
 *
 * @module auth/authHierarchy
 */

import { ROLE_ADMIN, ROLE_SUPER_ADMIN, ROLE_USER, isAssignableRole, normalizeRole } from './authRoles.mjs';

/** Every action the matrix knows. */
export const USER_ACTIONS = Object.freeze([
  'view', 'create', 'deactivate', 'activate', 'delete', 'resetPassword', 'setCapabilities',
  'updateName', 'updateEmail', 'setRole', 'revokeSessions',
]);

/** Error codes (also the API `error` field, plan/auth/04). */
export const HIERARCHY_ERRORS = Object.freeze({
  forbidden: 'ADMIN_REQUIRED',
  target: 'TARGET_FORBIDDEN',
  targetSuper: 'TARGET_IS_SUPER_ADMIN',
  self: 'CANNOT_ACT_ON_SELF',
  role: 'ROLE_NOT_ASSIGNABLE',
  unknown: 'UNKNOWN_ACTION',
});

// Cells of the plan/auth/01 table, by actor role then target role. `true` = allowed.
// `create` is checked against the requested role instead (see below).
const MATRIX = {
  [ROLE_ADMIN]: {
    [ROLE_USER]: ['view', 'deactivate', 'activate', 'delete', 'resetPassword', 'setCapabilities', 'updateName', 'updateEmail', 'revokeSessions'],
    [ROLE_ADMIN]: [],
    [ROLE_SUPER_ADMIN]: [],
  },
  [ROLE_SUPER_ADMIN]: {
    [ROLE_USER]: ['view', 'deactivate', 'activate', 'delete', 'resetPassword', 'setCapabilities', 'updateName', 'updateEmail', 'setRole', 'revokeSessions'],
    [ROLE_ADMIN]: ['view', 'deactivate', 'activate', 'delete', 'resetPassword', 'setCapabilities', 'updateName', 'updateEmail', 'setRole', 'revokeSessions'],
    [ROLE_SUPER_ADMIN]: ['view'],
  },
};

/** What an account may do to itself (any role): own name, sign out everywhere. */
const SELF_ACTIONS = new Set(['updateName', 'revokeSessions']);

const allow = () => ({ ok: true });
const deny = (code) => ({ ok: false, code });

/**
 * @param {{id: string, role: string} | null | undefined} actor The signed-in account.
 * @param {{id?: string, role?: string} | null | undefined} target The account acted on
 *   (for `create`: `{role}` = the requested role).
 * @param {string} action One of USER_ACTIONS.
 * @returns {{ok: true} | {ok: false, code: string}}
 */
export function authorizeUserAction(actor, target, action) {
  if (!USER_ACTIONS.includes(action)) return deny(HIERARCHY_ERRORS.unknown);
  const actorRole = normalizeRole(actor?.role);
  if (!actor || !MATRIX[actorRole]) return deny(HIERARCHY_ERRORS.forbidden);

  if (action === 'create') {
    // Exact strings only: a junk or 1a-spelled role is refused, never normalized to `user`.
    return isAssignableRole(actorRole, target?.role ?? ROLE_USER) ? allow() : deny(HIERARCHY_ERRORS.role);
  }

  if (target?.id !== undefined && String(target.id) === String(actor.id)) {
    if (SELF_ACTIONS.has(action)) return allow();
    // An admin's own row is hidden like every other admin; a super_admin sees itself.
    if (action === 'view') return actorRole === ROLE_SUPER_ADMIN ? allow() : deny(HIERARCHY_ERRORS.target);
    return deny(HIERARCHY_ERRORS.self);
  }

  const targetRole = normalizeRole(target?.role);
  if (MATRIX[actorRole][targetRole].includes(action)) return allow();
  return deny(targetRole === ROLE_SUPER_ADMIN ? HIERARCHY_ERRORS.targetSuper : HIERARCHY_ERRORS.target);
}
