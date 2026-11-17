import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { authDoctorEnv, formatAuthReadiness, inspectAuthReadiness } from '../scripts/setup-doctor.mjs';

const SECRET = 'doctor-secret-value-that-is-long-enough-1'; // test-only
const EMAIL = 'owner@example.test'; // test-only

test('authDoctorEnv: shell value wins, dotenv fills the rest, unrelated names are not read', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'gev-doctor-auth-'));
  writeFileSync(path.join(root, '.env'), `BETTER_AUTH_SECRET=${SECRET}\nSUPER_ADMIN_EMAILS=${EMAIL}\nOPENAI_API_KEY=sk-x\n`);
  const env = authDoctorEnv({ SUPER_ADMIN_EMAILS: 'shell@example.test', HOST: '0.0.0.0' }, root);
  assert.equal(env.BETTER_AUTH_SECRET, SECRET);
  assert.equal(env.SUPER_ADMIN_EMAILS, 'shell@example.test');
  assert.equal(env.HOST, '0.0.0.0');
  assert.equal(Object.hasOwn(env, 'OPENAI_API_KEY'), false);
});

test('inspectAuthReadiness reads facts from the configured database file and formats without values', async () => {
  const root = mkdtempSync(path.join(tmpdir(), 'gev-doctor-auth-'));
  let asked;
  const checks = await inspectAuthReadiness({
    environment: { BETTER_AUTH_SECRET: SECRET, SUPER_ADMIN_EMAILS: EMAIL, AUTH_DATABASE_FILE: 'db/auth.db', HOST: '0.0.0.0' },
    rootDir: root,
    readFacts: async (file, emails) => {
      asked = { file, emails };
      return { available: true, envEmails: 1, ready: 0, noAccount: 1, blocked: 0, passwordOnlyAdmins: 1, reconcileBlocked: 1 };
    },
  });
  assert.deepEqual(asked, { file: path.join(root, 'db', 'auth.db'), emails: EMAIL });
  const levels = Object.fromEntries(checks.map((item) => [item.id, item.level]));
  assert.deepEqual(levels, { 'auth.secret': 'ok', 'auth.superAdminEmails': 'ok', 'auth.database': 'ok', 'auth.superAdminAccess': 'warn', 'auth.reconcileBlocked': 'warn', 'auth.exposure': 'warn' });
  const text = formatAuthReadiness(checks);
  assert.match(text, /^Login \(auth\) readiness:/);
  assert.match(text, /\[OK\] BETTER_AUTH_SECRET present \(length ok\)/);
  assert.match(text, /\[WARN\] 0 of 1 super_admin email\(s\) can sign in; 1 without an account \(run npm run auth:set-password\)/);
  assert.match(text, /\[WARN\] 1 role\.reconcile\.blocked audit entry/);
  assert.match(text, /\[WARN\] reachable beyond localhost \(HOST\) while 1 admin\(s\).*reverse proxy/);
  assert.ok(!text.includes(SECRET) && !text.includes(EMAIL), 'no secret or email printed');
});

test('inspectAuthReadiness: nothing configured → errors, the real file reader reports a missing database', async () => {
  const root = mkdtempSync(path.join(tmpdir(), 'gev-doctor-auth-'));
  const empty = await inspectAuthReadiness({ environment: {}, rootDir: root });
  assert.deepEqual(empty.map((item) => [item.id, item.level]), [['auth.secret', 'error'], ['auth.superAdminEmails', 'error'], ['auth.exposure', 'ok']]);
  const noDb = await inspectAuthReadiness({ environment: { BETTER_AUTH_SECRET: SECRET, SUPER_ADMIN_EMAILS: EMAIL }, rootDir: root });
  assert.deepEqual(noDb.find((item) => item.id === 'auth.database'), { id: 'auth.database', level: 'warn', params: { problem: 'missing' } });
  assert.match(formatAuthReadiness(noDb), /auth database not created yet/);
});
