import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseAccountAuditQuery, parseLoginLogQuery, parseUserListQuery, parseUsersRoute, validateCreateBody, validateDeleteBody,
  validatePasswordBody, validateRoleBody, validateUpdateBody,
} from './usersBoundary.mjs';
import { userErrorMessage } from './usersErrors.mjs';
import { createUsersApi, queryString } from './usersApi.js';

test('parseUsersRoute: every contract route, /stats never an id, 404 vs 405', () => {
  assert.deepEqual(parseUsersRoute('GET', '/?q=x'), { route: 'list' });
  assert.deepEqual(parseUsersRoute('POST', '/'), { route: 'create' });
  assert.deepEqual(parseUsersRoute('GET', '/stats'), { route: 'stats' });
  assert.deepEqual(parseUsersRoute('PATCH', '/abc_1'), { route: 'update', id: 'abc_1' });
  assert.deepEqual(parseUsersRoute('POST', '/abc/sessions/revoke/'), { route: 'revokeSessions', id: 'abc' });
  assert.deepEqual(parseUsersRoute('POST', '/abc/role'), { route: 'role', id: 'abc' });
  assert.deepEqual(parseUsersRoute('DELETE', '/stats').error, { code: 'METHOD_NOT_ALLOWED', status: 405 });
  assert.deepEqual(parseUsersRoute('POST', '/stats/role').error, { code: 'NOT_FOUND', status: 404 });
  assert.deepEqual(parseUsersRoute('GET', '/a%20b').error.code, 'NOT_FOUND');
  assert.deepEqual(parseUsersRoute('GET', '/a/b/c').error.code, 'NOT_FOUND');
});

test('list / log / audit queries: enums checked, paging clamped', () => {
  assert.deepEqual(parseUserListQuery('/?q=%20ani%20&status=active&limit=500&offset=-1'), { q: 'ani', status: 'active', role: undefined, limit: 100, offset: 0 });
  assert.equal(parseUserListQuery('/?role=root').error.field, 'role');
  assert.deepEqual(parseLoginLogQuery('/?success=false&userId=U_1'), { userId: 'U_1', success: false, range: undefined, limit: 20, offset: 0 });
  assert.equal(parseLoginLogQuery('/?range=7d').range, '7d');
  assert.equal(parseLoginLogQuery('/?range=forever').error.field, 'range');
  assert.equal(parseLoginLogQuery('/?success=1').error.field, 'success');
  assert.deepEqual(parseAccountAuditQuery('/?action=user.delete&offset=40'), { source: 'account', action: 'user.delete', targetId: undefined, range: undefined, limit: 20, offset: 40 });
  assert.equal(parseAccountAuditQuery('/?range=30d').range, '30d');
  assert.equal(parseAccountAuditQuery('/?range=1y').error.field, 'range');
  assert.deepEqual(parseAccountAuditQuery('/?source=system&action=anything'), { source: 'system' });
  assert.equal(parseAccountAuditQuery('/?action=nope').error.field, 'action');
});

test('bodies: create/update/password/role/delete validated at the boundary', () => {
  assert.deepEqual(validateCreateBody({ email: 'a@b.test', name: 'A', generate: true, capabilities: { premium: true } }).value,
    { email: 'a@b.test', name: 'A', role: undefined, generate: true, capabilities: { layers: true, ai: true, premium: true } });
  assert.equal(validateCreateBody({ email: 'a@b.test', name: 'A' }).error.field, 'password');
  assert.equal(validateCreateBody({ email: 'a@b.test', name: 'A', role: 'super_admin', generate: true }).error.code, 'ROLE_NOT_ASSIGNABLE');
  assert.equal(validateCreateBody({ email: 'a@b.test', name: 'A', generate: true, capabilities: { admin: true } }).error.field, 'capabilities');
  assert.equal(validateCreateBody([]).error.field, 'body');
  assert.deepEqual(validateUpdateBody({ name: 'B' }).value, { name: 'B' });
  assert.equal(validateUpdateBody({ capabilities: { layers: true } }).error.field, 'capabilities', 'all three toggles on update');
  assert.equal(validateUpdateBody({ role: 'admin' }).error.field, 'body', 'role is not editable here');
  assert.deepEqual(validatePasswordBody({ generate: true }).value, { generate: true });
  assert.equal(validatePasswordBody({ generate: 'yes' }).error.field, 'generate');
  assert.deepEqual(validateRoleBody({ role: 'admin', currentPassword: 'x' }).value, { role: 'admin', currentPassword: 'x' });
  assert.equal(validateRoleBody({ role: 'admin', currentPassword: 5 }).error.field, 'currentPassword');
  assert.equal(validateDeleteBody({}).error.field, 'confirmEmail');
});

test('userErrorMessage: Indonesian text per code, password reason, field', () => {
  assert.equal(userErrorMessage('EMAIL_TAKEN'), 'Email sudah dipakai akun lain.');
  assert.equal(userErrorMessage({ error: 'PASSWORD_WEAK', reason: 'too_short', min: 15 }), 'Password minimal 15 karakter.');
  assert.equal(userErrorMessage({ error: 'INVALID_INPUT', field: 'email' }), 'Isian email tidak valid.');
  assert.equal(userErrorMessage('SOMETHING_NEW'), 'Permintaan gagal (SOMETHING_NEW).');
});

test('usersApi: URLs, methods, JSON bodies; refusals throw with code and Indonesian message', async () => {
  const calls = [];
  const fake = (reply) => async (url, init) => { calls.push([init.method, url, init.body ?? null]); return reply; };
  const api = createUsersApi(fake({ ok: true, json: async () => ({ users: [] }) }));
  await api.list({ q: 'ani', status: '', offset: 0, limit: 20 });
  await api.audit({ targetId: 'U1' });
  await api.remove('U 1', 'a@b.test');
  await api.setRole('U1', { role: 'admin', currentPassword: 'pw' });
  assert.deepEqual(calls, [
    ['GET', '/api/admin/users?q=ani&limit=20', null],
    ['GET', '/api/admin/audit?source=account&targetId=U1', null],
    ['DELETE', '/api/admin/users/U%201', '{"confirmEmail":"a@b.test"}'],
    ['POST', '/api/admin/users/U1/role', '{"role":"admin","currentPassword":"pw"}'],
  ]);
  const refused = createUsersApi(fake({ ok: false, status: 409, json: async () => ({ error: 'EMAIL_TAKEN', message: 'x' }) }));
  await assert.rejects(refused.create({}), (error) => error.code === 'EMAIL_TAKEN' && error.status === 409 && error.message === 'Email sudah dipakai akun lain.');
  assert.equal(queryString({ a: '', b: null, offset: 0, limit: 0 }), '?limit=0');
});
