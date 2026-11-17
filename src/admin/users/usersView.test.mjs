import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  accountStatus, areaRoleScope, compactIp, auditActorText, auditDetailText, createFormDefaults, createPayload, describeDevice, formatDateTime, handoverMessage,
  loginAccountText, loginResultText, managesRoles, pageInfo, rowActions,
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
  for (const role of ['admin', 'super_admin']) {
    const actions = rowActions(adminMe, target('X', role), 'admin');
    assert.equal(actions.any, false, role);
  }
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

test('managesRoles / areaRoleScope: only a super_admin in /dev picks roles; /admin lists users only', () => {
  assert.deepEqual([managesRoles(superMe, 'dev'), managesRoles(superMe, 'admin'), managesRoles(adminMe, 'dev')], [true, false, false]);
  assert.deepEqual([areaRoleScope('admin'), areaRoleScope('dev')], ['user', undefined]);
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

test('accountStatus: inactive beats throttled beats must-change beats active', () => {
  assert.deepEqual(accountStatus({ active: false, throttled: true }), { label: 'Nonaktif', tone: 'error' });
  assert.deepEqual(accountStatus({ active: true, throttled: true, mustChangePassword: true }), { label: 'Ter-throttle', tone: 'warn' });
  assert.deepEqual(accountStatus({ active: true, mustChangePassword: true }), { label: 'Wajib ganti password', tone: 'info' });
  assert.deepEqual(accountStatus({ active: true }), { label: 'Aktif', tone: 'ok' });
});

test('pageInfo: range label and neighbours, empty and last pages', () => {
  assert.deepEqual(pageInfo({ total: 45, limit: 20, offset: 20 }), { from: 21, to: 40, total: 45, label: '21–40 dari 45', prevOffset: 0, nextOffset: 40 });
  assert.deepEqual(pageInfo({ total: 45, limit: 20, offset: 40 }).nextOffset, null);
  assert.deepEqual(pageInfo({ total: 0, limit: 20, offset: 0 }), { from: 0, to: 0, total: 0, label: '0–0 dari 0', prevOffset: null, nextOffset: null });
});

test('log wording: device from user agent, result and account cells, audit actor redaction', () => {
  assert.equal(describeDevice('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0 Safari/537.36'), 'Chrome · macOS');
  assert.equal(describeDevice('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1'), 'Safari · iOS');
  assert.equal(describeDevice('node'), 'Skrip');
  assert.equal(describeDevice(null), '—');
  assert.equal(loginResultText({ success: false, reason: 'throttled' }), 'Ter-throttle');
  assert.equal(loginResultText({ success: true }), 'Berhasil');
  assert.equal(loginAccountText({ userId: null }), 'Email tidak terdaftar');
  assert.equal(loginAccountText({ userId: 'U1', userName: 'Pengguna terhapus', userDeleted: true }), 'Pengguna terhapus (terhapus)');
  assert.equal(auditActorText({ actorId: 'A1', actorName: 'Admin', actorRole: 'admin' }, adminMe), 'Anda');
  assert.equal(auditActorText({ actorId: null, actorName: null, actorRole: 'super_admin' }, adminMe), 'Super admin');
  assert.equal(auditActorText({ actorId: null, actorName: null, actorRole: 'admin' }, adminMe), 'Admin lain');
  assert.equal(auditDetailText('role user'), 'Role: Pengguna');
  assert.equal(auditDetailText('fields name,capabilities'), 'Diubah: nama, izin fitur');
  assert.equal(auditDetailText('user → admin'), 'Pengguna → Admin');
  assert.equal(auditDetailText('cli'), 'cli');
  assert.equal(auditDetailText(null), '');
  assert.equal(auditActorText({ actorId: null, actorName: null, actorRole: null }, adminMe), 'Sistem');
  assert.equal(formatDateTime('nope'), '—');
  assert.equal(compactIp('0000:0000:0000:0000:0000:0000:0000:0000'), '::');
  assert.equal(compactIp('0000:0000:0000:0000:0000:0000:0000:0001'), '::1');
  assert.equal(compactIp('2001:0db8:0000:0000:0001:0000:0000:0001'), '2001:db8::1:0:0:1');
  assert.equal(compactIp('203.0.113.7'), '203.0.113.7');
  assert.equal(compactIp(null), '—');
  assert.match(formatDateTime('2026-11-17T09:18:10.338Z'), /2026/);
});
