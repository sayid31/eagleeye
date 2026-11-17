/**
 * Pure presentation logic of the Pengguna / Log Login / Audit pages: which
 * actions a row offers (straight from `authorizeUserAction`, the same matrix
 * the server enforces), create-form defaults, the "Salin pesan" handover text,
 * status pills, paging and log wording. No DOM, no network.
 *
 * @module admin/users/usersView
 */

import { authorizeUserAction } from '../../auth/authHierarchy.mjs';
import { DEFAULT_CAPABILITIES } from '../../auth/authCapabilities.mjs';
import { ROLE_ADMIN, ROLE_SUPER_ADMIN, ROLE_USER } from '../../auth/authRoles.mjs';
import { minPasswordLength } from '../../auth/passwordPolicy.mjs';
import { AUDIT_COPY, LOGIN_LOG_COPY, USERS_COPY } from './usersCopy.js';

/** `/api/me` user → the shape authorizeUserAction takes. */
const actorOf = (me) => ({ id: String(me?.id ?? ''), role: me?.role });

/**
 * Whether the area manages roles (promote/demote, role selector): `/dev` only.
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
 * What a row offers the signed-in account. Every flag is a cell of the
 * plan/auth/01 matrix; the UI never offers what the server would refuse.
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
 * Empty create form (owner defaults: Layer data + Voice & AI on, premium off — plan/auth/08 #1).
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

/** Minimum password length shown in the form hint. @param {string} role */
export const passwordMinFor = (role) => minPasswordLength(role);

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

/**
 * Status pill of an account.
 * @param {{active: boolean, throttled?: boolean, mustChangePassword?: boolean}} user
 * @returns {{label: string, tone: 'ok' | 'warn' | 'error' | 'info'}}
 */
export function accountStatus(user) {
  if (!user.active) return { label: USERS_COPY.status.inactive, tone: 'error' };
  if (user.throttled) return { label: USERS_COPY.status.throttled, tone: 'warn' };
  if (user.mustChangePassword) return { label: USERS_COPY.status.mustChange, tone: 'info' };
  return { label: USERS_COPY.status.active, tone: 'ok' };
}

/** @param {string} role @returns {string} */
export const roleText = (role) => USERS_COPY.roles[role] ?? role;

/**
 * Paging line + neighbours for a `{total, limit, offset}` page.
 * @param {{total: number, limit: number, offset: number}} page
 */
export function pageInfo({ total, limit, offset }) {
  const from = total === 0 ? 0 : Math.min(offset + 1, total);
  const to = Math.min(offset + limit, total);
  return {
    from, to, total,
    label: USERS_COPY.pager.range(from, to, total),
    prevOffset: offset > 0 ? Math.max(0, offset - limit) : null,
    nextOffset: offset + limit < total ? offset + limit : null,
  };
}

/**
 * Short device label from a user agent (browser · OS); never the raw string.
 * @param {string | null | undefined} userAgent
 * @returns {string}
 */
export function describeDevice(userAgent) {
  const ua = String(userAgent ?? '');
  if (!ua) return '—';
  const browser = [[/Edg\//, 'Edge'], [/OPR\//, 'Opera'], [/Firefox\//, 'Firefox'], [/Chrome\//, 'Chrome'], [/Safari\//, 'Safari'], [/node|undici|curl/i, 'Skrip']]
    .find(([pattern]) => pattern.test(ua))?.[1] ?? 'Browser lain';
  const os = [[/Android/, 'Android'], [/iPhone|iPad/, 'iOS'], [/Windows/, 'Windows'], [/Mac OS X|Macintosh/, 'macOS'], [/Linux/, 'Linux']]
    .find(([pattern]) => pattern.test(ua))?.[1];
  return os ? `${browser} · ${os}` : browser;
}

/**
 * Short form of a stored IP for display: an expanded IPv6 address
 * (`0000:0000:…:0001`) is compacted (`::1`); IPv4 and anything else as stored.
 * @param {string | null | undefined} ip
 * @returns {string}
 */
export function compactIp(ip) {
  const text = String(ip ?? '');
  if (!text) return '—';
  if (!/^[0-9a-f]{1,4}(:[0-9a-f]{1,4}){7}$/i.test(text)) return text;
  const groups = text.split(':').map((group) => group.replace(/^0+(?=.)/, '').toLowerCase());
  let best = { start: -1, length: 0 };
  for (let i = 0; i < groups.length;) {
    let j = i;
    while (j < groups.length && groups[j] === '0') j += 1;
    if (j - i > best.length) best = { start: i, length: j - i };
    i = j > i ? j : i + 1;
  }
  if (best.length < 2) return groups.join(':');
  return `${groups.slice(0, best.start).join(':')}::${groups.slice(best.start + best.length).join(':')}`;
}

/** Result text of a login_log row. @param {{success: boolean, reason?: string | null}} entry */
export function loginResultText(entry) {
  if (entry.success) return LOGIN_LOG_COPY.ok;
  return LOGIN_LOG_COPY.reasons[entry.reason] ?? entry.reason ?? '—';
}

/** Account cell of a login_log row. */
export function loginAccountText(entry) {
  if (!entry.userId) return LOGIN_LOG_COPY.unknownAccount;
  const name = entry.userName ?? entry.userId;
  return entry.userDeleted ? `${name} (${LOGIN_LOG_COPY.deleted})` : name;
}

/** Wording of an audit action code. @param {string} action */
export const auditActionText = (action) => AUDIT_COPY.actions[action] ?? action;

/**
 * Who acted, for an audit row (redacted actors read as their role).
 * @param {{actorId: string | null, actorName: string | null, actorRole: string | null}} entry
 * @param {{id: string}} me
 */
export function auditActorText(entry, me) {
  if (entry.actorId && entry.actorId === String(me?.id)) return USERS_COPY.self;
  if (entry.actorName) return entry.actorName;
  if (!entry.actorRole) return AUDIT_COPY.system;
  return AUDIT_COPY.otherActor(roleText(entry.actorRole), entry.actorRole === ROLE_SUPER_ADMIN);
}

/**
 * Indonesian reading of an audit summary written by the account service
 * (`role user`, `fields name,email`, `user → admin`); anything else as stored.
 * @param {string | null | undefined} summary
 * @returns {string}
 */
export function auditDetailText(summary) {
  const text = String(summary ?? '');
  const { detail } = AUDIT_COPY;
  let match = /^role (\S+)$/.exec(text);
  if (match) return `${detail.role}: ${roleText(match[1])}`;
  match = /^fields (.+)$/.exec(text);
  if (match) return `${detail.fields}: ${match[1].split(',').map((field) => detail.fieldNames[field] ?? field).join(', ')}`;
  match = /^(\S+) → (\S+)$/.exec(text);
  if (match) return `${roleText(match[1])} → ${roleText(match[2])}`;
  return text;
}

/**
 * Local date-time for a stored ISO string (`id-ID`, 24-hour).
 * @param {string | null | undefined} iso
 * @returns {string}
 */
export function formatDateTime(iso) {
  const time = Date.parse(iso ?? '');
  if (!Number.isFinite(time)) return '—';
  return new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeStyle: 'short', hour12: false }).format(time);
}
