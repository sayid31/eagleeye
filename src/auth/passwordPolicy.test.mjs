import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  GENERATED_PASSWORD_LENGTH, PASSWORD_MAX, PASSWORD_MIN_ADMIN, PASSWORD_MIN_USER, generatePassword, minPasswordLength, validatePassword,
} from './passwordPolicy.mjs';

test('minimum 12 for users, 15 for admin and super_admin', () => {
  assert.equal(PASSWORD_MIN_USER, 12);
  assert.equal(PASSWORD_MIN_ADMIN, 15);
  assert.deepEqual(['user', 'admin', 'super_admin', undefined].map(minPasswordLength), [12, 15, 15, 12]);
});

test('validatePassword: boundary lengths per role', () => {
  assert.deepEqual(validatePassword('a'.repeat(11), { role: 'user' }), { ok: false, code: 'PASSWORD_WEAK', reason: 'too_short', min: 12 });
  assert.deepEqual(validatePassword('a'.repeat(12), { role: 'user' }), { ok: true });
  assert.equal(validatePassword('a'.repeat(14), { role: 'admin' }).reason, 'too_short');
  assert.deepEqual(validatePassword('a'.repeat(15), { role: 'admin' }), { ok: true });
  assert.equal(validatePassword('a'.repeat(14), { role: 'super_admin' }).reason, 'too_short');
  assert.deepEqual(validatePassword('a'.repeat(PASSWORD_MAX)), { ok: true });
  assert.equal(validatePassword('a'.repeat(PASSWORD_MAX + 1)).reason, 'too_long');
  assert.equal(validatePassword(undefined).reason, 'too_short');
});

test('validatePassword: no composition rules, but never the email, its local part or the name', () => {
  assert.deepEqual(validatePassword('correct horse battery'), { ok: true });
  assert.equal(validatePassword('Long.Person@example.test', { email: 'long.person@example.test' }).reason, 'matches_identity');
  assert.equal(validatePassword('averylonglocalpart', { email: 'AveryLongLocalPart@example.test' }).reason, 'matches_identity');
  assert.equal(validatePassword(' Budi Santoso Raharjo ', { name: 'budi santoso raharjo' }).reason, 'matches_identity');
  assert.deepEqual(validatePassword('budi santoso raharjo!', { name: 'Budi Santoso Raharjo' }), { ok: true });
});

test('generatePassword: requested length, unambiguous alphabet, passes the admin policy, differs each call', () => {
  const one = generatePassword();
  assert.equal(one.length, GENERATED_PASSWORD_LENGTH);
  assert.match(one, /^[a-km-zA-HJ-NP-Z2-9]+$/);
  assert.deepEqual(validatePassword(one, { role: 'super_admin' }), { ok: true });
  assert.notEqual(one, generatePassword());
  assert.equal(generatePassword(32).length, 32);
});
