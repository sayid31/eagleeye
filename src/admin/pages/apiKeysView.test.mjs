import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildKeyRemoval, buildKeyUpdate, describeTestResult, isEditable, keyStatusBadge, storeLabel } from './apiKeysView.js';

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
    { text: 'The provider accepted the key. (HTTP 200)', tone: 'ok' });
  assert.equal(describeTestResult({ result: 'rejected', message: 'x' }).tone, 'error');
  assert.equal(describeTestResult({ result: 'untestable', message: 'x' }).text, 'x');
});
