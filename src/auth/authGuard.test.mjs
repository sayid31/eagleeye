import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ADMIN_API_PERMISSIONS, adminApiPermission, apiDecision, authEndpointOriginAllowed, classifyRequest,
  loginPageDecision, pageDecision,
} from './authGuard.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const ORIGIN = 'http://localhost:4173';
const who = (role, status) => ({ role, status, user: { id: `id-${role}-${status}` } });

test('classifyRequest sorts auth, me, admin API, API, login, pages and assets', () => {
  const cases = [
    ['GET', '/api/auth/ok', 'auth'],
    ['POST', '/api/auth/sign-in/social', 'auth'],
    ['GET', '/api/me', 'me'],
    ['GET', '/api/me?x=1', 'me'],
    ['GET', '/api/admin/keys', 'admin-api'],
    ['PUT', '/api/admin/voice/settings', 'admin-api'],
    ['GET', '/api/admin', 'admin-api'],
    ['GET', '/api/opensky/states/all', 'api'],
    ['GET', '/API/google/3dtiles/root.json', 'api'],
    ['POST', '/api/live/session', 'api'],
    ['GET', '/api', 'api'],
    ['GET', '/login', 'login'],
    ['GET', '/login?notice=banned', 'login'],
    ['GET', '/login.html', 'login'],
    ['GET', '/', 'page'],
    ['HEAD', '/', 'page'],
    ['GET', '/index.html', 'page'],
    ['GET', '/?setup=1', 'page'],
    ['GET', '/some/spa/path', 'page'],
    ['GET', '/admin', 'admin-page'],
    ['GET', '/admin/server-log', 'admin-page'],
    ['GET', '/ADMIN.html', 'admin-page'],
    ['GET', '/src/main.js', 'asset'],
    ['GET', '/@vite/client', 'asset'],
    ['GET', '/logo.svg', 'asset'],
    ['GET', '/cesium/Cesium.js', 'asset'],
    ['POST', '/', 'asset'],
    ['GET', '/apiary', 'page'],
  ];
  for (const [method, url, kind] of cases) assert.equal(classifyRequest(method, url), kind, `${method} ${url}`);
});

test('pages: anonymous → /login (session notice when a cookie was sent), banned → banned notice, non-admin off /admin', () => {
  assert.deepEqual(pageDecision({ kind: 'page', actor: null }), { action: 'redirect', location: '/login' });
  assert.deepEqual(pageDecision({ kind: 'page', actor: null, hadSessionCookie: true }), { action: 'redirect', location: '/login?notice=session' });
  assert.deepEqual(pageDecision({ kind: 'page', actor: who('user', 'banned') }), { action: 'redirect', location: '/login?notice=banned' });
  assert.deepEqual(pageDecision({ kind: 'page', actor: who('user', 'pending') }), { action: 'next' });
  assert.deepEqual(pageDecision({ kind: 'page', actor: who('user', 'active') }), { action: 'next' });
  assert.deepEqual(pageDecision({ kind: 'admin-page', actor: who('user', 'active') }), { action: 'redirect', location: '/' });
  assert.deepEqual(pageDecision({ kind: 'admin-page', actor: who('admin', 'pending') }), { action: 'redirect', location: '/' });
  assert.deepEqual(pageDecision({ kind: 'admin-page', actor: who('admin', 'active') }), { action: 'next' });
  assert.deepEqual(pageDecision({ kind: 'admin-page', actor: who('super-admin', 'active') }), { action: 'next' });
  assert.deepEqual(loginPageDecision(who('user', 'pending')), { action: 'redirect', location: '/' });
  assert.deepEqual(loginPageDecision(who('user', 'banned')), { action: 'next' });
  assert.deepEqual(loginPageDecision(null), { action: 'next' });
});

test('API: 401 anonymous, 403 banned / pending, pass-through for any active account', () => {
  const base = { kind: 'api', method: 'GET', url: '/api/opensky/states/all', trustedOrigin: ORIGIN };
  assert.deepEqual(apiDecision({ ...base, actor: null }), { action: 'deny', status: 401, code: 'AUTH_REQUIRED', error: 'Login diperlukan' });
  assert.equal(apiDecision({ ...base, actor: who('admin', 'banned') }).code, 'ACCOUNT_BANNED');
  assert.equal(apiDecision({ ...base, actor: who('user', 'pending') }).code, 'ACCOUNT_PENDING');
  assert.equal(apiDecision({ ...base, actor: who('user', 'pending') }).status, 403);
  assert.deepEqual(apiDecision({ ...base, actor: who('user', 'active') }), { action: 'next' });
});

test('admin API: admin role required, key routes super-admin only, writes need exact Origin + JSON', () => {
  const base = { kind: 'admin-api', method: 'GET', trustedOrigin: ORIGIN };
  assert.equal(apiDecision({ ...base, url: '/api/admin/log', actor: who('user', 'active') }).code, 'ADMIN_REQUIRED');
  assert.deepEqual(apiDecision({ ...base, url: '/api/admin/log', actor: who('admin', 'active') }), { action: 'next' });
  assert.equal(apiDecision({ ...base, url: '/api/admin/keys', actor: who('admin', 'active') }).code, 'SUPER_ADMIN_REQUIRED');
  assert.equal(apiDecision({ ...base, url: '/api/admin/keys/test', actor: who('admin', 'active') }).code, 'SUPER_ADMIN_REQUIRED');
  assert.deepEqual(apiDecision({ ...base, url: '/api/admin/keys', actor: who('super-admin', 'active') }), { action: 'next' });
  const write = { ...base, method: 'PUT', url: '/api/admin/voice/settings', actor: who('admin', 'active') };
  assert.equal(apiDecision({ ...write, headers: { 'content-type': 'application/json' } }).code, 'ORIGIN_NOT_ALLOWED');
  assert.equal(apiDecision({ ...write, headers: { origin: 'http://evil.example', 'content-type': 'application/json' } }).code, 'ORIGIN_NOT_ALLOWED');
  assert.equal(apiDecision({ ...write, headers: { origin: ORIGIN } }).status, 415);
  assert.deepEqual(apiDecision({ ...write, headers: { origin: ORIGIN, 'content-type': 'application/json; charset=utf-8' } }), { action: 'next' });
});

test('an unmapped admin route needs the strictest permission', () => {
  assert.equal(adminApiPermission('/api/admin/something-new'), 'keys');
  assert.equal(adminApiPermission('/api/admin/logbook'), 'keys');
  assert.equal(adminApiPermission('/api/admin/log?level=error'), 'admin');
  assert.equal(adminApiPermission('/API/ADMIN/KEYS/test'), 'keys');
});

function sourceFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    return /\.(mjs|js)$/.test(entry.name) && !entry.name.includes('.test.') ? [full] : [];
  });
}

test('every /api/admin route registered in the codebase has an explicit permission', () => {
  const registered = new Set();
  for (const file of [...sourceFiles(path.join(ROOT, 'src')), path.join(ROOT, 'vite.config.js')]) {
    const text = fs.readFileSync(file, 'utf8');
    for (const match of text.matchAll(/\.use\(\s*['"`](\/api\/admin[^'"`]*)['"`]/g)) registered.add(match[1]);
  }
  assert.ok(registered.size >= 5, `expected the admin routes to be found, got ${[...registered]}`);
  for (const route of registered) {
    assert.ok(Object.hasOwn(ADMIN_API_PERMISSIONS, route), `${route} has no entry in ADMIN_API_PERMISSIONS`);
  }
  assert.deepEqual(Object.keys(ADMIN_API_PERMISSIONS).sort(), [...registered].sort(), 'the map lists a route that no longer exists');
  const keyRoutes = Object.entries(ADMIN_API_PERMISSIONS).filter(([, permission]) => permission === 'keys').map(([route]) => route);
  assert.deepEqual(keyRoutes, ['/api/admin/keys']);
});

test('the guard plugin is registered before every route and proxy plugin in vite.config.js', () => {
  const text = fs.readFileSync(path.join(ROOT, 'vite.config.js'), 'utf8');
  const plugins = text.slice(text.indexOf('plugins: ['), text.indexOf('server: {'));
  const calls = [...plugins.matchAll(/^\s{6}(\w+)\(/gm)].map((m) => m[1]);
  const guardAt = calls.indexOf('authPlugin');
  assert.ok(guardAt > 0, calls.join(', '));
  assert.deepEqual(calls.slice(0, guardAt), ['skipOnReactPages', 'react', 'serverLogWatchPlugin']);
  assert.ok(calls.length - guardAt > 20, 'all proxies follow the guard');
});

test('auth endpoints: state-changing calls need this app\'s Origin (or Referer)', () => {
  const check = (method, headers) => authEndpointOriginAllowed({ method, headers, trustedOrigin: ORIGIN });
  assert.equal(check('GET', {}), true);
  assert.equal(check('POST', { origin: ORIGIN }), true);
  assert.equal(check('POST', { origin: 'http://evil.example' }), false);
  assert.equal(check('POST', { origin: 'http://127.0.0.1:4173' }), false);
  assert.equal(check('POST', {}), false);
  assert.equal(check('POST', { referer: `${ORIGIN}/login` }), true);
  assert.equal(check('POST', { referer: 'http://evil.example/x' }), false);
  assert.equal(check('POST', { referer: 'not a url' }), false);
});
