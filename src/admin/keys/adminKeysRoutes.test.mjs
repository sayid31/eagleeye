import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import { installAdminKeysRoutes } from './adminKeysRoutes.mjs';
import { createProviderKeyStore } from './providerKeyStore.mjs';

// test-only fixtures, not real credentials
const FAKE = 'test-only-key-0123456789abcdef';

function makeStore() {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gev-keyroutes-'));
  const env = {};
  const store = createProviderKeyStore({
    rootDir, launcherAtBoot: undefined, providerEnvAtBoot: new Proxy({}, { get: () => '' }),
    devFreshExternalAtBoot: new Set(), env, harden: () => true,
  });
  return { store, env, envPath: path.join(rootDir, '.env') };
}

function request(handler, { method = 'GET', url = '/', body, headers = {}, remote = '127.0.0.1' } = {}) {
  const req = Object.assign(Readable.from(body === undefined ? [] : [typeof body === 'string' ? body : JSON.stringify(body)]), {
    method, url, headers: { host: 'localhost:4173', ...headers }, socket: { remoteAddress: remote },
  });
  return new Promise((resolve) => {
    const out = { status: 0, headers: {} };
    const res = {
      set statusCode(v) { out.status = v; },
      setHeader: (k, v) => { out.headers[k.toLowerCase()] = v; },
      end: (text) => { out.json = JSON.parse(text); out.raw = text; resolve(out); },
    };
    handler(req, res);
  });
}

function adminSetup({ guard = () => ({ ok: true }), testKey } = {}) {
  const { store, env, envPath } = makeStore();
  const audit = { entries: [], record(e) { this.entries.push(e); return true; } };
  let restarts = 0;
  let handler;
  installAdminKeysRoutes({ use: (_p, h) => { handler = h; } }, {
    store, audit, guard, restart: () => { restarts += 1; }, ...(testKey ? { testKey } : {}),
  });
  return { call: (opts) => request(handler, opts), store, env, envPath, audit, restarts: () => restarts };
}

test('admin keys: every route is refused when the guard refuses', async () => {
  const { call, envPath } = adminSetup({ guard: () => ({ ok: false, status: 401, error: 'Login diperlukan' }) });
  assert.equal((await call()).status, 401);
  assert.equal((await call({ method: 'PUT', body: { OPENAI_API_KEY: FAKE } })).status, 401);
  assert.equal((await call({ method: 'POST', url: '/test', body: { id: 'openai' } })).status, 401);
  assert.equal(fs.existsSync(envPath), false);
});

test('admin keys: GET lists the registry with test notes and no values', async () => {
  const { call, env } = adminSetup();
  env.OPENAI_API_KEY = FAKE;
  const r = await call();
  assert.equal(r.status, 200);
  assert.equal(r.json.keys.find((k) => k.id === 'openai').set, true);
  assert.match(r.json.testNotes['google-maps'], /Not testable from the server/);
  assert.equal(r.headers['cache-control'], 'no-store');
  assert.ok(!r.raw.includes(FAKE));
});

test('admin keys: PUT saves, restarts once, audits names only, echoes no value', async () => {
  const { call, envPath, audit, restarts } = adminSetup();
  const r = await call({ method: 'PUT', body: { OPENAI_API_KEY: FAKE } });
  assert.equal(r.status, 200);
  assert.deepEqual(r.json.saved, ['OPENAI_API_KEY']);
  assert.equal(r.json.restarting, true);
  assert.ok(!r.raw.includes(FAKE));
  assert.match(fs.readFileSync(envPath, 'utf8'), /OPENAI_API_KEY=/);
  assert.equal(restarts(), 1);
  assert.deepEqual(audit.entries, [{ event: 'keys.changed', source: 'admin', saved: ['OPENAI_API_KEY'], removed: [] }]);
  assert.ok(!JSON.stringify(audit.entries).includes(FAKE));
});

test('admin keys: invalid bodies are refused without a restart and audited as failures', async () => {
  const { call, audit, restarts } = adminSetup();
  assert.equal((await call({ method: 'PUT', body: { NOT_A_KEY: FAKE } })).status, 400);
  assert.equal((await call({ method: 'PUT', body: '{nope' })).status, 400);
  assert.equal((await call({ method: 'PUT', body: 'x'.repeat(9000) })).status, 413);
  assert.equal((await call({ method: 'DELETE' })).status, 405);
  assert.equal((await call({ url: '/elsewhere' })).status, 404);
  assert.equal(restarts(), 0);
  assert.deepEqual(audit.entries, [{ event: 'keys.change_failed', source: 'admin', httpStatus: 400 }]);
});

test('admin keys: /test runs the provider check and audits the result code', async () => {
  const seen = [];
  const { call, audit } = adminSetup({ testKey: async (entry) => { seen.push(entry.id); return { result: 'rejected', httpStatus: 401, message: 'The provider rejected the key.' }; } });
  const r = await call({ method: 'POST', url: '/test', body: { id: 'openai' } });
  assert.equal(r.status, 200);
  assert.deepEqual(r.json, { id: 'openai', result: 'rejected', httpStatus: 401, message: 'The provider rejected the key.' });
  assert.deepEqual(seen, ['openai']);
  assert.deepEqual(audit.entries, [{ event: 'keys.tested', provider: 'openai', result: 'rejected', httpStatus: 401 }]);
  assert.equal((await call({ method: 'POST', url: '/test', body: { id: 'nope' } })).status, 400);
  assert.equal((await call({ url: '/test' })).status, 405);
});

test('keyTestLogEvent logs rejected as error, unreachable as warn, and nothing for ok/untestable', async () => {
  const { keyTestLogEvent } = await import('./adminKeysRoutes.mjs');
  const entry = { id: 'openai', title: 'OPENAI' };
  assert.deepEqual(keyTestLogEvent(entry, { result: 'rejected', httpStatus: 401, message: 'The provider rejected the key.' }), {
    level: 'error', source: 'keys', code: 'keys.rejected', message: 'OPENAI: The provider rejected the key.', detail: { provider: 'openai', httpStatus: 401 },
  });
  assert.equal(keyTestLogEvent(entry, { result: 'unreachable', message: 'x' }).level, 'warn');
  assert.equal(keyTestLogEvent(entry, { result: 'ok', message: 'x' }), null);
  assert.equal(keyTestLogEvent(entry, { result: 'untestable', message: 'x' }), null);
});
