import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { ACTOR_CACHE_MS } from './actorResolver.mjs';
import { OWNER_EMAIL, OWNER_PASSWORD, actorFor, signInOwner, startAuthTestServer } from './__fixtures__/authTestServer.mjs';

let t;
let owner;
const PASSWORD = 'correct-horse-battery'; // test-only

before(async () => {
  t = await startAuthTestServer();
  owner = await actorFor(t, await signInOwner(t));
});
after(() => t.close());

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function makeUser(email, { mustChange = false } = {}) {
  const created = await t.state.services.accounts.createUser(owner, { email, name: 'Budi', password: PASSWORD });
  assert.equal(created.ok, true, created.code);
  if (!mustChange) await (await t.state.auth.$context).internalAdapter.updateUser(created.user.id, { mustChangePassword: false });
  return created.user.id;
}
const userRow = (id) => t.rows('SELECT failedLoginCount, throttleUntil, mustChangePassword, passwordSetBy, banned FROM "user" WHERE id = ?', id)[0];
const logFor = (id) => t.rows('SELECT success, reason, method FROM login_log WHERE userId = ? ORDER BY createdAt', id);

test('password sign-in: success sets gev.session_token; wrong password and unknown email look identical', async () => {
  const id = await makeUser('budi@example.test');
  const ok = await t.signIn('budi@example.test', PASSWORD);
  assert.equal(ok.res.status, 200);
  assert.ok(ok.cookie, 'session cookie set');
  const wrong = await t.signIn('budi@example.test', 'not-the-password!!');
  const unknown = await t.signIn('nobody@example.test', 'not-the-password!!');
  assert.equal(wrong.res.status, 401);
  assert.equal(unknown.res.status, 401);
  assert.deepEqual(await wrong.res.json(), await unknown.res.json());
  assert.deepEqual(logFor(id).map((row) => [row.success, row.reason, row.method]), [[1, null, 'password'], [0, 'bad_credentials', 'password']]);
  assert.equal(t.rows("SELECT COUNT(*) AS n FROM login_log WHERE userId IS NULL AND emailHash IS NOT NULL AND reason = 'bad_credentials'")[0].n, 1, 'unknown email stored as hash only');
  assert.equal(t.rows("SELECT COUNT(*) AS n FROM login_log WHERE emailHash LIKE '%@%'")[0].n, 0);
});

test('throttle: 5 failures → even the right password is refused generically; it expires by itself; success resets', async () => {
  const id = await makeUser('throttle@example.test');
  for (let i = 0; i < 5; i += 1) assert.equal((await t.signIn('throttle@example.test', `wrong-password-${i}`)).res.status, 401);
  assert.equal(userRow(id).failedLoginCount, 5);
  assert.ok(Date.parse(userRow(id).throttleUntil) > Date.now());
  const blocked = await t.signIn('throttle@example.test', PASSWORD);
  assert.equal(blocked.res.status, 401);
  assert.equal((await blocked.res.json()).code, 'INVALID_EMAIL_OR_PASSWORD');
  assert.equal(blocked.cookie, undefined);
  assert.equal(logFor(id).at(-1).reason, 'throttled');
  assert.equal(userRow(id).failedLoginCount, 5, 'attempts while throttled do not extend the delay');
  // Let the delay run out (as if a minute had passed).
  t.state.db.prepare('UPDATE "user" SET throttleUntil = ? WHERE id = ?').run(new Date(Date.now() - 1000).toISOString(), id);
  assert.equal((await t.signIn('throttle@example.test', PASSWORD)).res.status, 200);
  assert.deepEqual([userRow(id).failedLoginCount, userRow(id).throttleUntil], [0, null]);
});

test('throttle counter is atomic: 10 concurrent wrong passwords count 10', async () => {
  const id = await makeUser('race@example.test');
  await Promise.all(Array.from({ length: 10 }, (_, i) => t.signIn('race@example.test', `wrong-password-${i}`)));
  assert.equal(userRow(id).failedLoginCount, 10);
});

test('unknown emails are throttled too (no existence oracle)', async () => {
  for (let i = 0; i < 5; i += 1) await t.signIn('ghost@example.test', `wrong-password-${i}`);
  assert.equal(t.rows('SELECT MAX(failedCount) AS n FROM login_throttle')[0].n, 5);
  assert.equal((await t.signIn('ghost@example.test', 'anything-at-all')).res.status, 401);
  assert.equal(t.rows("SELECT COUNT(*) AS n FROM login_log WHERE reason = 'throttled' AND userId IS NULL")[0].n, 1);
});

test('Better Auth IP rate limit is on (database storage) and logged as rate_limited', async () => {
  const ip = '203.0.113.77';
  const statuses = [];
  for (let i = 0; i < 4; i += 1) statuses.push((await t.signIn('rl@example.test', 'whatever-password', { ip })).res.status);
  assert.deepEqual(statuses, [401, 401, 401, 429]);
  await sleep(50);
  assert.equal(t.rows("SELECT COUNT(*) AS n FROM login_log WHERE reason = 'rate_limited'")[0].n, 1);
  assert.ok(t.rows('SELECT COUNT(*) AS n FROM rateLimit')[0].n >= 1);
});

test('deactivated account: password correct → "Akun dinonaktifkan"; an open session dies within the cache window', async () => {
  const id = await makeUser('gone@example.test');
  const { cookie } = await t.signIn('gone@example.test', PASSWORD);
  assert.equal((await t.request('/api/log', { cookie })).status, 299);
  assert.equal((await t.state.services.accounts.deactivate(owner, id)).ok, true);
  await sleep(ACTOR_CACHE_MS + 100);
  assert.equal((await t.request('/api/log', { cookie })).status, 401);
  const again = await t.signIn('gone@example.test', PASSWORD);
  assert.equal(again.res.status, 403);
  assert.deepEqual(await again.res.json(), { code: 'ACCOUNT_DISABLED', message: 'Akun dinonaktifkan, hubungi admin' });
  assert.equal((await t.signIn('gone@example.test', 'wrong-password!!')).res.status, 401, 'a wrong password never reveals the state');
});

test('admin reset → sessions dead, mustChangePassword pins pages and APIs until the change; change clears it', async () => {
  const id = await makeUser('reset@example.test');
  const old = await t.signIn('reset@example.test', PASSWORD);
  const reset = await t.state.services.accounts.setPassword(owner, id, { generate: true });
  assert.equal(reset.ok, true);
  assert.equal(reset.tempPassword.length, 20);
  t.state.resolver.forget();
  assert.equal((await t.request('/api/log', { cookie: old.cookie })).status, 401);
  const fresh = await t.signIn('reset@example.test', reset.tempPassword);
  assert.equal((await t.request('/app', { cookie: fresh.cookie })).headers.get('location'), '/account/password');
  assert.equal((await (await t.request('/api/log', { cookie: fresh.cookie })).json()).error, 'PASSWORD_CHANGE_REQUIRED');
  assert.equal((await t.post('/api/auth/update-user', { name: 'X' }, { cookie: fresh.cookie })).status, 403);
  assert.equal((await (await t.request('/api/me', { cookie: fresh.cookie })).json()).user.mustChangePassword, true);
  const weak = await t.post('/api/auth/change-password', { currentPassword: reset.tempPassword, newPassword: 'short' }, { cookie: fresh.cookie });
  assert.equal((await weak.json()).code, 'PASSWORD_WEAK');
  const changed = await t.post('/api/auth/change-password', { currentPassword: reset.tempPassword, newPassword: 'my own long password', revokeOtherSessions: false }, { cookie: fresh.cookie });
  assert.equal(changed.status, 200);
  assert.deepEqual([userRow(id).mustChangePassword, userRow(id).passwordSetBy], [0, 'self']);
  assert.equal(t.rows('SELECT COUNT(*) AS n FROM session WHERE userId = ?', id)[0].n, 1, 'revokeOtherSessions forced: only the new session remains');
});

test('update-user accepts a name only', async () => {
  await makeUser('name@example.test');
  const { cookie } = await t.signIn('name@example.test', PASSWORD);
  assert.equal((await t.post('/api/auth/update-user', { name: '  Budi Baru ' }, { cookie })).status, 200);
  assert.equal((await (await t.request('/api/me', { cookie })).json()).user.name, 'Budi Baru');
  for (const body of [{ name: 'x', image: 'http://e/x.png' }, { role: 'super_admin' }, { name: 'x'.repeat(81) }, { name: '' }]) {
    const res = await t.post('/api/auth/update-user', body, { cookie });
    assert.equal(res.status, 400, JSON.stringify(body));
  }
});

test('env email: CLI password → super_admin; an admin-set password for an env email is refused ("masuk lewat Google")', async () => {
  const me = await (await t.request('/api/me', { cookie: (await t.signIn(OWNER_EMAIL, OWNER_PASSWORD)).cookie })).json();
  assert.equal(me.user.role, 'super_admin');
  const ctx = await t.state.auth.$context;
  // Simulate the escalation path: the owner's password reset by an admin (passwordSetBy 'admin').
  await ctx.adapter.update({ model: 'user', where: [{ field: 'email', value: OWNER_EMAIL }], update: { passwordSetBy: 'admin' } });
  const refused = await t.signIn(OWNER_EMAIL, OWNER_PASSWORD);
  assert.equal(refused.res.status, 403);
  assert.deepEqual(await refused.res.json(), { code: 'GOOGLE_SIGN_IN_REQUIRED', message: 'Akun ini masuk lewat Google' });
  await t.state.services.bootstrap.setSuperAdminPassword(OWNER_EMAIL, OWNER_PASSWORD);
});
