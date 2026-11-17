import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PASSWORD_MIN_ADMIN, PASSWORD_MIN_USER } from '../auth/passwordPolicy.mjs';
import { changePasswordErrorText, changePasswordProblem, passwordHint } from './changePasswordView.js';
import { PASSWORD_ERRORS } from './loginCopy.js';

const user = { email: 'budi@example.test', name: 'Budi Santoso', role: 'user' }; // test-only
const admin = { ...user, role: 'admin' };
const form = (next, extra = {}) => ({ currentPassword: 'old-password-123', newPassword: next, confirm: next, ...extra });

test('passwordHint: 12 for user, 15 for admin and super_admin, from the shared constants', () => {
  assert.match(passwordHint('user'), new RegExp(`Minimal ${PASSWORD_MIN_USER} karakter`));
  assert.match(passwordHint('admin'), new RegExp(`Minimal ${PASSWORD_MIN_ADMIN} karakter`));
  assert.match(passwordHint('super_admin'), new RegExp(`Minimal ${PASSWORD_MIN_ADMIN} karakter`));
  assert.match(passwordHint(undefined), /Minimal 12/);
});

test('changePasswordProblem: role-aware length, identity, same, confirm', () => {
  assert.equal(changePasswordProblem(form('a long new password'), user), null);
  assert.equal(changePasswordProblem(form('a long new password', { currentPassword: '' }), user), PASSWORD_ERRORS.CURRENT_REQUIRED);
  assert.equal(changePasswordProblem(form('thirteen-char'), user), null, '13 chars ok for a user');
  assert.equal(changePasswordProblem(form('thirteen-char'), admin), 'Password baru minimal 15 karakter.');
  assert.equal(changePasswordProblem(form('short'), user), 'Password baru minimal 12 karakter.');
  assert.match(changePasswordProblem(form('x'.repeat(129)), user), /maksimal 128/);
  assert.equal(changePasswordProblem(form('budi@example.test'), user), PASSWORD_ERRORS.MATCHES_IDENTITY);
  assert.equal(changePasswordProblem(form('Budi Santoso'), { ...user, name: 'budi santoso' }), PASSWORD_ERRORS.MATCHES_IDENTITY);
  assert.equal(changePasswordProblem(form('old-password-123'), user), PASSWORD_ERRORS.SAME_AS_CURRENT);
  assert.equal(changePasswordProblem(form('a long new password', { confirm: 'something else' }), user), PASSWORD_ERRORS.MISMATCH);
});

test('changePasswordErrorText: server refusals mapped, unknown → generic', () => {
  assert.equal(changePasswordErrorText({ status: 400, code: 'INVALID_PASSWORD' }), 'Password saat ini salah.');
  assert.equal(changePasswordErrorText({ status: 400, code: 'PASSWORD_WEAK' }), PASSWORD_ERRORS.PASSWORD_WEAK);
  assert.equal(changePasswordErrorText({ status: 400, code: 'PASSWORD_TOO_SHORT' }), PASSWORD_ERRORS.PASSWORD_WEAK);
  assert.equal(changePasswordErrorText({ status: 400, code: 'PASSWORD_TOO_LONG' }), PASSWORD_ERRORS.TOO_LONG);
  assert.match(changePasswordErrorText({ status: 400, code: 'CREDENTIAL_ACCOUNT_NOT_FOUND' }), /Google/);
  assert.equal(changePasswordErrorText({ status: 401, code: 'UNAUTHORIZED' }), PASSWORD_ERRORS.SESSION_EXPIRED);
  assert.equal(changePasswordErrorText({ status: 429, code: 'X' }), PASSWORD_ERRORS.RATE_LIMITED);
  assert.equal(changePasswordErrorText({ status: 500, code: 'BOOM' }), PASSWORD_ERRORS.GENERIC);
  assert.equal(changePasswordErrorText(), PASSWORD_ERRORS.GENERIC);
});
