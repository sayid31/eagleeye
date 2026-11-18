import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PASSWORD_MIN_ADMIN, PASSWORD_MIN_USER } from '../auth/passwordPolicy.mjs';
import { PASSWORD_ERRORS } from '../copy/en/login.js';
import { changePasswordFailure, changePasswordIssue, passwordRequirements } from './changePasswordView.js';

const user = { email: 'budi@example.test', name: 'Budi Santoso', role: 'user' }; // test-only
const admin = { ...user, role: 'admin' };
const form = (next, extra = {}) => ({ currentPassword: 'old-password-123', newPassword: next, confirm: next, ...extra });
const message = (input, identity) => changePasswordIssue(input, identity)?.message ?? null;
const met = (input, identity) => Object.fromEntries(passwordRequirements(input, identity).map(({ id, met: ok }) => [id, ok]));

test('passwordRequirements: the length line carries the shared minimum (12 user, 15 admin and super_admin)', () => {
  const label = (role) => passwordRequirements(form(''), { role })[0].label;
  assert.equal(label('user'), `Minimal ${PASSWORD_MIN_USER} karakter`);
  assert.equal(label('admin'), `Minimal ${PASSWORD_MIN_ADMIN} karakter`);
  assert.equal(label('super_admin'), `Minimal ${PASSWORD_MIN_ADMIN} karakter`);
  assert.equal(label(undefined), `Minimal ${PASSWORD_MIN_USER} karakter`);
});

test('passwordRequirements: nothing is met on an empty form; each line turns on by itself as the input improves', () => {
  assert.deepEqual(met({ currentPassword: '', newPassword: '', confirm: '' }, user), { length: false, identity: false, different: false, match: false });
  assert.deepEqual(met({ currentPassword: 'old', newPassword: 'short', confirm: '' }, user), { length: false, identity: true, different: true, match: false });
  assert.deepEqual(met(form('a long new password'), user), { length: true, identity: true, different: true, match: true });
  assert.equal(met(form('thirteen-char'), user).length, true);
  assert.equal(met(form('thirteen-char'), admin).length, false, 'an admin needs 15');
  assert.equal(met(form('a long new password', { confirm: 'something else' }), user).match, false);
  assert.equal(met(form('old-password-123'), user).different, false);
});

test('passwordRequirements: the identity line is right even while the password is still too short', () => {
  assert.equal(met({ currentPassword: 'x', newPassword: 'budi', confirm: '' }, user).identity, false, 'email local part');
  assert.equal(met({ currentPassword: 'x', newPassword: 'budi@example.test', confirm: '' }, user).identity, false, 'whole email');
  assert.equal(met({ currentPassword: 'x', newPassword: ' Budi Santoso ', confirm: '' }, user).identity, false, 'name, trimmed, any case');
  assert.equal(met({ currentPassword: 'x', newPassword: 'budi-and-more', confirm: '' }, user).identity, true);
});

test('changePasswordIssue: role-aware length, identity, same, confirm — each on its own field', () => {
  assert.equal(changePasswordIssue(form('a long new password'), user), null);
  assert.deepEqual(changePasswordIssue(form('a long new password', { currentPassword: '' }), user), { field: 'current', message: PASSWORD_ERRORS.CURRENT_REQUIRED });
  assert.equal(changePasswordIssue(form('thirteen-char'), user), null, '13 chars ok for a user');
  assert.deepEqual(changePasswordIssue(form('thirteen-char'), admin), { field: 'next', message: 'Password baru minimal 15 karakter.' });
  assert.equal(message(form('short'), user), 'Password baru minimal 12 karakter.');
  assert.match(message(form('x'.repeat(129)), user), /maksimal 128/);
  assert.equal(message(form('budi@example.test'), user), PASSWORD_ERRORS.MATCHES_IDENTITY);
  assert.equal(message(form('Budi Santoso'), { ...user, name: 'budi santoso' }), PASSWORD_ERRORS.MATCHES_IDENTITY);
  assert.deepEqual(changePasswordIssue(form('old-password-123'), user), { field: 'next', message: PASSWORD_ERRORS.SAME_AS_CURRENT });
  assert.deepEqual(changePasswordIssue(form('a long new password', { confirm: 'something else' }), user), { field: 'confirm', message: PASSWORD_ERRORS.MISMATCH });
});

test('changePasswordFailure: a wrong current password lands on that field, the rest on the form; unknown → generic', () => {
  assert.deepEqual(changePasswordFailure({ status: 400, code: 'INVALID_PASSWORD' }), { field: 'current', message: 'Current password is incorrect.' });
  assert.deepEqual(changePasswordFailure({ status: 400, code: 'PASSWORD_WEAK' }), { field: 'next', message: PASSWORD_ERRORS.PASSWORD_WEAK });
  assert.equal(changePasswordFailure({ status: 400, code: 'PASSWORD_TOO_SHORT' }).message, PASSWORD_ERRORS.PASSWORD_WEAK);
  assert.deepEqual(changePasswordFailure({ status: 400, code: 'PASSWORD_TOO_LONG' }), { field: 'next', message: PASSWORD_ERRORS.TOO_LONG });
  assert.match(changePasswordFailure({ status: 400, code: 'CREDENTIAL_ACCOUNT_NOT_FOUND' }).message, /Google/);
  assert.deepEqual(changePasswordFailure({ status: 401, code: 'UNAUTHORIZED' }), { field: null, message: PASSWORD_ERRORS.SESSION_EXPIRED });
  assert.deepEqual(changePasswordFailure({ status: 429, code: 'X' }), { field: null, message: PASSWORD_ERRORS.RATE_LIMITED });
  assert.deepEqual(changePasswordFailure({ status: 500, code: 'BOOM' }), { field: null, message: PASSWORD_ERRORS.GENERIC });
  assert.deepEqual(changePasswordFailure(), { field: null, message: PASSWORD_ERRORS.GENERIC });
});
