// src/auth/authPlugin.mjs
/**
 * Vite plugin (dev + preview) for the shared Google login:
 *
 *  - boots the SQLite database + Better Auth and runs the schema migration
 *    once the server listens (so BETTER_AUTH_URL defaults to the real port);
 *  - mounts Better Auth at `/api/auth/*` (no-path `use` + prefix check:
 *    `use('/api/auth', h)` would 404 because Connect strips the prefix);
 *  - serves `/api/me` and the `/login` page;
 *  - guards every page and every `/api/*` route registered after it
 *    (`authGuard.mjs` decides, this file applies). It must be registered
 *    before any proxy plugin and before any body parser.
 *
 * Static assets (JS/CSS/Cesium files) stay unguarded; the bundle therefore
 * still carries CESIUM_ION_TOKEN to anyone who can reach the server.
 *
 * @module auth/authPlugin
 */

import { toNodeHandler } from 'better-auth/node';
import { readAuthEnv } from './authEnv.mjs';
import { sharedAuthDatabase } from './authDatabase.mjs';
import { CLIENT_IP_HEADER, createAuthInstance, migrateAuthSchema } from './authInstance.mjs';
import { createActorResolver, hasSessionCookie } from './actorResolver.mjs';
import {
  LOGIN_PAGE_FILE, apiDecision, authEndpointOriginAllowed, classifyRequest, loginPageDecision, pageDecision,
} from './authGuard.mjs';

function sendJson(res, status, payload, setCookies = []) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  if (setCookies.length) res.setHeader('Set-Cookie', setCookies);
  res.end(JSON.stringify(payload));
}

function redirect(res, location) {
  res.statusCode = 302;
  res.setHeader('Location', location);
  res.setHeader('Cache-Control', 'no-store');
  res.end();
}

const queryOf = (url) => { const at = String(url ?? '').indexOf('?'); return at < 0 ? '' : String(url).slice(at); };

/** Request headers for Better Auth, with the peer address from the socket (never from the client). */
export function authRequestHeaders(req) {
  return { ...req.headers, [CLIENT_IP_HEADER]: req.socket?.remoteAddress ?? '' };
}

/**
 * Boot the auth stack for one server.
 * @param {{env: object, port: number, rootDir: string}} input
 * @returns {Promise<{config: object, auth?: object, handler?: Function, resolver?: object}>}
 */
export async function bootAuth({ env, port, rootDir }) {
  const config = readAuthEnv(env, { port, rootDir });
  for (const warning of config.warnings) console.warn(`[auth] ${warning}`);
  if (!config.ok) {
    console.warn(`[auth] login is not configured; every page shows the login page. Missing: ${config.missing.join(', ') || '-'}; invalid: ${config.invalid.join(', ') || '-'}.`);
    return { config };
  }
  const { db, driver, journalMode } = await sharedAuthDatabase(config.databaseFile);
  const auth = createAuthInstance({ database: db, config });
  const migrated = await migrateAuthSchema(auth);
  console.info(`[auth] ready on ${driver} (journal ${journalMode}); tables created: ${migrated.created.join(', ') || 'none'}, columns added: ${migrated.added.join(', ') || 'none'}.`);
  return {
    config,
    auth,
    handler: toNodeHandler(auth),
    resolver: createActorResolver({ auth, superAdminEmails: config.superAdminEmails }),
  };
}

/**
 * The guard middleware. `getState` resolves to what `bootAuth` returned, or rejects when boot failed.
 * @param {() => Promise<object>} getState
 * @returns {(req: any, res: any, next: Function) => Promise<void>}
 */
export function createAuthMiddleware(getState) {
  return async function authMiddleware(req, res, next) {
    const kind = classifyRequest(req.method, req.url);
    if (kind === 'asset') return next();

    let state;
    try {
      state = await getState();
    } catch (error) {
      console.error(`[auth] unavailable, refusing ${kind} request: ${error?.message || error}`);
      return sendJson(res, 503, { error: 'Login sedang tidak tersedia; lihat log server.', code: 'AUTH_UNAVAILABLE' });
    }
    const { config } = state;

    if (!config.ok) {
      if (kind === 'login') { req.url = `${LOGIN_PAGE_FILE}${queryOf(req.url)}`; return next(); }
      if (kind === 'page' || kind === 'admin-page') return redirect(res, '/login');
      if (kind === 'me') return sendJson(res, 200, { authenticated: false, configured: false, missing: config.missing, invalid: config.invalid });
      return sendJson(res, 503, { error: 'Login belum dikonfigurasi', code: 'AUTH_NOT_CONFIGURED' });
    }

    if (kind === 'auth') {
      if (!authEndpointOriginAllowed({ method: req.method, headers: req.headers, trustedOrigin: config.origin })) {
        return sendJson(res, 403, { error: 'Origin tidak diizinkan', code: 'ORIGIN_NOT_ALLOWED' });
      }
      req.headers[CLIENT_IP_HEADER] = req.socket?.remoteAddress ?? '';
      // Sign-in/out changes who a cookie belongs to; drop cached resolutions.
      if (req.method !== 'GET') res.once('finish', () => state.resolver.forget());
      return state.handler(req, res);
    }

    const headers = authRequestHeaders(req);
    let actor;
    let setCookies = [];
    try {
      if (kind === 'me') ({ actor, setCookies } = await state.resolver.resolveFresh({ headers }));
      else actor = await state.resolver.resolveActor({ headers });
    } catch (error) {
      console.error(`[auth] session lookup failed for ${kind} request: ${error?.message || error}`);
      return sendJson(res, 503, { error: 'Sesi tidak bisa diperiksa', code: 'AUTH_UNAVAILABLE' });
    }

    if (kind === 'me') {
      if (!actor) return sendJson(res, 200, { authenticated: false, configured: true }, setCookies);
      return sendJson(res, 200, {
        authenticated: true, configured: true, role: actor.role, status: actor.status, email: actor.user.email,
      }, setCookies);
    }

    if (kind === 'login') {
      const decision = loginPageDecision(actor);
      if (decision.action === 'redirect') return redirect(res, decision.location);
      req.url = `${LOGIN_PAGE_FILE}${queryOf(req.url)}`;
      return next();
    }

    if (kind === 'page' || kind === 'admin-page') {
      const decision = pageDecision({ kind, actor, hadSessionCookie: hasSessionCookie(req.headers.cookie) });
      if (decision.action === 'redirect') return redirect(res, decision.location);
      req.gevActor = actor;
      return next();
    }

    const decision = apiDecision({ kind, method: req.method, url: req.url, actor, headers: req.headers, trustedOrigin: config.origin });
    if (decision.action === 'deny') return sendJson(res, decision.status, { error: decision.error, code: decision.code });
    req.gevActor = actor;
    return next();
  };
}

/**
 * @param {{env?: () => object, rootDir?: string}} [options]
 * @returns {import('vite').Plugin}
 */
export function authPlugin({ env = () => process.env, rootDir = process.cwd() } = {}) {
  function install(server, configuredPort) {
    let resolveState;
    const ready = new Promise((resolve) => { resolveState = resolve; });
    // Reported once here; each request refused meanwhile logs its own line.
    ready.catch((error) => console.error(`[auth] boot failed; every page and /api request answers 503: ${error?.message || error}`));
    const boot = (port) => resolveState(bootAuth({ env: env(), port, rootDir }));
    const httpServer = server.httpServer;
    if (httpServer) httpServer.once('listening', () => boot(httpServer.address()?.port ?? configuredPort));
    else boot(configuredPort);
    server.middlewares.use(createAuthMiddleware(() => ready));
  }
  return {
    name: 'gev-auth',
    configureServer(server) { install(server, server.config.server.port); },
    configurePreviewServer(server) { install(server, server.config.preview.port); },
  };
}
