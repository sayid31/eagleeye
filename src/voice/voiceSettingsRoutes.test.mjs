import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import { installVoiceSettingsRoutes } from './voiceSettingsRoutes.mjs';
import { createVoiceSettingsStore } from './voiceSettingsStore.mjs';
import { defaultVoiceSettings } from './voiceSettingsCore.mjs';
import { requireAdmin } from './requireAdmin.mjs';

const ORIGIN = 'http://localhost:4173';
const SECRET = 'sk-test-SECRET-should-never-appear';

function setup(requireAdminImpl) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gev-vr-'));
  const store = createVoiceSettingsStore({ filePath: path.join(dir, 'v.json') });
  const routes = new Map();
  const middlewares = { use: (p, h) => routes.set(p, h) };
  const readRequestBody = async (req) => req.__body ?? '';
  installVoiceSettingsRoutes(middlewares, {
    store, readRequestBody, ...(requireAdminImpl ? { requireAdmin: requireAdminImpl } : {}),
  });
  return { routes, store };
}

async function call(routes, route, {
  method = 'GET', body, remote = '127.0.0.1', host = 'localhost:4173', headers = {}, origin = ORIGIN,
} = {}) {
  const isWrite = method === 'PUT';
  const req = Object.assign(Readable.from([]), {
    method,
    socket: { remoteAddress: remote },
    headers: {
      host,
      ...(isWrite && origin ? { origin } : {}),
      ...(isWrite ? { 'content-type': 'application/json' } : {}),
      ...headers,
    },
    __body: body === undefined ? undefined : (typeof body === 'string' ? body : JSON.stringify(body)),
  });
  const res = { headers: {}, setHeader(k, v) { this.headers[k] = v; }, end(text) { this.text = text; } };
  await routes.get(route)(req, res);
  return { status: res.statusCode, headers: res.headers, json: JSON.parse(res.text) };
}

test('GET /api/setup/voice returns defaults when nothing was saved', async () => {
  const { routes } = setup();
  const r = await call(routes, '/api/setup/voice');
  assert.equal(r.status, 200);
  assert.deepEqual(r.json.settings, defaultVoiceSettings());
  assert.equal(r.headers['Cache-Control'], 'no-store');
});

test('PUT saves; GET and /api/voice/config read it back without private fields', async () => {
  const { routes } = setup();
  const put = await call(routes, '/api/setup/voice', {
    method: 'PUT',
    body: { enabled: false, costLimits: { warnUsd: 1, capUsd: 3 }, persona: { name: 'Ela', instructions: 'Be brief.' } },
  });
  assert.equal(put.status, 200);
  const get = await call(routes, '/api/setup/voice');
  assert.equal(get.json.settings.persona.name, 'Ela');
  const pub = await call(routes, '/api/voice/config');
  assert.deepEqual(pub.json, { enabled: false, assistantName: 'Ela', costLimits: { warnUsd: 1, capUsd: 3 } });
  assert.ok(!JSON.stringify(pub.json).includes('Be brief'));
});

test('invalid PUT is 422/400, nothing is stored, the secret is never echoed', async () => {
  const { routes, store } = setup();
  const r = await call(routes, '/api/setup/voice', { method: 'PUT', body: { apiKey: SECRET, costLimits: { capUsd: -5 } } });
  assert.equal(r.status, 422);
  assert.ok(!JSON.stringify(r.json).includes(SECRET));
  assert.equal(fs.existsSync(store.filePath), false);
  assert.equal((await call(routes, '/api/setup/voice', { method: 'PUT', body: '{nope' })).status, 400);
});

test('non-loopback, proxied, foreign-host and cross-origin requests are rejected', async () => {
  const { routes } = setup();
  assert.equal((await call(routes, '/api/setup/voice', { remote: '192.168.1.9' })).status, 403);
  assert.equal((await call(routes, '/api/setup/voice', { headers: { 'x-forwarded-for': '1.2.3.4' } })).status, 403);
  assert.equal((await call(routes, '/api/setup/voice', { host: 'evil.example.com' })).status, 403);
  const cross = await call(routes, '/api/setup/voice', { method: 'PUT', body: {}, origin: 'http://evil.example.com' });
  assert.equal(cross.status, 403);
});

test('PUT without Origin is refused (no CSRF write primitive)', async () => {
  const { routes, store } = setup();
  const r = await call(routes, '/api/setup/voice', { method: 'PUT', body: {}, origin: '' });
  assert.equal(r.status, 403);
  assert.equal(fs.existsSync(store.filePath), false);
});

test('access control is swappable: routes use only the injected requireAdmin', async () => {
  const denied = setup(() => ({ ok: false, status: 401, error: 'login required' }));
  assert.equal((await call(denied.routes, '/api/setup/voice', { remote: '8.8.8.8' })).status, 401);
  const open = setup(() => ({ ok: true }));
  assert.equal((await call(open.routes, '/api/setup/voice', { remote: '8.8.8.8' })).status, 200);
});

test('requireAdmin currently delegates to the localhost gate', () => {
  const local = { method: 'GET', socket: { remoteAddress: '127.0.0.1' }, headers: { host: 'localhost:4173' } };
  assert.equal(requireAdmin(local, { env: {} }).ok, true);
  const remote = { ...local, socket: { remoteAddress: '10.0.0.5' } };
  assert.equal(requireAdmin(remote, { env: {} }).ok, false);
});

test('/api/voice/config rejects non-GET', async () => {
  const { routes } = setup();
  assert.equal((await call(routes, '/api/voice/config', { method: 'PUT', body: {} })).status, 405);
});
