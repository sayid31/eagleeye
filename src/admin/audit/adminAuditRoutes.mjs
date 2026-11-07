// src/admin/audit/adminAuditRoutes.mjs
/**
 * GET /api/admin/audit?type=&offset=&limit= — the owner audit trail
 * (`adminAuditLog.mjs`), newest first, for /admin → Audit Log. Behind
 * `requireAdminSession`. Entries already hold only codes and env var names.
 *
 * @module admin/audit/adminAuditRoutes
 */

import { requireAdminSession } from '../auth/requireAdminSession.mjs';

/** Filter chips on the page → event-code prefix. */
export const AUDIT_TYPES = Object.freeze({
  keys: 'keys.',
  settings: 'voice_settings.',
  login: 'admin.',
  log: 'log.',
});
const PAGE_MAX = 200;

/** `?type=keys&offset=50&limit=50` → validated list options. */
export function parseAuditQuery(url) {
  const params = new URLSearchParams(String(url ?? '').split('?')[1] ?? '');
  const type = params.get('type');
  const limit = Number(params.get('limit'));
  const offset = Number(params.get('offset'));
  return {
    type: Object.hasOwn(AUDIT_TYPES, type ?? '') ? type : '',
    prefix: AUDIT_TYPES[type] ?? '',
    limit: Number.isInteger(limit) && limit > 0 ? Math.min(limit, PAGE_MAX) : 100,
    offset: Number.isInteger(offset) && offset > 0 ? offset : 0,
  };
}

/**
 * @param {import('connect').Server} middlewares
 * @param {{audit: {list: Function}, guard?: (req: any) => {ok: boolean, status?: number, error?: string}}} deps
 */
export function installAdminAuditRoutes(middlewares, { audit, guard = (req) => requireAdminSession(req) }) {
  middlewares.use('/api/admin/audit', (req, res) => {
    const send = (status, payload) => {
      res.statusCode = status;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store');
      res.end(JSON.stringify(payload));
    };
    const admitted = guard(req);
    if (!admitted.ok) return send(admitted.status, { error: admitted.error });
    if (req.method !== 'GET') return send(405, { error: 'Method not allowed' });
    const query = parseAuditQuery(req.url);
    // Ask for one extra row to know whether another page exists.
    const rows = audit.list({ limit: query.limit + 1, offset: query.offset, prefix: query.prefix });
    return send(200, {
      entries: rows.slice(0, query.limit),
      nextOffset: rows.length > query.limit ? query.offset + query.limit : null,
      type: query.type,
      types: Object.keys(AUDIT_TYPES),
    });
  });
}
