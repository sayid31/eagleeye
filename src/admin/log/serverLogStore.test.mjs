import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { capLogSize, createServerLog, maxLogBytes } from './serverLogStore.mjs';

const T0 = Date.UTC(2026, 10, 6, 10);

test('maxLogBytes reads GEV_SERVER_LOG_MAX_MB; capLogSize drops the oldest rows first', () => {
  assert.equal(maxLogBytes({}), 5 * 1024 * 1024);
  assert.equal(maxLogBytes({ GEV_SERVER_LOG_MAX_MB: '0.5' }), 524288);
  assert.equal(maxLogBytes({ GEV_SERVER_LOG_MAX_MB: 'x' }), 5 * 1024 * 1024);
  const rows = Array.from({ length: 50 }, (_, i) => ({ id: String(i), lastAt: i, message: 'm'.repeat(100) }));
  const capped = capLogSize(rows, 2000);
  assert.ok(Buffer.byteLength(JSON.stringify(capped)) <= 2000);
  assert.ok(capped.every((r) => r.lastAt >= 50 - capped.length));
});

test('store: records, persists 0600 after the flush, reloads, clears with a trace', () => {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'gev-slog-')), 'log.json');
  const timers = [];
  let t = T0;
  const store = createServerLog({ filePath: file, now: () => t, env: {}, setTimer: (fn) => timers.push(fn) });
  assert.equal(store.record({ level: 'error', source: 'browser', code: 'browser.js_error', message: 'boom' }), true);
  assert.equal(store.record({ level: 'nope' }), false);
  assert.equal(timers.length, 1);
  timers.shift()();
  assert.equal(fs.statSync(file).mode & 0o777, 0o600);
  t += 5;
  const reloaded = createServerLog({ filePath: file, now: () => t, env: {}, setTimer: () => {} });
  assert.equal(reloaded.query().entries[0].code, 'browser.js_error');
  assert.equal(reloaded.clear(), 1);
  assert.deepEqual(reloaded.query().entries.map((e) => e.code), ['log.cleared']);
});

test('store: a failed write is reported once as a log.write_failed entry, never thrown', () => {
  const failing = { ...fs, readFileSync: () => { throw Object.assign(new Error('x'), { code: 'ENOENT' }); }, mkdirSync: () => { throw new Error('disk full'); } };
  const warned = [];
  const warn = console.warn;
  console.warn = (m) => warned.push(m);
  try {
    const store = createServerLog({ filePath: '/nowhere/log.json', fileSystem: failing, now: () => T0, env: {}, setTimer: () => {} });
    store.record({ level: 'info', source: 'voice', code: 'voice.session_started' });
    store.flushNow();
    store.flushNow();
    assert.deepEqual(store.query({ level: 'error' }).entries.map((e) => e.code), ['log.write_failed']);
  } finally { console.warn = warn; }
  assert.equal(warned.length, 1);
});
