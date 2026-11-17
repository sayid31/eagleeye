import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { KILL_SWITCH_CACHE_MS, createKillSwitchStore, ensureKillSwitchSchema } from './killSwitchStore.mjs';

const OWNER = { id: 'u1', role: 'super_admin', email: 'owner@example.test' }; // test-only

function tempDb() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gev-ks-'));
  const file = path.join(dir, 'auth.db');
  return { file, db: new DatabaseSync(file) };
}

test('fresh store: every killable gate on; non-killable gates never killed', () => {
  const { db } = tempDb();
  const store = createKillSwitchStore({ db });
  assert.deepEqual(store.list().map((row) => [row.gate, row.killed, row.updatedBy]), [['layers', false, null], ['ai', false, null], ['premium', false, null]]);
  for (const gate of ['layers', 'ai', 'premium', 'open', 'admin', 'super']) assert.equal(store.isKilled(gate), false, gate);
  assert.throws(() => store.set('admin', true, { actor: OWNER, reason: 'x' }), /not a killable gate/);
  ensureKillSwitchSchema(db);
  ensureKillSwitchSchema(db);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE name = 'kill_switch'").get().n, 1, 'idempotent schema');
});

test('set: applies at once in this process, records who/when/why with a masked email', () => {
  const { db } = tempDb();
  let now = 1_000_000;
  const store = createKillSwitchStore({ db, now: () => now });
  assert.equal(store.isKilled('ai'), false);
  now += 10;
  const row = store.set('ai', true, { actor: OWNER, reason: '  biaya melonjak  ' });
  assert.deepEqual(row, { gate: 'ai', killed: true, reason: 'biaya melonjak', updatedBy: { id: 'u1', role: 'super_admin', emailMasked: 'o***@example.test' }, updatedAt: now });
  assert.equal(store.isKilled('ai'), true, 'cache cleared by the write');
  assert.deepEqual(store.killedGates(), ['ai']);
  assert.equal(store.set('ai', false, { actor: OWNER, reason: '' }).reason, null);
  assert.equal(store.isKilled('ai'), false);
});

test('a write from another process is seen within KILL_SWITCH_CACHE_MS, not before', () => {
  const { db } = tempDb();
  let now = 5_000_000;
  const store = createKillSwitchStore({ db, now: () => now });
  assert.equal(store.isKilled('layers'), false);
  db.prepare("INSERT INTO kill_switch (gate, killed) VALUES ('layers', 1)").run();
  now += KILL_SWITCH_CACHE_MS - 1;
  assert.equal(store.isKilled('layers'), false, 'still cached');
  now += 1;
  assert.equal(store.isKilled('layers'), true, 're-read after the cache window');
  assert.ok(KILL_SWITCH_CACHE_MS <= 2000);
});

test('persists across a restart: a new handle on the same file sees the switch', () => {
  const { db, file } = tempDb();
  createKillSwitchStore({ db }).set('premium', true, { actor: OWNER, reason: 'kuota Google' });
  db.close();
  const reopened = createKillSwitchStore({ db: new DatabaseSync(file) });
  assert.equal(reopened.isKilled('premium'), true);
  assert.equal(reopened.list()[2].reason, 'kuota Google');
});

test('a failing read is reported and keeps the last known state (a killed gate stays killed)', () => {
  const errors = [];
  let now = 0;
  let broken = false;
  const { db } = tempDb();
  const real = db.prepare.bind(db);
  const flaky = { exec: (sql) => db.exec(sql), prepare: (sql) => { if (broken) throw new Error('disk I/O error'); return real(sql); } };
  const store = createKillSwitchStore({ db: flaky, now: () => now, error: (message) => errors.push(message) });
  store.set('ai', true, { actor: OWNER, reason: 'biaya' });
  assert.equal(store.isKilled('ai'), true);
  broken = true;
  now += KILL_SWITCH_CACHE_MS;
  assert.equal(store.isKilled('ai'), true);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /\[kill-switch\] reading kill_switch failed.*disk I\/O error/);
});
