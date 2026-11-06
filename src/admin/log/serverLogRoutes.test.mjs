import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createEventBudget, installServerLogRoutes, parseLogQuery } from './serverLogRoutes.mjs';
import { createServerLog } from './serverLogStore.mjs';

const ORIGIN = 'http://localhost:4173';
const JSON_HEADERS = { host: 'localhost:4173', origin: ORIGIN, 'content-type': 'application/json' };

function setup({ guard = () => ({ ok: true }), budget } = {}) {
  let t = Date.UTC(2026, 10, 6);
  const log = createServerLog({ filePath: '/unused', fileSystem: { readFileSync: () => { throw Object.assign(new Error('x'), { code: 'ENOENT' }); } }, now: () => (t += 1), env: {}, setTimer: () => {} });
  const audits = [];
  const routes = new Map();
  installServerLogRoutes({ use: (p, h) => routes.set(p, h) }, {
    log, guard, readRequestBody: async (req) => req.body ?? '', audit: (e) => audits.push(e), ...(budget ? { budget } : {}),
  });
  const call = (route, { method = 'GET', url = '/', body, headers = JSON_HEADERS } = {}) => new Promise((resolve) => {
    const out = {};
    const res = { set statusCode(v) { out.status = v; }, setHeader() {}, end: (text) => { out.json = JSON.parse(text); resolve(out); } };
    routes.get(route)({ method, url, headers, body: body === undefined ? undefined : (typeof body === 'string' ? body : JSON.stringify(body)) }, res);
  });
  return { call, log, audits };
}

test('POST /api/log accepts same-origin browser events and stamps client info', async () => {
  const { call, log } = setup();
  const r = await call('/api/log', { method: 'POST', body: {
    client: { version: '0.1.1', browser: 'Chrome 141' },
    events: [
      { level: 'error', source: 'browser', code: 'browser.js_error', message: 'TypeError: x is undefined' },
      { level: 'info', source: 'admin', code: 'admin.login', message: 'forged server source' },
      { level: 'warn', source: 'voice', code: 'voice.tool_failed', message: 'fly_to_location failed' },
    ],
  } });
  assert.deepEqual([r.status, r.json], [200, { accepted: 2, dropped: 1 }]);
  const rows = log.query().entries;
  assert.deepEqual(rows.map((e) => e.source).sort(), ['browser', 'voice']);
  assert.deepEqual(rows[0].client, { version: '0.1.1', browser: 'Chrome 141' });
});

test('POST /api/log refuses cross-origin, non-JSON, bad bodies and other methods', async () => {
  const { call, log } = setup();
  const ev = { events: [{ level: 'error', source: 'browser', code: 'browser.js_error' }] };
  assert.equal((await call('/api/log', { method: 'POST', body: ev, headers: { ...JSON_HEADERS, origin: 'http://evil.example.com' } })).status, 403);
  assert.equal((await call('/api/log', { method: 'POST', body: ev, headers: { ...JSON_HEADERS, 'content-type': 'text/plain' } })).status, 403);
  assert.equal((await call('/api/log', { method: 'POST', body: '{nope' })).status, 400);
  assert.equal((await call('/api/log')).status, 405);
  assert.equal(log.size(), 0);
});

test('POST /api/log answers 429 once the per-minute event budget is spent', async () => {
  const { call } = setup({ budget: createEventBudget(1) });
  const events = [1, 2].map((n) => ({ level: 'warn', source: 'browser', code: 'browser.js_error', message: `e${n}` }));
  const r = await call('/api/log', { method: 'POST', body: { events } });
  assert.deepEqual([r.status, r.json.accepted], [429, 1]);
});

test('createEventBudget resets each minute', () => {
  let t = 0;
  const budget = createEventBudget(3, () => t);
  assert.equal(budget(2), 2);
  assert.equal(budget(2), 1);
  assert.equal(budget(1), 0);
  t = 60_000;
  assert.equal(budget(5), 3);
});

test('admin log: guard first, then query with filters, then clear with a trace and an audit entry', async () => {
  const denied = setup({ guard: () => ({ ok: false, status: 401, error: 'Login diperlukan' }) });
  assert.equal((await denied.call('/api/admin/log')).status, 401);
  assert.equal((await denied.call('/api/admin/log', { method: 'DELETE' })).status, 401);

  const { call, log, audits } = setup();
  log.record({ level: 'error', source: 'browser', code: 'browser.js_error', message: 'a' });
  log.record({ level: 'info', source: 'voice', code: 'voice.session_started', message: 'b' });
  const filtered = await call('/api/admin/log', { url: '/?level=error' });
  assert.deepEqual(filtered.json.entries.map((e) => e.code), ['browser.js_error']);
  assert.ok(filtered.json.sources.includes('judge'));
  const cleared = await call('/api/admin/log', { method: 'DELETE' });
  assert.deepEqual(cleared.json, { removed: 2 });
  assert.deepEqual(log.query().entries.map((e) => e.code), ['log.cleared']);
  assert.deepEqual(audits, [{ event: 'log.cleared', source: 'admin' }]);
  assert.equal((await call('/api/admin/log', { method: 'PUT' })).status, 405);
});

test('parseLogQuery keeps only known levels/sources and clamps paging', () => {
  assert.deepEqual(parseLogQuery('/?level=error&source=voice&q=fly&limit=500&offset=20'), { level: 'error', source: 'voice', q: 'fly', limit: 200, offset: 20 });
  assert.deepEqual(parseLogQuery('/?level=debug&source=x&limit=-1'), { level: undefined, source: undefined, q: '', limit: 100, offset: 0 });
});
