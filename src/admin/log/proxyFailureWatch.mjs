// src/admin/log/proxyFailureWatch.mjs
/**
 * "External service failing repeatedly" (checklist 1E): watches the status of
 * every /api/* response and logs once a route answers 5xx several times in a
 * row, then once more when it recovers. Routes are grouped by their first two
 * path segments (`/api/tomtom/…` → `/api/tomtom`); no query string is kept.
 *
 * @module admin/log/proxyFailureWatch
 */

/** Consecutive 5xx answers before a route is reported as failing. */
export const FAILURE_STREAK = 3;
const IGNORED = ['/api/log', '/api/admin'];

/** `/api/tomtom/tile/1/2?key=x` → `/api/tomtom`; null for non-API paths. */
export function routeGroup(url) {
  const pathname = String(url ?? '').split('?')[0];
  if (!pathname.startsWith('/api/')) return null;
  if (IGNORED.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))) return null;
  const [, api, name] = pathname.split('/');
  return name ? `/${api}/${name}` : null;
}

/**
 * Pure streak tracker. `observe` returns the event to log, if any.
 * @returns {{observe: (group: string, status: number) => object | null}}
 */
export function createFailureTracker(threshold = FAILURE_STREAK) {
  const streaks = new Map();
  const failing = new Set();
  return {
    observe(group, status) {
      if (status >= 500) {
        const streak = (streaks.get(group) ?? 0) + 1;
        streaks.set(group, streak);
        if (streak === threshold) {
          failing.add(group);
          return { level: 'warn', source: 'proxy', code: 'proxy.failing', message: `${group} answered HTTP ${status} ${threshold} times in a row`, detail: { route: group, status } };
        }
        return null;
      }
      streaks.set(group, 0);
      if (!failing.delete(group)) return null;
      return { level: 'info', source: 'proxy', code: 'proxy.recovered', message: `${group} answers normally again`, detail: { route: group, status } };
    },
  };
}

/**
 * Connect middleware: observes each response when it finishes. Install it
 * BEFORE the proxies so it sees their responses.
 * @param {(event: object) => void} record
 */
export function proxyFailureMiddleware(record, tracker = createFailureTracker()) {
  return (req, res, next) => {
    const group = routeGroup(req.originalUrl ?? req.url);
    if (group) {
      res.on('finish', () => {
        const event = tracker.observe(group, res.statusCode);
        if (event) record(event);
      });
    }
    next();
  };
}
