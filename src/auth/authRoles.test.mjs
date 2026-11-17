import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  canAccessAdmin, canManageKeys, canUseDataApis, initialAccount, isAdminRole, normalizeRole, normalizeStatus,
  reconcileAccount, reconcileRole,
} from './authRoles.mjs';

const SUPERS = ['owner@example.test']; // test-only fixture

test('normalizeRole / normalizeStatus fall back to least privilege', () => {
  assert.equal(normalizeRole('admin'), 'admin');
  assert.equal(normalizeRole('super-admin'), 'super-admin');
  for (const bad of [undefined, null, '', 'root', 'Admin', 42]) assert.equal(normalizeRole(bad), 'user');
  assert.equal(normalizeStatus('active'), 'active');
  assert.equal(normalizeStatus('banned'), 'banned');
  for (const bad of [undefined, '', 'ACTIVE', 'approved']) assert.equal(normalizeStatus(bad), 'pending');
});

test('reconcileRole matrix: env email wins, a stale super-admin drops to user, others keep their role', () => {
  const cases = [
    ['owner@example.test', 'user', 'super-admin'],
    ['  Owner@Example.TEST ', 'admin', 'super-admin'],
    ['owner@example.test', undefined, 'super-admin'],
    ['former@example.test', 'super-admin', 'user'],
    ['someone@example.test', 'admin', 'admin'],
    ['someone@example.test', 'user', 'user'],
    ['someone@example.test', 'garbage', 'user'],
  ];
  for (const [email, stored, expected] of cases) {
    assert.equal(reconcileRole(email, stored, SUPERS), expected, `${email} ${stored}`);
  }
});

test('reconcileAccount forces an env super-admin active and reports whether anything changed', () => {
  assert.deepEqual(reconcileAccount({ email: 'owner@example.test', role: 'user', status: 'pending' }, SUPERS), { role: 'super-admin', status: 'active', changed: true });
  assert.deepEqual(reconcileAccount({ email: 'owner@example.test', role: 'super-admin', status: 'banned' }, SUPERS), { role: 'super-admin', status: 'active', changed: true });
  assert.deepEqual(reconcileAccount({ email: 'owner@example.test', role: 'super-admin', status: 'active' }, SUPERS), { role: 'super-admin', status: 'active', changed: false });
  assert.deepEqual(reconcileAccount({ email: 'former@example.test', role: 'super-admin', status: 'active' }, SUPERS), { role: 'user', status: 'active', changed: true });
  assert.deepEqual(reconcileAccount({ email: 'x@example.test', role: 'admin', status: 'banned' }, SUPERS), { role: 'admin', status: 'banned', changed: false });
  assert.deepEqual(reconcileAccount({ email: 'x@example.test', role: 'user', status: 'weird' }, SUPERS), { role: 'user', status: 'pending', changed: true });
});

test('initialAccount: env super-admin starts active, everyone else a pending user', () => {
  assert.deepEqual(initialAccount('OWNER@example.test', SUPERS), { role: 'super-admin', status: 'active' });
  assert.deepEqual(initialAccount('new@example.test', SUPERS), { role: 'user', status: 'pending' });
  assert.deepEqual(initialAccount('new@example.test', []), { role: 'user', status: 'pending' });
});

test('permission matrix', () => {
  const actor = (role, status) => ({ role, status });
  const rows = [
    // role, status, dataApis, admin, keys
    ['user', 'active', true, false, false],
    ['admin', 'active', true, true, false],
    ['super-admin', 'active', true, true, true],
    ['user', 'pending', false, false, false],
    ['admin', 'pending', false, false, false],
    ['super-admin', 'pending', false, false, false],
    ['admin', 'banned', false, false, false],
    ['super-admin', 'banned', false, false, false],
  ];
  for (const [role, status, data, admin, keys] of rows) {
    const who = actor(role, status);
    assert.equal(canUseDataApis(who), data, `${role}/${status} data`);
    assert.equal(canAccessAdmin(who), admin, `${role}/${status} admin`);
    assert.equal(canManageKeys(who), keys, `${role}/${status} keys`);
  }
  for (const nobody of [null, undefined, {}]) {
    assert.equal(canUseDataApis(nobody), false);
    assert.equal(canAccessAdmin(nobody), false);
    assert.equal(canManageKeys(nobody), false);
  }
  assert.equal(isAdminRole('admin'), true);
  assert.equal(isAdminRole('super-admin'), true);
  assert.equal(isAdminRole('user'), false);
});
