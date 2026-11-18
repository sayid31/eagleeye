import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createActorResolver } from './actorResolver.mjs';
import { mintSessionCookie } from './authSessionMint.mjs';
import { actorFor, signInOwner, startAuthTestServer } from './__fixtures__/authTestServer.mjs';

let t;
let owner;
let admin;
let accounts;
const PASSWORD = 'fixture-password-long-1'; // test-only

before(async () => {
  t = await startAuthTestServer();
  accounts = t.state.services.accounts;
  owner = await actorFor(t, await signInOwner(t));
  const created = await accounts.createUser(owner, { email: 'admin@example.test', name: 'Admin', role: 'admin', password: PASSWORD });
  admin = { user: { id: created.user.id, email: 'admin@example.test' }, role: 'admin' };
});
after(() => t.close());

const audits = (action) => t.rows('SELECT actorId, action, targetId, targetEmailMasked, meta FROM audit_log WHERE action = ?', action);

test('createUser: admin makes users only; super_admin users and admins; env emails reserved; duplicates refused', async () => {
  assert.equal((await accounts.createUser(admin, { email: 'a2@example.test', name: 'A2', role: 'admin', password: PASSWORD })).code, 'ROLE_NOT_ASSIGNABLE');
  assert.equal((await accounts.createUser(admin, { email: 'owner@example.test', name: 'X', password: PASSWORD })).code, 'SUPER_ADMIN_EMAIL_RESERVED');
  assert.equal((await accounts.createUser(admin, { email: 'u@example.test', name: 'U', password: 'too-short' })).code, 'PASSWORD_WEAK');
  assert.equal((await accounts.createUser(owner, { email: 'a3@example.test', name: 'A3', role: 'admin', password: 'fourteen-chars' })).code, 'PASSWORD_WEAK', 'admin needs 15');
  const made = await accounts.createUser(admin, { email: ' New.User@Example.test ', name: 'Baru', generate: true });
  assert.equal(made.ok, true);
  assert.equal(made.user.email, 'new.user@example.test');
  assert.deepEqual([made.user.role, made.user.mustChangePassword, made.user.capabilities], ['user', true, { layers: true, ai: true, premium: false }]);
  assert.equal(typeof made.tempPassword, 'string');
  assert.equal(made.audit, 'written');
  assert.equal((await accounts.createUser(admin, { email: 'new.user@example.test', name: 'Dup', password: PASSWORD })).code, 'EMAIL_TAKEN');
  const row = audits('user.create').find((entry) => entry.targetId === made.user.id);
  assert.equal(row.targetEmailMasked, 'n***@example.test');
  assert.doesNotMatch(JSON.stringify(audits('user.create')), new RegExp(made.tempPassword), 'temp password never in audit');
  assert.equal(t.rows("SELECT COUNT(*) AS n FROM account WHERE providerId = 'credential' AND userId = ?", made.user.id)[0].n, 1, 'credential row created with the user');
});

test('admin acting on an admin or super_admin is refused; on itself too', async () => {
  const other = await accounts.createUser(owner, { email: 'admin2@example.test', name: 'Admin 2', role: 'admin', password: PASSWORD });
  assert.equal((await accounts.deactivate(admin, other.user.id)).code, 'TARGET_FORBIDDEN');
  assert.equal((await accounts.setPassword(admin, other.user.id, { generate: true })).code, 'TARGET_FORBIDDEN');
  assert.equal((await accounts.deleteUser(admin, owner.user.id, { confirmEmail: 'owner@example.test' })).code, 'TARGET_IS_SUPER_ADMIN');
  assert.deepEqual(await accounts.deactivate(admin, admin.user.id), { ok: false, status: 400, code: 'CANNOT_ACT_ON_SELF' });
  assert.equal((await accounts.revokeSessions(admin, admin.user.id)).ok, true, 'signing yourself out everywhere is allowed');
  assert.equal((await accounts.getUser(admin, other.user.id)).code, 'TARGET_FORBIDDEN');
  assert.equal((await accounts.deactivate(owner, 'no-such-id')).code, 'NOT_FOUND');
});

test('listUsers: admins see users only, super_admin sees everyone; filters and paging clamp', async () => {
  const asAdmin = await accounts.listUsers(admin, { limit: 500 });
  assert.equal(asAdmin.limit, 100);
  assert.ok(asAdmin.users.length > 0 && asAdmin.users.every((user) => user.role === 'user'));
  const asOwner = await accounts.listUsers(owner, {});
  assert.deepEqual(new Set(asOwner.users.map((user) => user.role)), new Set(['user', 'admin', 'super_admin']));
  assert.equal(asOwner.total, asOwner.users.length);
  const found = await accounts.listUsers(owner, { q: 'NEW.USER' });
  assert.deepEqual(found.users.map((user) => user.email), ['new.user@example.test']);
  assert.equal((await accounts.listUsers(admin, { role: 'admin' })).users.length, 0);
  assert.equal((await accounts.listUsers({ user: { id: 'x' }, role: 'user' })).code, 'ADMIN_REQUIRED');
  assert.ok(!JSON.stringify(asOwner).includes('password'), 'no hash in the public shape');
});

test('updateUser: name/email/capabilities with per-field checks; email change revokes sessions', async () => {
  const made = await accounts.createUser(admin, { email: 'edit@example.test', name: 'Edit', password: PASSWORD });
  const minted = await mintSessionCookie(t.state.auth, { email: 'edit@example.test' });
  const updated = await accounts.updateUser(admin, made.user.id, { name: 'Edited', email: 'edited@example.test', capabilities: { premium: true } });
  assert.equal(updated.ok, true);
  assert.deepEqual([updated.user.name, updated.user.email, updated.user.capabilities], ['Edited', 'edited@example.test', { layers: false, ai: false, premium: true }]);
  assert.equal(t.rows('SELECT COUNT(*) AS n FROM session WHERE token = ?', minted.token)[0].n, 0);
  assert.equal((await accounts.updateUser(admin, made.user.id, { email: 'owner@example.test' })).code, 'SUPER_ADMIN_EMAIL_RESERVED');
  assert.equal((await accounts.updateUser(admin, admin.user.id, { name: 'Me' })).ok, true, 'own name');
  assert.equal((await accounts.updateUser(admin, admin.user.id, { email: 'me@example.test' })).code, 'CANNOT_ACT_ON_SELF');
  assert.equal((await accounts.updateUser(admin, made.user.id, {})).code, 'INVALID_INPUT');
});

test('setRole: super_admin only, re-authenticated by password; failed re-auth counts toward the throttle', async () => {
  const made = await accounts.createUser(owner, { email: 'promote@example.test', name: 'P', password: PASSWORD });
  assert.equal((await accounts.setRole(admin, made.user.id, { role: 'admin', currentPassword: PASSWORD })).code, 'TARGET_FORBIDDEN');
  assert.equal((await accounts.setRole(owner, made.user.id, { role: 'super_admin', currentPassword: 'x' })).code, 'ROLE_NOT_ASSIGNABLE');
  const failures = () => t.rows('SELECT failedLoginCount AS n FROM "user" WHERE id = ?', owner.user.id)[0].n;
  const before = failures();
  assert.equal((await accounts.setRole(owner, made.user.id, { role: 'admin', currentPassword: 'wrong-password' })).code, 'REAUTH_FAILED');
  assert.equal(failures(), before + 1);
  const promoted = await accounts.setRole(owner, made.user.id, { role: 'admin', currentPassword: 'owner-test-password-1234' });
  assert.deepEqual([promoted.ok, promoted.user.role, promoted.user.mustChangePassword], [true, 'admin', true]);
  assert.equal(audits('role.set').at(-1).targetId, made.user.id);
});

test('deleteUser = tombstone: PII scrubbed, sign-in methods gone, logs kept, email free again', async () => {
  const made = await accounts.createUser(admin, { email: 'bye@example.test', name: 'Bye', password: PASSWORD });
  await t.signIn('bye@example.test', PASSWORD);
  const logsBefore = t.rows('SELECT COUNT(*) AS n FROM login_log WHERE userId = ?', made.user.id)[0].n;
  assert.equal((await accounts.deleteUser(admin, made.user.id, { confirmEmail: 'wrong@example.test' })).code, 'CONFIRM_EMAIL_MISMATCH');
  assert.equal((await accounts.deleteUser(admin, made.user.id, { confirmEmail: 'BYE@example.test' })).ok, true);
  const row = t.rows('SELECT name, email, banned, deletedAt FROM "user" WHERE id = ?', made.user.id)[0];
  assert.equal(row.name, 'Deleted user');
  assert.match(row.email, /^deleted\+.+@deleted\.invalid$/);
  assert.equal(row.banned, 1);
  assert.ok(row.deletedAt);
  assert.equal(t.rows('SELECT COUNT(*) AS n FROM account WHERE userId = ?', made.user.id)[0].n, 0);
  assert.equal(t.rows('SELECT COUNT(*) AS n FROM login_log WHERE userId = ?', made.user.id)[0].n, logsBefore);
  assert.equal(audits('user.delete').at(-1).targetEmailMasked, 'b***@example.test');
  assert.equal((await accounts.getUser(owner, made.user.id)).code, 'NOT_FOUND', 'tombstones are hidden');
  assert.equal((await t.signIn('bye@example.test', PASSWORD)).res.status, 401);
  assert.equal((await accounts.createUser(admin, { email: 'bye@example.test', name: 'Again', password: PASSWORD })).ok, true);
});

test('reconcile: an env email without Google or CLI password is NOT promoted (audited once); removal from env demotes + revokes', async () => {
  const made = await accounts.createUser(admin, { email: 'later-env@example.test', name: 'L', password: PASSWORD });
  const minted = await mintSessionCookie(t.state.auth, { email: 'later-env@example.test' });
  const resolver = createActorResolver({ auth: t.state.auth, superAdminEmails: ['owner@example.test', 'later-env@example.test'], audit: t.state.services.audit });
  const actor = await resolver.resolveActor({ headers: { cookie: minted.cookie } });
  assert.equal(actor.role, 'user');
  await resolver.resolveFresh({ headers: { cookie: minted.cookie } });
  assert.equal(audits('role.reconcile.blocked').filter((row) => row.targetId === made.user.id).length, 1);

  const former = await mintSessionCookie(t.state.auth, { email: 'former@example.test', role: 'super_admin', passwordSetBy: 'cli' });
  const demoting = createActorResolver({ auth: t.state.auth, superAdminEmails: ['owner@example.test'], audit: t.state.services.audit });
  assert.equal(await demoting.resolveActor({ headers: { cookie: former.cookie } }), null, 'demoted: every session revoked');
  assert.equal(t.rows("SELECT role FROM \"user\" WHERE email = 'former@example.test'")[0].role, 'user');
  assert.equal(audits('role.reconcile').at(-1).targetId, former.userId);
});

test('CLI bootstrap: only env emails; unlock clears the throttle', async () => {
  const { bootstrap } = t.state.services;
  assert.equal((await bootstrap.setSuperAdminPassword('someone@example.test', 'a-long-enough-password')).code, 'NOT_A_SUPER_ADMIN_EMAIL');
  assert.equal((await bootstrap.setSuperAdminPassword('owner@example.test', 'short')).code, 'PASSWORD_WEAK');
  for (let i = 0; i < 5; i += 1) await t.signIn('admin@example.test', `wrong-${i}-password`);
  assert.ok(t.rows('SELECT throttleUntil FROM "user" WHERE id = ?', admin.user.id)[0].throttleUntil);
  assert.deepEqual((await bootstrap.unlock('Admin@Example.test')).found, true);
  assert.deepEqual(t.rows('SELECT failedLoginCount, throttleUntil FROM "user" WHERE id = ?', admin.user.id)[0], { failedLoginCount: 0, throttleUntil: null });
  assert.equal(audits('auth.unlock').length, 1);
  assert.ok(audits('bootstrap.super_admin').length >= 1);
});
