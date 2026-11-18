/**
 * Browser-side calls to the account-management API (session cookie):
 * `/api/admin/users`, `/api/admin/login-log`, `/api/admin/audit` (account
 * source). A refused call throws an Error whose `message` is the Indonesian
 * text for its code and whose `code`/`status`/`field`/`reason`/`min` say what happened (errorMessage() reads them).
 *
 * @module admin/users/usersApi
 */

import { userErrorMessage } from './usersErrors.mjs';

const USERS = '/api/admin/users';

/**
 * `{q: 'x', status: '', offset: 0}` → `?q=x` (empty, null and undefined values dropped; 0 kept only for limit).
 * @param {Record<string, unknown>} params
 * @returns {string}
 */
export function queryString(params = {}) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '' || (key === 'offset' && value === 0)) continue;
    search.set(key, String(value));
  }
  const text = search.toString();
  return text ? `?${text}` : '';
}

async function call(fetchFn, method, url, body) {
  const init = { method, credentials: 'same-origin', cache: 'no-store' };
  if (method !== 'GET') {
    init.headers = { 'Content-Type': 'application/json' };
    init.body = JSON.stringify(body ?? {});
  }
  const response = await fetchFn(url, init);
  const payload = await response.json().catch(() => ({}));
  if (response.ok) return payload;
  const error = new Error(userErrorMessage(payload.error ? payload : `HTTP_${response.status}`));
  error.code = payload.error ?? `HTTP_${response.status}`;
  error.status = response.status;
  error.field = payload.field;
  error.reason = payload.reason;
  error.min = payload.min;
  throw error;
}

/**
 * The account API bound to one `fetch` (tests pass a fake).
 * @param {typeof fetch} [fetchFn]
 */
export function createUsersApi(fetchFn = (...args) => fetch(...args)) {
  const byId = (id) => `${USERS}/${encodeURIComponent(id)}`;
  return {
    /** @param {{q?: string, status?: string, role?: string, limit?: number, offset?: number}} filter */
    list: (filter) => call(fetchFn, 'GET', `${USERS}${queryString(filter)}`),
    stats: () => call(fetchFn, 'GET', `${USERS}/stats`),
    /** @param {object} body `{email, name, role?, capabilities?, password? | generate: true}` */
    create: (body) => call(fetchFn, 'POST', USERS, body),
    update: (id, body) => call(fetchFn, 'PATCH', byId(id), body),
    deactivate: (id) => call(fetchFn, 'POST', `${byId(id)}/deactivate`),
    activate: (id) => call(fetchFn, 'POST', `${byId(id)}/activate`),
    /** @param {{password?: string, generate?: true}} body */
    resetPassword: (id, body) => call(fetchFn, 'POST', `${byId(id)}/password`, body),
    revokeSessions: (id) => call(fetchFn, 'POST', `${byId(id)}/sessions/revoke`),
    remove: (id, confirmEmail) => call(fetchFn, 'DELETE', byId(id), { confirmEmail }),
    /** @param {{role: 'user' | 'admin', currentPassword?: string}} body */
    setRole: (id, body) => call(fetchFn, 'POST', `${byId(id)}/role`, body),
    /** @param {{userId?: string, success?: string, range?: string, limit?: number, offset?: number}} filter */
    loginLog: (filter) => call(fetchFn, 'GET', `/api/admin/login-log${queryString(filter)}`),
    /** @param {{action?: string, targetId?: string, range?: string, limit?: number, offset?: number}} filter */
    audit: (filter) => call(fetchFn, 'GET', `/api/admin/audit${queryString({ source: 'account', ...filter })}`),
  };
}

/** Shared instance for the pages. */
export const usersApi = createUsersApi();
