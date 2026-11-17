import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { OWNER_EMAIL, actorFor, signInOwner, startAuthTestServer } from './__fixtures__/authTestServer.mjs';

let t;
const cookies = {};
const PASSWORD = 'user-test-password-1'; // test-only

before(async () => {
  t = await startAuthTestServer();
  cookies.owner = await signInOwner(t);
  const owner = await actorFor(t, cookies.owner);
  const { accounts } = t.state.services;
  const make = async (email, role, capabilities) => {
    const created = await accounts.createUser(owner, { email, name: `Fixture ${role}`, role, capabilities, password: `${PASSWORD}-${role}-long` });
    assert.equal(created.ok, true, `${email}: ${created.code}`);
    // Forced change is covered elsewhere; clear it so the fixture can browse.
    await (await t.state.auth.$context).internalAdapter.updateUser(created.user.id, { mustChangePassword: false });
    return (await t.signIn(email, `${PASSWORD}-${role}-long`)).cookie;
  };
  cookies.admin = await make('admin@example.test', 'admin');
  cookies.user = await make('user@example.test', 'user', { layers: true, ai: false, premium: false });
});

after(() => t.close());

const status = async (res) => [res.status, res.headers.get('location')];

test('/api/auth/*: only the allowlist reaches Better Auth; smuggled paths and other endpoints are 404', async () => {
  assert.equal((await t.request('/api/auth/get-session', { cookie: cookies.user })).status, 200);
  for (const [method, url] of [
    ['POST', '/api/auth/sign-up/email'], ['POST', '/api/auth/admin/set-role'], ['POST', '/api/auth/sign-in/%2e%2e/admin/x'],
    ['POST', '/api/auth/verify-password'], ['POST', '/api/auth//sign-in/email'], ['GET', '/api/auth/ok'], ['POST', '/api/auth/request-password-reset'],
  ]) {
    const res = await t.request(url, { method, headers: { origin: t.origin, 'content-type': 'application/json' }, body: method === 'POST' ? '{}' : undefined });
    assert.equal(res.status, 404, `${method} ${url}`);
    assert.equal((await res.json()).error, 'NOT_FOUND');
  }
});

test('sign-in/social: Google only, extra fields refused, off-site callbackURL refused', async () => {
  const offsite = await t.post('/api/auth/sign-in/social', { provider: 'google', callbackURL: 'http://evil.example/' });
  assert.equal(offsite.status, 403, 'Better Auth checks trustedOrigins on the client value first');
  const google = await t.post('/api/auth/sign-in/social', { provider: 'google', callbackURL: '/app' });
  // No GOOGLE_CLIENT_ID in this fixture: the provider is absent, but the forced body passed validation.
  assert.equal(google.status, 404);
  assert.equal((await google.json()).code, 'PROVIDER_NOT_FOUND');
  const github = await t.post('/api/auth/sign-in/social', { provider: 'github' });
  assert.equal(github.status, 400);
  assert.equal((await github.json()).code, 'SOCIAL_SIGN_IN_REFUSED');
  const idToken = await t.post('/api/auth/sign-in/social', { provider: 'google', idToken: { token: 'x' } });
  assert.equal((await idToken.json()).code, 'SOCIAL_SIGN_IN_REFUSED');
  const crossSite = await t.post('/api/auth/sign-in/social', { provider: 'google' }, { headers: { origin: 'http://evil.example' } });
  assert.equal(crossSite.status, 403);
});

test('sign-in/social with Google configured: the stored OAuth state carries the forced /dev and error URL', async () => {
  // test-only dummy client, never contacted
  const g = await startAuthTestServer({ env: { GOOGLE_CLIENT_ID: 'fixture.apps.googleusercontent.com', GOOGLE_CLIENT_SECRET: 'fixture-secret' } });
  try {
    const res = await g.post('/api/auth/sign-in/social', { provider: 'google', callbackURL: '/app', errorCallbackURL: '/app', newUserCallbackURL: '/app' });
    assert.equal(res.status, 200);
    const { url } = await res.json();
    assert.equal(new URL(url).origin, 'https://accounts.google.com');
    assert.equal(new URL(url).searchParams.get('redirect_uri'), `${g.origin}/api/auth/callback/google`);
    const stored = g.rows('SELECT value FROM verification').map((row) => row.value).join('\n');
    assert.match(stored, /"callbackURL":"\/dev"/);
    assert.match(stored, /"errorURL":"\/login\?next=\/dev&notice=google"/);
    assert.doesNotMatch(stored, /"\/app"/, 'no client-chosen URL survives');
    assert.equal((await (await g.request('/api/me')).json()).googleSignIn, true);
  } finally {
    await g.close();
  }
});

test('page guard over HTTP: landing public, map needs a session, areas by role, internals 404', async () => {
  assert.deepEqual(await status(await t.request('/')), [299, null]);
  assert.deepEqual(await status(await t.request('/app')), [302, '/login?next=%2Fapp']);
  assert.deepEqual(await status(await t.request('/dev', { cookie: 'gev.session_token=stale.value' })), [302, '/login?next=%2Fdev&notice=session']);
  assert.deepEqual(await status(await t.request('/app', { cookie: cookies.user })), [299, null]);
  assert.equal((await (await t.request('/app?welcome=1', { cookie: cookies.user })).json()).reached, '/index.html?welcome=1');
  assert.deepEqual(await status(await t.request('/admin', { cookie: cookies.user })), [302, '/app']);
  assert.deepEqual(await status(await t.request('/dev', { cookie: cookies.admin })), [302, '/admin']);
  assert.equal((await (await t.request('/dev/keys', { cookie: cookies.owner })).json()).reached, '/admin.html');
  assert.deepEqual(await status(await t.request('/login', { cookie: cookies.owner })), [302, '/dev']);
  for (const leak of ['/.gev-data/auth.db', '/.gev-cache/admin-audit.jsonl', '/__open-in-editor?file=x', '/data/auth.db', '/whatever']) {
    assert.equal((await t.request(leak)).status, 404, leak);
  }
  assert.equal((await t.request('/__open-in-editor?file=x', { cookie: cookies.admin })).status, 404);
  assert.equal((await t.request('/logo.svg')).status, 299, 'allowlisted asset passes without a session');
});

test('/api/* gates: 401 anonymous, 403 CAPABILITY_REQUIRED with the gate, admin/super by role, unknown → 404', async () => {
  assert.equal((await t.request('/api/opensky/states/all')).status, 401);
  assert.equal((await t.request('/api/opensky/states/all', { cookie: cookies.user })).status, 299);
  const hud = await t.request('/api/openai/hud-summary', { cookie: cookies.user });
  assert.equal(hud.status, 403);
  assert.deepEqual(await hud.json(), { error: 'CAPABILITY_REQUIRED', message: 'Fitur belum diaktifkan admin', gate: 'ai' });
  assert.equal((await (await t.request('/api/google/3dtiles/root.json', { cookie: cookies.user })).json()).gate, 'premium');
  assert.equal((await t.request('/API/google/3dtiles/root.json', { cookie: cookies.admin })).status, 299, 'admins hold every toggle; Connect-style case-insensitive match');
  assert.equal((await (await t.request('/api/admin/users', { cookie: cookies.user })).json()).error, 'ADMIN_REQUIRED');
  assert.equal((await t.request('/api/admin/users', { cookie: cookies.admin })).status, 299);
  assert.equal((await (await t.request('/api/admin/keys', { cookie: cookies.admin })).json()).error, 'SUPER_ADMIN_REQUIRED');
  assert.equal((await t.request('/api/admin/keys', { cookie: cookies.owner })).status, 299);
  assert.equal((await t.request('/api/not-registered', { cookie: cookies.owner })).status, 404);
  assert.equal((await t.request('/api/log', { cookie: cookies.user, headers: { 'sec-fetch-site': 'same-site' } })).status, 403, 'another localhost port is refused');
});

test('/api/* writes need the exact Origin; admin writes also JSON', async () => {
  const write = (url, headers) => t.request(url, { method: 'POST', cookie: cookies.owner, body: '{}', headers });
  assert.equal((await write('/api/log', { origin: t.origin, 'content-type': 'application/json' })).status, 299);
  assert.equal((await write('/api/log', { 'content-type': 'application/json' })).status, 403);
  assert.equal((await write('/api/log', { origin: 'http://localhost:1', 'content-type': 'application/json' })).status, 403);
  assert.equal((await write('/api/admin/keys', { origin: t.origin, 'content-type': 'text/plain' })).status, 415);
});

test('kill switch: a switched-off gate answers 503 FEATURE_DISABLED for everyone', async () => {
  const killed = await startAuthTestServer({ isKilled: (gate) => gate === 'ai' });
  try {
    const owner = await signInOwner(killed);
    const res = await killed.request('/api/openai/hud-summary', { cookie: owner });
    assert.equal(res.status, 503);
    assert.deepEqual(await res.json(), { error: 'FEATURE_DISABLED', message: 'Fitur sedang dimatikan oleh developer', gate: 'ai' });
    assert.equal((await killed.request('/api/admin/keys', { cookie: owner })).status, 299, 'role gates are never killed');
  } finally {
    await killed.close();
  }
});

test('/api/me v2: anonymous, user with toggles, admin with every toggle, super_admin home /dev', async () => {
  assert.deepEqual(await (await t.request('/api/me')).json(), { configured: true, signedIn: false, home: '/login', googleSignIn: false });
  const user = await (await t.request('/api/me', { cookie: cookies.user })).json();
  assert.deepEqual(Object.keys(user.user).sort(), ['capabilities', 'email', 'id', 'mustChangePassword', 'name', 'role']);
  assert.deepEqual([user.user.role, user.home, user.user.capabilities], ['user', '/app', { layers: true, ai: false, premium: false }]);
  const admin = await (await t.request('/api/me', { cookie: cookies.admin })).json();
  assert.deepEqual([admin.home, admin.user.capabilities], ['/admin', { layers: true, ai: true, premium: true }]);
  const owner = await (await t.request('/api/me', { cookie: cookies.owner })).json();
  assert.deepEqual([owner.user.email, owner.user.role, owner.home], [OWNER_EMAIL, 'super_admin', '/dev']);
});

test('/api/me without configuration says configured:false and names no env var', async () => {
  const bare = await startAuthTestServer({ env: { SUPER_ADMIN_EMAILS: '' } });
  try {
    const body = await (await bare.request('/api/me')).json();
    assert.deepEqual(body, { configured: false, signedIn: false, home: '/login', googleSignIn: false });
    assert.equal((await bare.request('/app')).headers.get('location'), '/login');
    assert.equal((await bare.request('/api/log')).status, 503);
  } finally {
    await bare.close();
  }
});
