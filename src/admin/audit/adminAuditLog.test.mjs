import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createAdminAuditLog, sanitizeAuditEntry } from './adminAuditLog.mjs';

const AT = new Date('2026-11-06T10:00:00Z');
const tmpFile = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'gev-audit-')), 'nested', 'a.jsonl');

test('sanitizeAuditEntry keeps only allowlisted code fields and env var names', () => {
  const entry = sanitizeAuditEntry({
    event: 'keys.changed', source: 'admin', saved: ['OPENAI_API_KEY', 'sk-test-value', 'lower_case'],
    removed: [], email: 'owner@example.com', value: 'sk-test-value', httpStatus: 401, provider: 'has space',
  }, AT);
  assert.deepEqual(entry, { at: '2026-11-06T10:00:00.000Z', event: 'keys.changed', source: 'admin', httpStatus: 401, saved: ['OPENAI_API_KEY'] });
  assert.equal(sanitizeAuditEntry({ source: 'admin' }, AT), null);
  assert.equal(sanitizeAuditEntry({ event: 'not a code!' }, AT), null);
});

test('record appends JSONL 0600 and list returns newest first', () => {
  const log = createAdminAuditLog({ filePath: tmpFile(), now: () => AT });
  assert.deepEqual(log.list(), []);
  assert.equal(log.record({ event: 'keys.tested', provider: 'openai', result: 'ok' }), true);
  assert.equal(log.record({ event: 'keys.changed', saved: ['FIRMS_MAP_KEY'] }), true);
  assert.equal(log.record({ nothing: true }), false);
  assert.deepEqual(log.list().map((e) => e.event), ['keys.changed', 'keys.tested']);
  assert.equal(fs.statSync(log.filePath).mode & 0o777, 0o600);
});

test('the file is trimmed to the newest lines once it doubles the cap', () => {
  const log = createAdminAuditLog({ filePath: tmpFile(), now: () => AT, maxLines: 3 });
  for (let i = 0; i < 7; i += 1) log.record({ event: `e.${i}` });
  assert.deepEqual(log.list().map((e) => e.event), ['e.6', 'e.5', 'e.4']);
});

test('a write failure is reported, not thrown', () => {
  const failing = { ...fs, appendFileSync: () => { throw Object.assign(new Error('nope'), { code: 'EACCES' }); } };
  const warned = [];
  const warn = console.warn;
  console.warn = (m) => warned.push(m);
  try {
    const log = createAdminAuditLog({ filePath: tmpFile(), fileSystem: failing, now: () => AT });
    assert.equal(log.record({ event: 'keys.changed' }), false);
  } finally { console.warn = warn; }
  assert.deepEqual(warned, ['[admin-audit] could not record keys.changed: EACCES']);
});
