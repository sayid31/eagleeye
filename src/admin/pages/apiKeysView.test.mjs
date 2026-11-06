import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AI_PROVIDER_KEY_IDS, partitionKeys, buildKeyRemoval, buildKeyUpdate, describeTestResult, isEditable, keyStatusBadge, storeLabel } from './apiKeysView.js';

const openai = { title: 'OPENAI', envVars: ['OPENAI_API_KEY'] };
const opensky = { title: 'OPENSKY', envVars: ['OPENSKY_CLIENT_ID', 'OPENSKY_CLIENT_SECRET'] };

test('status badge and editability follow presence and source', () => {
  assert.deepEqual(keyStatusBadge({ set: false }), { label: 'Missing', tone: 'muted' });
  assert.equal(keyStatusBadge({ set: true, managed: 'file' }).label, 'Configured');
  assert.match(keyStatusBadge({ set: true, managed: 'external' }).label, /read-only/);
  assert.equal(isEditable({ set: false }), true);
  assert.equal(isEditable({ set: true, managed: 'file' }), true);
  assert.equal(isEditable({ set: true, managed: 'external' }), false);
});

test('storeLabel names the file in owner terms', () => {
  assert.equal(storeLabel('env-file'), 'the project .env file');
  assert.equal(storeLabel('pinokio-environment'), 'the Pinokio ENVIRONMENT file');
});

test('buildKeyUpdate trims, requires every variable and rejects spaces', () => {
  assert.deepEqual(buildKeyUpdate(openai, { OPENAI_API_KEY: '  abc123  ' }), { ok: true, updates: { OPENAI_API_KEY: 'abc123' } });
  assert.match(buildKeyUpdate(openai, {}).error, /Paste the OPENAI key first/);
  assert.match(buildKeyUpdate(opensky, { OPENSKY_CLIENT_ID: 'id' }).error, /Fill in every field for OPENSKY/);
  assert.match(buildKeyUpdate(openai, { OPENAI_API_KEY: 'a b' }).error, /must not contain spaces/);
});

test('buildKeyRemoval nulls every variable of the provider', () => {
  assert.deepEqual(buildKeyRemoval(opensky), { OPENSKY_CLIENT_ID: null, OPENSKY_CLIENT_SECRET: null });
});

test('describeTestResult maps result codes to tones and adds the HTTP status', () => {
  assert.deepEqual(describeTestResult({ result: 'ok', httpStatus: 200, message: 'The provider accepted the key.' }),
    { text: 'The provider accepted the key. (HTTP 200)', tone: 'ok', label: 'OK' });
  assert.equal(describeTestResult({ result: 'ok', message: 'The live vessel feed on this server is receiving data with this key.' }).label, 'OK');
  assert.equal(describeTestResult({ result: 'unreachable', message: 'x' }).label, 'Not checked');
  assert.equal(describeTestResult({ result: 'weird', message: 'x' }).label, 'Unknown');
  assert.equal(describeTestResult({ result: 'rejected', message: 'x' }).tone, 'error');
  assert.equal(describeTestResult({ result: 'untestable', message: 'x' }).text, 'x');
});

test('partitionKeys moves the OpenAI key to AI Provider and counts each side', () => {
  const keys = [{ id: 'google-maps', set: false }, { id: 'openai', set: true }, { id: 'firms', set: true }];
  const { ai, data } = partitionKeys(keys);
  assert.deepEqual(ai.keys.map((k) => k.id), ['openai']);
  assert.deepEqual({ setCount: ai.setCount, total: ai.total }, { setCount: 1, total: 1 });
  assert.deepEqual(data.keys.map((k) => k.id), ['google-maps', 'firms']);
  assert.deepEqual({ setCount: data.setCount, total: data.total }, { setCount: 1, total: 2 });
  assert.deepEqual(AI_PROVIDER_KEY_IDS, ['openai']);
});

test('test-result colours are scoped to beat the card paragraph colour', async () => {
  const fs = await import('node:fs');
  const css = fs.readFileSync(new URL('../adminForms.css', import.meta.url), 'utf8');
  for (const tone of ['ok', 'error', 'warn', 'muted']) assert.match(css, new RegExp(`\\.adm-card \\.adm-test-${tone} \\{`), tone);
});
