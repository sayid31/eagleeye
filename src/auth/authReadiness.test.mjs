import { test } from 'node:test';
import assert from 'node:assert/strict';
import { READINESS_MESSAGES_EN, authReadinessChecks, publicExposure, readinessWarnings } from './authReadiness.mjs';

const SECRET = 's'.repeat(40); // test-only
const GOOD_ENV = { BETTER_AUTH_SECRET: SECRET, SUPER_ADMIN_EMAILS: 'owner@example.test' }; // test-only
const FACTS = { available: true, envEmails: 1, ready: 1, noAccount: 0, blocked: 0, passwordOnlyAdmins: 0, reconcileBlocked: 0 };
const byId = (checks) => Object.fromEntries(checks.map((item) => [item.id, item]));

test('publicExposure: wildcard HOST or a non-loopback BETTER_AUTH_URL', () => {
  assert.deepEqual(publicExposure({}), { exposed: false, via: null });
  assert.deepEqual(publicExposure({ HOST: 'localhost', BETTER_AUTH_URL: 'http://127.0.0.1:4173' }), { exposed: false, via: null });
  assert.deepEqual(publicExposure({ BETTER_AUTH_URL: 'http://[::1]:4173' }), { exposed: false, via: null });
  assert.deepEqual(publicExposure({ HOST: '0.0.0.0' }), { exposed: true, via: 'host' });
  assert.deepEqual(publicExposure({ HOST: '::' }), { exposed: true, via: 'host' });
  assert.deepEqual(publicExposure({ BETTER_AUTH_URL: 'https://eagle.example.test' }), { exposed: true, via: 'url' });
  assert.deepEqual(publicExposure({ BETTER_AUTH_URL: 'not a url' }), { exposed: false, via: null });
});

test('all good: every check ok, no warnings', () => {
  const checks = authReadinessChecks({ env: GOOD_ENV, facts: FACTS });
  assert.deepEqual(checks.map((item) => [item.id, item.level]), [
    ['auth.secret', 'ok'], ['auth.superAdminEmails', 'ok'], ['auth.database', 'ok'], ['auth.superAdminAccess', 'ok'], ['auth.exposure', 'ok'],
  ]);
  assert.deepEqual(readinessWarnings(checks), []);
});

test('secret: missing / too short are errors; legacy name is a warning; database not consulted on errors', () => {
  const missing = byId(authReadinessChecks({ env: { SUPER_ADMIN_EMAILS: 'owner@example.test' }, facts: FACTS }));
  assert.deepEqual(missing['auth.secret'], { id: 'auth.secret', level: 'error', params: { problem: 'missing' } });
  assert.equal(missing['auth.database'], undefined);
  const short = byId(authReadinessChecks({ env: { ...GOOD_ENV, BETTER_AUTH_SECRET: 'short' }, facts: FACTS }));
  assert.deepEqual(short['auth.secret'].params, { problem: 'invalid' });
  const legacy = byId(authReadinessChecks({ env: { ADMIN_SESSION_SECRET: SECRET, SUPER_ADMIN_EMAILS: 'owner@example.test' }, facts: FACTS }));
  assert.equal(legacy['auth.secret'].level, 'warn');
});

test('SUPER_ADMIN_EMAILS missing or invalid; BETTER_AUTH_URL invalid', () => {
  assert.deepEqual(byId(authReadinessChecks({ env: { BETTER_AUTH_SECRET: SECRET } }))['auth.superAdminEmails'].params, { problem: 'missing' });
  assert.deepEqual(byId(authReadinessChecks({ env: { ...GOOD_ENV, SUPER_ADMIN_EMAILS: 'nope' } }))['auth.superAdminEmails'].params, { problem: 'invalid' });
  assert.equal(byId(authReadinessChecks({ env: { ...GOOD_ENV, BETTER_AUTH_URL: 'ftp://x' } }))['auth.url'].level, 'error');
});

test('database facts: missing DB, env emails without access, blocked promotions', () => {
  assert.deepEqual(byId(authReadinessChecks({ env: GOOD_ENV, facts: null }))['auth.database'], { id: 'auth.database', level: 'warn', params: { problem: 'missing' } });
  const checks = byId(authReadinessChecks({ env: GOOD_ENV, facts: { ...FACTS, envEmails: 3, ready: 1, noAccount: 1, blocked: 1, reconcileBlocked: 2 } }));
  assert.equal(checks['auth.superAdminAccess'].level, 'warn');
  assert.deepEqual(checks['auth.reconcileBlocked'], { id: 'auth.reconcileBlocked', level: 'warn', params: { count: 2 } });
  assert.match(READINESS_MESSAGES_EN['auth.superAdminAccess'](checks['auth.superAdminAccess'].params), /1 of 3 .*1 without an account .*auth:set-password.*1 with an admin-set password/);
});

test('exposure: warn when public while admins are password-only (or unknown); ok when none', () => {
  const pub = { ...GOOD_ENV, HOST: '0.0.0.0' };
  assert.equal(byId(authReadinessChecks({ env: pub, facts: { ...FACTS, passwordOnlyAdmins: 2 } }))['auth.exposure'].level, 'warn');
  assert.equal(byId(authReadinessChecks({ env: pub, facts: null }))['auth.exposure'].level, 'warn', 'unknown counts are risky');
  assert.equal(byId(authReadinessChecks({ env: pub, facts: FACTS }))['auth.exposure'].level, 'ok');
  const message = READINESS_MESSAGES_EN['auth.exposure']({ exposed: true, via: 'host', passwordOnlyAdmins: 2 });
  assert.match(message, /HOST.*2 admin\(s\).*reverse proxy/);
});

test('no check result or message ever contains the secret or an email', () => {
  const checks = authReadinessChecks({ env: { ...GOOD_ENV, HOST: '0.0.0.0' }, facts: { ...FACTS, passwordOnlyAdmins: 1, reconcileBlocked: 1 } });
  const text = JSON.stringify(checks) + checks.map((item) => READINESS_MESSAGES_EN[item.id](item.params)).join('\n');
  assert.doesNotMatch(text, new RegExp(SECRET));
  assert.doesNotMatch(text, /owner@example\.test/);
});
