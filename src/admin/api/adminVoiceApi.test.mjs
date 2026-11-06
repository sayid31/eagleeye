import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fetchVoiceSettings, fetchVoiceUsage, saveVoiceSettings } from './adminVoiceApi.js';

const reply = (ok, status, body) => async () => ({ ok, status, json: async () => body });

test('fetchVoiceSettings returns the payload and sends the session cookie', async () => {
  let opts;
  const data = await fetchVoiceSettings(async (_url, o) => { opts = o; return { ok: true, status: 200, json: async () => ({ settings: { enabled: true } }) }; });
  assert.deepEqual(data, { settings: { enabled: true } });
  assert.equal(opts.credentials, 'same-origin');
});

test('saveVoiceSettings PUTs JSON', async () => {
  let call;
  await saveVoiceSettings({ enabled: false }, async (url, o) => { call = { url, o }; return { ok: true, status: 200, json: async () => ({}) }; });
  assert.equal(call.url, '/api/admin/voice/settings');
  assert.equal(call.o.method, 'PUT');
  assert.equal(call.o.headers['Content-Type'], 'application/json');
  assert.deepEqual(JSON.parse(call.o.body), { enabled: false });
});

test('a validation failure surfaces the server error and up to three details', async () => {
  const body = { error: 'Pengaturan tidak valid', details: ['a', 'b', 'c', 'd'] };
  await assert.rejects(saveVoiceSettings({}, reply(false, 422, body)), (error) => {
    assert.equal(error.message, 'Saving settings failed — Pengaturan tidak valid: a; b; c');
    assert.equal(error.status, 422);
    return true;
  });
});

test('a failure without a JSON body still names the HTTP status', async () => {
  const noJson = async () => ({ ok: false, status: 502, json: async () => { throw new Error('html'); } });
  await assert.rejects(fetchVoiceUsage(7, noJson), /Loading usage failed — HTTP 502/);
});

test('fetchVoiceUsage asks for the chosen window', async () => {
  let url;
  await fetchVoiceUsage(30, async (u) => { url = u; return { ok: true, status: 200, json: async () => ({}) }; });
  assert.equal(url, '/api/admin/voice/usage?days=30');
});
