/**
 * Pure presentation logic of the Pengguna page: which actions a row offers (straight from `authorizeUserAction`, the
 * same matrix the server enforces), the filter → query mapping, form-error routing and toast wording. The create/edit
 * form rules live in userFormView.js. No DOM, no network.
 *
 * @module admin/users/usersView
 */

import { authorizeUserAction } from '../../auth/authHierarchy.mjs';
import { ROLE_ADMIN, ROLE_SUPER_ADMIN, ROLE_USER } from '../../auth/authRoles.mjs';
import { USERS_COPY } from '../../copy/en/users.js';

/** Default and maximum page size of the list (API: 20, max 100). */
export const USERS_PAGE_SIZE = 20;
/** Select value that stands for "no filter" (Radix Select items cannot have an empty value). */
export const ALL = 'all';

const actorOf = (me) => ({ id: String(me?.id ?? ''), role: me?.role });

/**
 * Whether the area manages roles (promote/demote, role selector): `/dev` for a super_admin only.
 * @param {{role?: string}} me
 * @param {'admin' | 'dev'} area
 */
export function managesRoles(me, area) {
  return area === 'dev' && me?.role === ROLE_SUPER_ADMIN;
}

/**
 * Role filter forced by the area: `/admin` is about `user` accounts only.
 * @param {'admin' | 'dev'} area
 * @returns {string | undefined}
 */
export function areaRoleScope(area) {
  return area === 'admin' ? ROLE_USER : undefined;
}

/**
 * What a row offers the signed-in account. Every flag is a cell of the plan/auth/01 matrix; the UI never offers what
 * the server would refuse.
 * @param {{id: string, role: string}} me `/api/me` user.
 * @param {{id: string, role: string, active: boolean}} target
 * @param {'admin' | 'dev'} area
 */
export function rowActions(me, target, area) {
  const actor = actorOf(me);
  const can = (action) => authorizeUserAction(actor, target, action).ok;
  const edit = { name: can('updateName'), email: can('updateEmail'), capabilities: can('setCapabilities') && target.role === ROLE_USER };
  const roleChange = managesRoles(me, area) && can('setRole');
  const actions = {
    edit: edit.name || edit.email || edit.capabilities ? edit : null,
    toggleActive: target.active ? (can('deactivate') ? 'deactivate' : null) : (can('activate') ? 'activate' : null),
    resetPassword: can('resetPassword'),
    revokeSessions: can('revokeSessions'),
    delete: can('delete'),
    role: roleChange ? (target.role === ROLE_ADMIN ? 'demote' : 'promote') : null,
  };
  return { ...actions, any: Object.values(actions).some(Boolean), self: actor.id === String(target.id) };
}

/**
 * Menu entries of a row in display order, destructive ones flagged (RowActions puts them last under a separator).
 * Someone else's row also links to that account's Log Login and Audit (read-only views, always allowed).
 * @param {ReturnType<typeof rowActions>} actions
 * @returns {Array<{id: string, destructive: boolean}>}
 */
export function rowMenuEntries(actions) {
  const entries = [
    actions.edit && { id: 'edit', destructive: false },
    actions.resetPassword && { id: 'resetPassword', destructive: false },
    actions.role && { id: actions.role, destructive: false },
    actions.revokeSessions && { id: 'revokeSessions', destructive: false },
    !actions.self && { id: 'loginLog', destructive: false },
    !actions.self && { id: 'audit', destructive: false },
    actions.toggleActive && { id: actions.toggleActive, destructive: actions.toggleActive === 'deactivate' },
    actions.delete && { id: 'delete', destructive: true },
  ];
  return entries.filter(Boolean);
}

/**
 * Query of `GET /api/admin/users` for the toolbar state and area (empty values are dropped by the api module).
 * @param {{search: string, status: string, role: string, limit: number, offset: number}} filter `ALL` means no filter.
 * @param {'admin' | 'dev'} area
 */
export function usersQuery({ search, status, role, limit, offset }, area) {
  const pick = (value) => (value === ALL ? '' : value);
  return { q: search.trim(), status: pick(status), role: areaRoleScope(area) ?? pick(role), limit, offset };
}

/**
 * Whether any toolbar filter narrows the list (drives "no match" vs "no users yet" and the reset button).
 * @param {{search: string, status: string, role: string}} filter
 */
export function hasUserFilters({ search, status, role }) {
  return search.trim() !== '' || status !== ALL || role !== ALL;
}

/** API failure code → the form field it is about (shown inline under that field instead of in the dialog alert). */
const FIELD_OF_CODE = Object.freeze({ EMAIL_TAKEN: 'email', SUPER_ADMIN_EMAIL_RESERVED: 'email', PASSWORD_WEAK: 'password' });

/**
 * Field a failed save belongs to, when the form has it.
 * @param {{code?: string, field?: string} | null | undefined} failure Error thrown by the api module.
 * @param {readonly string[]} fields Fields the form shows.
 * @returns {string | null}
 */
export function errorField(failure, fields) {
  const field = FIELD_OF_CODE[failure?.code] ?? (failure?.code === 'INVALID_INPUT' ? failure.field : null);
  return fields.includes(field) ? field : null;
}

/** Dialog kind → key of USERS_COPY.toast (promote and demote both read "Role diubah"). */
const TOAST_KEY = Object.freeze({
  create: 'created', edit: 'updated', deactivate: 'deactivated', activate: 'activated', revokeSessions: 'revoked',
  delete: 'deleted', promote: 'roleChanged', demote: 'roleChanged', resetPassword: 'passwordReset',
});

/**
 * Toast text after an action succeeded; `audit: 'failed'` in the reply (the action worked, its log line did not) is
 * reported as a warning instead of a plain success.
 * @param {string} kind Dialog kind.
 * @param {{audit?: string} | null | undefined} result API reply.
 * @returns {{text: string, level: 'success' | 'warning'}}
 */
export function doneToast(kind, result) {
  if (result?.audit === 'failed') return { text: USERS_COPY.toast.auditFailed, level: 'warning' };
  return { text: USERS_COPY.toast[TOAST_KEY[kind]] ?? USERS_COPY.toast.updated, level: 'success' };
}

/** Status key of StatusBadge for an account: inactive beats throttled beats must-change beats active. */
export function accountStatusKey(user) {
  if (!user.active) return 'inactive';
  if (user.throttled) return 'throttled';
  if (user.mustChangePassword) return 'mustChangePassword';
  return 'active';
}

/** @param {string} role @returns {string} */
export const roleText = (role) => USERS_COPY.roles[role] ?? role;
