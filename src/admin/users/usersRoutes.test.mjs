import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { OWNER_EMAIL, OWNER_PASSWORD, STAFF_PASSWORD, signInOwner, startUsersTestServer } from './__fixtures__/usersTestServer.mjs';

let t;
let owner;
let ownerId;
let admin;
let otherAdmin;
let user;

before(async () => {
  t = await startUsersTestServer();
  owner = await signInOwner(t);
  ownerId = t.rows('SELECT id FROM "user" WHERE email = ?', OWNER_EMAIL)[0].id;
  admin = await t.makeStaff(owner, 'admin@example.test', 'admin');
  otherAdmin = await t.makeStaff(owner, 'admin2@example.test', 'admin');
  user = await t.makeStaff(admin.cookie, 'user@example.test', 'user');
});
after(() => t.close());

const sessionsOf = (id) => t.rows('SELECT COUNT(*) AS n FROM session WHERE userId = ?', id)[0].n;

test('anonymous → 401, user → 403 ADMIN_REQUIRED on every route; admin → 403 SUPER_ADMIN_REQUIRED on /role', async () => {
  const routes = [
    ['GET', '/api/admin/users'], ['GET', '/api/admin/users/stats'], ['POST', '/api/admin/users'], ['GET', `/api/admin/users/${user.id}`],
    ['PATCH', `/api/admin/users/${user.id}`], ['DELETE', `/api/admin/users/${user.id}`], ['POST', `/api/admin/users/${user.id}/deactivate`],
    ['POST', `/api/admin/users/${user.id}/activate`], ['POST', `/api/admin/users/${user.id}/password`],
    ['POST', `/api/admin/users/${user.id}/sessions/revoke`], ['POST', `/api/admin/users/${user.id}/role`],
    ['GET', '/api/admin/login-log'], ['GET', '/api/admin/audit'],
  ];
  for (const [method, url] of routes) {
    assert.equal((await t.call(method, url))[0], 401, `${method} ${url} anonymous`);
    const [status, body] = await t.call(method, url, user.cookie);
    assert.deepEqual([status, body.error], [403, 'ADMIN_REQUIRED'], `${method} ${url} as user`);
  }
  const [status, body] = await t.call('POST', `/api/admin/users/${user.id}/role`, admin.cookie, { role: 'admin', currentPassword: STAFF_PASSWORD });
  assert.deepEqual([status, body.error], [403, 'SUPER_ADMIN_REQUIRED']);
  assert.equal(body.message, 'Only super admins can do this.');
});

test('unknown sub-path 404, wrong method 405, malformed JSON 400, oversized body 413', async () => {
  assert.equal((await t.call('GET', '/api/admin/users/abc/nope', owner))[0], 404);
  assert.equal((await t.call('PUT', '/api/admin/users/stats', owner))[0], 405);
  assert.equal((await t.call('POST', '/api/admin/login-log', owner))[0], 405);
  const bad = await t.request('/api/admin/users', { method: 'POST', cookie: owner, body: '{"email":' });
  assert.deepEqual([bad.status, (await bad.json()).error], [400, 'INVALID_JSON']);
  const huge = await t.request('/api/admin/users', { method: 'POST', cookie: owner, body: JSON.stringify({ name: 'x'.repeat(20000) }) });
  assert.equal(huge.status, 413);
});

test('POST /users: defaults, one-time temp password, role rules, reserved email, weak password, duplicates', async () => {
  const [status, made] = await t.call('POST', '/api/admin/users', admin.cookie, { email: ' Baru@Example.test ', name: 'Baru', generate: true });
  assert.equal(status, 201);
  assert.deepEqual([made.user.email, made.user.role, made.user.mustChangePassword, made.user.active], ['baru@example.test', 'user', true, true]);
  assert.deepEqual(made.user.capabilities, { layers: true, ai: true, premium: false }, 'owner default toggles');
  assert.match(made.tempPassword, /^[A-Za-z0-9]{20}$/);
  assert.equal(JSON.stringify(t.rows('SELECT * FROM audit_log')).includes(made.tempPassword), false, 'temp password never stored in audit');
  const [, again] = await t.call('GET', `/api/admin/users/${made.user.id}`, admin.cookie);
  assert.equal(again.tempPassword, undefined, 'shown once');

  const cases = [
    [admin.cookie, { email: 'a3@example.test', name: 'A3', role: 'admin', password: STAFF_PASSWORD }, 403, 'ROLE_NOT_ASSIGNABLE'],
    [owner, { email: 'x@example.test', name: 'X', role: 'super_admin', password: STAFF_PASSWORD }, 403, 'ROLE_NOT_ASSIGNABLE'],
    [admin.cookie, { email: OWNER_EMAIL.toUpperCase(), name: 'X', password: STAFF_PASSWORD }, 409, 'SUPER_ADMIN_EMAIL_RESERVED'],
    [admin.cookie, { email: 'baru@example.test', name: 'Dup', password: STAFF_PASSWORD }, 409, 'EMAIL_TAKEN'],
    [admin.cookie, { email: 'w@example.test', name: 'W', password: 'short-pw' }, 400, 'PASSWORD_WEAK'],
    [owner, { email: 'w2@example.test', name: 'W2', role: 'admin', password: 'fourteen-chars' }, 400, 'PASSWORD_WEAK'],
    [admin.cookie, { email: 'not-an-email', name: 'N', password: STAFF_PASSWORD }, 400, 'INVALID_INPUT'],
    [admin.cookie, { email: 'g@example.test', name: 'G', password: STAFF_PASSWORD, generate: true }, 400, 'INVALID_INPUT'],
    [admin.cookie, { email: 'c@example.test', name: 'C', password: STAFF_PASSWORD, capabilities: { layers: 'yes' } }, 400, 'INVALID_INPUT'],
    [admin.cookie, { email: 'e@example.test', name: '   ', password: STAFF_PASSWORD }, 400, 'INVALID_INPUT'],
  ];
  for (const [cookie, body, wantStatus, wantCode] of cases) {
    const [got, reply] = await t.call('POST', '/api/admin/users', cookie, body);
    assert.deepEqual([got, reply.error], [wantStatus, wantCode], JSON.stringify(body));
    assert.equal(typeof reply.message, 'string');
  }
  const [, weak] = await t.call('POST', '/api/admin/users', admin.cookie, { email: 'w@example.test', name: 'W', password: 'short-pw' });
  assert.deepEqual([weak.reason, weak.min, weak.message], ['too_short', 12, 'Password must be at least 12 characters.']);
  const [, typed] = await t.call('POST', '/api/admin/users', owner, { email: 'admin3@example.test', name: 'A3', role: 'admin', password: STAFF_PASSWORD, capabilities: { premium: true } });
  assert.equal(typed.tempPassword, undefined, 'a typed password is not echoed back');
  assert.equal(typed.user.role, 'admin');
});

test('GET /users: admin sees users only, super_admin everyone; filters; paging clamps (20 default, 100 max)', async () => {
  const [, asAdmin] = await t.call('GET', '/api/admin/users', admin.cookie);
  assert.ok(asAdmin.users.length > 0 && asAdmin.users.every((row) => row.role === 'user'));
  assert.deepEqual([asAdmin.limit, asAdmin.offset], [20, 0]);
  const [, asOwner] = await t.call('GET', '/api/admin/users', owner);
  assert.deepEqual(new Set(asOwner.users.map((row) => row.role)), new Set(['user', 'admin', 'super_admin']));
  assert.equal((await t.call('GET', '/api/admin/users?role=admin', admin.cookie))[1].total, 0, 'admins never listed for an admin');
  assert.equal((await t.call('GET', '/api/admin/users?limit=500', owner))[1].limit, 100);
  assert.equal((await t.call('GET', '/api/admin/users?limit=0&offset=-5', owner))[1].limit, 20);
  const [, firstPage] = await t.call('GET', '/api/admin/users?limit=2', owner);
  const [, secondPage] = await t.call('GET', '/api/admin/users?limit=2&offset=2', owner);
  assert.equal(firstPage.users.length, 2);
  assert.equal(firstPage.total, secondPage.total);
  assert.equal(firstPage.users.some((row) => secondPage.users.some((other) => other.id === row.id)), false, 'pages do not overlap');
  const [, beyond] = await t.call('GET', '/api/admin/users?offset=9999', owner);
  assert.deepEqual([beyond.users.length, beyond.total > 0], [0, true]);
  assert.deepEqual((await t.call('GET', '/api/admin/users?q=USER@example', admin.cookie))[1].users.map((row) => row.email), ['user@example.test']);
  const [badStatus, bad] = await t.call('GET', '/api/admin/users?status=weird', admin.cookie);
  assert.deepEqual([badStatus, bad.error, bad.field], [400, 'INVALID_INPUT', 'status']);
  assert.equal((await t.call('GET', `/api/admin/users?q=${'x'.repeat(101)}`, admin.cookie))[0], 400);
  assert.ok(!JSON.stringify(asOwner).includes('password'), 'no hash or password field in the list');
});

test('admin on an admin or super_admin target → 403; anyone on itself → 400 CANNOT_ACT_ON_SELF', async () => {
  for (const [method, suffix, body] of [
    ['GET', '', undefined], ['PATCH', '', { name: 'X' }], ['POST', '/deactivate'], ['POST', '/activate'], ['POST', '/password', { generate: true }],
    ['POST', '/sessions/revoke'], ['DELETE', '', { confirmEmail: 'admin2@example.test' }],
  ]) {
    const [status, reply] = await t.call(method, `/api/admin/users/${otherAdmin.id}${suffix}`, admin.cookie, body);
    assert.deepEqual([status, reply.error], [403, 'TARGET_FORBIDDEN'], `${method} ${suffix} on admin`);
  }
  const [superStatus, superReply] = await t.call('POST', `/api/admin/users/${ownerId}/deactivate`, admin.cookie);
  assert.deepEqual([superStatus, superReply.error], [403, 'TARGET_IS_SUPER_ADMIN']);
  for (const [cookie, id] of [[admin.cookie, admin.id], [owner, ownerId]]) {
    const [status, reply] = await t.call('POST', `/api/admin/users/${id}/deactivate`, cookie);
    assert.deepEqual([status, reply.error], [400, 'CANNOT_ACT_ON_SELF']);
  }
  assert.deepEqual((await t.call('DELETE', `/api/admin/users/${ownerId}`, owner, { confirmEmail: OWNER_EMAIL }))[0], 400);
  assert.equal((await t.call('GET', '/api/admin/users/does-not-exist', owner))[0], 404);
});

test('PATCH: name/email/toggles; email change signs the account out; toggles need all three keys', async () => {
  const target = await t.makeStaff(admin.cookie, 'edit@example.test');
  assert.equal(sessionsOf(target.id), 1);
  const [status, reply] = await t.call('PATCH', `/api/admin/users/${target.id}`, admin.cookie, { name: 'Diedit', email: 'edited@example.test', capabilities: { layers: false, ai: true, premium: true } });
  assert.equal(status, 200);
  assert.deepEqual([reply.user.name, reply.user.email, reply.user.capabilities], ['Diedit', 'edited@example.test', { layers: false, ai: true, premium: true }]);
  assert.equal(sessionsOf(target.id), 0, 'email change revokes sessions');
  assert.equal((await t.call('PATCH', `/api/admin/users/${target.id}`, admin.cookie, { capabilities: { premium: true } }))[1].field, 'capabilities');
  assert.equal((await t.call('PATCH', `/api/admin/users/${target.id}`, admin.cookie, {}))[0], 400);
  assert.equal((await t.call('PATCH', `/api/admin/users/${target.id}`, admin.cookie, { email: OWNER_EMAIL }))[1].error, 'SUPER_ADMIN_EMAIL_RESERVED');
});

test('deactivate signs out and blocks sign-in; activate restores; revoke sessions; password reset', async () => {
  const target = await t.makeStaff(admin.cookie, 'cycle@example.test');
  assert.equal((await t.call('POST', `/api/admin/users/${target.id}/deactivate`, admin.cookie))[0], 200);
  assert.equal(sessionsOf(target.id), 0);
  assert.equal(await t.signIn('cycle@example.test', STAFF_PASSWORD), undefined, 'deactivated account cannot sign in');
  assert.equal((await t.call('GET', '/api/admin/users?status=inactive', admin.cookie))[1].users.some((row) => row.id === target.id), true);
  assert.equal((await t.call('POST', `/api/admin/users/${target.id}/activate`, admin.cookie))[0], 200);
  assert.ok(await t.signIn('cycle@example.test', STAFF_PASSWORD));
  assert.equal((await t.call('POST', `/api/admin/users/${target.id}/sessions/revoke`, admin.cookie))[0], 200);
  assert.equal(sessionsOf(target.id), 0);

  await t.signIn('cycle@example.test', STAFF_PASSWORD);
  const [weakStatus, weak] = await t.call('POST', `/api/admin/users/${target.id}/password`, admin.cookie, { password: 'tiny' });
  assert.deepEqual([weakStatus, weak.error], [400, 'PASSWORD_WEAK']);
  const [, reset] = await t.call('POST', `/api/admin/users/${target.id}/password`, admin.cookie, { generate: true });
  assert.equal(typeof reset.tempPassword, 'string');
  assert.equal(sessionsOf(target.id), 0, 'reset revokes sessions');
  const row = t.rows('SELECT mustChangePassword, passwordSetBy FROM "user" WHERE id = ?', target.id)[0];
  assert.deepEqual(row, { mustChangePassword: 1, passwordSetBy: 'admin' });
  assert.ok(await t.signIn('cycle@example.test', reset.tempPassword), 'temp password works');
  assert.equal((await t.call('POST', `/api/admin/users/${target.id}/password`, admin.cookie, {}))[1].field, 'password');
});

test('DELETE: confirm mismatch 400; tombstone hides the account and keeps its login_log rows', async () => {
  const target = await t.makeStaff(admin.cookie, 'bye@example.test');
  const logsBefore = t.rows('SELECT COUNT(*) AS n FROM login_log WHERE userId = ?', target.id)[0].n;
  assert.ok(logsBefore >= 1);
  const [status, reply] = await t.call('DELETE', `/api/admin/users/${target.id}`, admin.cookie, { confirmEmail: 'other@example.test' });
  assert.deepEqual([status, reply.error], [400, 'CONFIRM_EMAIL_MISMATCH']);
  assert.equal((await t.call('DELETE', `/api/admin/users/${target.id}`, admin.cookie, {}))[1].field, 'confirmEmail');
  assert.equal((await t.call('DELETE', `/api/admin/users/${target.id}`, admin.cookie, { confirmEmail: 'BYE@example.test' }))[0], 200);
  assert.equal(t.rows('SELECT COUNT(*) AS n FROM login_log WHERE userId = ?', target.id)[0].n, logsBefore);
  assert.equal((await t.call('GET', `/api/admin/users/${target.id}`, admin.cookie))[0], 404);
  assert.equal((await t.call('GET', '/api/admin/users?q=bye', owner))[1].total, 0);
  const [, log] = await t.call('GET', `/api/admin/login-log?userId=${target.id}`, admin.cookie);
  assert.equal(log.total, logsBefore, 'admin still sees the deleted user\'s sign-ins');
  assert.deepEqual([log.entries[0].userDeleted, log.entries[0].userName], [true, 'Deleted user']);
});

test('POST /:id/role: super_admin + re-auth; promotion forces a password change; super targets refused', async () => {
  const target = await t.makeStaff(admin.cookie, 'promote@example.test');
  const failures = () => t.rows('SELECT failedLoginCount AS n FROM "user" WHERE id = ?', ownerId)[0].n;
  const before = failures();
  const [wrongStatus, wrong] = await t.call('POST', `/api/admin/users/${target.id}/role`, owner, { role: 'admin', currentPassword: 'wrong-password-123' });
  assert.deepEqual([wrongStatus, wrong.error], [403, 'REAUTH_FAILED']);
  assert.equal(failures(), before + 1, 'failed re-auth counts toward the throttle');
  assert.equal((await t.call('POST', `/api/admin/users/${target.id}/role`, owner, { role: 'admin' }))[1].error, 'REAUTH_FAILED', 'a password account must confirm');
  assert.equal((await t.call('POST', `/api/admin/users/${target.id}/role`, owner, { role: 'super_admin', currentPassword: OWNER_PASSWORD }))[1].error, 'ROLE_NOT_ASSIGNABLE');
  assert.equal((await t.call('POST', `/api/admin/users/${ownerId}/role`, owner, { role: 'admin', currentPassword: OWNER_PASSWORD }))[0], 400, 'self');
  const [status, promoted] = await t.call('POST', `/api/admin/users/${target.id}/role`, owner, { role: 'admin', currentPassword: OWNER_PASSWORD });
  assert.equal(status, 200);
  assert.deepEqual([promoted.user.role, promoted.user.mustChangePassword], ['admin', true]);
  assert.equal(sessionsOf(target.id), 0, 'role change revokes sessions');
  const [, demoted] = await t.call('POST', `/api/admin/users/${target.id}/role`, owner, { role: 'user', currentPassword: OWNER_PASSWORD });
  assert.equal(demoted.user.role, 'user');
});

test('GET /login-log: admin sees user accounts only; super_admin also admins and unknown emails; filters + paging', async () => {
  await t.signIn('nobody@example.test', 'whatever-password-1');
  await t.signIn('user@example.test', 'wrong-password-xyz');
  const [, asAdmin] = await t.call('GET', '/api/admin/login-log?limit=100', admin.cookie);
  assert.ok(asAdmin.entries.length > 0);
  assert.ok(asAdmin.entries.every((row) => row.userRole === 'user'), 'no admin, super_admin or unknown rows for an admin');
  const [, asOwner] = await t.call('GET', '/api/admin/login-log?limit=100', owner);
  assert.ok(asOwner.entries.some((row) => row.userId === null), 'unknown email attempts visible to super_admin');
  assert.ok(asOwner.entries.some((row) => row.userRole === 'admin'));
  assert.ok(asOwner.total > asAdmin.total);
  const [, failed] = await t.call('GET', `/api/admin/login-log?success=false&userId=${user.id}`, admin.cookie);
  assert.ok(failed.total >= 1 && failed.entries.every((row) => row.success === false && row.userId === user.id && row.reason));
  const [, page] = await t.call('GET', '/api/admin/login-log?limit=1&offset=1', owner);
  assert.deepEqual([page.entries.length, page.limit, page.offset], [1, 1, 1]);
  assert.equal((await t.call('GET', '/api/admin/login-log?limit=1000', owner))[1].limit, 100);
  assert.equal((await t.call('GET', '/api/admin/login-log?success=maybe', owner))[1].field, 'success');
  assert.equal((await t.call('GET', '/api/admin/login-log?userId=a%20b', owner))[1].field, 'userId');
  assert.equal((await t.call('GET', '/api/admin/login-log?range=24h&limit=100', owner))[1].total, asOwner.total, 'every row so far is from the last 24 hours');
  t.state.db.prepare("UPDATE login_log SET createdAt = '2020-01-01T00:00:00.000Z' WHERE id IN (SELECT id FROM login_log LIMIT 1)").run();
  assert.equal((await t.call('GET', '/api/admin/login-log?range=24h&limit=100', owner))[1].total, asOwner.total - 1, 'a row older than the window drops out of 24h');
  assert.equal((await t.call('GET', '/api/admin/login-log?range=forever', owner))[1].field, 'range');
});

test('GET /audit: admin gets user.* on user accounts with other actors redacted; super_admin all; ?source=system is the legacy trail', async () => {
  const [, asAdmin] = await t.call('GET', '/api/admin/audit?limit=100', admin.cookie);
  assert.equal(asAdmin.scope, 'admin');
  assert.ok(asAdmin.entries.length > 0);
  assert.ok(asAdmin.entries.every((row) => row.action.startsWith('user.')), 'no role.* or bootstrap rows');
  const adminTargets = new Set([admin.id, otherAdmin.id, ownerId]);
  assert.ok(asAdmin.entries.every((row) => !adminTargets.has(row.targetId)), 'no rows about admins');
  assert.ok(asAdmin.entries.every((row) => row.actorId === null || row.actorId === admin.id), 'other actors redacted');
  assert.ok(asAdmin.entries.some((row) => row.actorId === admin.id && row.actorName === 'Staff admin'));
  const [, asOwner] = await t.call('GET', '/api/admin/audit?limit=100', owner);
  assert.equal(asOwner.scope, 'all');
  const actions = new Set(asOwner.entries.map((row) => row.action));
  for (const action of ['role.set', 'bootstrap.super_admin', 'user.create', 'user.delete']) assert.ok(actions.has(action), action);
  const [, filtered] = await t.call('GET', '/api/admin/audit?action=user.deactivate', owner);
  assert.ok(filtered.total >= 1 && filtered.entries.every((row) => row.action === 'user.deactivate'));
  assert.equal((await t.call('GET', '/api/admin/audit?action=drop.table', owner))[1].field, 'action');
  assert.equal((await t.call('GET', '/api/admin/audit?source=elsewhere', owner))[0], 400);
  const [legacyStatus, legacy] = await t.call('GET', '/api/admin/audit?source=system', owner);
  assert.deepEqual([legacyStatus, legacy.entries[0].event], [200, 'keys.changed']);
  assert.equal((await t.call('GET', '/api/admin/audit?source=system', admin.cookie))[0], 403, 'key/AI trail stays super only');
  assert.equal((await t.call('GET', '/api/admin/audit?limit=999', owner))[1].limit, 100);
});

test('GET /users/stats: counts scoped by role; 24h sign-ins and failures', async () => {
  const [, asAdmin] = await t.call('GET', '/api/admin/users/stats', admin.cookie);
  const [, asOwner] = await t.call('GET', '/api/admin/users/stats', owner);
  const usersOnly = t.rows('SELECT COUNT(*) AS n FROM "user" WHERE role = ? AND deletedAt IS NULL', 'user')[0].n;
  assert.equal(asAdmin.stats.total, usersOnly);
  assert.equal(asAdmin.stats.active + asAdmin.stats.inactive, usersOnly);
  assert.ok(asOwner.stats.total > asAdmin.stats.total, 'super_admin counts admins too');
  assert.ok(asAdmin.stats.logins24h >= 1 && asAdmin.stats.failed24h >= 1);
  assert.ok(asOwner.stats.failed24h > asAdmin.stats.failed24h, 'unknown-email failures only for super_admin');
  for (let i = 0; i < 5; i += 1) await t.signIn('user@example.test', `wrong-${i}-password`);
  assert.equal((await t.call('GET', '/api/admin/users/stats', admin.cookie))[1].stats.throttled, 1);
});
