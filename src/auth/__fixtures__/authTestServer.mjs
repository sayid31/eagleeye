// src/auth/__fixtures__/authTestServer.mjs
/**
 * Test-only: a real HTTP server running the login guard on a temporary SQLite
 * file, with a sentinel standing in for whatever the next plugin would serve
 * (status 299 + the URL it reached). Not imported by the app.
 */

import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { bootAuth, createAuthMiddleware } from '../authPlugin.mjs';

// test-only routes (a sample of each gate)
export const TEST_ROUTES = [
  { prefix: '/api/opensky', gate: 'layers' },
  { prefix: '/api/openai/hud-summary', gate: 'ai' },
  { prefix: '/api/google/3dtiles', gate: 'premium' },
  { prefix: '/api/log', gate: 'open' },
  { prefix: '/api/admin/users', gate: 'admin' },
  { prefix: '/api/admin/keys', gate: 'super' },
];
export const OWNER_EMAIL = 'owner@example.test'; // test-only
export const OWNER_PASSWORD = 'owner-test-password-1234'; // test-only

/**
 * @param {{env?: object, isKilled?: (gate: string) => boolean}} [options]
 */
export async function startAuthTestServer({ env = {}, isKilled } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gev-auth-it-'));
  let resolveState;
  const ready = new Promise((resolve) => { resolveState = resolve; });
  const guard = createAuthMiddleware(() => ready, { routes: TEST_ROUTES, isKilled });
  const server = http.createServer((req, res) => guard(req, res, () => {
    res.statusCode = 299;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ reached: req.url, actorRole: req.gevActor?.role ?? null }));
  }));
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
      // The test client is 127.0.0.1: trusting it lets each test pick its client IP via X-Forwarded-For.
      AUTH_TRUSTED_PROXIES: '127.0.0.1',
      ...env,
    },
  });
  resolveState(state);
  let ipCounter = 0;
  const base = `http://127.0.0.1:${port}`;
  /** Fresh client IP per call unless one is given (keeps Better Auth's per-IP limit out of the way). */
  const nextIp = () => `198.51.100.${(ipCounter += 1) % 250 + 1}`;
  const request = (url, { cookie, ip = nextIp(), headers = {}, ...init } = {}) => fetch(`${base}${url}`, {
    redirect: 'manual', ...init, headers: { 'x-forwarded-for': ip, ...(cookie ? { cookie } : {}), ...headers },
  });
  const post = (url, body, options = {}) => request(url, {
    method: 'POST', body: JSON.stringify(body), ...options,
    headers: { origin, 'content-type': 'application/json', ...(options.headers ?? {}) },
  });
  /** Sign in with a password; returns the response and the session cookie (`name=value`) if any. */
  const signIn = async (email, password, options) => {
    const res = await post('/api/auth/sign-in/email', { email, password }, options);
    const cookie = (res.headers.getSetCookie?.() ?? []).map((line) => line.split(';')[0]).find((pair) => pair.startsWith('gev.session_token='));
    return { res, cookie };
  };
  const rows = (sql, ...args) => state.db.prepare(sql).all(...args).map((row) => ({ ...row }));
  return {
    dir, state, origin, request, post, signIn, rows,
    close: () => new Promise((resolve) => { server.close(resolve); server.closeAllConnections(); }),
  };
}

/** Bootstrap the env owner through the CLI path and sign it in. */
export async function signInOwner(t) {
  await t.state.services.bootstrap.setSuperAdminPassword(OWNER_EMAIL, OWNER_PASSWORD);
  return (await t.signIn(OWNER_EMAIL, OWNER_PASSWORD)).cookie;
}

/** Resolve a cookie to the guard's actor (what route handlers get as req.gevActor). */
export async function actorFor(t, cookie) {
  t.state.resolver.forget();
  return t.state.resolver.resolveActor({ headers: { cookie } });
}
