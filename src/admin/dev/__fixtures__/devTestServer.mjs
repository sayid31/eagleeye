// src/admin/dev/__fixtures__/devTestServer.mjs
/**
 * Test-only: a real HTTP server running the login guard (with the persistent
 * kill switches — no injected `isKilled`) in front of the `/dev` system
 * routes, on a temporary SQLite file. Any other registered gate route answers
 * a sentinel 299 so enforcement can be observed. Not imported by the app.
 */

import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { bootAuth, createAuthMiddleware } from '../../../auth/authPlugin.mjs';
import { routeMatches } from '../../../auth/apiGates.mjs';
import { registeredApiRoutes } from '../../../auth/apiRouteRegistry.mjs';
import { OWNER_EMAIL, TEST_ROUTES } from '../../../auth/__fixtures__/authTestServer.mjs';
import { installDevSystemRoutes } from '../devSystemRoutes.mjs';

/** Minimal Connect stand-in: `use(prefix, handler)` + prefix dispatch with the prefix stripped. */
function miniApp() {
  const mounts = [];
  return {
    use(prefix, handler) { mounts.push({ prefix, handler }); },
    dispatch(req, res) {
      const pathname = req.url.split('?')[0];
      const mount = mounts.find((item) => routeMatches(pathname, item.prefix));
      if (!mount) {
        res.statusCode = 299;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ reached: req.url, actorRole: req.gevActor?.role ?? null }));
        return;
      }
      req.url = req.url.slice(mount.prefix.length) || '/';
      mount.handler(req, res, () => { res.statusCode = 404; res.end(); });
    },
  };
}

/**
 * @param {{src?: object, env?: object, dir?: string}} [options] `dir` reuses a database directory (restart).
 */
export async function startDevTestServer({ src = {}, env = {}, dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gev-dev-it-')) } = {}) {
  let resolveState;
  const ready = new Promise((resolve) => { resolveState = resolve; });
  const app = miniApp();
  installDevSystemRoutes(app, { src, getState: () => ready });
  const routes = [...TEST_ROUTES, ...registeredApiRoutes(app)];
  const guard = createAuthMiddleware(() => ready, { routes });
  const server = http.createServer((req, res) => guard(req, res, () => app.dispatch(req, res)));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  const origin = `http://localhost:${port}`;
  const fullEnv = {
    BETTER_AUTH_SECRET: randomBytes(32).toString('hex'), // test-only
    BETTER_AUTH_URL: origin,
    SUPER_ADMIN_EMAILS: OWNER_EMAIL,
    AUTH_DATABASE_FILE: path.join(dir, 'auth.db'),
    AUTH_TRUSTED_PROXIES: '127.0.0.1',
    ...env,
  };
  const state = await bootAuth({ port, rootDir: dir, env: fullEnv });
  resolveState(state);
  let ipCounter = 0;
  const base = `http://127.0.0.1:${port}`;
  const request = (url, { cookie, headers = {}, ...init } = {}) => fetch(`${base}${url}`, {
    redirect: 'manual', ...init, headers: { 'x-forwarded-for': `198.51.100.${(ipCounter += 1) % 250 + 1}`, ...(cookie ? { cookie } : {}), ...headers },
  });
  const send = (method, url, body, options = {}) => request(url, {
    method, body: JSON.stringify(body), ...options,
    headers: { origin, 'content-type': 'application/json', ...(options.headers ?? {}) },
  });
  const signIn = async (email, password) => {
    const res = await send('POST', '/api/auth/sign-in/email', { email, password });
    const cookie = (res.headers.getSetCookie?.() ?? []).map((line) => line.split(';')[0]).find((pair) => pair.startsWith('gev.session_token='));
    return { res, cookie };
  };
  const rows = (sql, ...args) => state.db.prepare(sql).all(...args).map((row) => ({ ...row }));
  return {
    dir, state, origin, env: fullEnv, request, signIn, rows,
    post: (url, body, options) => send('POST', url, body, options),
    put: (url, body, options) => send('PUT', url, body, options),
    close: () => new Promise((resolve) => { server.close(resolve); server.closeAllConnections(); }),
  };
}
