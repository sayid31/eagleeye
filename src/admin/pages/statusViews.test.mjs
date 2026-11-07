import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AUDIT_FILTERS, describeAuditEntry } from './auditView.js';
import { HEALTH_LABELS, describeOverall } from './healthView.js';
import { AUDIT_TYPES } from '../audit/adminAuditRoutes.mjs';
import { fetchAudit } from '../api/adminStatusApi.js';

test('audit filter ids match the server types', () => {
  assert.deepEqual(AUDIT_FILTERS.map((f) => f.id).filter(Boolean), Object.keys(AUDIT_TYPES));
});

test('describeAuditEntry words each event the owner will see', () => {
  assert.deepEqual(describeAuditEntry({ event: 'keys.changed', saved: ['OPENAI_API_KEY'], removed: ['TOMTOM_API_KEY'] }),
    { title: 'API key changed', detail: 'saved OPENAI_API_KEY · removed TOMTOM_API_KEY', tone: 'ok' });
  assert.deepEqual(describeAuditEntry({ event: 'keys.tested', provider: 'openai', result: 'rejected', httpStatus: 401 }),
    { title: 'Connection tested', detail: 'openai → rejected (HTTP 401)', tone: 'error' });
  assert.equal(describeAuditEntry({ event: 'voice_settings.saved', sections: ['limits', 'persona'] }).detail, 'Changed: limits, persona');
  assert.equal(describeAuditEntry({ event: 'admin.login_denied', result: 'not_admin' }).detail, 'Reason: not_admin');
  assert.equal(describeAuditEntry({ event: 'something.new', provider: 'x' }).title, 'something.new');
});

test('describeOverall counts problems and warnings; every status has a label', () => {
  const report = (statuses) => ({ sections: [{ items: statuses.map((status) => ({ status })) }] });
  assert.equal(describeOverall(report(['ok', 'off', 'unknown'])), 'All checks OK');
  assert.equal(describeOverall(report(['error', 'error', 'warn'])), '2 problems · 1 warning');
  for (const status of ['ok', 'warn', 'error', 'off', 'unknown']) assert.ok(HEALTH_LABELS[status]);
});

test('fetchAudit builds the query and surfaces server errors', async () => {
  let url;
  await fetchAudit({ type: 'keys', offset: 100 }, async (u) => { url = u; return { ok: true, json: async () => ({}) }; });
  assert.equal(url, '/api/admin/audit?type=keys&offset=100');
  await assert.rejects(fetchAudit({}, async () => ({ ok: false, status: 401, json: async () => ({ error: 'Login diperlukan' }) })), /Loading the audit log failed — Login diperlukan/);
});
