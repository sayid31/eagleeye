import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { openAuthDatabase } from './authDatabase.mjs';
import { readAuthEnv } from './authEnv.mjs';
import { createAuthInstance, migrateAuthSchema } from './authInstance.mjs';
import { mintSessionCookie } from './authSessionMint.mjs';
import { createActorResolver } from './actorResolver.mjs';

// test-only fixtures, not real credentials
const env = (dir) => ({
  BETTER_AUTH_SECRET: randomBytes(32).toString('hex'),
  SUPER_ADMIN_EMAILS: 'owner@example.test',
  GOOGLE_CLIENT_ID: 'fixture-client.apps.googleusercontent.com',
  GOOGLE_CLIENT_SECRET: 'fixture-secret',
  AUTH_DATABASE_FILE: path.join(dir, 'nested', 'auth.db'),
});

async function setup(options = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gev-auth-'));
  const config = readAuthEnv(env(dir), { port: 4173 });
  const { db } = await openAuthDatabase(config.databaseFile);
  const auth = createAuthInstance({ database: db, config, ...options });
  return { dir, db, config, auth, migrated: await migrateAuthSchema(auth) };
}

// node:sqlite returns null-prototype rows; copy them for deepEqual.
const rows = (db, sql) => db.prepare(sql).all().map((row) => ({ ...row }));
const settle = () => new Promise((resolve) => setTimeout(resolve, 20));

test('the migration builds every table from an empty file and is a no-op the second time', async () => {
  const { db, auth, migrated, config } = await setup();
  assert.deepEqual(migrated.created.sort(), ['account', 'login_log', 'session', 'user', 'verification']);
  assert.deepEqual(await migrateAuthSchema(auth), { created: [], added: [] });
  const userColumns = rows(db, "SELECT name FROM pragma_table_info('user')").map((c) => c.name);
  assert.ok(userColumns.includes('role') && userColumns.includes('status'));
  const logColumns = rows(db, "SELECT name FROM pragma_table_info('login_log')").map((c) => c.name).sort();
  assert.deepEqual(logColumns, ['createdAt', 'id', 'ip', 'method', 'userAgent', 'userId']);
  assert.equal(db.prepare('PRAGMA journal_mode;').get().journal_mode, 'wal');
  assert.equal(fs.statSync(config.databaseFile).mode & 0o777, 0o600);
  assert.equal(fs.statSync(path.dirname(config.databaseFile)).mode & 0o777, 0o700);
});

test('create hook: env super-admin starts super-admin/active, anyone else user/pending, forged values ignored', async () => {
  const { auth } = await setup();
  const ctx = await auth.$context;
  const forged = { name: 'Fixture', emailVerified: true, role: 'super-admin', status: 'active' };
  const { user: stranger } = await ctx.internalAdapter.createOAuthUser({ ...forged, email: 'someone@example.test' }, { providerId: 'google', accountId: 'sub-1' });
  const { user: owner } = await ctx.internalAdapter.createOAuthUser({ ...forged, email: 'Owner@Example.test', role: 'user', status: 'banned' }, { providerId: 'google', accountId: 'sub-2' });
  assert.deepEqual([stranger.role, stranger.status], ['user', 'pending']);
  assert.deepEqual([owner.role, owner.status], ['super-admin', 'active']);
});

test('every session creation writes one login_log row with the user id and method google', async () => {
  const { auth, db } = await setup();
  const first = await mintSessionCookie(auth, { email: 'someone@example.test' });
  await mintSessionCookie(auth, { email: 'someone@example.test' });
  await settle();
  const log = rows(db, 'SELECT userId, method FROM login_log');
  assert.deepEqual(log, [{ userId: first.userId, method: 'google' }, { userId: first.userId, method: 'google' }]);
});

test('a login_log failure is reported without the email and the sign-in still works', async () => {
  const warnings = [];
  const { auth, config } = await setup({
    writeLoginLog: async () => { throw Object.assign(new Error('disk full'), { code: 'SQLITE_FULL' }); },
    warn: (message) => warnings.push(message),
  });
  const minted = await mintSessionCookie(auth, { email: 'someone@example.test', status: 'active' });
  await settle();
  const resolver = createActorResolver({ auth, superAdminEmails: config.superAdminEmails });
  const actor = await resolver.resolveActor({ headers: { cookie: minted.cookie } });
  assert.equal(actor.user.id, minted.userId);
  assert.equal(actor.status, 'active');
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], new RegExp(`login_log insert failed for user ${minted.userId}: SQLITE_FULL`));
  assert.ok(!warnings[0].includes('@'));
});

test('session resolution reconciles role/status against env and writes only on change', async () => {
  const { auth, config, db } = await setup();
  const resolver = createActorResolver({ auth, superAdminEmails: config.superAdminEmails, cacheMs: 0 });
  // A stored super-admin whose email is not in env is demoted to user on its next request.
  const former = await mintSessionCookie(auth, { email: 'former@example.test', role: 'super-admin', status: 'active' });
  const demoted = await resolver.resolveActor({ headers: { cookie: former.cookie } });
  assert.deepEqual([demoted.role, demoted.status], ['user', 'active']);
  assert.equal(db.prepare('SELECT role FROM user WHERE id = ?').get(former.userId).role, 'user');
  // The env owner is forced back to super-admin/active even if the row says otherwise.
  const owner = await mintSessionCookie(auth, { email: 'owner@example.test', role: 'user', status: 'banned' });
  const restored = await resolver.resolveActor({ headers: { cookie: owner.cookie } });
  assert.deepEqual([restored.role, restored.status], ['super-admin', 'active']);
  const before = db.prepare('SELECT updatedAt FROM user WHERE id = ?').get(owner.userId).updatedAt;
  await resolver.resolveActor({ headers: { cookie: owner.cookie } });
  assert.equal(db.prepare('SELECT updatedAt FROM user WHERE id = ?').get(owner.userId).updatedAt, before);
  // No cookie, or a forged one, resolves to nobody.
  assert.equal(await resolver.resolveActor({ headers: {} }), null);
  assert.equal(await resolver.resolveActor({ headers: { cookie: `${owner.cookieName}=${owner.token}.forged` } }), null);
});
