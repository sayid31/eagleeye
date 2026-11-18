// src/admin/users/__fixtures__/usersTestServer.mjs
/**
 * Test-only: a real HTTP server with the login guard in front of the REAL
 * account-management routes (and the legacy audit trail behind them), on a
 * temporary SQLite file. A minimal Connect stand-in mounts the routes with
 * Connect's prefix stripping. Not imported by the app.
 */

import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { bootAuth, createAuthMiddleware } from '../../../auth/authPlugin.mjs';
import { registeredApiRoutes } from '../../../auth/apiRouteRegistry.mjs';
import { routeMatches } from '../../../auth/apiGates.mjs';
import { installAdminAuditRoutes } from '../../audit/adminAuditRoutes.mjs';
import { installAdminLogRoutes } from '../adminLogRoutes.mjs';
import { installAdminUsersRoutes } from '../usersRoutes.mjs';

export const OWNER_EMAIL = 'owner@example.test'; // test-only
export const OWNER_PASSWORD = 'owner-test-password-1234'; // test-only
export const STAFF_PASSWORD = 'staff-test-password-12345'; // test-only

/** Connect's `use(prefix, fn)` + prefix stripping, enough for these routes. */
function miniConnect() {
  const layers = [];
  return {
    use(prefix, handle) { layers.push({ prefix, handle }); },
    handle(req, res, done) {
      const originalUrl = req.url;
      let index = 0;
      const next = () => {
        req.url = originalUrl;
        const layer = layers.slice(index).find((item) => routeMatches(originalUrl.split('?')[0], item.prefix));
        if (!layer) return done();
        index = layers.indexOf(layer) + 1;
        const rest = originalUrl.slice(layer.prefix.length);
        req.url = rest.startsWith('/') ? rest : `/${rest}`;
        return layer.handle(req, res, next);
      };
      next();
    },
  };
}

export async function startUsersTestServer() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gev-users-it-'));
  let resolveState;
  const ready = new Promise((resolve) => { resolveState = resolve; });
  const app = miniConnect();
  const getState = () => ready;
  installAdminUsersRoutes(app, { getState });
  installAdminLogRoutes(app, { getState });
  const legacy = { list: () => [{ at: '2026-11-17T00:00:00.000Z', event: 'keys.changed' }] }; // test-only JSONL trail
  installAdminAuditRoutes(app, { audit: legacy });
  const guard = createAuthMiddleware(() => ready, { routes: registeredApiRoutes(app) });
  const server = http.createServer((req, res) => guard(req, res, () => app.handle(req, res, () => {
    res.statusCode = 404;
    res.end('unrouted');
  })));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  const origin = `http://localhost:${port}`;
  const state = await bootAuth({
    port,
    rootDir: dir,
    env: {
      BETTER_AUTH_SECRET: randomBytes(32).toString('hex'), // test-only
      BETTER_AUTH_URL: origin,
      SUPER_ADMIN_EMAILS: OWNER_EMAIL,
      AUTH_DATABASE_FILE: path.join(dir, 'auth.db'),
      AUTH_TRUSTED_PROXIES: '127.0.0.1',
    },
  });
  resolveState(state);
  let ipCounter = 0;
  const base = `http://127.0.0.1:${port}`;
  const nextIp = () => `203.0.113.${(ipCounter += 1) % 250 + 1}`;
  const request = (url, { cookie, method = 'GET', body, headers = {} } = {}) => fetch(`${base}${url}`, {
    method,
    redirect: 'manual',
    body: body === undefined ? undefined : (typeof body === 'string' ? body : JSON.stringify(body)),
    headers: {
      'x-forwarded-for': nextIp(),
      ...(method !== 'GET' ? { origin, 'content-type': 'application/json' } : {}),
      ...(cookie ? { cookie } : {}),
      ...headers,
    },
  });
  /** `[status, json]` of a call. */
  const call = async (method, url, cookie, body) => {
    const res = await request(url, { method, cookie, body: body ?? (method === 'GET' ? undefined : {}) });
    return [res.status, await res.json().catch(() => null)];
  };
  const signIn = async (email, password) => {
    const res = await request('/api/auth/sign-in/email', { method: 'POST', body: { email, password } });
    return (res.headers.getSetCookie?.() ?? []).map((line) => line.split(';')[0]).find((pair) => pair.startsWith('gev.session_token='));
  };
  const rows = (sql, ...args) => state.db.prepare(sql).all(...args).map((row) => ({ ...row }));
  /** Sign-in-ready account (forced password change cleared) → its session cookie and id. */
  const makeStaff = async (actorCookie, email, role = 'user') => {
    const [status, body] = await call('POST', '/api/admin/users', actorCookie, { email, name: `Staff ${role}`, role, password: STAFF_PASSWORD });
    if (status !== 201) throw new Error(`fixture: creating ${role} failed: ${status} ${body?.error}`);
    await (await state.auth.$context).internalAdapter.updateUser(body.user.id, { mustChangePassword: false });
    return { id: body.user.id, cookie: await signIn(email, STAFF_PASSWORD) };
  };
  return {
    state, origin, request, call, signIn, rows, makeStaff,
    close: () => new Promise((resolve) => { server.close(resolve); server.closeAllConnections(); }),
  };
}

/** Bootstrap the env owner through the CLI path and sign it in. */
export async function signInOwner(t) {
  const created = await t.state.services.bootstrap.setSuperAdminPassword(OWNER_EMAIL, OWNER_PASSWORD);
  if (created.ok === false) throw new Error(`fixture: owner bootstrap failed: ${created.code}`);
  return t.signIn(OWNER_EMAIL, OWNER_PASSWORD);
}
