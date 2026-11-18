// src/admin/users/adminLogRoutes.mjs
/**
 * Read-only log routes for /admin and /dev, gate `admin`:
 *
 *   GET /api/admin/login-log?userId&success&range&limit&offset
 *       admin: sign-ins of `user` accounts; super_admin: every row.
 *   GET /api/admin/audit?source=account&action&targetId&range&limit&offset   (default source)
 *       the `audit_log` table — admin: `user.*` actions on `user` accounts;
 *       super_admin: every action.
 *   GET /api/admin/audit?source=system&…
 *       falls through to the legacy key/AI JSONL trail
 *       (src/admin/audit/adminAuditRoutes.mjs, super_admin only) until that
 *       trail moves into the table (plan/auth/06). This route must therefore be
 *       registered BEFORE serverLogPlugin's.
 *
 * Paginated (`limit` 20, max 100). No route here writes or deletes a row.
 *
 * @module admin/users/adminLogRoutes
 */

import { registerApiRoute } from '../../auth/apiRouteRegistry.mjs';
import { ROLE_SUPER_ADMIN } from '../../auth/authRoles.mjs';
import { requireActor } from '../../auth/requireActor.mjs';
import { rangeStart } from './activityRange.mjs';
import { parseAccountAuditQuery, parseLoginLogQuery } from './usersBoundary.mjs';
import { bootedState, guarded, sendError, sendInvalid, sendResult } from './usersHttp.mjs';
import { logQueriesFor, visibleRoles } from './usersRoutes.mjs';

export const LOGIN_LOG_ROUTE = '/api/admin/login-log';
export const AUDIT_ROUTE = '/api/admin/audit';

const pathOf = (url) => String(url ?? '/').split('?')[0].replace(/(.)\/$/, '$1') || '/';

/** Shared admission: admin gate, GET on the mount root only. */
function admit(req, res) {
  const admitted = requireActor(req, 'admin');
  if (!admitted.ok) { sendError(res, admitted.status, admitted.status === 401 ? 'AUTH_REQUIRED' : 'ADMIN_REQUIRED'); return false; }
  if (pathOf(req.url) !== '/') { sendError(res, 404, 'NOT_FOUND'); return false; }
  if (req.method !== 'GET') { sendError(res, 405, 'METHOD_NOT_ALLOWED'); return false; }
  return true;
}

/**
 * An admin sees who acted only when it was itself (other admins stay hidden, plan/auth/08);
 * the role still shows.
 * @param {object[]} entries
 * @param {{role: string, user: {id: string}}} actor
 */
export function redactAuditActors(entries, actor) {
  if (actor.role === ROLE_SUPER_ADMIN) return entries;
  const self = String(actor.user.id);
  return entries.map((entry) => (entry.actorId === self ? entry : { ...entry, actorId: null, actorName: null }));
}

/**
 * @param {any} middlewares Connect app (or Vite server).
 * @param {{getState: () => Promise<object>}} deps Booted auth state (authStateFor).
 */
export function installAdminLogRoutes(middlewares, { getState }) {
  registerApiRoute(middlewares, LOGIN_LOG_ROUTE, 'admin', guarded('login-log', async (req, res) => {
    if (!admit(req, res)) return;
    const query = parseLoginLogQuery(req.url);
    if (query.error) return sendInvalid(res, query.error);
    const actor = req.gevActor;
    const queries = logQueriesFor(await bootedState(getState));
    const roles = actor.role === ROLE_SUPER_ADMIN ? null : visibleRoles(actor);
    const { range, ...filter } = query;
    const page = queries.loginLog({ ...filter, since: rangeStart(range), roles });
    return sendResult(res, { ok: true, ...page, limit: query.limit, offset: query.offset });
  }));

  registerApiRoute(middlewares, AUDIT_ROUTE, 'admin', guarded('audit', async (req, res, next) => {
    const query = parseAccountAuditQuery(req.url);
    if (query.source === 'system') return next();
    if (!admit(req, res)) return;
    if (query.error) return sendInvalid(res, query.error);
    const actor = req.gevActor;
    const scope = actor.role === ROLE_SUPER_ADMIN ? 'all' : 'admin';
    const { range, ...filter } = query;
    const page = logQueriesFor(await bootedState(getState)).accountAudit({ ...filter, since: rangeStart(range), scope });
    return sendResult(res, { ok: true, source: 'account', scope, entries: redactAuditActors(page.entries, actor), total: page.total, limit: query.limit, offset: query.offset });
  }));
}
