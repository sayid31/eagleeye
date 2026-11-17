// src/admin/users/usersBoundary.mjs
/**
 * Request validation for `/api/admin/users`, `/api/admin/login-log` and
 * `/api/admin/audit` (plan/auth/04): every path, query and JSON body is
 * checked here, before the account service or a query runs. Pure — each
 * function returns the clean input or `{error: {code, field?}}`.
 *
 * @module admin/users/usersBoundary
 */

import { AUDIT_ACTIONS } from '../../auth/auditLog.mjs';
import { CAPABILITY_KEYS, DEFAULT_CAPABILITIES } from '../../auth/authCapabilities.mjs';
import { ROLES } from '../../auth/authRoles.mjs';
import { clampPage } from '../../auth/accountQueries.mjs';

export const MAX_QUERY_LENGTH = 100;
const MAX_TEXT = 320;
const MAX_PASSWORD_INPUT = 256;
const ID = /^[A-Za-z0-9_-]{1,64}$/;
/** Roles an account can be moved between (super_admin comes from env + CLI only). */
const SETTABLE_ROLES = ['user', 'admin'];

const invalid = (field) => ({ error: { code: 'INVALID_INPUT', field } });
const isPlainObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const optionalText = (value, max = MAX_TEXT) => value === undefined || (typeof value === 'string' && value.length <= max);

/** Sub-routes of `/api/admin/users`, by `[method, shape]`. */
const USER_ROUTES = [
  ['GET', /^\/$/, 'list'], ['POST', /^\/$/, 'create'], ['GET', /^\/stats$/, 'stats'],
  ['GET', /^\/([^/]+)$/, 'get'], ['PATCH', /^\/([^/]+)$/, 'update'], ['DELETE', /^\/([^/]+)$/, 'delete'],
  ['POST', /^\/([^/]+)\/deactivate$/, 'deactivate'], ['POST', /^\/([^/]+)\/activate$/, 'activate'],
  ['POST', /^\/([^/]+)\/password$/, 'password'], ['POST', /^\/([^/]+)\/sessions\/revoke$/, 'revokeSessions'],
  ['POST', /^\/([^/]+)\/role$/, 'role'],
];

const splitUrl = (url) => {
  const [path, query = ''] = String(url ?? '/').split('#')[0].split('?');
  return { path: path || '/', params: new URLSearchParams(query) };
};

/**
 * Route of a request inside the `/api/admin/users` mount (Connect strips the prefix).
 * @param {string} method
 * @param {string} url e.g. `/abc/role?x=1`
 * @returns {{route: string, id?: string} | {error: {code: string, status: number}}}
 */
export function parseUsersRoute(method, url) {
  const path = splitUrl(url).path.replace(/(.)\/$/, '$1');
  let pathKnown = false;
  for (const [routeMethod, shape, route] of USER_ROUTES) {
    const match = shape.exec(path);
    if (!match) continue;
    // `/stats` is its own route, never an account id.
    if (match[1] === 'stats' && route !== 'stats') continue;
    pathKnown = true;
    if (routeMethod !== method) continue;
    if (match[1] !== undefined && !ID.test(match[1])) return { error: { code: 'NOT_FOUND', status: 404 } };
    return match[1] === undefined ? { route } : { route, id: match[1] };
  }
  return { error: pathKnown ? { code: 'METHOD_NOT_ALLOWED', status: 405 } : { code: 'NOT_FOUND', status: 404 } };
}

/**
 * `GET /api/admin/users?q&status&role&limit&offset`.
 * @param {string} url
 */
export function parseUserListQuery(url) {
  const { params } = splitUrl(url);
  const q = (params.get('q') ?? '').trim();
  const status = params.get('status') ?? '';
  const role = params.get('role') ?? '';
  if (q.length > MAX_QUERY_LENGTH) return invalid('q');
  if (!['', 'active', 'inactive'].includes(status)) return invalid('status');
  if (role && !ROLES.includes(role)) return invalid('role');
  return { q, status: status || undefined, role: role || undefined, ...clampPage({ limit: params.get('limit'), offset: params.get('offset') }) };
}

/** `{password}` xor `{generate: true}`. */
function passwordChoice(body) {
  if (body.generate !== undefined && typeof body.generate !== 'boolean') return invalid('generate');
  if (body.generate === true) return body.password === undefined ? { generate: true } : invalid('password');
  if (typeof body.password !== 'string' || body.password.length > MAX_PASSWORD_INPUT) return invalid('password');
  return { password: body.password };
}

/**
 * Exactly `{layers, ai, premium}` booleans; on create, missing keys take the defaults.
 * @param {unknown} value
 * @param {{partial: boolean}} options
 */
function capabilitiesInput(value, { partial }) {
  if (!isPlainObject(value)) return invalid('capabilities');
  const keys = Object.keys(value);
  if (keys.some((key) => !CAPABILITY_KEYS.includes(key) || typeof value[key] !== 'boolean')) return invalid('capabilities');
  if (!partial && keys.length !== CAPABILITY_KEYS.length) return invalid('capabilities');
  return { value: { ...DEFAULT_CAPABILITIES, ...value } };
}

/** `POST /api/admin/users` body. */
export function validateCreateBody(body) {
  if (!isPlainObject(body)) return invalid('body');
  if (typeof body.email !== 'string' || body.email.length > MAX_TEXT) return invalid('email');
  if (typeof body.name !== 'string' || body.name.length > MAX_TEXT) return invalid('name');
  if (body.role !== undefined && !SETTABLE_ROLES.includes(body.role)) return { error: { code: 'ROLE_NOT_ASSIGNABLE' } };
  const password = passwordChoice(body);
  if (password.error) return password;
  const input = { email: body.email, name: body.name, role: body.role, ...password };
  if (body.capabilities !== undefined) {
    const capabilities = capabilitiesInput(body.capabilities, { partial: true });
    if (capabilities.error) return capabilities;
    input.capabilities = capabilities.value;
  }
  return { value: input };
}

/** `PATCH /api/admin/users/:id` body — `{name?, email?, capabilities?}` (all three toggles together). */
export function validateUpdateBody(body) {
  if (!isPlainObject(body)) return invalid('body');
  if (!optionalText(body.name) || !optionalText(body.email)) return invalid(optionalText(body.name) ? 'email' : 'name');
  const input = {};
  if (body.name !== undefined) input.name = body.name;
  if (body.email !== undefined) input.email = body.email;
  if (body.capabilities !== undefined) {
    const capabilities = capabilitiesInput(body.capabilities, { partial: false });
    if (capabilities.error) return capabilities;
    input.capabilities = capabilities.value;
  }
  return Object.keys(input).length ? { value: input } : invalid('body');
}

/** `POST /api/admin/users/:id/password` body. */
export function validatePasswordBody(body) {
  if (!isPlainObject(body)) return invalid('body');
  const choice = passwordChoice(body);
  return choice.error ? choice : { value: choice };
}

/** `POST /api/admin/users/:id/role` body — `{role, currentPassword?}` (absent only for a Google-only super_admin). */
export function validateRoleBody(body) {
  if (!isPlainObject(body)) return invalid('body');
  if (!SETTABLE_ROLES.includes(body.role)) return { error: { code: 'ROLE_NOT_ASSIGNABLE' } };
  if (!optionalText(body.currentPassword, MAX_PASSWORD_INPUT)) return invalid('currentPassword');
  return { value: { role: body.role, currentPassword: body.currentPassword } };
}

/** `DELETE /api/admin/users/:id` body. */
export function validateDeleteBody(body) {
  if (!isPlainObject(body) || typeof body.confirmEmail !== 'string' || body.confirmEmail.length > MAX_TEXT) return invalid('confirmEmail');
  return { value: { confirmEmail: body.confirmEmail } };
}

const optionalId = (params, field) => {
  const value = params.get(field) ?? '';
  return value === '' || ID.test(value) ? { value: value || undefined } : invalid(field);
};

/**
 * `GET /api/admin/login-log?userId&success&limit&offset`.
 * @param {string} url
 */
export function parseLoginLogQuery(url) {
  const { params } = splitUrl(url);
  const userId = optionalId(params, 'userId');
  if (userId.error) return userId;
  const success = params.get('success') ?? '';
  if (!['', 'true', 'false'].includes(success)) return invalid('success');
  return { userId: userId.value, success: success === '' ? undefined : success === 'true', ...clampPage({ limit: params.get('limit'), offset: params.get('offset') }) };
}

/** Sources of `GET /api/admin/audit`: the account `audit_log` table, or the legacy key/AI JSONL trail. */
export const AUDIT_SOURCES = Object.freeze(['account', 'system']);

/**
 * `GET /api/admin/audit?source&action&targetId&limit&offset` (account source).
 * @param {string} url
 */
export function parseAccountAuditQuery(url) {
  const { params } = splitUrl(url);
  const source = params.get('source') || 'account';
  if (!AUDIT_SOURCES.includes(source)) return invalid('source');
  // The legacy trail validates its own query (src/admin/audit/adminAuditRoutes.mjs).
  if (source === 'system') return { source };
  const action = params.get('action') ?? '';
  if (action && !AUDIT_ACTIONS.includes(action)) return invalid('action');
  const targetId = optionalId(params, 'targetId');
  if (targetId.error) return targetId;
  return { source, action: action || undefined, targetId: targetId.value, ...clampPage({ limit: params.get('limit'), offset: params.get('offset') }) };
}
