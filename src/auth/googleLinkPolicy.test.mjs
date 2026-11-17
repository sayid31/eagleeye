import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GOOGLE_ACCOUNT_LINKING, googleLinkDecision } from './googleLinkPolicy.mjs';

const ENV = ['owner@example.test']; // test-only
const password = [{ providerId: 'credential' }];
const decide = (user, accounts = []) => googleLinkDecision({ user, accounts, superAdminEmails: ENV });

test('googleLinkDecision: allows a fresh env-email account and a CLI-bootstrapped super_admin', () => {
  assert.deepEqual(decide({ email: 'owner@example.test' }), { allow: true, reason: 'google_only' });
  assert.deepEqual(decide({ email: 'Owner@Example.test', passwordSetBy: 'cli' }, password), { allow: true, reason: 'cli_password' });
  assert.deepEqual(decide({ email: 'owner@example.test', passwordSetBy: 'cli' }, [...password, { providerId: 'google' }]), { allow: true, reason: 'cli_password' });
});

test('googleLinkDecision: refuses every other same-email case', () => {
  assert.deepEqual(decide(null), { allow: false, reason: 'no_user' });
  assert.deepEqual(decide({ email: 'budi@example.test', passwordSetBy: 'cli' }, password), { allow: false, reason: 'not_reserved' });
  assert.deepEqual(decide({ email: 'budi@example.test' }), { allow: false, reason: 'not_reserved' }, 'no password is no excuse off the env list');
  for (const setBy of ['admin', 'self', null, undefined]) {
    assert.deepEqual(decide({ email: 'owner@example.test', passwordSetBy: setBy }, password), { allow: false, reason: 'password_not_cli' }, String(setBy));
  }
  assert.deepEqual(decide({ email: 'owner@example.test', passwordSetBy: 'cli', banned: true }, password), { allow: false, reason: 'closed' });
  assert.deepEqual(decide({ email: 'owner@example.test', deletedAt: '2026-11-01T00:00:00Z' }), { allow: false, reason: 'closed' });
  assert.equal(googleLinkDecision({ user: { email: 'owner@example.test' }, accounts: [], superAdminEmails: [] }).allow, false);
});

test('GOOGLE_ACCOUNT_LINKING: on, no trusted providers (Google must verify the email), no different emails', () => {
  assert.equal(GOOGLE_ACCOUNT_LINKING.enabled, true);
  assert.equal(GOOGLE_ACCOUNT_LINKING.allowDifferentEmails, false);
  assert.equal('trustedProviders' in GOOGLE_ACCOUNT_LINKING, false);
  assert.equal(GOOGLE_ACCOUNT_LINKING.updateUserInfoOnLink, false);
  assert.ok(Object.isFrozen(GOOGLE_ACCOUNT_LINKING));
});
