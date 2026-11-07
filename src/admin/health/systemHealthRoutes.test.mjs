import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gatherHealthFacts, installSystemHealthRoutes } from './systemHealthRoutes.mjs';

function call(handler, method = 'GET') {
  return new Promise((resolve) => {
    const out = {};
    handler({ method, url: '/' }, { set statusCode(v) { out.status = v; }, setHeader() {}, end: (t) => { out.json = JSON.parse(t); resolve(out); } });
  });
}

const sources = (over = {}) => ({
  now: () => 1_000_000,
  env: { GEV_VOICE_JUDGE: 'off' },
  appVersion: '0.1.1',
  startedAt: 0,
  settingsStore: { read: () => ({ settings: { enabled: true, limits: { dailyMinutes: 5 } } }) },
  usageStore: { read: () => ({ days: { '2026-11-07': { seconds: 120, judgeCalls: 2 } } }), today: () => '2026-11-07' },
  keyStore: { status: () => ({ keys: [{ id: 'openai', title: 'OPENAI', set: true, managed: 'file' }] }) },
  audit: { list: (n) => (n > 1000 ? [{}, {}, {}] : []) },
  aisFeedEvidence: () => ({ status: 'idle' }),
  proxyTracker: { snapshot: () => [] },
  openSkyCredits: () => null,
  openSkyWarnAt: 400,
  tomtomBudget: () => null,
  judgeMax: 300,
  serverLog: { stats: () => ({ entries: 0, bytes: null, maxBytes: 100, writeFailing: false, lastWriteAt: null }) },
  ...over,
});

test('gatherHealthFacts reads every source without calling a provider', () => {
  const facts = gatherHealthFacts(sources());
  assert.deepEqual(facts.voice, { enabled: true, dailyMinutes: 5, usedSeconds: 120, judgeEnabled: false, judgeCalls: 2, judgeMax: 300 });
  assert.equal(facts.logs.auditEntries, 3);
  assert.equal(facts.keys[0].id, 'openai');
});

test('GET /api/admin/health returns a report; guard and method are enforced; a failure is a 500', async () => {
  let handler;
  installSystemHealthRoutes({ use: (_p, h) => { handler = h; } }, { gather: () => gatherHealthFacts(sources()), guard: () => ({ ok: true }) });
  const ok = await call(handler);
  assert.equal(ok.status, 200);
  assert.ok(['ok', 'warn', 'error'].includes(ok.json.status));
  assert.equal((await call(handler, 'POST')).status, 405);

  let denied;
  installSystemHealthRoutes({ use: (_p, h) => { denied = h; } }, { gather: () => ({}), guard: () => ({ ok: false, status: 401, error: 'Login diperlukan' }) });
  assert.equal((await call(denied)).status, 401);

  let broken;
  installSystemHealthRoutes({ use: (_p, h) => { broken = h; } }, { gather: () => { throw new Error('boom'); }, guard: () => ({ ok: true }) });
  const warn = console.warn;
  console.warn = () => {};
  try { assert.equal((await call(broken)).status, 500); } finally { console.warn = warn; }
});
