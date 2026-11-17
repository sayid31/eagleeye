// src/auth/nextPath.mjs
/**
 * `?next=` validation for the login page and the guard's redirects: only a
 * same-origin path inside the app's own areas is accepted, so a crafted login
 * link can never send a freshly signed-in user to another site. Pure; runs in
 * the server and the browser.
 *
 * @module auth/nextPath
 */

/** Areas a `next` may point into (exact path, or a sub-path under it). */
export const NEXT_PATH_AREAS = Object.freeze(['/app', '/admin', '/dev', '/account']);
const MAX_NEXT_LENGTH = 512;
// Path part only: letters, digits and the unreserved/sub-delim characters; no
// `%` (no encoded slash or dot), no `\`, no control characters, no `:`.
const SAFE_PATH = /^\/[A-Za-z0-9\-._~/!$&'()*+,;=@]*$/;

/**
 * @param {unknown} raw Value of `next` (already URL-decoded once by URLSearchParams).
 * @returns {string | null} The path (with its own query, if any), or null when refused.
 */
export function safeNextPath(raw) {
  if (typeof raw !== 'string' || !raw || raw.length > MAX_NEXT_LENGTH) return null;
  const queryAt = raw.indexOf('?');
  const pathname = queryAt < 0 ? raw : raw.slice(0, queryAt);
  const query = queryAt < 0 ? '' : raw.slice(queryAt);
  if (!SAFE_PATH.test(pathname) || pathname.includes('//')) return null;
  if (pathname.split('/').some((segment) => segment === '.' || segment === '..')) return null;
  if (/[\\\s#]/.test(query) || query.includes('%5c') || query.includes('%5C')) return null;
  const area = NEXT_PATH_AREAS.find((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
  return area ? `${pathname}${query}` : null;
}

/**
 * The login URL that brings the visitor back to `pathname` after sign-in.
 * @param {string} pathname
 * @param {string} [search] The original query (`?…`), kept when the target is accepted.
 * @param {string} [notice] Optional `notice=` code for the login page.
 * @returns {string}
 */
export function loginUrlFor(pathname, search = '', notice) {
  const params = new URLSearchParams();
  const next = safeNextPath(`${pathname}${search || ''}`) ?? safeNextPath(pathname);
  if (next) params.set('next', next);
  if (notice) params.set('notice', notice);
  const query = params.toString();
  return query ? `/login?${query}` : '/login';
}
