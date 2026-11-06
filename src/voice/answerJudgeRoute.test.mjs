import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installAnswerJudgeRoute, judgeDailyMax, judgeGate } from './answerJudgeRoute.mjs';

const ORIGIN = 'http://localhost:4173';
const HEADERS = { host: 'localhost:4173', origin: ORIGIN, 'content-type': 'application/json' };
const ENV = { OPENAI_API_KEY: 'test-only-not-a-key' }; // test-only

function setup({ env = ENV, verdict = { category: 'off_topic', reason: 'told a story' }, callsToday = 0 } = {}) {
  const logged = [];
  const judgeCosts = [];
  const usageStore = {
    read: () => ({ days: { '2026-11-06': { judgeCalls: callsToday } } }),
    today: () => '2026-11-06',
    recordJudge: (usd) => judgeCosts.push(usd),
  };
  let handler;
  const route = installAnswerJudgeRoute({ use: (_p, h) => { handler = h; } }, {
    usageStore, log: (e) => logged.push(e), readRequestBody: async (req) => req.body, env: () => env,
    fetchFn: async () => ({ ok: true, status: 200, json: async () => ({ output: [{ content: [{ text: JSON.stringify(verdict) }] }], usage: { input_tokens: 500, output_tokens: 50 } }) }),
  });
  const call = (body, headers = HEADERS, method = 'POST') => new Promise((resolve) => {
    const out = {};
    const res = { set statusCode(v) { out.status = v; }, setHeader() {}, end: (t) => { out.json = JSON.parse(t); resolve(out); } };
    handler({ method, headers, body: typeof body === 'string' ? body : JSON.stringify(body) }, res);
  });
  return { call, logged, judgeCosts, pending: route.pending };
}

test('a turn is accepted with 202, judged in the background, logged and priced', async () => {
  const { call, logged, judgeCosts, pending } = setup();
  const r = await call({ question: 'ceritakan kisah si kancil', answer: 'Alkisah...' });
  assert.deepEqual([r.status, r.json], [202, { judged: true }]);
  await pending();
  assert.deepEqual(logged.map((e) => e.code), ['judge.off_topic']);
  assert.ok(!JSON.stringify(logged).includes('kancil'), 'the conversation is never logged');
  assert.equal(judgeCosts.length, 1);
});

test('on_topic is priced but not logged', async () => {
  const { call, logged, judgeCosts, pending } = setup({ verdict: { category: 'on_topic', reason: 'fine' } });
  await call({ answer: 'GA410 menuju Denpasar.' });
  await pending();
  assert.deepEqual([logged.length, judgeCosts.length], [0, 1]);
});

test('secret-looking answers are logged without calling the model', async () => {
  const { call, logged, judgeCosts } = setup();
  const r = await call({ answer: 'kuncinya sk-proj-abcdefghijklmnop1234' });
  assert.deepEqual(r.json, { judged: false, reason: 'secret_like' });
  assert.deepEqual(logged.map((e) => e.code), ['judge.secret_like']);
  assert.equal(judgeCosts.length, 0);
});

test('off switch, missing key and the daily cap skip the model', async () => {
  assert.deepEqual((await setup({ env: { ...ENV, GEV_VOICE_JUDGE: 'off' } }).call({ answer: 'x' })).json, { judged: false, reason: 'disabled' });
  assert.deepEqual((await setup({ env: {} }).call({ answer: 'x' })).json, { judged: false, reason: 'no_key' });
  const capped = setup({ env: { ...ENV, GEV_VOICE_JUDGE_DAILY_MAX: '2' }, callsToday: 2 });
  assert.deepEqual((await capped.call({ answer: 'x' })).json, { judged: false, reason: 'daily_cap' });
  assert.deepEqual(capped.logged.map((e) => e.code), ['judge.daily_cap']);
});

test('cross-origin, bad JSON, missing answer and other methods are refused', async () => {
  const { call } = setup();
  assert.equal((await call({ answer: 'x' }, { ...HEADERS, origin: 'http://evil.example.com' })).status, 403);
  assert.equal((await call('{nope')).status, 400);
  assert.equal((await call({ question: 'only' })).status, 422);
  assert.equal((await call({}, HEADERS, 'GET')).status, 405);
});

test('judgeDailyMax and judgeGate read config, not constants', () => {
  assert.equal(judgeDailyMax({}), 300);
  assert.equal(judgeDailyMax({ GEV_VOICE_JUDGE_DAILY_MAX: '0' }), 0);
  assert.equal(judgeDailyMax({ GEV_VOICE_JUDGE_DAILY_MAX: 'x' }), 300);
  assert.equal(judgeGate({ answer: 'ok' }, { env: ENV, callsToday: 0 }).judge, true);
});

test('the secret-pattern check still logs when the judge model is turned off', async () => {
  const { call, logged } = setup({ env: { ...ENV, GEV_VOICE_JUDGE: 'off' } });
  assert.deepEqual((await call({ answer: 'kunci sk-proj-abcdefghijklmnop1234' })).json, { judged: false, reason: 'secret_like' });
  assert.deepEqual(logged.map((e) => e.code), ['judge.secret_like']);
});
