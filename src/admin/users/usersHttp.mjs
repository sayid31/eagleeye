// src/admin/users/usersHttp.mjs
/**
 * HTTP plumbing shared by the account-management routes: JSON body reading
 * with a size cap, the `{error: CODE, message}` reply (plan/auth/04), and the
 * mapping from an account-service result to a response. Never logs a body,
 * an email or a password — failures name the route, the actor id and a code.
 *
 * @module admin/users/usersHttp
 */

import { sendJson } from '../../auth/authReplies.mjs';
import { readRequestBodyCapped } from '../../server/proxyInfra.mjs';
import { userErrorMessage } from './usersErrors.mjs';

export const MAX_BODY_BYTES = 16 * 1024;
/** HTTP status of the codes the boundary itself produces. */
const BOUNDARY_STATUS = { INVALID_INPUT: 400, INVALID_JSON: 400, BODY_TOO_LARGE: 413, ROLE_NOT_ASSIGNABLE: 403 };
/** Extra detail fields a failure may carry to the client (never a value the user typed). */
const DETAIL_FIELDS = ['field', 'reason', 'min'];

/**
 * @param {import('node:http').ServerResponse} res
 * @param {number} status
 * @param {string} code
 * @param {object} [detail] `{field?, reason?, min?}`
 */
export function sendError(res, status, code, detail = {}) {
  const extra = Object.fromEntries(DETAIL_FIELDS.filter((key) => detail[key] !== undefined).map((key) => [key, detail[key]]));
  sendJson(res, status, { error: code, message: userErrorMessage({ error: code, ...extra }), ...extra });
}

/**
 * Reply for a boundary validation failure (`{code, field?}` from usersBoundary).
 * @param {import('node:http').ServerResponse} res
 * @param {{code: string, field?: string}} problem
 */
export function sendInvalid(res, problem) {
  sendError(res, BOUNDARY_STATUS[problem.code] ?? 400, problem.code, problem);
}

/**
 * Reply for an account-service result: `{ok: true, …}` → `status` with the rest; `{ok: false, status, code}` → error.
 * @param {import('node:http').ServerResponse} res
 * @param {{ok: boolean, status?: number, code?: string}} result
 * @param {number} [status] Success status.
 */
export function sendResult(res, result, status = 200) {
  if (!result.ok) return sendError(res, result.status ?? 400, result.code, result);
  const { ok: _ok, ...payload } = result;
  return sendJson(res, status, payload);
}

/**
 * Parsed JSON object body, or `{error}` for a missing, oversized or malformed one.
 * @param {import('node:http').IncomingMessage} req
 * @returns {Promise<{value: object} | {error: {code: string}}>}
 */
export async function readJsonBody(req) {
  let raw;
  try {
    raw = await readRequestBodyCapped(req, MAX_BODY_BYTES);
  } catch (error) {
    if (error?.code === 'BODY_TOO_LARGE') return { error: { code: 'BODY_TOO_LARGE' } };
    throw new Error(`reading the request body failed: ${error?.code || error?.message || error}`);
  }
  const text = raw.toString('utf8').trim();
  if (!text) return { value: {} };
  try {
    return { value: JSON.parse(text) };
  } catch {
    // Malformed JSON is the client's mistake: answered 400, nothing to report.
    return { error: { code: 'INVALID_JSON' } };
  }
}

/**
 * Wrap an async route handler: an unexpected error becomes a 500 (or 503 when
 * the auth stack is unavailable), reported once with the route and actor id.
 * @param {string} route Name for the log line.
 * @param {(req: any, res: any, next: Function) => Promise<unknown>} handler
 * @returns {(req: any, res: any, next: Function) => void}
 */
export function guarded(route, handler) {
  return (req, res, next) => {
    handler(req, res, next).catch((error) => {
      const unavailable = error?.code === 'AUTH_UNAVAILABLE';
      console.error(`[admin-users] ${route} failed for actor ${String(req.gevActor?.user?.id ?? '-')}: ${error?.message || error}`);
      if (res.headersSent) { res.end(); return; }
      sendError(res, unavailable ? 503 : 500, unavailable ? 'AUTH_UNAVAILABLE' : 'INTERNAL_ERROR');
    });
  };
}

/**
 * The booted auth state with services and database, or an AUTH_UNAVAILABLE error.
 * @param {() => Promise<object>} getState
 */
export async function bootedState(getState) {
  let state;
  try {
    state = await getState();
  } catch (error) {
    throw Object.assign(new Error(`auth boot failed: ${error?.message || error}`), { code: 'AUTH_UNAVAILABLE' });
  }
  if (!state?.services || !state?.db) throw Object.assign(new Error('auth is not configured'), { code: 'AUTH_UNAVAILABLE' });
  return state;
}
