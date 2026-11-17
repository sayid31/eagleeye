import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { bootAuth, createAuthMiddleware } from './authPlugin.mjs';
import { mintSessionCookie } from './authSessionMint.mjs';

// test-only fixtures, not real credentials
const fixtureEnv = (dir, port) => ({
  BETTER_AUTH_SECRET: randomBytes(32).toString('hex'),
  BETTER_AUTH_URL: `http://localhost:${port}`,
  SUPER_ADMIN_EMAILS: 'owner@example.test',
  GOOGLE_CLIENT_ID: 'fixture-client.apps.googleusercontent.com',
  GOOGLE_CLIENT_SECRET: 'fixture-secret',
  AUTH_DATABASE_FILE: path.join(dir, 'auth.db'),
});

/** Minimal Connect stand-in: the guard, then a sentinel for whatever the next plugin would serve. */
function startServer(getState) {
  const guard = createAuthMiddleware(getState);
  const server = http.createServer((req, res) => {
    guard(req, res, () => {
      res.statusCode = 299;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ reached: req.url, actorRole: req.gevActor?.role ?? null }));
    });
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}

let server;
let base;
let origin;
let state;
const cookies = {};

before(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gev-auth-plugin-'));
  let resolveState;
  const ready = new Promise((resolve) => { resolveState = resolve; });
  server = await startServer(() => ready);
  const { port } = server.address();
  base = `http://127.0.0.1:${port}`;
  origin = `http://localhost:${port}`;
  state = await bootAuth({ env: fixtureEnv(dir, port), port, rootDir: dir });
  resolveState(state);
  const { auth } = state;
  cookies.pending = (await mintSessionCookie(auth, { email: 'new@example.test' })).cookie;
  cookies.active = (await mintSessionCookie(auth, { email: 'user@example.test', status: 'active' })).cookie;
  cookies.banned = (await mintSessionCookie(auth, { email: 'gone@example.test', status: 'banned' })).cookie;
  cookies.admin = (await mintSessionCookie(auth, { email: 'admin@example.test', role: 'admin', status: 'active' })).cookie;
  cookies.owner = (await mintSessionCookie(auth, { email: 'owner@example.test' })).cookie;
});

after(() => new Promise((resolve) => server.close(resolve)));

const get = (url, cookie, init = {}) => fetch(`${base}${url}`, {
  redirect: 'manual', ...init, headers: { ...(cookie ? { cookie } : {}), ...(init.headers ?? {}) },
});

test('Better Auth is reachable under /api/auth/* (no-path mount keeps the prefix)', async () => {
  const res = await get('/api/auth/ok');
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ok: true });
});

test('sign-in/social: same-origin POST gets a Google URL; a cross-origin or Origin-less POST is refused', async () => {
  const body = JSON.stringify({ provider: 'google', callbackURL: '/' });
  const same = await get('/api/auth/sign-in/social', null, { method: 'POST', headers: { origin, 'content-type': 'application/json' }, body });
  assert.equal(same.status, 200);
  const { url } = await same.json();
  assert.equal(new URL(url).origin, 'https://accounts.google.com');
  assert.equal(new URL(url).searchParams.get('redirect_uri'), `${origin}/api/auth/callback/google`);
  const evil = await get('/api/auth/sign-in/social', null, { method: 'POST', headers: { origin: 'http://evil.example', 'content-type': 'application/json' }, body });
  assert.equal(evil.status, 403);
  assert.equal((await evil.json()).code, 'ORIGIN_NOT_ALLOWED');
  const bare = await get('/api/auth/sign-in/social', null, { method: 'POST', headers: { 'content-type': 'application/json' }, body });
  assert.equal(bare.status, 403);
  const offsite = await get('/api/auth/sign-in/social', null, { method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: JSON.stringify({ provider: 'google', callbackURL: 'http://evil.example/' }) });
  assert.equal(offsite.status, 403, 'an off-site callbackURL is refused by trustedOrigins');
});

test('page guard: anonymous / expired / banned go to /login, pending and active see the map, only admins see /admin', async () => {
  const location = async (url, cookie) => { const res = await get(url, cookie); return [res.status, res.headers.get('location')]; };
  assert.deepEqual(await location('/'), [302, '/login']);
  assert.deepEqual(await location('/index.html'), [302, '/login']);
  assert.deepEqual(await location('/admin'), [302, '/login']);
  assert.deepEqual(await location('/', 'better-auth.session_token=stale.value'), [302, '/login?notice=session']);
  assert.deepEqual(await location('/', cookies.banned), [302, '/login?notice=banned']);
  assert.deepEqual(await location('/', cookies.pending), [299, null]);
  assert.deepEqual(await location('/', cookies.active), [299, null]);
  assert.deepEqual(await location('/admin/server-log', cookies.active), [302, '/']);
  assert.deepEqual(await location('/admin.html', cookies.pending), [302, '/']);
  assert.deepEqual(await location('/admin/server-log', cookies.admin), [299, null]);
  assert.deepEqual(await location('/admin', cookies.owner), [299, null]);
  assert.deepEqual(await location('/logo.svg'), [299, null], 'static assets stay unguarded');
});

test('/login serves the login page, and sends a signed-in visitor to the map', async () => {
  const anonymous = await get('/login?notice=session');
  assert.equal(anonymous.status, 299);
  assert.equal((await anonymous.json()).reached, '/login.html?notice=session');
  assert.equal((await get('/login', cookies.banned)).status, 299);
  const signedIn = await get('/login', cookies.pending);
  assert.deepEqual([signedIn.status, signedIn.headers.get('location')], [302, '/']);
});

test('/api/* guard on real proxy routes: 401, 403 pending, 403 banned, pass-through when active', async () => {
  for (const route of ['/api/opensky/states/all', '/api/tomtom/flow/10/1/1.png', '/api/google/3dtiles/root.json', '/API/google/3dtiles/root.json', '/api/live/session', '/api/log']) {
    const anonymous = await get(route);
    assert.equal(anonymous.status, 401, route);
    assert.deepEqual(await anonymous.json(), { error: 'Login diperlukan', code: 'AUTH_REQUIRED' });
    assert.equal((await (await get(route, cookies.pending)).json()).code, 'ACCOUNT_PENDING', route);
    assert.equal((await (await get(route, cookies.banned)).json()).code, 'ACCOUNT_BANNED', route);
    const active = await get(route, cookies.active);
    assert.equal(active.status, 299, route);
    assert.equal((await active.json()).actorRole, 'user');
  }
});

test('/api/admin/*: admin pages for admins, key routes for the super-admin only, CSRF on writes', async () => {
  assert.equal((await get('/api/admin/log', cookies.active)).status, 403);
  assert.equal((await get('/api/admin/log', cookies.admin)).status, 299);
  const adminKeys = await get('/api/admin/keys', cookies.admin);
  assert.equal(adminKeys.status, 403);
  assert.equal((await adminKeys.json()).code, 'SUPER_ADMIN_REQUIRED');
  assert.equal((await get('/api/admin/keys', cookies.owner)).status, 299);
  const put = (headers) => get('/api/admin/keys', cookies.owner, { method: 'PUT', headers, body: '{}' });
  assert.equal((await put({ 'content-type': 'application/json' })).status, 403);
  assert.equal((await put({ origin, 'content-type': 'text/plain' })).status, 415);
  assert.equal((await put({ origin, 'content-type': 'application/json' })).status, 299);
});

test('/api/me answers for anyone with the actor\'s role and status', async () => {
  assert.deepEqual(await (await get('/api/me')).json(), { authenticated: false, configured: true });
  assert.deepEqual(await (await get('/api/me', cookies.pending)).json(), { authenticated: true, configured: true, role: 'user', status: 'pending', email: 'new@example.test' });
  const owner = await (await get('/api/me', cookies.owner)).json();
  assert.deepEqual([owner.role, owner.status], ['super-admin', 'active']);
  assert.equal((await get('/api/me', cookies.owner)).headers.get('cache-control'), 'no-store');
});

test('not configured: pages go to /login, /api/me lists missing NAMES, other APIs answer 503', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gev-auth-plugin-off-'));
  const warn = console.warn;
  console.warn = () => {};
  let offState;
  try {
    offState = await bootAuth({ env: { GOOGLE_CLIENT_ID: 'fixture-client.apps.googleusercontent.com' }, port: 1, rootDir: dir });
  } finally { console.warn = warn; }
  const off = await startServer(async () => offState);
  const offBase = `http://127.0.0.1:${off.address().port}`;
  try {
    const page = await fetch(`${offBase}/`, { redirect: 'manual' });
    assert.deepEqual([page.status, page.headers.get('location')], [302, '/login']);
    assert.equal((await (await fetch(`${offBase}/login`)).json()).reached, '/login.html');
    const me = await (await fetch(`${offBase}/api/me`)).json();
    assert.deepEqual(me, { authenticated: false, configured: false, missing: ['BETTER_AUTH_SECRET', 'SUPER_ADMIN_EMAILS', 'GOOGLE_CLIENT_SECRET'], invalid: [] });
    const api = await fetch(`${offBase}/api/opensky/states/all`);
    assert.equal(api.status, 503);
    assert.equal((await api.json()).code, 'AUTH_NOT_CONFIGURED');
    assert.equal((await fetch(`${offBase}/api/auth/ok`)).status, 503);
    assert.ok(!fs.existsSync(path.join(dir, 'data')), 'no database is created while unconfigured');
  } finally {
    await new Promise((resolve) => off.close(resolve));
  }
});

test('a failed boot fails closed with 503 for pages and APIs', async () => {
  const error = console.error;
  console.error = () => {};
  const broken = await startServer(() => Promise.reject(new Error('disk unreadable')));
  const brokenBase = `http://127.0.0.1:${broken.address().port}`;
  try {
    assert.equal((await fetch(`${brokenBase}/`, { redirect: 'manual' })).status, 503);
    assert.equal((await fetch(`${brokenBase}/api/opensky/states/all`)).status, 503);
    assert.equal((await fetch(`${brokenBase}/logo.svg`)).status, 299);
  } finally {
    console.error = error;
    await new Promise((resolve) => broken.close(resolve));
  }
});
