import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { isBunRuntime, openAuthDatabase, prepareDatabaseFile, sharedAuthDatabase } from './authDatabase.mjs';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'gev-auth-db-'));

test('opens the runtime driver with WAL, busy timeout and foreign keys', async () => {
  const { db, driver, journalMode } = await openAuthDatabase(path.join(tmp(), 'a.db'));
  assert.equal(driver, isBunRuntime() ? 'bun:sqlite' : 'node:sqlite');
  assert.equal(journalMode, 'wal');
  assert.equal(Number(Object.values(db.prepare('PRAGMA busy_timeout;').get())[0]), 5000);
  assert.equal(Number(Object.values(db.prepare('PRAGMA foreign_keys;').get())[0]), 1);
});

test('a new directory is 0700 and the file 0600; an existing operator directory keeps its mode', () => {
  const root = tmp();
  const file = path.join(root, 'new', 'auth.db');
  prepareDatabaseFile(file);
  assert.equal(fs.statSync(path.dirname(file)).mode & 0o777, 0o700);
  assert.equal(fs.statSync(file).mode & 0o777, 0o600);
  fs.chmodSync(root, 0o755);
  prepareDatabaseFile(path.join(root, 'b.db'));
  assert.equal(fs.statSync(root).mode & 0o777, 0o755);
});

test('sharedAuthDatabase reuses one handle per file and retries after a failed open', async () => {
  const file = path.join(tmp(), 'shared.db');
  let opens = 0;
  const failing = async () => { opens += 1; throw new Error('locked'); };
  await assert.rejects(sharedAuthDatabase(file, failing), /locked/);
  await new Promise((resolve) => setImmediate(resolve));
  const first = await sharedAuthDatabase(file);
  const second = await sharedAuthDatabase(file, failing);
  assert.equal(first, second);
  assert.equal(opens, 1);
});

test('an unpreparable path fails with the file name and error code only', async () => {
  const blocker = path.join(tmp(), 'not-a-dir');
  fs.writeFileSync(blocker, '');
  await assert.rejects(openAuthDatabase(path.join(blocker, 'auth.db')), /Auth database auth\.db could not be prepared: (ENOTDIR|EEXIST)/);
});
