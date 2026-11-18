import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ALL, accountStatusKey, doneToast, errorField, areaRoleScope, hasUserFilters,
  managesRoles, roleText, rowActions, rowMenuEntries, usersQuery,
} from './usersView.js';

const superMe = { id: 'S1', role: 'super_admin' };
const adminMe = { id: 'A1', role: 'admin' };
const target = (id, role, active = true) => ({ id, role, active });
const offered = (actions) => Object.entries(actions).filter(([key, value]) => value && key !== 'any' && key !== 'self').map(([key, value]) => (typeof value === 'string' ? value : key)).sort();

test('rowActions: admin → user gets every account action but no role change', () => {
  const actions = rowActions(adminMe, target('U1', 'user'), 'admin');
  assert.deepEqual(actions.edit, { name: true, email: true, capabilities: true });
  assert.deepEqual(offered(actions), ['deactivate', 'delete', 'edit', 'resetPassword', 'revokeSessions']);
  assert.equal(rowActions(adminMe, target('U1', 'user', false), 'admin').toggleActive, 'activate');
});

test('rowActions: admin → admin or super_admin offers nothing; admin → itself only own sign-out and name', () => {
  for (const role of ['admin', 'super_admin']) assert.equal(rowActions(adminMe, target('X', role), 'admin').any, false, role);
  const self = rowActions(adminMe, target('A1', 'admin'), 'admin');
  assert.deepEqual([self.self, self.edit, self.toggleActive, self.delete, self.resetPassword, self.revokeSessions],
    [true, { name: true, email: false, capabilities: false }, null, false, false, true]);
});

test('rowActions: super_admin in /dev promotes users and demotes admins; toggles only for user targets', () => {
  const onUser = rowActions(superMe, target('U1', 'user'), 'dev');
  assert.equal(onUser.role, 'promote');
  assert.deepEqual(offered(onUser), ['deactivate', 'delete', 'edit', 'promote', 'resetPassword', 'revokeSessions']);
  const onAdmin = rowActions(superMe, target('A1', 'admin'), 'dev');
  assert.equal(onAdmin.role, 'demote');
  assert.deepEqual(onAdmin.edit, { name: true, email: true, capabilities: false });
});

test('rowActions: super_admin → other super_admin is read-only; → itself only name + sign-out; /admin hides role changes', () => {
  assert.equal(rowActions(superMe, target('S2', 'super_admin'), 'dev').any, false);
  const self = rowActions(superMe, target('S1', 'super_admin'), 'dev');
  assert.deepEqual(offered(self), ['edit', 'revokeSessions']);
  assert.equal(self.role, null);
  assert.equal(rowActions(superMe, target('U1', 'user'), 'admin').role, null, 'role changes are /dev only');
  assert.equal(rowActions({ id: 'U9', role: 'user' }, target('U1', 'user'), 'admin').any, false, 'a user is offered nothing');
});

test('rowMenuEntries: ordinary actions first, deactivate and delete last and flagged destructive', () => {
  const entries = rowMenuEntries(rowActions(superMe, target('U1', 'user'), 'dev'));
  assert.deepEqual(entries.map((entry) => entry.id), ['edit', 'resetPassword', 'promote', 'revokeSessions', 'loginLog', 'audit', 'deactivate', 'delete']);
  assert.deepEqual(entries.filter((entry) => entry.destructive).map((entry) => entry.id), ['deactivate', 'delete']);
  const inactive = rowMenuEntries(rowActions(adminMe, target('U1', 'user', false), 'admin'));
  assert.equal(inactive.find((entry) => entry.id === 'activate').destructive, false, 'activating is not destructive');
  assert.deepEqual(rowMenuEntries(rowActions(adminMe, target('X', 'admin'), 'admin')).map((entry) => entry.id), ['loginLog', 'audit'], 'a read-only row still links to its logs');
  const own = rowMenuEntries(rowActions(superMe, target('S1', 'super_admin'), 'dev')).map((entry) => entry.id);
  assert.deepEqual(own, ['edit', 'revokeSessions'], 'no log links on your own row');
});

test('managesRoles / areaRoleScope: only a super_admin in /dev picks roles; /admin lists users only', () => {
  assert.deepEqual([managesRoles(superMe, 'dev'), managesRoles(superMe, 'admin'), managesRoles(adminMe, 'dev')], [true, false, false]);
  assert.deepEqual([areaRoleScope('admin'), areaRoleScope('dev')], ['user', undefined]);
});

test('usersQuery: ALL and blanks drop out, /admin forces role=user, page size and offset pass through', () => {
  const filter = { search: '  ani ', status: ALL, role: 'admin', limit: 50, offset: 100 };
  assert.deepEqual(usersQuery(filter, 'dev'), { q: 'ani', status: '', role: 'admin', limit: 50, offset: 100 });
  assert.deepEqual(usersQuery({ ...filter, status: 'inactive', role: ALL }, 'dev'), { q: 'ani', status: 'inactive', role: '', limit: 50, offset: 100 });
  assert.equal(usersQuery(filter, 'admin').role, 'user', 'a role filter can never widen /admin');
});

test('hasUserFilters: search, status or role narrow the list', () => {
  const none = { search: '  ', status: ALL, role: ALL };
  assert.equal(hasUserFilters(none), false);
  assert.equal(hasUserFilters({ ...none, search: 'a' }), true);
  assert.equal(hasUserFilters({ ...none, status: 'active' }), true);
  assert.equal(hasUserFilters({ ...none, role: 'admin' }), true);
});

test('accountStatusKey: inactive beats throttled beats must-change beats active', () => {
  assert.equal(accountStatusKey({ active: false, throttled: true }), 'inactive');
  assert.equal(accountStatusKey({ active: true, throttled: true, mustChangePassword: true }), 'throttled');
  assert.equal(accountStatusKey({ active: true, mustChangePassword: true }), 'mustChangePassword');
  assert.equal(accountStatusKey({ active: true }), 'active');
  assert.equal(roleText('super_admin'), 'Super admin');
  assert.equal(roleText('x'), 'x');
});

test('errorField: duplicate or reserved email → email, weak password → password, invalid input → its field, else null', () => {
  const fields = ['email', 'name', 'password'];
  assert.equal(errorField({ code: 'EMAIL_TAKEN' }, fields), 'email');
  assert.equal(errorField({ code: 'SUPER_ADMIN_EMAIL_RESERVED' }, fields), 'email');
  assert.equal(errorField({ code: 'PASSWORD_WEAK' }, fields), 'password');
  assert.equal(errorField({ code: 'INVALID_INPUT', field: 'name' }, fields), 'name');
  assert.equal(errorField({ code: 'INVALID_INPUT', field: 'capabilities' }, fields), null, 'not a field of the form');
  assert.equal(errorField({ code: 'EMAIL_TAKEN' }, ['name']), null, 'the form lacks that field');
  assert.equal(errorField({ code: 'INTERNAL_ERROR' }, fields), null);
  assert.equal(errorField(null, fields), null);
});

test('doneToast: one sentence per action, role changes share one, a failed audit line becomes a warning', () => {
  assert.deepEqual(doneToast('create', {}), { text: 'Akun dibuat', level: 'success' });
  assert.equal(doneToast('promote', {}).text, 'Role diubah');
  assert.equal(doneToast('demote', {}).text, 'Role diubah');
  assert.equal(doneToast('resetPassword', null).text, 'Password direset');
  assert.equal(doneToast('revokeSessions', {}).text, 'Akun dikeluarkan dari semua perangkat');
  const warned = doneToast('delete', { audit: 'failed' });
  assert.equal(warned.level, 'warning');
  assert.match(warned.text, /catatan audit gagal/);
  assert.equal(doneToast('unknown-kind', {}).text, 'Perubahan disimpan');
});
