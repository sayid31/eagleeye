import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AUDIT_TYPES } from '../../audit/adminAuditRoutes.mjs';
import { AUDIT_FILTER_COPY } from '../../../copy/en/systemLogs.js';
import { ALL_TYPES, auditRows, auditTypeParam, describeAuditEntry } from './auditView.js';
import { fetchAudit, fetchHealth, fetchLog } from './logsApi.js';

test('audit filter ids match the server types', () => {
  assert.deepEqual(AUDIT_FILTER_COPY.map((f) => f.id).filter(Boolean), Object.keys(AUDIT_TYPES));
  assert.equal(auditTypeParam(ALL_TYPES), '');
  assert.equal(auditTypeParam('keys'), 'keys');
});

test('describeAuditEntry words each event in Indonesian with a status', () => {
  assert.deepEqual(describeAuditEntry({ event: 'keys.changed', saved: ['OPENAI_API_KEY'], removed: ['TOMTOM_API_KEY'] }),
    { title: 'API key changed', detail: 'saved: OPENAI_API_KEY · removed: TOMTOM_API_KEY', status: 'ok' });
  assert.deepEqual(describeAuditEntry({ event: 'keys.tested', provider: 'openai', result: 'rejected', httpStatus: 401 }),
    { title: 'Connection tested', detail: 'OpenAI: rejected (HTTP 401)', status: 'error' });
  assert.equal(describeAuditEntry({ event: 'voice_settings.saved', sections: ['limits', 'persona'] }).detail, 'Changed: limits, persona');
  assert.equal(describeAuditEntry({ event: 'admin.login_denied', result: 'not_admin' }).status, 'warn');
  assert.equal(describeAuditEntry({ event: 'log.cleared' }).title, 'Server Log cleared');
  const unknown = describeAuditEntry({ event: 'something.new', provider: 'x', result: 'y' });
  assert.deepEqual([unknown.title, unknown.detail, unknown.status], ['something.new', 'x · y', 'off']);
});

test('auditRows keeps the server order and builds unique ids', () => {
  const at = new Date(1_800_000_000_000).toISOString();
  const rows = auditRows([{ at, event: 'log.cleared', source: 'admin' }, { at, event: 'log.cleared' }], 1_800_000_060_000);
  assert.equal(rows.length, 2);
  assert.notEqual(rows[0].id, rows[1].id);
  assert.equal(rows[0].via, 'Via admin');
  assert.equal(rows[0].time.relative, '1 min ago');
  assert.equal(rows[1].via, '');
});

test('fetchAudit builds the query; failures carry status (and code only when the server sent one)', async () => {
  let url;
  await fetchAudit({ type: 'keys', offset: 100 }, async (u) => { url = u; return { ok: true, json: async () => ({}) }; });
  assert.equal(url, '/api/admin/audit?source=system&type=keys&offset=100');
  const failure = await fetchHealth(async () => ({ ok: false, status: 401, json: async () => ({ error: 'Login required' }) })).catch((e) => e);
  assert.equal(failure.status, 401);
  assert.equal(failure.code, null);
  const coded = await fetchLog({}, async () => ({ ok: false, status: 403, json: async () => ({ error: 'SUPER_ADMIN_REQUIRED' }) })).catch((e) => e);
  assert.equal(coded.code, 'SUPER_ADMIN_REQUIRED');
});
