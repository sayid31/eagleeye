import { test } from 'node:test';
import assert from 'node:assert/strict';
import { adminGateDecision, CHANGE_PASSWORD_PATH } from './adminGateDecision.js';

const signedIn = (role, extra = {}) => ({
  configured: true, signedIn: true, home: '/app', googleSignIn: false,
  user: { id: 'u1', name: 'N', email: 'n@example.test', role, mustChangePassword: false, capabilities: {}, ...extra },
});
const at = (pathname, search = '') => ({ pathname, search });
const loginTarget = (redirect) => {
  const url = new URL(redirect, 'http://local.test');
  return { path: url.pathname, next: url.searchParams.get('next'), notice: url.searchParams.get('notice') };
};

test('signed out or auth not configured goes to /login with next + notice=session', () => {
  for (const me of [null, undefined, { configured: false, signedIn: false }, { configured: true, signedIn: false }]) {
    const target = loginTarget(adminGateDecision(me, at('/admin/users')).redirect);
    assert.deepEqual(target, { path: '/login', next: '/admin/users', notice: 'session' });
  }
  const unconfigured = { ...signedIn('admin'), configured: false };
  assert.equal(loginTarget(adminGateDecision(unconfigured, at('/admin')).redirect).path, '/login');
});

test('the login redirect keeps the query of the page being opened', () => {
  const target = loginTarget(adminGateDecision({ configured: true, signedIn: false }, at('/dev/ai/general', '?tab=1')).redirect);
  assert.equal(target.next, '/dev/ai/general?tab=1');
});

test('a pending password change wins over every area rule', () => {
  assert.equal(CHANGE_PASSWORD_PATH, '/account/password');
  assert.equal(adminGateDecision(signedIn('super_admin', { mustChangePassword: true }), at('/dev')).redirect, '/account/password');
  assert.equal(adminGateDecision(signedIn('user', { mustChangePassword: true }), at('/admin')).redirect, '/account/password');
});

test('/dev renders for super_admin only; others go to their own home', () => {
  assert.deepEqual(adminGateDecision(signedIn('super_admin'), at('/dev')), { redirect: null });
  assert.deepEqual(adminGateDecision(signedIn('super_admin'), at('/dev/api-keys')), { redirect: null });
  assert.equal(adminGateDecision(signedIn('admin'), at('/dev/api-keys')).redirect, '/admin');
  assert.equal(adminGateDecision(signedIn('user'), at('/dev')).redirect, '/app');
});

test('/admin renders for admin and super_admin; a user goes to /app', () => {
  assert.deepEqual(adminGateDecision(signedIn('admin'), at('/admin')), { redirect: null });
  assert.deepEqual(adminGateDecision(signedIn('super_admin'), at('/admin/users')), { redirect: null });
  assert.equal(adminGateDecision(signedIn('user'), at('/admin/audit')).redirect, '/app');
  assert.equal(adminGateDecision(signedIn('super-admin'), at('/admin')).redirect, '/app', '1a spelling is just a user');
});

test('a look-alike prefix is not the /dev area', () => {
  assert.deepEqual(adminGateDecision(signedIn('admin'), at('/developer')), { redirect: null });
});
