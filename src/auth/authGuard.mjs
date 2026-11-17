// src/auth/authGuard.mjs
/**
 * Pure request classification and access decisions for the shared login.
 * `authPlugin.mjs` applies them to every request before any proxy or page
 * handler runs; nothing here performs I/O.
 *
 * @module auth/authGuard
 */

import { canAccessAdmin, canManageKeys } from './authRoles.mjs';

export const LOGIN_PATH = '/login';
export const LOGIN_PAGE_FILE = '/login.html';

/**
 * Permission every `/api/admin/*` route prefix needs. `admin` = active admin or
 * super-admin; `keys` = active super-admin (provider keys / `.env`). A prefix
 * missing here falls back to `keys` (strictest), and
 * `authGuard.test.mjs` fails when a registered admin route is not listed.
 */
export const ADMIN_API_PERMISSIONS = Object.freeze({
  '/api/admin/audit': 'admin',
  '/api/admin/health': 'admin',
  '/api/admin/log': 'admin',
  '/api/admin/voice': 'admin',
  '/api/admin/keys': 'keys',
});

/** Vite-internal and module paths that are never pages even without an extension. */
const INTERNAL_PREFIXES = ['/@', '/__', '/node_modules/', '/src/'];

const lowerPath = (url) => String(url ?? '/').split('?')[0].split('#')[0].toLowerCase() || '/';
const underPrefix = (pathname, prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`);

/**
 * What kind of request this is. Matching is case-insensitive because Connect
 * routes `/API/opensky` to the `/api/opensky` proxy too.
 * @param {string} method
 * @param {string} url Raw `req.url`.
 * @returns {'auth' | 'me' | 'admin-api' | 'api' | 'login' | 'admin-page' | 'page' | 'asset'}
 */
export function classifyRequest(method, url) {
  const pathname = lowerPath(url);
  if (pathname.startsWith('/api/auth/')) return 'auth';
  if (pathname === '/api/me') return 'me';
  if (underPrefix(pathname, '/api/admin')) return 'admin-api';
  if (underPrefix(pathname, '/api')) return 'api';
  if (method !== 'GET' && method !== 'HEAD') return 'asset';
  if (pathname === LOGIN_PATH || pathname === `${LOGIN_PATH}/` || pathname === LOGIN_PAGE_FILE) return 'login';
  if (underPrefix(pathname, '/admin') || pathname === '/admin.html') return 'admin-page';
  if (pathname === '/' || pathname === '/index.html') return 'page';
  if (INTERNAL_PREFIXES.some((prefix) => pathname.startsWith(prefix))) return 'asset';
  // Any other extension-less path falls back to index.html (SPA), so it is the map page.
  return /\.[a-z0-9]+$/.test(pathname) ? 'asset' : 'page';
}

/**
 * @param {string} url
 * @returns {'admin' | 'keys'}
 */
export function adminApiPermission(url) {
  const pathname = lowerPath(url);
  const prefix = Object.keys(ADMIN_API_PERMISSIONS).find((candidate) => underPrefix(pathname, candidate));
  return prefix ? ADMIN_API_PERMISSIONS[prefix] : 'keys';
}

/**
 * Decision for a page navigation.
 * @param {{kind: 'page' | 'admin-page', actor: {role: string, status: string} | null, hadSessionCookie?: boolean}} input
 * @returns {{action: 'next'} | {action: 'redirect', location: string}}
 */
export function pageDecision({ kind, actor, hadSessionCookie = false }) {
  if (!actor) return { action: 'redirect', location: hadSessionCookie ? `${LOGIN_PATH}?notice=session` : LOGIN_PATH };
  if (actor.status === 'banned') return { action: 'redirect', location: `${LOGIN_PATH}?notice=banned` };
  if (kind === 'admin-page' && !canAccessAdmin(actor)) return { action: 'redirect', location: '/' };
  return { action: 'next' };
}

/**
 * Decision for the login page: a signed-in, not banned visitor goes to the map.
 * @param {{role: string, status: string} | null} actor
 * @returns {{action: 'next'} | {action: 'redirect', location: string}}
 */
export function loginPageDecision(actor) {
  return actor && actor.status !== 'banned' ? { action: 'redirect', location: '/' } : { action: 'next' };
}

const deny = (status, code, error) => ({ action: 'deny', status, code, error });

/**
 * Decision for an `/api/*` call other than `/api/auth/*` and `/api/me`.
 * @param {{kind: 'api' | 'admin-api', method: string, url: string, actor: {role: string, status: string} | null,
 *   headers?: Record<string, string | undefined>, trustedOrigin: string}} input
 * @returns {{action: 'next'} | {action: 'deny', status: number, code: string, error: string}}
 */
export function apiDecision({ kind, method, url, actor, headers = {}, trustedOrigin }) {
  if (!actor) return deny(401, 'AUTH_REQUIRED', 'Login diperlukan');
  if (actor.status === 'banned') return deny(403, 'ACCOUNT_BANNED', 'Akun diblokir');
  if (actor.status !== 'active') return deny(403, 'ACCOUNT_PENDING', 'Akun menunggu persetujuan admin');
  if (kind !== 'admin-api') return { action: 'next' };

  if (!canAccessAdmin(actor)) return deny(403, 'ADMIN_REQUIRED', 'Hanya admin yang boleh mengakses ini');
  if (adminApiPermission(url) === 'keys' && !canManageKeys(actor)) {
    return deny(403, 'SUPER_ADMIN_REQUIRED', 'Hanya super admin yang boleh mengelola API key');
  }
  if (method !== 'GET' && method !== 'HEAD') {
    if (headers.origin !== trustedOrigin) return deny(403, 'ORIGIN_NOT_ALLOWED', 'Origin tidak diizinkan');
    if (!/^application\/json\b/i.test(String(headers['content-type'] ?? ''))) {
      return deny(415, 'JSON_REQUIRED', 'Content-Type harus application/json');
    }
  }
  return { action: 'next' };
}

/**
 * Origin gate for state-changing Better Auth endpoints. Better Auth checks the
 * Origin only when the request already carries cookies, so a cookie-less
 * cross-origin POST to `sign-in/social` would otherwise be accepted.
 * @param {{method: string, headers?: Record<string, string | undefined>, trustedOrigin: string}} input
 * @returns {boolean}
 */
export function authEndpointOriginAllowed({ method, headers = {}, trustedOrigin }) {
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return true;
  if (headers.origin) return headers.origin === trustedOrigin;
  try {
    return Boolean(headers.referer) && new URL(headers.referer).origin === trustedOrigin;
  } catch {
    return false;
  }
}
