// src/admin/dev/devHttp.mjs
/**
 * HTTP plumbing of the `/dev` system routes (kill switches, usage, system
 * summary): `{error: CODE, message}` replies (plan/auth/04), a capped JSON
 * body reader, and an async-handler wrapper that reports failures with the
 * route and actor id only — never a body, an email or a password.
 *
 * @module admin/dev/devHttp
 */

import { sendJson } from '../../auth/authReplies.mjs';
import { readRequestBodyCapped } from '../../server/proxyInfra.mjs';
import { DEV_ERROR_MESSAGES } from './devText.js';

export const MAX_BODY_BYTES = 8 * 1024;

/**
 * @param {import('node:http').ServerResponse} res
 * @param {number} status
 * @param {string} code
 * @param {{field?: string}} [detail]
 */
export function sendError(res, status, code, detail = {}) {
  sendJson(res, status, { error: code, message: DEV_ERROR_MESSAGES[code] ?? DEV_ERROR_MESSAGES.INTERNAL_ERROR, ...(detail.field ? { field: detail.field } : {}) });
}

/** Path below the mounted prefix (Connect strips it), without the query. */
export const subPath = (req) => String(req.url ?? '/').split('?')[0].replace(/\/+$/, '') || '/';

/**
 * Parsed JSON body or `{error}` (missing → `{}`; oversized/malformed → a code).
 * @param {import('node:http').IncomingMessage} req
 * @returns {Promise<{value: unknown} | {error: string}>}
 */
export async function readJsonBody(req) {
  let raw;
  try {
    raw = await readRequestBodyCapped(req, MAX_BODY_BYTES);
  } catch (error) {
    if (error?.code === 'BODY_TOO_LARGE') return { error: 'BODY_TOO_LARGE' };
    throw new Error(`reading the request body failed: ${error?.code || error?.message || error}`);
  }
  const text = raw.toString('utf8').trim();
  if (!text) return { value: {} };
  try {
    return { value: JSON.parse(text) };
  } catch {
    // Malformed JSON is the client's mistake: answered 400, nothing to report.
    return { error: 'INVALID_JSON' };
  }
}

/**
 * The booted auth state (services, db, kill switches) or an AUTH_UNAVAILABLE error.
 * @param {() => Promise<object>} getState
 * @returns {Promise<object>}
 */
export async function bootedState(getState) {
  let state;
  try {
    state = await getState();
  } catch (error) {
    throw Object.assign(new Error(`auth boot failed: ${error?.message || error}`), { code: 'AUTH_UNAVAILABLE' });
  }
  if (!state?.services || !state?.killSwitches) throw Object.assign(new Error('auth is not configured'), { code: 'AUTH_UNAVAILABLE' });
  return state;
}

/**
 * Wrap an async handler: an unexpected error is reported once (route + actor id) and answered 500/503.
 * @param {string} route
 * @param {(req: any, res: any, next: Function) => Promise<unknown>} handler
 * @returns {(req: any, res: any, next: Function) => void}
 */
export function guarded(route, handler) {
  return (req, res, next) => {
    handler(req, res, next).catch((error) => {
      const unavailable = error?.code === 'AUTH_UNAVAILABLE';
      console.error(`[dev] ${route} failed for actor ${String(req.gevActor?.user?.id ?? '-')}: ${error?.message || error}`);
      if (res.headersSent) { res.end(); return; }
      sendError(res, unavailable ? 503 : 500, unavailable ? 'AUTH_UNAVAILABLE' : 'INTERNAL_ERROR');
    });
  };
}
