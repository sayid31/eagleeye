import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildKeyRemoval, buildKeyUpdate, describeTestResult, fieldLabel, isEditable, keySource, keyStatus, providerRows, providersSummary, storeLabel,
} from './providerKeysView.js';

const openai = { id: 'openai', title: 'OPENAI', envVars: ['OPENAI_API_KEY'], set: true, managed: 'file', tier: 'metered' };
const opensky = { id: 'opensky', title: 'OPENSKY', envVars: ['OPENSKY_CLIENT_ID', 'OPENSKY_CLIENT_SECRET'], set: false, managed: null, tier: 'free' };
const tomtom = { id: 'tomtom', title: 'TOMTOM', envVars: ['TOMTOM_API_KEY'], set: true, managed: 'external', tier: 'free' };
const payload = { keys: [openai, opensky, tomtom], store: 'env-file' };

test('status and source follow presence, source and this visit\'s test', () => {
  assert.deepEqual(keyStatus({ set: false }), { id: 'unset', label: 'Belum', tone: 'muted' });
  assert.equal(keyStatus(openai).label, 'Terpasang');
  assert.equal(keyStatus(openai, 'rejected').id, 'rejected');
  assert.equal(keyStatus({ set: false }, 'rejected').id, 'unset', 'an empty key is never "rejected"');
  assert.equal(keyStatus(openai, 'ok').id, 'set');
  assert.equal(keySource(openai, 'env-file').label, '.env');
  assert.equal(keySource(openai, 'pinokio-environment').id, 'pinokio');
  assert.equal(keySource(tomtom, 'env-file').id, 'external');
  assert.equal(keySource(opensky, 'env-file').id, 'none');
  assert.equal(isEditable(openai) && isEditable(opensky), true);
  assert.equal(isEditable(tomtom), false);
});

test('providerRows carry Indonesian name and purpose, status, source, editability and the last test', () => {
  const rows = providerRows(payload, { openai: { result: 'rejected', at: 1 } });
  assert.deepEqual(rows.map((r) => r.id), ['openai', 'opensky', 'tomtom']);
  assert.equal(rows[0].name, 'OpenAI');
  assert.match(rows[0].purpose, /suara/);
  assert.equal(rows[0].status.id, 'rejected');
  assert.equal(rows[0].lastTest.at, 1);
  assert.equal(rows[1].testable, false);
  assert.equal(rows[2].editable, false);
  assert.equal(rows[2].testable, true, 'a key set outside the app can still be tested');
  for (const row of rows) assert.doesNotMatch(JSON.stringify({ ...row, key: undefined }), /[A-Z]{3,}_[A-Z_]+_(KEY|SECRET|TOKEN)\b.*=/);
});

test('an unknown provider id falls back to the server title', () => {
  const [row] = providerRows({ keys: [{ id: 'future', title: 'FUTURE', unlocks: 'Something', envVars: ['F'], set: false, tier: 'free' }], store: 'env-file' });
  assert.deepEqual([row.name, row.purpose], ['FUTURE', 'Something']);
});

test('summary and store label are in owner terms', () => {
  assert.equal(providersSummary(payload), '2 dari 3 penyedia sudah punya kunci. Kunci disimpan di file .env proyek di komputer ini.');
  assert.equal(storeLabel('pinokio-environment'), 'file ENVIRONMENT Pinokio');
});

test('buildKeyUpdate trims, requires every variable, rejects spaces and keys errors by variable', () => {
  assert.deepEqual(buildKeyUpdate(openai, { OPENAI_API_KEY: '  abc123  ' }), { ok: true, updates: { OPENAI_API_KEY: 'abc123' } });
  assert.match(buildKeyUpdate(openai, {}).errors.OPENAI_API_KEY, /API key wajib diisi/);
  const partial = buildKeyUpdate(opensky, { OPENSKY_CLIENT_ID: 'id' });
  assert.deepEqual(Object.keys(partial.errors), ['OPENSKY_CLIENT_SECRET']);
  assert.match(partial.errors.OPENSKY_CLIENT_SECRET, /Isi semua kolom/);
  assert.match(buildKeyUpdate(openai, { OPENAI_API_KEY: 'a b' }).errors.OPENAI_API_KEY, /tidak boleh berisi spasi/);
  assert.deepEqual(buildKeyRemoval(opensky), { OPENSKY_CLIENT_ID: null, OPENSKY_CLIENT_SECRET: null });
});

test('field labels: a single variable is "API key", parts use their own names', () => {
  assert.equal(fieldLabel(openai, 'OPENAI_API_KEY'), 'API key');
  assert.equal(fieldLabel(opensky, 'OPENSKY_CLIENT_ID'), 'Client ID');
  assert.equal(fieldLabel({ envVars: ['A', 'B'] }, 'A'), 'A');
});

test('test results read as words with a tone; the AIS hint only joins "tidak terhubung"', () => {
  assert.deepEqual(['ok', 'rejected', 'unreachable', 'untestable', 'not_set', 'weird'].map((r) => describeTestResult({ result: r }, 'x').tone),
    ['success', 'destructive', 'warning', 'muted', 'muted', 'muted']);
  assert.match(describeTestResult({ result: 'unreachable' }, 'aisstream').text, /layer Kapal/);
  assert.doesNotMatch(describeTestResult({ result: 'unreachable' }, 'openai').text, /layer Kapal/);
  assert.equal(describeTestResult({ result: 'weird' }, 'x').label, 'Tidak diketahui');
  assert.doesNotMatch(describeTestResult({ result: 'rejected', httpStatus: 401, message: 'HTTP 401' }, 'x').text, /401/, 'no raw status');
});
