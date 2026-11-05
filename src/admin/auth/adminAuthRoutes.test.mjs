import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installAdminAuthRoutes } from './adminAuthRoutes.mjs';
import { requireAdminSession } from './requireAdminSession.mjs';
import { PENDING_COOKIE, SESSION_COOKIE, createToken } from './adminSession.mjs';

// test-only fixtures, not real credentials
const SECRET = 's'.repeat(40);
const ENV = { GOOGLE_CLIENT_ID: 'cid', GOOGLE_CLIENT_SECRET: 'csec', ADMIN_EMAIL: 'owner@example.com', ADMIN_SESSION_SECRET: SECRET };
const NOW = 1_700_000_000_000;
const ORIGIN = 'http://localhost:4173';

function setup({ env = ENV, fetchFn, events = [] } = {}) {
  let handler;
  installAdminAuthRoutes({ use: (_path, fn) => { handler = fn; } }, { env: () => env, fetchFn, onEvent: (e, d) => events.push([e, d?.reason]), now: () => NOW });
  return (method, url, headers = {}) => new Promise((resolve) => {
    const out = { status: 0, headers: {}, body: '' };
    const res = {
      set statusCode(v) { out.status = v; },
      setHeader: (k, v) => { out.headers[k.toLowerCase()] = v; },
      end: (b = '') => { out.body = b; resolve(out); },
    };
    handler({ method, url, headers }, res);
  });
}
const cookieValue = (setCookie, name) => [].concat(setCookie).find((c) => c.startsWith(`${name}=`))?.split(';')[0].slice(name.length + 1);
const sessionFor = (email) => createToken({ email }, { kind: 'session', secret: SECRET, ttlMs: 60_000, now: NOW });
const idTokenFor = (claims) => `h.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.s`;

async function startLogin(call) {
  const login = await call('GET', '/login');
  const state = new URL(login.headers.location).searchParams.get('state');
  const nonce = new URL(login.headers.location).searchParams.get('nonce');
  return { login, state, nonce, pending: cookieValue(login.headers['set-cookie'], PENDING_COOKIE) };
}
const googleOk = (claims) => async () => ({ ok: true, status: 200, json: async () => ({ id_token: idTokenFor(claims) }) });
const claimsFor = (nonce, over = {}) => ({ iss: 'accounts.google.com', aud: 'cid', exp: NOW / 1000 + 60, nonce, email: 'owner@example.com', email_verified: true, ...over });

test('login redirects to Google and sets a Lax, HttpOnly pending cookie', async () => {
  const { login } = await startLogin(setup());
  assert.equal(login.status, 302);
  assert.match(login.headers.location, /^https:\/\/accounts\.google\.com\//);
  const cookie = login.headers['set-cookie'][0];
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=Lax/);
});

test('the admin account completes login and gets a Strict 24h session cookie', async () => {
  const events = [];
  let nonce;
  const call = setup({ events, fetchFn: (...a) => googleOk(claimsFor(nonce))(...a) });
  const started = await startLogin(call);
  nonce = started.nonce;
  const cb = await call('GET', `/callback?code=abc&state=${started.state}`, { cookie: `${PENDING_COOKIE}=${started.pending}` });
  assert.equal(cb.status, 302);
  assert.equal(cb.headers.location, '/admin');
  const session = cb.headers['set-cookie'].find((c) => c.startsWith(`${SESSION_COOKIE}=`));
  assert.match(session, /SameSite=Strict/);
  assert.match(session, /Max-Age=86400/);
  assert.deepEqual(events.at(-1), ['login_ok', undefined]);
  const status = await call('GET', '/session', { cookie: `${SESSION_COOKIE}=${cookieValue(cb.headers['set-cookie'], SESSION_COOKIE)}` });
  assert.deepEqual(JSON.parse(status.body), { configured: true, authenticated: true, email: 'owner@example.com' });
});

test('a different Google account is refused, logged by reason (not email), and gets no session', async () => {
  const events = [];
  let nonce;
  const call = setup({ events, fetchFn: (...a) => googleOk(claimsFor(nonce, { email: 'intruder@example.com' }))(...a) });
  const started = await startLogin(call);
  nonce = started.nonce;
  const cb = await call('GET', `/callback?code=abc&state=${started.state}`, { cookie: `${PENDING_COOKIE}=${started.pending}` });
  assert.equal(cb.headers.location, '/admin/login?error=not_admin');
  assert.ok(![].concat(cb.headers['set-cookie']).some((c) => c.startsWith(`${SESSION_COOKIE}=`) && !c.includes('Max-Age=0')));
  assert.deepEqual(events.at(-1), ['login_rejected', 'not_admin']);
  assert.ok(!JSON.stringify(events).includes('intruder'));
});

test('callback with a wrong state, or no pending cookie, is rejected before contacting Google', async () => {
  let googleCalls = 0;
  const call = setup({ fetchFn: async () => { googleCalls += 1; return { ok: true, json: async () => ({}) }; } });
  const started = await startLogin(call);
  const wrong = await call('GET', '/callback?code=abc&state=forged', { cookie: `${PENDING_COOKIE}=${started.pending}` });
  const none = await call('GET', `/callback?code=abc&state=${started.state}`);
  assert.equal(wrong.headers.location, '/admin/login?error=invalid_request');
  assert.equal(none.headers.location, '/admin/login?error=invalid_request');
  assert.equal(googleCalls, 0);
});

test('a Google outage during exchange fails closed', async () => {
  const call = setup({ fetchFn: async () => { throw new Error('network down'); } });
  const started = await startLogin(call);
  const cb = await call('GET', `/callback?code=abc&state=${started.state}`, { cookie: `${PENDING_COOKIE}=${started.pending}` });
  assert.equal(cb.headers.location, '/admin/login?error=google_unavailable');
});

test('unconfigured server reports missing NAMES, never values, and refuses login', async () => {
  const call = setup({ env: { ...ENV, ADMIN_SESSION_SECRET: '' } });
  const session = JSON.parse((await call('GET', '/session')).body);
  assert.deepEqual(session, { configured: false, authenticated: false, missing: ['ADMIN_SESSION_SECRET'] });
  assert.equal((await call('GET', '/login')).headers.location, '/admin/login?error=not_configured');
});

test('logout needs a session and clears the cookie', async () => {
  const call = setup();
  const headers = { cookie: `${SESSION_COOKIE}=${sessionFor('owner@example.com')}`, origin: ORIGIN, 'content-type': 'application/json' };
  assert.equal((await call('POST', '/logout', { origin: ORIGIN, 'content-type': 'application/json' })).status, 401);
  const out = await call('POST', '/logout', headers);
  assert.equal(out.status, 200);
  assert.match(out.headers['set-cookie'][0], /Max-Age=0/);
});

test('requireAdminSession: only a valid admin session passes; writes also need Origin and JSON', () => {
  const ok = { method: 'GET', headers: { cookie: `${SESSION_COOKIE}=${sessionFor('owner@example.com')}` } };
  assert.equal(requireAdminSession(ok, { env: ENV, now: NOW }).ok, true);
  assert.equal(requireAdminSession({ method: 'GET', headers: {} }, { env: ENV, now: NOW }).status, 401);
  assert.equal(requireAdminSession({ method: 'GET', headers: { cookie: `${SESSION_COOKIE}=${sessionFor('other@example.com')}` } }, { env: ENV, now: NOW }).status, 401);
  assert.equal(requireAdminSession({ method: 'GET', headers: { cookie: `${SESSION_COOKIE}=${sessionFor('owner@example.com')}` } }, { env: ENV, now: NOW + 2 * 60_000 }).status, 401);
  assert.equal(requireAdminSession(ok, { env: { ...ENV, ADMIN_SESSION_SECRET: '' }, now: NOW }).status, 503);
  const write = (extra) => ({ method: 'PUT', headers: { ...ok.headers, ...extra } });
  assert.equal(requireAdminSession(write({}), { env: ENV, now: NOW }).status, 403);
  assert.equal(requireAdminSession(write({ origin: 'http://evil.example', 'content-type': 'application/json' }), { env: ENV, now: NOW }).status, 403);
  assert.equal(requireAdminSession(write({ origin: ORIGIN }), { env: ENV, now: NOW }).status, 415);
  assert.equal(requireAdminSession(write({ origin: ORIGIN, 'content-type': 'application/json' }), { env: ENV, now: NOW }).ok, true);
});
