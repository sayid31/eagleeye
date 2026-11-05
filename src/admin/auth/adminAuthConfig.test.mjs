import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readAdminAuthConfig } from './adminAuthConfig.mjs';

// test-only fixtures, not real credentials
const GOOD = {
  GOOGLE_CLIENT_ID: 'client-id', GOOGLE_CLIENT_SECRET: 'client-secret',
  ADMIN_EMAIL: 'Owner@Example.com', ADMIN_SESSION_SECRET: 'x'.repeat(32),
};

test('a complete env yields a config with lowercase admin email and 24h session', () => {
  const config = readAdminAuthConfig(GOOD);
  assert.equal(config.ok, true);
  assert.equal(config.adminEmail, 'owner@example.com');
  assert.equal(config.sessionTtlMs, 24 * 3_600_000);
  assert.equal(config.redirectUri, 'http://localhost:4173/api/admin/auth/callback');
  assert.equal(config.allowedOrigin, 'http://localhost:4173');
  assert.equal(config.secureCookies, false);
});

test('missing or weak settings are reported by NAME only', () => {
  const result = readAdminAuthConfig({ ...GOOD, ADMIN_SESSION_SECRET: 'short', ADMIN_EMAIL: 'not-an-email', GOOGLE_CLIENT_ID: '' });
  assert.equal(result.ok, false);
  assert.deepEqual(result.missing.sort(), ['ADMIN_EMAIL', 'ADMIN_SESSION_SECRET', 'GOOGLE_CLIENT_ID']);
  assert.ok(!JSON.stringify(result).includes('short'));
});

test('an https redirect URI turns on Secure cookies; PORT and TTL are honoured', () => {
  assert.equal(readAdminAuthConfig({ ...GOOD, ADMIN_OAUTH_REDIRECT_URI: 'https://admin.example.com/api/admin/auth/callback' }).secureCookies, true);
  assert.equal(readAdminAuthConfig({ ...GOOD, PORT: '5000' }).redirectUri, 'http://localhost:5000/api/admin/auth/callback');
  assert.equal(readAdminAuthConfig({ ...GOOD, ADMIN_SESSION_TTL_HOURS: '2' }).sessionTtlMs, 2 * 3_600_000);
});

test('a non-http redirect URI is rejected', () => {
  assert.deepEqual(readAdminAuthConfig({ ...GOOD, ADMIN_OAUTH_REDIRECT_URI: 'javascript:alert(1)' }).missing, ['ADMIN_OAUTH_REDIRECT_URI']);
});
