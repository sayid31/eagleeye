import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { DEFAULT_AUTH_DATABASE_FILE, MIN_AUTH_SECRET_LENGTH, parseEmailList, readAuthEnv } from './authEnv.mjs';

const SECRET = 'x'.repeat(MIN_AUTH_SECRET_LENGTH); // test-only
const base = { BETTER_AUTH_SECRET: SECRET, SUPER_ADMIN_EMAILS: ' Owner@Example.test, dev@example.test ,bad' };

test('a complete env: lower-cased super_admins, localhost default URL, .gev-data default DB with a legacy path', () => {
  const config = readAuthEnv(base, { port: 4391, rootDir: '/repo' });
  assert.equal(config.ok, true);
  assert.deepEqual(config.superAdminEmails, ['owner@example.test', 'dev@example.test']);
  assert.equal(config.origin, 'http://localhost:4391');
  assert.equal(DEFAULT_AUTH_DATABASE_FILE, '.gev-data/auth.db');
  assert.equal(config.databaseFile, path.resolve('/repo/.gev-data/auth.db'));
  assert.equal(config.legacyDatabaseFile, path.resolve('/repo/data/auth.db'));
  assert.equal(config.google, null, 'Google is optional');
  assert.equal(readAuthEnv({ ...base, AUTH_DATABASE_FILE: 'x/y.db' }, { rootDir: '/repo' }).legacyDatabaseFile, null, 'explicit file: no legacy move');
});

test('SUPER_ADMIN_EMAILS is required; ADMIN_EMAIL is no longer a fallback (warned by name)', () => {
  const missing = readAuthEnv({ BETTER_AUTH_SECRET: SECRET, ADMIN_EMAIL: 'owner@example.test' });
  assert.equal(missing.ok, false);
  assert.deepEqual(missing.missing, ['SUPER_ADMIN_EMAILS']);
  assert.match(missing.warnings.join(' '), /ADMIN_EMAIL is no longer read/);
  assert.deepEqual(readAuthEnv({ BETTER_AUTH_SECRET: SECRET, SUPER_ADMIN_EMAILS: 'nope' }).invalid, ['SUPER_ADMIN_EMAILS']);
  assert.deepEqual(readAuthEnv({ SUPER_ADMIN_EMAILS: 'a@b.cd' }).missing, ['BETTER_AUTH_SECRET']);
  assert.deepEqual(readAuthEnv({ ...base, BETTER_AUTH_SECRET: 'short' }).invalid, ['BETTER_AUTH_SECRET']);
});

test('Google: both values enable it; half or malformed pairs disable it with a warning, login still configured', () => {
  const full = readAuthEnv({ ...base, GOOGLE_CLIENT_ID: 'id.apps.googleusercontent.com', GOOGLE_CLIENT_SECRET: 'secret' }); // test-only
  assert.deepEqual(full.google, { clientId: 'id.apps.googleusercontent.com', clientSecret: 'secret' });
  const half = readAuthEnv({ ...base, GOOGLE_CLIENT_ID: 'id.apps.googleusercontent.com' });
  assert.equal(half.ok, true);
  assert.equal(half.google, null);
  assert.match(half.warnings.join(' '), /GOOGLE_CLIENT_SECRET/);
  assert.equal(readAuthEnv({ ...base, GOOGLE_CLIENT_ID: 'has space', GOOGLE_CLIENT_SECRET: 's' }).google, null);
});

test('AUTH_TRUSTED_PROXIES parsed; invalid entries counted, never echoed', () => {
  const config = readAuthEnv({ ...base, AUTH_TRUSTED_PROXIES: '127.0.0.1, 10.0.0.0/8, nonsense' });
  assert.deepEqual(config.trustedProxies.entries, ['127.0.0.1', '10.0.0.0/8']);
  assert.match(config.warnings.join(' '), /1 invalid entry/);
  assert.doesNotMatch(config.warnings.join(' '), /nonsense/);
});

test('parseEmailList de-duplicates and drops invalid entries', () => {
  assert.deepEqual(parseEmailList('A@b.cd, a@b.cd, x, , c@d.ef'), ['a@b.cd', 'c@d.ef']);
});
