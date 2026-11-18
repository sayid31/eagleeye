// src/auth/authPlugin.mjs
/**
 * Vite plugin (dev + preview) for the email+password login — a thin
 * dispatcher over pure policies:
 *  - `/api/auth/*` → exact-match allowlist (authEndpointPolicy) → Better Auth;
 *  - `/api/me`     → mePayload (authGuard);
 *  - `/api/*`      → the gate each route declared at registration (apiGates,
 *                    apiRouteRegistry) → apiDecision (authGuard);
 *  - everything else → pageRoutes (pages, asset allowlist, 404).
 * It must be registered before every other server plugin (and before any body
 * parser). Boot and wiring live in authBoot.mjs.
 *
 * @module auth/authPlugin
 */

import { gatesForPath, routeMatches } from './apiGates.mjs';
import { registeredApiRoutes } from './apiRouteRegistry.mjs';
import { PASSWORD_CHANGE_ALLOWED, authEndpointDecision, authEndpointOriginAllowed } from './authEndpointPolicy.mjs';
import { apiDecision, mePayload } from './authGuard.mjs';
import { hasSessionCookie } from './actorResolver.mjs';
import { bootAuth, withClientIp } from './authBoot.mjs';
import { pageAreaFor, pageRouteDecision } from './pageRoutes.mjs';
import { redirect, sendJson, sendNotFound } from './authReplies.mjs';

export { bootAuth };

const pathOf = (url) => String(url ?? '/').split('?')[0].split('#')[0] || '/';

async function handleAuthEndpoint(req, res, state) {
  const decision = authEndpointDecision(req.method, req.url);
  if (!decision.allowed) return sendJson(res, 404, { error: 'NOT_FOUND', message: 'Endpoint does not exist' });
  if (!authEndpointOriginAllowed({ method: req.method, headers: req.headers, trustedOrigin: state.config.origin })) {
    return sendJson(res, 403, { error: 'ORIGIN_NOT_ALLOWED', message: 'Origin not allowed' });
  }
  withClientIp(req, state.config);
  if (!PASSWORD_CHANGE_ALLOWED.includes(decision.endpoint) && !decision.endpoint.startsWith('POST /sign-in/')) {
    const actor = await state.resolver.resolveActor({ headers: req.headers });
    if (actor?.mustChangePassword) return sendJson(res, 403, { error: 'PASSWORD_CHANGE_REQUIRED', message: 'Change your password first' });
  }
  if (req.method !== 'GET') {
    res.once('finish', () => {
      // Sign-in/out changes who a cookie belongs to; drop cached resolutions.
      state.resolver.forget();
      if (decision.endpoint === 'POST /sign-in/email' && res.statusCode === 429) {
        void state.recordLogin({ success: false, reason: 'rate_limited', method: 'password', ip: req.headers['x-gev-client-ip'], userAgent: req.headers['user-agent'] });
      }
    });
  }
  return state.handler(req, res);
}

/**
 * The guard middleware. `getState` resolves to what `bootAuth` returned, or rejects when boot failed.
 * @param {() => Promise<object>} getState
 * @param {{routes?: {prefix: string, gate: string}[], mode?: 'dev' | 'preview', allowFsPrefix?: boolean,
 *   isKilled?: (gate: string) => boolean}} [options]
 * @returns {(req: any, res: any, next: Function) => Promise<void>}
 */
export function createAuthMiddleware(getState, { routes = [], mode = 'dev', allowFsPrefix = false, isKilled } = {}) {
  return async function authMiddleware(req, res, next) {
    const route = (actor, hadSessionCookie = false) => pageRouteDecision({ method: req.method, url: req.url, actor, hadSessionCookie, mode, allowFsPrefix });
    const pathname = pathOf(req.url);
    const isApi = routeMatches(pathname, '/api');
    if (!isApi && !pageAreaFor(pathname) && !pathname.startsWith('/__')) {
      // Assets and unknown paths never depend on who is asking.
      return route(null).action === 'asset' ? next() : sendNotFound(res);
    }

    let state;
    try {
      state = await getState();
    } catch (error) {
      console.error(`[auth] unavailable, refusing ${pathname.startsWith('/api') ? 'API' : 'page'} request: ${error?.message || error}`);
      return sendJson(res, 503, { error: 'AUTH_UNAVAILABLE', message: 'Login is unavailable; see the server log.' });
    }
    const { config } = state;

    if (!config.ok) {
      if (pathname === '/api/me') return sendJson(res, 200, mePayload({ configured: false }));
      if (isApi) return sendJson(res, 503, { error: 'AUTH_NOT_CONFIGURED', message: 'Login not configured' });
      const decision = route(null);
      if (decision.action === 'serve') { req.url = decision.url; return next(); }
      return decision.action === 'redirect' ? redirect(res, '/login') : sendNotFound(res);
    }

    if (routeMatches(pathname, '/api/auth')) return handleAuthEndpoint(req, res, state);

    let actor;
    let setCookies = [];
    try {
      if (pathname === '/api/me') ({ actor, setCookies } = await state.resolver.resolveFresh({ headers: req.headers }));
      else actor = await state.resolver.resolveActor({ headers: req.headers });
    } catch (error) {
      console.error(`[auth] session lookup failed for ${isApi ? 'an API' : 'a page'} request: ${error?.message || error}`);
      return sendJson(res, 503, { error: 'AUTH_UNAVAILABLE', message: 'The session could not be checked' });
    }

    if (pathname === '/api/me') return sendJson(res, 200, mePayload({ configured: true, actor, googleSignIn: Boolean(config.google) }), setCookies);

    if (isApi) {
      const gates = gatesForPath(pathname, routes);
      // An injected check (tests) wins; otherwise the persistent per-gate switches of /dev → Kill switch.
      const decision = apiDecision({ method: req.method, pathname, gates, actor, headers: req.headers, trustedOrigin: config.origin, isKilled: isKilled ?? state.killSwitches?.isKilled });
      if (decision.action === 'deny') return sendJson(res, decision.status, { error: decision.code, message: decision.error, ...(decision.gate ? { gate: decision.gate } : {}) });
      req.gevActor = actor;
      return next();
    }

    const decision = route(actor, hasSessionCookie(req.headers.cookie));
    if (decision.action === 'redirect') return redirect(res, decision.location);
    if (decision.action === 'not-found') return sendNotFound(res);
    if (decision.action === 'serve') req.url = decision.url;
    req.gevActor = actor;
    return next();
  };
}

const bootStates = new WeakMap();

/**
 * Boot state (what `bootAuth` resolved to) of the login guard installed on a
 * server, for `/api/admin/*` plugins registered after `authPlugin`.
 * @param {any} server Vite dev/preview server, or its Connect `middlewares`.
 * @returns {Promise<object>} Rejects when boot failed.
 */
export function authStateFor(server) {
  const ready = bootStates.get(server?.middlewares ?? server);
  if (!ready) throw new Error('authStateFor: authPlugin is not installed on this server (register it first)');
  return ready;
}

/**
 * @param {{env?: () => object, rootDir?: string, isKilled?: (gate: string) => boolean}} [options]
 * @returns {import('vite').Plugin}
 */
export function authPlugin({ env = () => process.env, rootDir = process.cwd(), isKilled } = {}) {
  function install(server, configuredPort, mode) {
    let resolveState;
    const ready = new Promise((resolve) => { resolveState = resolve; });
    // Reported once here; each request refused meanwhile logs its own line.
    ready.catch((error) => console.error(`[auth] boot failed; every page and /api request answers 503: ${error?.message || error}`));
    bootStates.set(server.middlewares, ready);
    const boot = (port) => resolveState(bootAuth({ env: env(), port, rootDir }));
    const httpServer = server.httpServer;
    if (httpServer) httpServer.once('listening', () => boot(httpServer.address()?.port ?? configuredPort));
    else boot(configuredPort);
    // Vite loaded from the canonical root (Pinokio launcher) may serve the app's modules under /@fs/.
    const allowFsPrefix = mode === 'dev' && (process.env.GEV_LAUNCHER === 'pinokio' || server.config?.root !== process.cwd());
    server.middlewares.use(createAuthMiddleware(() => ready, { routes: registeredApiRoutes(server), mode, allowFsPrefix, isKilled }));
  }
  return {
    name: 'gev-auth',
    configureServer(server) { install(server, server.config.server.port, 'dev'); },
    configurePreviewServer(server) { install(server, server.config.preview.port, 'preview'); },
  };
}
