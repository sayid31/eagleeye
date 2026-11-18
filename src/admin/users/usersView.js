/**
 * Pure presentation logic of the Pengguna page: which actions a row offers (straight from `authorizeUserAction`, the
 * same matrix the server enforces), the filter → query mapping, create/edit form rules, password requirement hints
 * and the "Salin pesan" handover text. No DOM, no network.
 *
 * @module admin/users/usersView
 */

import { authorizeUserAction } from '../../auth/authHierarchy.mjs';
import { CAPABILITY_KEYS, DEFAULT_CAPABILITIES } from '../../auth/authCapabilities.mjs';
import { ROLE_ADMIN, ROLE_SUPER_ADMIN, ROLE_USER, normalizeEmail } from '../../auth/authRoles.mjs';
import { PASSWORD_MAX, minPasswordLength, validatePassword } from '../../auth/passwordPolicy.mjs';
import { USERS_COPY } from '../../copy/id/users.js';

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

/**
 * Empty create form (owner defaults: Layer data + Voice & AI on, premium off).
 * @returns {{email: string, name: string, role: string, capabilities: object, passwordMode: 'generate' | 'typed', password: string}}
 */
export function createFormDefaults() {
  return { email: '', name: '', role: ROLE_USER, capabilities: { ...DEFAULT_CAPABILITIES }, passwordMode: 'generate', password: '' };
}

/**
 * API body of the create form (`role` only when the area manages roles; toggles only for users).
 * @param {ReturnType<typeof createFormDefaults>} form
 * @param {boolean} chooseRole
 */
export function createPayload(form, chooseRole) {
  const role = chooseRole ? form.role : ROLE_USER;
  const body = { email: form.email.trim(), name: form.name.trim(), ...(chooseRole ? { role } : {}) };
  if (role === ROLE_USER) body.capabilities = { ...form.capabilities };
  return form.passwordMode === 'generate' ? { ...body, generate: true } : { ...body, password: form.password };
}

/**
 * Whether the create form may be submitted (the server stays the authority; this only avoids a pointless round trip).
 * @param {ReturnType<typeof createFormDefaults>} form
 * @param {boolean} chooseRole
 */
export function createFormReady(form, chooseRole) {
  const role = chooseRole ? form.role : ROLE_USER;
  if (!/^\S+@\S+\.\S+$/.test(form.email.trim()) || form.name.trim() === '') return false;
  return form.passwordMode === 'generate' || passwordRequirements({ ...form, role }).every((item) => item.met);
}

/**
 * Body of `PATCH /api/admin/users/:id`: only the fields the actor may edit and that changed; the three capability
 * toggles always travel together. Null when nothing changed.
 * @param {{name: string, email: string, capabilities: object}} target
 * @param {{name: string, email: string, capabilities: object}} form
 * @param {{name: boolean, email: boolean, capabilities: boolean}} edit Flags from `rowActions(...).edit`.
 */
export function editPayload(target, form, edit) {
  const body = {};
  if (edit.name && form.name.trim() !== target.name) body.name = form.name.trim();
  if (edit.email && normalizeEmail(form.email) !== target.email) body.email = form.email.trim();
  if (edit.capabilities && CAPABILITY_KEYS.some((key) => form.capabilities[key] !== target.capabilities[key])) {
    body.capabilities = Object.fromEntries(CAPABILITY_KEYS.map((key) => [key, Boolean(form.capabilities[key])]));
  }
  return Object.keys(body).length ? body : null;
}

/**
 * Live checklist for a typed password: length for the role, upper bound, and not equal to the email or name.
 * @param {{password: string, role: string, email?: string, name?: string}} input
 * @returns {Array<{id: 'min' | 'max' | 'identity', label: string, met: boolean}>}
 */
export function passwordRequirements({ password, role, email = '', name = '' }) {
  const { password: copy } = USERS_COPY;
  const length = [...password].length;
  const min = minPasswordLength(role);
  const weak = validatePassword(password, { email, name, role });
  return [
    { id: 'min', label: copy.minLength(min), met: length >= min },
    { id: 'max', label: copy.maxLength(PASSWORD_MAX), met: length <= PASSWORD_MAX },
    { id: 'identity', label: copy.notIdentity, met: weak.ok || weak.reason !== 'matches_identity' },
  ];
}

/**
 * The "Salin pesan" text an admin sends (e.g. over WhatsApp) to a new or reset account.
 * @param {{origin: string, email: string, password: string, reset?: boolean}} input
 * @returns {string}
 */
export function handoverMessage({ origin, email, password, reset = false }) {
  const base = String(origin ?? '').replace(/\/+$/, '');
  return [
    reset ? 'Password akun EagleEye Anda sudah direset.' : 'Akun EagleEye Anda sudah dibuat.',
    '',
    `Alamat login: ${base}/login`,
    `Email: ${email}`,
    `Password sementara: ${password}`,
    '',
    'Catatan: password ini wajib diganti saat login pertama. Jangan bagikan pesan ini ke orang lain.',
  ].join('\n');
}
