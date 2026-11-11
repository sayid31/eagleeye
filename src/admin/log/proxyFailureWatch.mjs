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
 * Pure streak tracker. `observe` returns the event to log, if any;
 * `snapshot` is the per-route state System Health shows.
 * @returns {{observe: (group: string, status: number, at?: number) => object | null,
 *   snapshot: () => Array<{route: string, lastStatus: number, lastAt: number, streak: number, failing: boolean}>}}
 */
export function createFailureTracker(threshold = FAILURE_STREAK) {
  const streaks = new Map();
  const failing = new Set();
  const last = new Map();
  return {
    snapshot() {
      return [...last].map(([route, seen]) => ({ route, ...seen, streak: streaks.get(route) ?? 0, failing: failing.has(route) }))
        .sort((a, b) => a.route.localeCompare(b.route));
    },
    observe(group, status, at = Date.now()) {
      last.set(group, { lastStatus: status, lastAt: at });
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
 * One event per failed answer, so the first 5xx is visible without waiting for
 * a streak, and a 429 (our limiter or the upstream's) is visible at all. The
 * message names route + status only, so repeats merge into one counted row;
 * the WHY comes from the proxy's own console report (consoleBridge.mjs).
 * @param {string} group Route group from `routeGroup`.
 * @param {number} status HTTP status sent.
 * @returns {object|null}
 */
export function responseFailureEvent(group, status) {
  if (status === 429) {
    return { level: 'warn', source: 'proxy', code: 'proxy.rate_limited', message: `${group} answered HTTP 429 (rate limited)`, detail: { route: group, status } };
  }
  if (status >= 500) {
    return { level: 'error', source: 'proxy', code: 'proxy.http_error', message: `${group} answered HTTP ${status}`, detail: { route: group, status } };
  }
  return null;
}

/** The process-wide tracker (survives a Vite in-process restart), read by System Health. */
export function getProxyFailureTracker() {
  globalThis.__GEV_PROXY_TRACKER__ ??= createFailureTracker();
  return globalThis.__GEV_PROXY_TRACKER__;
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
        const failure = responseFailureEvent(group, res.statusCode);
        if (failure) record(failure);
        const event = tracker.observe(group, res.statusCode);
        if (event) record(event);
      });
    }
    next();
  };
}
