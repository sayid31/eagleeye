import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pageAreaFor, pageRouteDecision } from './pageRoutes.mjs';
import { isPublicAsset } from './assetAllowlist.mjs';

const who = (role, mustChangePassword = false) => ({ role, mustChangePassword });
const decide = (url, actor = null, extra = {}) => pageRouteDecision({ method: 'GET', url, actor, ...extra });
const ROLES = { none: null, user: who('user'), admin: who('admin'), super: who('super_admin') };

// plan/auth/02 route table × (no session, user, admin, super_admin).
const TABLE = {
  '/': { none: '→/landing.html', user: '→/landing.html', admin: '→/landing.html', super: '→/landing.html' },
  '/login': { none: '→/login.html', user: '302 /app', admin: '302 /admin', super: '302 /dev' },
  '/app': { none: '302 /login?next=%2Fapp', user: '→/index.html', admin: '→/index.html', super: '→/index.html' },
  '/index.html': { none: '302 /login', user: '→/index.html', admin: '→/index.html', super: '→/index.html' },
  '/admin': { none: '302 /login?next=%2Fadmin', user: '302 /app', admin: '→/admin.html', super: '→/admin.html' },
  '/admin/users': { none: '302 /login?next=%2Fadmin%2Fusers', user: '302 /app', admin: '→/admin.html', super: '→/admin.html' },
  '/admin.html': { none: '302 /login', user: '302 /app', admin: '→/admin.html', super: '→/admin.html' },
  '/dev': { none: '302 /login?next=%2Fdev', user: '302 /app', admin: '302 /admin', super: '→/admin.html' },
  '/dev/keys': { none: '302 /login?next=%2Fdev%2Fkeys', user: '302 /app', admin: '302 /admin', super: '→/admin.html' },
  '/account': { none: '302 /login?next=%2Faccount', user: '→/login.html', admin: '→/login.html', super: '→/login.html' },
  '/account/password': { none: '302 /login?next=%2Faccount%2Fpassword', user: '→/login.html', admin: '→/login.html', super: '→/login.html' },
  '/settings': { none: '404', user: '404', admin: '404', super: '404' },
  '/app/extra': { none: '404', user: '404', admin: '404', super: '404' },
};

const show = (decision) => {
  if (decision.action === 'serve') return `→${decision.url}`;
  if (decision.action === 'redirect') return `302 ${decision.location}`;
  return decision.action === 'not-found' ? '404' : decision.action;
};

for (const [path, cells] of Object.entries(TABLE)) {
  test(`route ${path} for every role and without a session`, () => {
    for (const [role, expected] of Object.entries(cells)) {
      assert.equal(show(decide(path, ROLES[role])), expected, `${path} as ${role}`);
    }
  });
}

test('the query survives the rewrite (html-proxy modules, ?welcome=)', () => {
  assert.deepEqual(decide('/app?welcome=1', ROLES.user), { action: 'serve', url: '/index.html?welcome=1' });
  assert.deepEqual(decide('/index.html?html-proxy&index=0.css', ROLES.user), { action: 'serve', url: '/index.html?html-proxy&index=0.css' });
  assert.deepEqual(decide('/app?welcome=1'), { action: 'redirect', location: '/login?next=%2Fapp%3Fwelcome%3D1' });
});

test('an expired cookie adds notice=session; mustChangePassword pins every page to /account/password', () => {
  assert.deepEqual(decide('/app', null, { hadSessionCookie: true }), { action: 'redirect', location: '/login?next=%2Fapp&notice=session' });
  for (const path of ['/app', '/admin', '/dev', '/account', '/login']) {
    assert.deepEqual(decide(path, who('super_admin', true)), { action: 'redirect', location: '/account/password' }, path);
  }
  assert.deepEqual(decide('/account/password', who('user', true)), { action: 'serve', url: '/login.html' });
  assert.deepEqual(decide('/', who('user', true)), { action: 'serve', url: '/landing.html' }, 'the public landing stays reachable');
});

test('non-GET page requests and /__* internals are 404 unless super_admin', () => {
  assert.equal(pageRouteDecision({ method: 'POST', url: '/app', actor: ROLES.super }).action, 'not-found');
  assert.equal(decide('/__open-in-editor?file=x').action, 'not-found');
  assert.equal(decide('/__open-in-editor?file=x', ROLES.admin).action, 'not-found');
  assert.equal(decide('/__open-in-editor?file=x', ROLES.super).action, 'asset');
});

test('assets: allowlist only — internal files and smuggled paths are 404 even with a session', () => {
  for (const ok of ['/@vite/client', '/@react-refresh', '/@id/__x00__virtual', '/node_modules/.vite/deps/react.js?v=1', '/node_modules/vite/dist/client/env.mjs', '/node_modules/cesium/Build/Cesium/index.js', '/src/main.js', '/cesium/Cesium.js', '/logo.svg', '/style.css', '/models/jet.glb']) {
    assert.equal(decide(ok).action, 'asset', ok);
  }
  for (const bad of ['/.gev-data/auth.db', '/data/auth.db', '/.gev-cache/admin-audit.jsonl', '/.env', '/package.json', '/urlcctv.csv', '/models/../.env',
    '/src/%2e%2e/.gev-data/auth.db', '/src/..%2f.env', '/src//x', '/node_modules/better-auth/package.json', '/@fs/etc/passwd', '/models/x.txt']) {
    assert.equal(decide(bad, ROLES.super).action, 'not-found', bad);
  }
  assert.equal(isPublicAsset('/@fs/Users/x/node_modules/a.js', { allowFsPrefix: true }), true, 'Pinokio canonical root');
  assert.equal(isPublicAsset('/assets/index-abc.js', { mode: 'preview' }), true);
  assert.equal(isPublicAsset('/src/main.js', { mode: 'preview' }), false, 'preview serves build output only');
});

test('pageAreaFor is exact and case-sensitive', () => {
  assert.equal(pageAreaFor('/App'), null);
  assert.equal(pageAreaFor('/administrator'), null);
  assert.equal(pageAreaFor('/devices'), null);
  assert.equal(pageAreaFor('/dev/'), 'dev');
});

test('/ always rewrites to the public landing, keeping the query for its legacy-link redirect', () => {
  assert.deepEqual(decide('/'), { action: 'serve', url: '/landing.html' });
  assert.deepEqual(decide('/landing.html'), { action: 'serve', url: '/landing.html' });
  assert.deepEqual(decide('/?welcome=0'), { action: 'serve', url: '/landing.html?welcome=0' });
  assert.deepEqual(decide('/?trafficDebug=1', ROLES.admin), { action: 'serve', url: '/landing.html?trafficDebug=1' });
  assert.equal(pageRouteDecision({ method: 'POST', url: '/', actor: null }).action, 'not-found');
});
