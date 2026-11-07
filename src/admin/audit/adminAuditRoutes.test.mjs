import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { installAdminAuditRoutes, parseAuditQuery } from './adminAuditRoutes.mjs';
import { createAdminAuditLog } from './adminAuditLog.mjs';

function setup(guard = () => ({ ok: true })) {
  const audit = createAdminAuditLog({ filePath: path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'gev-audr-')), 'a.jsonl'), now: () => new Date(2026, 10, 7) });
  let handler;
  installAdminAuditRoutes({ use: (_p, h) => { handler = h; } }, { audit, guard });
  const call = (url = '/', method = 'GET') => new Promise((resolve) => {
    const out = {};
    handler({ method, url }, { set statusCode(v) { out.status = v; }, setHeader() {}, end: (t) => { out.json = JSON.parse(t); resolve(out); } });
  });
  return { audit, call };
}

test('parseAuditQuery maps types to prefixes and clamps paging', () => {
  assert.deepEqual(parseAuditQuery('/?type=keys&limit=500&offset=10'), { type: 'keys', prefix: 'keys.', limit: 200, offset: 10 });
  assert.deepEqual(parseAuditQuery('/?type=nope'), { type: '', prefix: '', limit: 100, offset: 0 });
});

test('the audit route lists newest first, filters by type and pages', async () => {
  const { audit, call } = setup();
  audit.record({ event: 'keys.changed', source: 'admin', saved: ['OPENAI_API_KEY'] });
  audit.record({ event: 'admin.login', source: 'google', result: 'ok' });
  audit.record({ event: 'voice_settings.saved', source: 'admin', sections: ['limits', 'persona'] });
  const all = await call('/?limit=2');
  assert.deepEqual(all.json.entries.map((e) => e.event), ['voice_settings.saved', 'admin.login']);
  assert.equal(all.json.nextOffset, 2);
  assert.deepEqual((await call('/?offset=2')).json.entries.map((e) => e.event), ['keys.changed']);
  const keys = await call('/?type=keys');
  assert.deepEqual(keys.json.entries.map((e) => e.event), ['keys.changed']);
  assert.equal(keys.json.nextOffset, null);
  assert.deepEqual((await call('/?type=settings')).json.entries[0].sections, ['limits', 'persona']);
  assert.equal((await call('/', 'DELETE')).status, 405);
});

test('the audit route is refused without an admin session', async () => {
  const { call } = setup(() => ({ ok: false, status: 401, error: 'Login diperlukan' }));
  assert.equal((await call()).status, 401);
});
