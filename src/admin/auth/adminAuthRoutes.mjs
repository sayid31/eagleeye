// src/admin/auth/adminAuthRoutes.mjs
/**
 * HTTP routes for admin login: /api/admin/auth/{login,callback,session,logout}.
 *
 * Failures never reveal WHY a Google account was refused to the browser beyond
 * a short code; the code (never the email) goes to `onEvent` for the log.
 *
 * @module admin/auth/adminAuthRoutes
 */
import { readAdminAuthConfig } from './adminAuthConfig.mjs';
import {
  PENDING_COOKIE, SESSION_COOKIE, createToken, parseCookies, safeEqual, serializeCookie, verifyToken,
} from './adminSession.mjs';
import { buildAuthUrl, decodeIdToken, exchangeCode, newLoginSecrets, validateIdToken } from './googleOAuth.mjs';
import { requireAdminSession } from './requireAdminSession.mjs';

const PENDING_TTL_MS = 10 * 60 * 1000;
const LOGIN_PAGE = '/admin/login';

function redirect(res, location, cookies = []) {
  res.statusCode = 302;
  res.setHeader('Location', location);
  res.setHeader('Cache-Control', 'no-store');
  if (cookies.length) res.setHeader('Set-Cookie', cookies);
  res.end();
}

function sendJson(res, status, payload, cookies = []) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  if (cookies.length) res.setHeader('Set-Cookie', cookies);
  res.end(JSON.stringify(payload));
}

const failTo = (res, code, clearPending) => redirect(res, `${LOGIN_PAGE}?error=${code}`, [clearPending]);

/**
 * @param {import('connect').Server} middlewares
 * @param {{env?: () => object, fetchFn?: typeof fetch, onEvent?: (event: string, detail?: object) => void, now?: () => number}} [deps]
 */
export function installAdminAuthRoutes(middlewares, { env = () => process.env, fetchFn = fetch, onEvent = () => {}, now = () => Date.now() } = {}) {
  middlewares.use('/api/admin/auth', async (req, res) => {
    const config = readAdminAuthConfig(env());
    const route = (req.url || '/').split('?')[0];
    if (!config.ok) {
      if (route === '/session') return sendJson(res, 200, { configured: false, authenticated: false, missing: config.missing });
      return redirect(res, `${LOGIN_PAGE}?error=not_configured`);
    }
    const cookieOf = (name, value, maxAgeSec, sameSite) => serializeCookie(name, value, { maxAgeSec, secure: config.secureCookies, sameSite });
    const clearPending = cookieOf(PENDING_COOKIE, '', 0, 'Lax');

    if (route === '/session' && req.method === 'GET') {
      const admitted = requireAdminSession(req, { env: env(), now: now() });
      return sendJson(res, 200, { configured: true, authenticated: admitted.ok, ...(admitted.ok ? { email: admitted.email } : {}) });
    }

    if (route === '/login' && req.method === 'GET') {
      const secrets = newLoginSecrets();
      const pending = createToken(
        { state: secrets.state, nonce: secrets.nonce, verifier: secrets.verifier },
        { kind: 'pending', secret: config.sessionSecret, ttlMs: PENDING_TTL_MS, now: now() },
      );
      // Lax, not Strict: Google redirects back cross-site and Strict would drop this cookie.
      return redirect(res, buildAuthUrl({ ...secrets, clientId: config.clientId, redirectUri: config.redirectUri }),
        [cookieOf(PENDING_COOKIE, pending, PENDING_TTL_MS / 1000, 'Lax')]);
    }

    if (route === '/callback' && req.method === 'GET') {
      const query = new URL(req.url, config.allowedOrigin).searchParams;
      const pending = verifyToken(parseCookies(req.headers.cookie)[PENDING_COOKIE], { kind: 'pending', secret: config.sessionSecret, now: now() });
      if (!pending || !safeEqual(query.get('state') ?? '', pending.state)) {
        onEvent('login_rejected', { reason: 'bad_state' });
        return failTo(res, 'invalid_request', clearPending);
      }
      if (query.get('error') || !query.get('code')) {
        onEvent('login_rejected', { reason: 'google_error' });
        return failTo(res, 'cancelled', clearPending);
      }
      let verdict;
      try {
        const idToken = await exchangeCode({ ...config, code: query.get('code'), verifier: pending.verifier, fetchFn });
        verdict = validateIdToken(decodeIdToken(idToken), { clientId: config.clientId, nonce: pending.nonce, adminEmail: config.adminEmail, now: now() });
      } catch (error) {
        onEvent('login_failed', { reason: error.message });
        return failTo(res, 'google_unavailable', clearPending);
      }
      if (!verdict.ok) {
        onEvent('login_rejected', { reason: verdict.reason });
        return failTo(res, verdict.reason === 'not_admin' ? 'not_admin' : 'invalid_request', clearPending);
      }
      const session = createToken({ email: verdict.email }, { kind: 'session', secret: config.sessionSecret, ttlMs: config.sessionTtlMs, now: now() });
      onEvent('login_ok');
      return redirect(res, '/admin', [cookieOf(SESSION_COOKIE, session, config.sessionTtlMs / 1000, 'Strict'), clearPending]);
    }

    if (route === '/logout' && req.method === 'POST') {
      const admitted = requireAdminSession(req, { env: env(), now: now() });
      if (!admitted.ok) return sendJson(res, admitted.status, { error: admitted.error });
      onEvent('logout');
      return sendJson(res, 200, { ok: true }, [cookieOf(SESSION_COOKIE, '', 0, 'Strict')]);
    }
    return sendJson(res, 404, { error: 'Not found' });
  });
}
