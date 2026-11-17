import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { openAuthDatabase } from './authDatabase.mjs';
import { readAuthEnv } from './authEnv.mjs';
import { createAuthInstance } from './authInstance.mjs';
import { AUTH_SCHEMA_VERSION, migrateAuthDatabase } from './authMigrations.mjs';

const DEFAULT_CAPS = '{"layers":true,"ai":true,"premium":false}';
const rows = (db, sql) => db.prepare(sql).all().map((row) => ({ ...row }));

async function open(file) {
  const config = readAuthEnv({ BETTER_AUTH_SECRET: randomBytes(32).toString('hex'), SUPER_ADMIN_EMAILS: 'owner@example.test', AUTH_DATABASE_FILE: file }, { port: 4173 }); // test-only
  const { db } = await openAuthDatabase(config.databaseFile);
  return { db, auth: createAuthInstance({ database: db, config }) };
}

test('a fresh database gets every table, owner-only files, schema v2; a second run is a no-op', async () => {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'gev-mig-')), '.gev-data', 'auth.db');
  const { db, auth } = await open(file);
  const first = await migrateAuthDatabase(auth, db, { defaultCapabilities: DEFAULT_CAPS });
  assert.deepEqual(first.created.sort(), ['account', 'audit_log', 'login_log', 'login_throttle', 'rateLimit', 'session', 'user', 'verification']);
  assert.equal(first.toVersion, AUTH_SCHEMA_VERSION);
  const second = await migrateAuthDatabase(auth, db, { defaultCapabilities: DEFAULT_CAPS });
  assert.deepEqual([second.created, second.added, second.fromVersion], [[], [], AUTH_SCHEMA_VERSION]);
  const userColumns = rows(db, "SELECT name FROM pragma_table_info('user')").map((c) => c.name);
  for (const column of ['role', 'banned', 'capabilities', 'mustChangePassword', 'passwordSetBy', 'failedLoginCount', 'throttleUntil', 'deletedAt', 'createdBy']) assert.ok(userColumns.includes(column), column);
  assert.equal(fs.statSync(file).mode & 0o777, 0o600);
  assert.equal(fs.statSync(path.dirname(file)).mode & 0o777, 0o700);
});

test('a phase-1a database is upgraded: super-admin renamed, pending/banned closed, login_log rebuilt with rows kept', async () => {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'gev-mig-1a-')), 'auth.db');
  const { db: legacy } = await openAuthDatabase(file);
  // The 1a schema, as Better Auth 1.7 created it (only the columns that matter here).
  legacy.exec(`CREATE TABLE "user" ("id" text not null primary key, "name" text not null, "email" text not null unique, "emailVerified" integer not null,
      "image" text, "createdAt" date not null, "updatedAt" date not null, "role" text, "status" text);
    CREATE TABLE "login_log" ("id" text not null primary key, "userId" text not null, "createdAt" date not null, "ip" text, "userAgent" text, "method" text not null);
    CREATE INDEX "login_log_userId_idx" ON "login_log" ("userId");
    INSERT INTO "user" VALUES ('o','Owner','owner@example.test',1,NULL,'2026-11-16','2026-11-16','super-admin','active');
    INSERT INTO "user" VALUES ('p','Pending','p@example.test',1,NULL,'2026-11-16','2026-11-16','user','pending');
    INSERT INTO "user" VALUES ('b','Banned','b@example.test',1,NULL,'2026-11-16','2026-11-16','user','banned');
    INSERT INTO "user" VALUES ('a','Active','a@example.test',1,NULL,'2026-11-16','2026-11-16','user','active');
    INSERT INTO "login_log" VALUES ('l1','o','2026-11-16T10:00:00.000Z','127.0.0.1','UA','google');`);
  legacy.close();
  const { db, auth } = await open(file);
  const result = await migrateAuthDatabase(auth, db, { defaultCapabilities: DEFAULT_CAPS });
  assert.equal(result.fromVersion, 0);
  assert.deepEqual(rows(db, 'SELECT id, role, banned, capabilities FROM "user" ORDER BY id'), [
    { id: 'a', role: 'user', banned: 0, capabilities: DEFAULT_CAPS },
    { id: 'b', role: 'user', banned: 1, capabilities: DEFAULT_CAPS },
    { id: 'o', role: 'super_admin', banned: 0, capabilities: DEFAULT_CAPS },
    { id: 'p', role: 'user', banned: 1, capabilities: DEFAULT_CAPS },
  ]);
  assert.deepEqual(rows(db, 'SELECT id, userId, method, success FROM login_log'), [{ id: 'l1', userId: 'o', method: 'google', success: 1 }]);
  assert.equal(rows(db, "SELECT \"notnull\" AS required FROM pragma_table_info('login_log') WHERE name = 'userId'")[0].required, 0);
  assert.equal(rows(db, "SELECT name FROM sqlite_master WHERE name = 'login_log_v1'").length, 0);
  const again = await migrateAuthDatabase(auth, db, { defaultCapabilities: DEFAULT_CAPS });
  assert.deepEqual([again.created, again.added], [[], []]);
});
