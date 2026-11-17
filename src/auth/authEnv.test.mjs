import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { parseEmailList, readAuthEnv } from './authEnv.mjs';

// test-only fixtures, not real credentials
const SECRET = 'f'.repeat(16) + 'e'.repeat(16) + 'd'.repeat(8);
const GOOD = {
  BETTER_AUTH_SECRET: SECRET,
  SUPER_ADMIN_EMAILS: 'Owner@Example.test, second@example.test',
  GOOGLE_CLIENT_ID: '1234-abc.apps.googleusercontent.com',
  GOOGLE_CLIENT_SECRET: 'client-secret-fixture',
};

test('a complete env yields a trimmed config with lower-cased super-admins and the localhost default URL', () => {
  const config = readAuthEnv({ ...GOOD, GOOGLE_CLIENT_ID: `  ${GOOD.GOOGLE_CLIENT_ID}\n`, BETTER_AUTH_SECRET: ` ${SECRET} ` }, { rootDir: '/repo' });
  assert.equal(config.ok, true);
  assert.equal(config.googleClientId, GOOD.GOOGLE_CLIENT_ID);
  assert.equal(config.secret, SECRET);
  assert.deepEqual(config.superAdminEmails, ['owner@example.test', 'second@example.test']);
  assert.equal(config.baseURL, 'http://localhost:4173');
  assert.equal(config.origin, 'http://localhost:4173');
  assert.equal(config.secureCookies, false);
  assert.equal(config.databaseFile, path.resolve('/repo', 'data/auth.db'));
  assert.deepEqual(config.warnings, []);
});

test('the listening port and PORT drive the default URL; BETTER_AUTH_URL overrides it', () => {
  assert.equal(readAuthEnv(GOOD, { port: 4183 }).baseURL, 'http://localhost:4183');
  assert.equal(readAuthEnv({ ...GOOD, PORT: '5000' }).baseURL, 'http://localhost:5000');
  const https = readAuthEnv({ ...GOOD, BETTER_AUTH_URL: 'https://eagle.example.test/' });
  assert.equal(https.origin, 'https://eagle.example.test');
  assert.equal(https.secureCookies, true);
  assert.deepEqual(readAuthEnv({ ...GOOD, BETTER_AUTH_URL: 'javascript:alert(1)' }).invalid, ['BETTER_AUTH_URL']);
  assert.deepEqual(readAuthEnv({ ...GOOD, BETTER_AUTH_URL: 'http://localhost:4173/app' }).invalid, ['BETTER_AUTH_URL']);
});

test('nothing set → not configured, listing NAMES only', () => {
  const result = readAuthEnv({});
  assert.equal(result.ok, false);
  assert.deepEqual(result.missing.sort(), ['BETTER_AUTH_SECRET', 'GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'SUPER_ADMIN_EMAILS']);
  assert.deepEqual(result.invalid, []);
});

test('weak secrets and bad client ids are invalid, and no value is echoed', () => {
  const result = readAuthEnv({ ...GOOD, BETTER_AUTH_SECRET: 'short-secret', GOOGLE_CLIENT_ID: '1234 abc.apps.googleusercontent.com' });
  assert.equal(result.ok, false);
  assert.deepEqual(result.invalid.sort(), ['BETTER_AUTH_SECRET', 'GOOGLE_CLIENT_ID']);
  const text = JSON.stringify(result);
  assert.ok(!text.includes('short-secret') && !text.includes('1234'));
  assert.deepEqual(readAuthEnv({ ...GOOD, GOOGLE_CLIENT_ID: '1234-abc.apps.googleusercontent.com​' }).invalid, ['GOOGLE_CLIENT_ID']);
  assert.deepEqual(readAuthEnv({ ...GOOD, GOOGLE_CLIENT_ID: '1234-äbc.apps.googleusercontent.com' }).invalid, ['GOOGLE_CLIENT_ID']);
});

test('legacy ADMIN_SESSION_SECRET and ADMIN_EMAIL still work, with a compatibility warning', () => {
  const { BETTER_AUTH_SECRET, SUPER_ADMIN_EMAILS, ...rest } = GOOD;
  const config = readAuthEnv({ ...rest, ADMIN_SESSION_SECRET: SECRET, ADMIN_EMAIL: ' Legacy@Example.test ' });
  assert.equal(config.ok, true);
  assert.equal(config.secret, SECRET);
  assert.deepEqual(config.superAdminEmails, ['legacy@example.test']);
  assert.equal(config.warnings.length, 2);
  assert.ok(config.warnings.every((w) => !w.includes('@')));
  assert.deepEqual(readAuthEnv({ ...rest, ADMIN_SESSION_SECRET: 'tiny', ADMIN_EMAIL: 'nope' }).invalid.sort(), ['ADMIN_EMAIL', 'ADMIN_SESSION_SECRET']);
  assert.equal(readAuthEnv({ ...GOOD, ADMIN_SESSION_SECRET: 'ignored-because-better-auth-secret-wins' }).secret, SECRET);
});

test('parseEmailList trims, lower-cases, de-duplicates and drops non-emails', () => {
  assert.deepEqual(parseEmailList(' A@x.test,a@X.test , not-an-email,, b@y.test'), ['a@x.test', 'b@y.test']);
  assert.deepEqual(parseEmailList(undefined), []);
  assert.deepEqual(readAuthEnv({ ...GOOD, SUPER_ADMIN_EMAILS: 'nope, still-nope' }).invalid, ['SUPER_ADMIN_EMAILS']);
});

test('AUTH_DATABASE_FILE is resolved against the checkout root', () => {
  assert.equal(readAuthEnv({ ...GOOD, AUTH_DATABASE_FILE: ' var/users.db ' }, { rootDir: '/repo' }).databaseFile, path.resolve('/repo/var/users.db'));
  assert.equal(readAuthEnv({ ...GOOD, AUTH_DATABASE_FILE: '/abs/auth.db' }, { rootDir: '/repo' }).databaseFile, '/abs/auth.db');
});
