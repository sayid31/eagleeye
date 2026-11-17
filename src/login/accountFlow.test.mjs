// Integration: what the /account pages rely on, against the real guard +
// Better Auth on a temp SQLite DB — the change-password before-hook enforces
// validatePassword and forces revokeOtherSessions even when the client asks
// otherwise; get-session exposes passwordSetBy; update-user and
// revoke-other-sessions behave as the page expects.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { actorFor, signInOwner, startAuthTestServer } from '../auth/__fixtures__/authTestServer.mjs';

const TEMP = 'temporary-password-1'; // test-only
let t;
let owner;

before(async () => {
  t = await startAuthTestServer();
  owner = await actorFor(t, await signInOwner(t));
});
after(() => t.close());

const sessionsOf = (id) => t.rows('SELECT COUNT(*) AS n FROM session WHERE userId = ?', id)[0].n;
const userRow = (id) => t.rows('SELECT mustChangePassword, passwordSetBy FROM "user" WHERE id = ?', id)[0];

async function adminCreated(email, role = 'user') {
  const created = await t.state.services.accounts.createUser(owner, { email, name: 'Sari Dewi', password: TEMP, role });
  assert.equal(created.ok, true, created.code);
  return created.user.id;
}

test('forced change: pinned to /account/password, policy enforced server-side, other sessions revoked, then home', async () => {
  const id = await adminCreated('sari@example.test');
  assert.equal(userRow(id).mustChangePassword, 1);
  const laptop = await t.signIn('sari@example.test', TEMP);
  const phone = await t.signIn('sari@example.test', TEMP);
  assert.equal(sessionsOf(id), 2);

  // The guard pins pages (including /account) to the change page, which itself is served.
  assert.equal((await t.request('/account', { cookie: phone.cookie })).headers.get('location'), '/account/password');
  assert.equal((await t.request('/account/password', { cookie: phone.cookie })).status, 299);
  // revoke-other-sessions and update-user are not open until the change.
  assert.equal((await t.post('/api/auth/revoke-other-sessions', {}, { cookie: phone.cookie })).status, 403);

  // Server-side policy, whatever the client sends (a hand-made request skips the form's checks).
  const tooShort = await t.post('/api/auth/change-password', { currentPassword: TEMP, newPassword: 'eleven-char' }, { cookie: phone.cookie });
  assert.equal(tooShort.status, 400);
  assert.equal((await tooShort.json()).code, 'PASSWORD_WEAK');
  const isEmail = await t.post('/api/auth/change-password', { currentPassword: TEMP, newPassword: 'sari@example.test' }, { cookie: phone.cookie });
  assert.equal((await isEmail.json()).code, 'PASSWORD_WEAK');
  const wrongCurrent = await t.post('/api/auth/change-password', { currentPassword: 'not-my-password', newPassword: 'a sentence long enough' }, { cookie: phone.cookie });
  assert.equal(wrongCurrent.status, 400);
  assert.equal((await wrongCurrent.json()).code, 'INVALID_PASSWORD');
  assert.equal(userRow(id).mustChangePassword, 1, 'refusals change nothing');
  assert.equal(sessionsOf(id), 2);

  // The client asks to KEEP other sessions; the hook forces revokeOtherSessions anyway.
  const ok = await t.post('/api/auth/change-password', { currentPassword: TEMP, newPassword: 'a sentence long enough', revokeOtherSessions: false }, { cookie: phone.cookie });
  assert.equal(ok.status, 200);
  const fresh = (ok.headers.getSetCookie?.() ?? []).map((line) => line.split(';')[0]).find((pair) => pair.startsWith('gev.session_token=')) ?? phone.cookie;
  assert.equal(sessionsOf(id), 1, 'only the changing device stays signed in');
  t.state.resolver.forget();
  assert.equal((await t.request('/api/log', { cookie: laptop.cookie })).status, 401, 'the other device is out');
  assert.deepEqual(userRow(id), { mustChangePassword: 0, passwordSetBy: 'self' });
  const me = await (await t.request('/api/me', { cookie: fresh })).json();
  assert.deepEqual([me.user.mustChangePassword, me.home], [false, '/app'], 'the page then leaves for homeFor(role)');
  assert.equal((await t.request('/account', { cookie: fresh })).status, 299, '/account opens after the change');
  assert.equal((await t.signIn('sari@example.test', 'a sentence long enough')).res.status, 200);
  assert.equal((await t.signIn('sari@example.test', TEMP)).res.status, 401, 'old password gone');
});

test('admin role: 15-character minimum on change-password (12 is not enough)', async () => {
  const id = await adminCreated('adi@example.test', 'admin');
  const { cookie } = await t.signIn('adi@example.test', TEMP);
  const twelve = await t.post('/api/auth/change-password', { currentPassword: TEMP, newPassword: 'twelve-chars' }, { cookie });
  assert.equal((await twelve.json()).code, 'PASSWORD_WEAK');
  assert.equal((await t.post('/api/auth/change-password', { currentPassword: TEMP, newPassword: 'fifteen-chars!!' }, { cookie })).status, 200);
  assert.equal(userRow(id).mustChangePassword, 0);
});

test('/account calls: get-session exposes passwordSetBy, update-user renames, revoke-other-sessions keeps this device', async () => {
  const id = await adminCreated('rina@example.test');
  await (await t.state.auth.$context).internalAdapter.updateUser(id, { mustChangePassword: false });
  const here = await t.signIn('rina@example.test', TEMP);
  const there = await t.signIn('rina@example.test', TEMP);
  const session = await (await t.request('/api/auth/get-session', { cookie: here.cookie })).json();
  assert.equal(session.user.passwordSetBy, 'admin');
  assert.equal(session.user.email, 'rina@example.test');

  assert.equal((await t.post('/api/auth/update-user', { name: '  Rina Baru ' }, { cookie: here.cookie })).status, 200);
  assert.equal(t.rows('SELECT name FROM "user" WHERE id = ?', id)[0].name, 'Rina Baru');

  assert.equal(sessionsOf(id), 2);
  const revoked = await t.post('/api/auth/revoke-other-sessions', {}, { cookie: here.cookie });
  assert.equal(revoked.status, 200);
  assert.equal(sessionsOf(id), 1);
  t.state.resolver.forget();
  assert.equal((await t.request('/api/log', { cookie: here.cookie })).status, 299, 'this device stays in');
  assert.equal((await t.request('/api/log', { cookie: there.cookie })).status, 401, 'the other is out');

  assert.equal((await t.post('/api/auth/sign-out', {}, { cookie: here.cookie })).status, 200);
  assert.equal(sessionsOf(id), 0);
});

test('CLI super_admin keeps passwordSetBy=cli after a self change (password section stays, Google link stays possible)', async () => {
  const { cookie } = await t.signIn('owner@example.test', 'owner-test-password-1234');
  const res = await t.post('/api/auth/change-password', { currentPassword: 'owner-test-password-1234', newPassword: 'owner-new-password-5678' }, { cookie });
  assert.equal(res.status, 200);
  assert.equal(t.rows('SELECT passwordSetBy FROM "user" WHERE email = ?', 'owner@example.test')[0].passwordSetBy, 'cli');
});
