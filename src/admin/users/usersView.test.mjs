import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ALL, accountStatusKey, areaRoleScope, createFormDefaults, createFormReady, createPayload, editPayload, handoverMessage, hasUserFilters,
  managesRoles, passwordRequirements, roleText, rowActions, rowMenuEntries, usersQuery,
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
  assert.deepEqual(entries.map((entry) => entry.id), ['edit', 'resetPassword', 'promote', 'revokeSessions', 'deactivate', 'delete']);
  assert.deepEqual(entries.filter((entry) => entry.destructive).map((entry) => entry.id), ['deactivate', 'delete']);
  const inactive = rowMenuEntries(rowActions(adminMe, target('U1', 'user', false), 'admin'));
  assert.equal(inactive.find((entry) => entry.id === 'activate').destructive, false, 'activating is not destructive');
  assert.deepEqual(rowMenuEntries(rowActions(adminMe, target('X', 'admin'), 'admin')), []);
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

test('create form: owner defaults (layers + ai ON, premium OFF, generated password, role user)', () => {
  assert.deepEqual(createFormDefaults(), {
    email: '', name: '', role: 'user', capabilities: { layers: true, ai: true, premium: false }, passwordMode: 'generate', password: '',
  });
  const form = createFormDefaults();
  form.capabilities.premium = true;
  assert.equal(createFormDefaults().capabilities.premium, false, 'defaults are a fresh copy');
});

test('createPayload: generate vs typed; role only when the area manages roles; toggles only for users', () => {
  const form = { ...createFormDefaults(), email: ' a@example.test ', name: ' Ani ' };
  assert.deepEqual(createPayload(form, false), { email: 'a@example.test', name: 'Ani', capabilities: { layers: true, ai: true, premium: false }, generate: true });
  assert.deepEqual(createPayload({ ...form, role: 'admin', passwordMode: 'typed', password: 'p'.repeat(15) }, true),
    { email: 'a@example.test', name: 'Ani', role: 'admin', password: 'p'.repeat(15) });
  assert.equal(createPayload({ ...form, role: 'admin' }, false).role, undefined, 'a role picked outside /dev is never sent');
});

test('createFormReady: needs an email, a name and, for a typed password, every requirement met', () => {
  const form = { ...createFormDefaults(), email: 'a@example.test', name: 'Ani' };
  assert.equal(createFormReady(form, false), true);
  assert.equal(createFormReady({ ...form, email: 'nope' }, false), false);
  assert.equal(createFormReady({ ...form, name: '  ' }, false), false);
  const typed = { ...form, passwordMode: 'typed', password: 'short' };
  assert.equal(createFormReady(typed, false), false);
  assert.equal(createFormReady({ ...typed, password: 'x'.repeat(12) }, false), true, 'users need 12');
  assert.equal(createFormReady({ ...typed, role: 'admin', password: 'x'.repeat(12) }, true), false, 'admins need 15');
  assert.equal(createFormReady({ ...typed, role: 'admin', password: 'x'.repeat(15) }, true), true);
});

test('editPayload: only changed, permitted fields; the three toggles always go together; null when unchanged', () => {
  const current = { name: 'Ani', email: 'ani@example.test', capabilities: { layers: true, ai: true, premium: false } };
  const all = { name: true, email: true, capabilities: true };
  assert.equal(editPayload(current, { ...current, capabilities: { ...current.capabilities } }, all), null);
  assert.equal(editPayload(current, { ...current, email: ' ANI@example.test ' }, all), null, 'email compares normalized');
  assert.deepEqual(editPayload(current, { ...current, name: ' Ani B ' }, all), { name: 'Ani B' });
  assert.deepEqual(editPayload(current, { ...current, capabilities: { layers: true, ai: false, premium: false } }, all), { capabilities: { layers: true, ai: false, premium: false } });
  assert.equal(editPayload(current, { name: 'Lain', email: 'lain@example.test', capabilities: current.capabilities }, { name: true, email: false, capabilities: false }).email, undefined, 'not permitted → not sent');
});

test('passwordRequirements: role length, upper bound and identity are checked live', () => {
  const met = (input) => Object.fromEntries(passwordRequirements(input).map((item) => [item.id, item.met]));
  assert.deepEqual(met({ password: '', role: 'user' }), { min: false, max: true, identity: true });
  assert.deepEqual(met({ password: 'x'.repeat(12), role: 'user' }), { min: true, max: true, identity: true });
  assert.equal(met({ password: 'x'.repeat(12), role: 'admin' }).min, false);
  assert.equal(met({ password: 'x'.repeat(129), role: 'user' }).max, false);
  assert.equal(met({ password: 'ani@example.test', role: 'user', email: 'ani@example.test' }).identity, false);
  assert.match(passwordRequirements({ password: '', role: 'admin' })[0].label, /15 karakter/);
});

test('handoverMessage: Indonesian, login URL from the origin, email, temp password, must-change note', () => {
  const text = handoverMessage({ origin: 'https://eagle-eye.example.test/', email: 'ani@example.test', password: 'Tmp9xYzAbc' });
  assert.equal(text, [
    'Akun EagleEye Anda sudah dibuat.',
    '',
    'Alamat login: https://eagle-eye.example.test/login',
    'Email: ani@example.test',
    'Password sementara: Tmp9xYzAbc',
    '',
    'Catatan: password ini wajib diganti saat login pertama. Jangan bagikan pesan ini ke orang lain.',
  ].join('\n'));
  assert.match(handoverMessage({ origin: 'http://localhost:4173', email: 'a@b.test', password: 'x', reset: true }), /^Password akun EagleEye Anda sudah direset\.\n\nAlamat login: http:\/\/localhost:4173\/login/);
});
