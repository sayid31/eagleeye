// src/admin/log/adminDenialWatch.mjs
/**
 * "Refused /admin access" (checklist 1F): any /api/admin/* response with 401
 * or 403 becomes one Server Log entry per route and status (repeats merge in
 * the log). Google accounts that are not the admin are logged separately by
 * the auth plugin with their reason code.
 *
 * @module admin/log/adminDenialWatch
 */

/** `/api/admin/keys/test?x` → `/api/admin/keys`; null outside /api/admin. */
export function adminRouteGroup(url) {
  const pathname = String(url ?? '').split('?')[0];
  if (!pathname.startsWith('/api/admin/')) return null;
  const [, api, admin, name] = pathname.split('/');
  return name ? `/${api}/${admin}/${name}` : null;
}

/** Status → Server Log event, or null. Pure. */
export function adminDenialEvent(group, status) {
  if (status !== 401 && status !== 403) return null;
  return {
    level: 'warn',
    source: 'admin',
    code: 'admin.access_denied',
    message: `${group} refused a request (HTTP ${status}: ${status === 401 ? 'no valid admin session' : 'origin not allowed'})`,
    detail: { route: group, status },
  };
}

/** Connect middleware; install before the admin routes. */
export function adminDenialMiddleware(record) {
  return (req, res, next) => {
    const group = adminRouteGroup(req.originalUrl ?? req.url);
    if (group) {
      res.on('finish', () => {
        const event = adminDenialEvent(group, res.statusCode);
        if (event) record(event);
      });
    }
    next();
  };
}
