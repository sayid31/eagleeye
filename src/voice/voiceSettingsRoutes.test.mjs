import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { installVoiceSettingsRoutes } from './voiceSettingsRoutes.mjs';
import { createVoiceSettingsStore } from './voiceSettingsStore.mjs';
import { defaultVoiceSettings, validateVoiceSettings } from './voiceSettingsCore.mjs';
import { createVoiceUsageStore } from './voiceUsageStore.mjs';

const ORIGIN = 'http://localhost:4173';

function setup() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gev-vr-'));
  const store = createVoiceSettingsStore({ filePath: path.join(dir, 'v.json') });
  const usageStore = createVoiceUsageStore({ filePath: path.join(dir, 'u.json'), now: () => new Date(2026, 10, 6, 12) });
  const routes = new Map();
  installVoiceSettingsRoutes({ use: (p, h) => routes.set(p, h) }, { store, usageStore, readRequestBody: async (req) => req.__body ?? '' });
  return { routes, store, usageStore };
}

async function call(routes, route, { method = 'GET', body, headers = {} } = {}) {
  const req = { method, headers: { host: 'localhost:4173', ...headers }, __body: body === undefined ? undefined : (typeof body === 'string' ? body : JSON.stringify(body)) };
  const res = { headers: {}, setHeader(k, v) { this.headers[k] = v; }, end(text) { this.text = text; } };
  await routes.get(route)(req, res);
  return { status: res.statusCode, headers: res.headers, json: JSON.parse(res.text) };
}

test('POWER UP is gone: no /api/setup/voice route is installed', () => {
  const { routes } = setup();
  assert.deepEqual([...routes.keys()].sort(), ['/api/voice/config', '/api/voice/usage']);
});

test('/api/voice/config returns the public slice only, never private fields', async () => {
  const { routes, store } = setup();
  store.write(validateVoiceSettings({ enabled: false, costLimits: { warnUsd: 1, capUsd: 3 }, persona: { name: 'Ela', instructions: 'Be brief.' } }).value);
  const pub = await call(routes, '/api/voice/config');
  assert.deepEqual(pub.json, {
    enabled: false,
    assistantName: 'Ela',
    costLimits: { warnUsd: 1, capUsd: 3 },
    limits: { dailyMinutes: 0, sessionMinutes: 0, idleSeconds: 0 },
    today: { remainingSeconds: null },
  });
  assert.ok(!JSON.stringify(pub.json).includes('Be brief'));
  assert.equal(pub.headers['Cache-Control'], 'no-store');
});

test('/api/voice/config defaults when nothing was saved, and rejects non-GET', async () => {
  const { routes } = setup();
  assert.equal((await call(routes, '/api/voice/config')).json.enabled, defaultVoiceSettings().enabled);
  assert.equal((await call(routes, '/api/voice/config', { method: 'PUT', body: {} })).status, 405);
});

const usageHeaders = { origin: ORIGIN, 'content-type': 'application/json' };

test('POST /api/voice/usage records a same-origin JSON report into today', async () => {
  const { routes, usageStore } = setup();
  const r = await call(routes, '/api/voice/usage', { method: 'POST', body: { seconds: 90, extrasUsd: 0.001 }, headers: usageHeaders });
  assert.equal(r.status, 200);
  assert.deepEqual(usageStore.read().days['2026-11-06'], { seconds: 90, sessions: 1, extrasUsd: 0.001, judgeCalls: 0, judgeUsd: 0 });
});

test('POST /api/voice/usage refuses cross-origin, missing origin, non-JSON and bad bodies', async () => {
  const { routes, usageStore } = setup();
  const post = (body, headers) => call(routes, '/api/voice/usage', { method: 'POST', body, headers });
  assert.equal((await post({ seconds: 5 }, { origin: 'http://evil.example.com', 'content-type': 'application/json' })).status, 403);
  assert.equal((await post({ seconds: 5 }, { 'content-type': 'application/json' })).status, 403);
  assert.equal((await post({ seconds: 5 }, { origin: ORIGIN, 'content-type': 'text/plain' })).status, 403);
  assert.equal((await post({ seconds: -5 }, usageHeaders)).status, 422);
  assert.equal((await post('{nope', usageHeaders)).status, 400);
  assert.equal((await call(routes, '/api/voice/usage')).status, 405);
  assert.deepEqual(usageStore.read().days, {});
});

test('/api/voice/config reports the seconds left under the daily cap', async () => {
  const { routes, store, usageStore } = setup();
  store.write(validateVoiceSettings({ limits: { dailyMinutes: 2 } }).value);
  usageStore.record({ seconds: 90, extrasUsd: 0 });
  const pub = await call(routes, '/api/voice/config');
  assert.equal(pub.json.today.remainingSeconds, 30);
  assert.equal(pub.json.limits.dailyMinutes, 2);
});
