// src/admin/auth/requireAdminSession.mjs
/**
 * Guard for every `/api/admin/*` route: a valid signed session cookie is
 * required. State-changing methods must also carry the exact allowed Origin
 * and a JSON content type (CSRF defence on top of SameSite=Strict).
 *
 * @module admin/auth/requireAdminSession
 */
import { readAdminAuthConfig } from './adminAuthConfig.mjs';
import { SESSION_COOKIE, parseCookies, verifyToken } from './adminSession.mjs';

/**
 * @param {import('node:http').IncomingMessage} req
 * @param {{env?: object, now?: number}} [options]
 * @returns {{ok: true, email: string} | {ok: false, status: number, error: string}}
 */
export function requireAdminSession(req, { env = process.env, now } = {}) {
  const config = readAdminAuthConfig(env);
  if (!config.ok) return { ok: false, status: 503, error: 'Admin login belum dikonfigurasi' };

  const session = verifyToken(parseCookies(req.headers?.cookie)[SESSION_COOKIE], {
    kind: 'session',
    secret: config.sessionSecret,
    now,
  });
  if (!session || session.email !== config.adminEmail) {
    return { ok: false, status: 401, error: 'Login diperlukan' };
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    if (req.headers?.origin !== config.allowedOrigin) {
      return { ok: false, status: 403, error: 'Origin tidak diizinkan' };
    }
    if (!/^application\/json\b/i.test(String(req.headers?.['content-type'] ?? ''))) {
      return { ok: false, status: 415, error: 'Content-Type harus application/json' };
    }
  }
  return { ok: true, email: session.email };
}
