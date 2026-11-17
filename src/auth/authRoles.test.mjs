import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ROLES, homeFor, isAdminRole, isAssignableRole, isReservedSuperAdminEmail, isSuperAdminRole, normalizeRole,
  reconcileAccount, reconcileRole,
} from './authRoles.mjs';

const SUPERS = ['owner@example.test'];

test('normalizeRole: exact strings only; 1a spelling, comma lists and junk fall back to user', () => {
  assert.deepEqual(ROLES, ['user', 'admin', 'super_admin']);
  for (const role of ROLES) assert.equal(normalizeRole(role), role);
  for (const junk of ['super-admin', 'admin,super_admin', 'ADMIN', '', null, undefined, 42]) assert.equal(normalizeRole(junk), 'user');
});

test('isAdminRole / isSuperAdminRole', () => {
  assert.deepEqual(['user', 'admin', 'super_admin', 'super-admin'].map(isAdminRole), [false, true, true, false]);
  assert.deepEqual(['user', 'admin', 'super_admin'].map(isSuperAdminRole), [false, false, true]);
});

test('homeFor: user → /app, admin → /admin, super_admin → /dev, signed out → /login', () => {
  assert.equal(homeFor('user'), '/app');
  assert.equal(homeFor('admin'), '/admin');
  assert.equal(homeFor('super_admin'), '/dev');
  assert.equal(homeFor(null), '/login');
  assert.equal(homeFor(undefined), '/login');
  assert.equal(homeFor('super-admin'), '/app', 'an unknown stored role gets the least-privileged home');
});

test('reconcileRole: env email is promoted only with a Google account or a CLI password', () => {
  assert.equal(reconcileRole(' Owner@Example.test ', 'user', SUPERS, { passwordSetBy: 'cli' }), 'super_admin');
  assert.equal(reconcileRole('owner@example.test', 'user', SUPERS, { hasGoogleAccount: true }), 'super_admin');
  assert.equal(reconcileRole('owner@example.test', 'admin', SUPERS, { passwordSetBy: 'admin' }), 'admin', 'admin-set password: blocked');
  assert.equal(reconcileRole('owner@example.test', 'user', SUPERS, { passwordSetBy: 'self' }), 'user');
  assert.equal(reconcileRole('owner@example.test', 'super_admin', SUPERS, {}), 'user', 'no proof left: not super_admin');
});

test('reconcileRole: a stored super_admin whose email left env drops to user; others keep their role', () => {
  assert.equal(reconcileRole('former@example.test', 'super_admin', SUPERS, { passwordSetBy: 'cli' }), 'user');
  assert.equal(reconcileRole('a@example.test', 'admin', SUPERS, {}), 'admin');
  assert.equal(reconcileRole('a@example.test', 'user', SUPERS, { hasGoogleAccount: true }), 'user');
});

test('reconcileAccount reports promoted / demoted / blocked / unchanged', () => {
  assert.deepEqual(reconcileAccount({ email: 'owner@example.test', role: 'user' }, SUPERS, { passwordSetBy: 'cli' }),
    { role: 'super_admin', changed: true, event: 'promoted' });
  assert.deepEqual(reconcileAccount({ email: 'former@example.test', role: 'super_admin' }, SUPERS, {}),
    { role: 'user', changed: true, event: 'demoted' });
  assert.deepEqual(reconcileAccount({ email: 'owner@example.test', role: 'admin' }, SUPERS, { passwordSetBy: 'admin' }),
    { role: 'admin', changed: false, event: 'blocked' });
  assert.deepEqual(reconcileAccount({ email: 'owner@example.test', role: 'super_admin' }, SUPERS, { hasGoogleAccount: true }),
    { role: 'super_admin', changed: false, event: null });
  assert.deepEqual(reconcileAccount({ email: 'a@example.test', role: 'user' }, SUPERS, {}), { role: 'user', changed: false, event: null });
});

test('isReservedSuperAdminEmail normalizes the email', () => {
  assert.equal(isReservedSuperAdminEmail('  OWNER@example.TEST', SUPERS), true);
  assert.equal(isReservedSuperAdminEmail('other@example.test', SUPERS), false);
});

test('isAssignableRole: admin may give user only; super_admin user/admin; nobody gives super_admin', () => {
  assert.equal(isAssignableRole('admin', 'user'), true);
  assert.equal(isAssignableRole('admin', 'admin'), false);
  assert.equal(isAssignableRole('super_admin', 'user'), true);
  assert.equal(isAssignableRole('super_admin', 'admin'), true);
  assert.equal(isAssignableRole('super_admin', 'super_admin'), false);
  assert.equal(isAssignableRole('user', 'user'), false);
});
