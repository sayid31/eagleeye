// src/admin/log/serverLogRoutes.mjs
/**
 * Server Log HTTP surface:
 *
 *  - POST /api/log — the browser's batched events (same-origin JSON only,
 *    ≤20 events, browser sources only, process-wide rate limit). Each event is
 *    validated and redacted by the store, never trusted.
 *  - GET    /api/admin/log?level=&source=&q=&offset=&limit= — newest first.
 *  - DELETE /api/admin/log — clear (leaves one `log.cleared` row).
 *
 * Admin routes are behind `requireAdminSession`.
 *
 * @module admin/log/serverLogRoutes
 */

import { requireAdminSession } from '../auth/requireAdminSession.mjs';
import { isSameOriginJson } from '../../server/sameOrigin.mjs';
import { BROWSER_LOG_SOURCES, LOG_LEVELS, LOG_SOURCES } from './serverLogCore.mjs';

const MAX_BODY_BYTES = 16 * 1024;
const MAX_EVENTS_PER_POST = 20;
/** Browser events accepted per minute, all clients together. */
export const BROWSER_EVENTS_PER_MINUTE = 120;
const PAGE_MAX = 200;

function sendJson(res, status, payload) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(payload));
}

/** Fixed-window counter: how many more events this minute. */
export function createEventBudget(perMinute = BROWSER_EVENTS_PER_MINUTE, now = () => Date.now()) {
  let windowStart = now();
  let used = 0;
  return (wanted) => {
    const t = now();
    if (t - windowStart >= 60_000) { windowStart = t; used = 0; }
    const granted = Math.max(0, Math.min(wanted, perMinute - used));
    used += granted;
    return granted;
  };
}

/** `?level=…` etc. → a validated filter for `queryLog`. */
export function parseLogQuery(url) {
  const params = new URLSearchParams(String(url ?? '').split('?')[1] ?? '');
  const level = params.get('level');
  const source = params.get('source');
  const limit = Number(params.get('limit'));
  const offset = Number(params.get('offset'));
  return {
    level: LOG_LEVELS.includes(level) ? level : undefined,
    source: LOG_SOURCES.includes(source) ? source : undefined,
    q: (params.get('q') ?? '').slice(0, 100),
    limit: Number.isInteger(limit) && limit > 0 ? Math.min(limit, PAGE_MAX) : 100,
    offset: Number.isInteger(offset) && offset > 0 ? offset : 0,
  };
}

/**
 * @param {import('connect').Server} middlewares
 * @param {object} deps
 * @param {ReturnType<import('./serverLogStore.mjs').createServerLog>} deps.log
 * @param {(req: any, maxBytes?: number) => Promise<string>} deps.readRequestBody
 * @param {(req: any) => {ok: boolean, status?: number, error?: string}} [deps.guard]
 * @param {(wanted: number) => number} [deps.budget]
 * @param {(entry: object) => void} [deps.audit] Records the clear in the audit trail.
 */
export function installServerLogRoutes(middlewares, {
  log, readRequestBody, guard = (req) => requireAdminSession(req), budget = createEventBudget(), audit = () => {},
}) {
  middlewares.use('/api/log', async (req, res) => {
    if (req.method !== 'POST') return sendJson(res, 405, { error: 'Method not allowed' });
    if (!isSameOriginJson(req)) return sendJson(res, 403, { error: 'Origin tidak diizinkan' });
    let body;
    try {
      body = JSON.parse(await readRequestBody(req, MAX_BODY_BYTES));
    } catch {
      return sendJson(res, 400, { error: 'Body bukan JSON yang valid atau terlalu besar' });
    }
    const events = Array.isArray(body?.events) ? body.events.slice(0, MAX_EVENTS_PER_POST) : [];
    const granted = budget(events.length);
    let accepted = 0;
    for (const event of events.slice(0, granted)) {
      if (log.record(event, { allowedSources: BROWSER_LOG_SOURCES, client: body.client })) accepted += 1;
    }
    return sendJson(res, granted < events.length ? 429 : 200, { accepted, dropped: events.length - accepted });
  });

  middlewares.use('/api/admin/log', (req, res) => {
    const admitted = guard(req);
    if (!admitted.ok) return sendJson(res, admitted.status, { error: admitted.error });
    if (req.method === 'GET') return sendJson(res, 200, { ...log.query(parseLogQuery(req.url)), levels: LOG_LEVELS, sources: LOG_SOURCES });
    if (req.method === 'DELETE') {
      const removed = log.clear();
      audit({ event: 'log.cleared', source: 'admin' });
      return sendJson(res, 200, { removed });
    }
    return sendJson(res, 405, { error: 'Method not allowed' });
  });
}
