// src/auth/pageRoutes.mjs
/**
 * The page route table (plan/auth/02) as one pure decision, used by the login
 * guard in dev and preview. Every path that is not a page below, an `/api/*`
 * call, or an allowlisted asset is answered 404 by the guard (Vite's own
 * fallback would otherwise serve the map for any unknown path).
 *
 * | Path                         | Who                  | Served from    |
 * |------------------------------|----------------------|----------------|
 * | `/`                          | public               | landing.html   |
 * | `/login`                     | public (signed in → home) | login.html |
 * | `/app`, `/index.html`        | any signed-in role   | index.html     |
 * | `/admin/*`, `/admin.html`    | admin, super_admin   | admin.html     |
 * | `/dev/*`                     | super_admin          | admin.html     |
 * | `/account`, `/account/password` | any signed-in role | login.html     |
 *
 * A wrong-area page redirects to `homeFor(role)`; no session → `/login?next=…`;
 * `mustChangePassword` → `/account/password` (every page but that one).
 *
 * @module auth/pageRoutes
 */

import { isPublicAsset } from './assetAllowlist.mjs';
import { LOGIN_PATH, ROLE_SUPER_ADMIN, homeFor, isAdminRole } from './authRoles.mjs';
import { loginUrlFor } from './nextPath.mjs';

export const PASSWORD_CHANGE_PATH = '/account/password';
export const LANDING_FILE = '/landing.html';
export const LOGIN_FILE = '/login.html';
export const MAP_FILE = '/index.html';
export const ADMIN_FILE = '/admin.html';

/** Areas: who may open them (`null` = public). */
const AREA_ACCESS = {
  landing: null,
  login: null,
  app: () => true,
  account: () => true,
  admin: (role) => isAdminRole(role),
  dev: (role) => role === ROLE_SUPER_ADMIN,
};
const AREA_FILE = { landing: LANDING_FILE, login: LOGIN_FILE, app: MAP_FILE, account: LOGIN_FILE, admin: ADMIN_FILE, dev: ADMIN_FILE };

const under = (pathname, prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`);

/**
 * Which area a path belongs to (exact, case-sensitive), or null.
 * @param {string} pathname
 * @returns {'landing' | 'login' | 'app' | 'account' | 'admin' | 'dev' | null}
 */
export function pageAreaFor(pathname) {
  if (pathname === '/' || pathname === LANDING_FILE) return 'landing';
  if (pathname === LOGIN_PATH || pathname === `${LOGIN_PATH}/` || pathname === LOGIN_FILE) return 'login';
  if (pathname === '/app' || pathname === '/app/' || pathname === MAP_FILE) return 'app';
  if (pathname === '/account' || pathname === PASSWORD_CHANGE_PATH) return 'account';
  if (under(pathname, '/admin') || pathname === ADMIN_FILE) return 'admin';
  if (under(pathname, '/dev')) return 'dev';
  return null;
}

const split = (url) => {
  const raw = String(url ?? '/');
  const at = raw.indexOf('?');
  return at < 0 ? [raw, ''] : [raw.slice(0, at), raw.slice(at)];
};

/**
 * @param {object} input
 * @param {string} input.method
 * @param {string} input.url Raw `req.url`.
 * @param {{role: string, mustChangePassword?: boolean} | null} input.actor
 * @param {boolean} [input.hadSessionCookie] A cookie was sent but resolved to no session.
 * @param {'dev' | 'preview'} [input.mode]
 * @param {boolean} [input.allowFsPrefix]
 * @param {boolean} [input.landingAvailable] false until landing.html exists (phase 2, W-D): `/` then
 *   redirects (signed in → home, anonymous → /login) instead of letting Vite's fallback serve the map.
 * @returns {{action: 'serve', url: string} | {action: 'redirect', location: string}
 *   | {action: 'asset'} | {action: 'not-found'}}
 */
export function pageRouteDecision({ method, url, actor, hadSessionCookie = false, mode = 'dev', allowFsPrefix = false, landingAvailable = true }) {
  const [pathname, search] = split(url);
  const area = pageAreaFor(pathname);
  if (method !== 'GET' && method !== 'HEAD') return { action: 'not-found' };
  if (!area) {
    if (pathname.startsWith('/__')) return actor?.role === ROLE_SUPER_ADMIN ? { action: 'asset' } : { action: 'not-found' };
    return isPublicAsset(pathname, { mode, allowFsPrefix }) ? { action: 'asset' } : { action: 'not-found' };
  }
  const serve = { action: 'serve', url: `${AREA_FILE[area]}${search}` };
  if (area === 'landing') {
    if (landingAvailable) return serve;
    return { action: 'redirect', location: actor ? homeFor(actor.role) : LOGIN_PATH };
  }
  if (area === 'login') {
    if (!actor) return serve;
    return { action: 'redirect', location: actor.mustChangePassword ? PASSWORD_CHANGE_PATH : homeFor(actor.role) };
  }
  if (!actor) return { action: 'redirect', location: loginUrlFor(pathname, search, hadSessionCookie ? 'session' : undefined) };
  if (actor.mustChangePassword && pathname !== PASSWORD_CHANGE_PATH) return { action: 'redirect', location: PASSWORD_CHANGE_PATH };
  if (!AREA_ACCESS[area](actor.role)) return { action: 'redirect', location: homeFor(actor.role) };
  return serve;
}
