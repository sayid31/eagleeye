import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  JUDGE_LOG, buildJudgeRequest, judgeCostUsd, judgeTurn, looksSecret, parseJudgeVerdict, validateJudgeTurn, verdictLogEvent,
} from './answerJudge.mjs';

const payload = (json, usage = { input_tokens: 400, output_tokens: 100 }) => ({
  output: [{ type: 'reasoning' }, { type: 'message', content: [{ type: 'output_text', text: JSON.stringify(json) }] }],
  usage,
});

test('validateJudgeTurn clips text, requires an answer and keeps only tool-shaped names', () => {
  assert.equal(validateJudgeTurn({}).ok, false);
  assert.equal(validateJudgeTurn(null).ok, false);
  const r = validateJudgeTurn({ question: 'q'.repeat(2000), answer: ' hi ', failedTools: ['fly_to_location', 'DROP TABLE', 5] });
  assert.equal(r.value.question.length, 1200);
  assert.equal(r.value.answer, 'hi');
  assert.deepEqual(r.value.failedTools, ['fly_to_location']);
});

test('buildJudgeRequest asks for a strict JSON verdict with low reasoning', () => {
  const body = buildJudgeRequest({ question: 'q', answer: 'a', failedTools: [] });
  assert.equal(body.model, 'gpt-5-nano');
  assert.equal(body.reasoning.effort, 'low');
  assert.equal(body.text.format.type, 'json_schema');
  assert.equal(body.text.format.strict, true);
  assert.ok(body.text.format.schema.properties.category.enum.includes('false_success'));
  assert.deepEqual(JSON.parse(body.input), { question: 'q', answer: 'a', failedTools: [] });
});

test('parseJudgeVerdict reads the message content and rejects unknown categories', () => {
  assert.deepEqual(parseJudgeVerdict(payload({ category: 'off_topic', reason: 'told a story' })), { category: 'off_topic', reason: 'told a story' });
  assert.equal(parseJudgeVerdict(payload({ category: 'bogus', reason: '' })), null);
  assert.equal(parseJudgeVerdict({ output: [{ content: [{ text: 'not json' }] }] }), null);
  assert.equal(parseJudgeVerdict(null), null);
});

test('verdictLogEvent maps categories to log entries; on_topic logs nothing', () => {
  assert.equal(verdictLogEvent({ category: 'on_topic', reason: '' }), null);
  assert.deepEqual(verdictLogEvent({ category: 'off_topic', reason: 'told a story' }), {
    ...JUDGE_LOG.off_topic, source: 'judge', message: 'Voice answered outside the console topics: told a story',
  });
  const claim = verdictLogEvent({ category: 'false_success', reason: 'claimed flight' }, ['fly_to_location']);
  assert.equal(claim.source, 'voice');
  assert.equal(claim.code, 'voice.false_success_claim');
  assert.deepEqual(claim.detail, { tools: 'fly_to_location' });
});

test('looksSecret catches key-, token- and email-shaped text only', () => {
  assert.equal(looksSecret('Kunci Anda sk-proj-abcdefghijklmnop1234'), true);
  assert.equal(looksSecret('hubungi owner@example.com'), true);
  assert.equal(looksSecret('Pesawat GA410 menuju Denpasar.'), false);
});

test('judgeCostUsd prices input and output tokens', () => {
  assert.ok(Math.abs(judgeCostUsd({ input_tokens: 1e6, output_tokens: 1e6 }) - 0.45) < 1e-9);
  assert.equal(judgeCostUsd(undefined), 0);
});

test('judgeTurn returns the verdict and cost; HTTP errors and network failures come back as errors', async () => {
  const ok = await judgeTurn({ question: 'q', answer: 'a', failedTools: [] }, {
    apiKey: 'test-only', fetchFn: async () => ({ ok: true, status: 200, json: async () => payload({ category: 'refusal_ok', reason: 'declined' }) }),
  });
  assert.equal(ok.verdict.category, 'refusal_ok');
  assert.ok(ok.costUsd > 0);
  const bad = await judgeTurn({ answer: 'a' }, { apiKey: 'x', fetchFn: async () => ({ ok: false, status: 429, json: async () => ({}) }) });
  assert.deepEqual([bad.verdict, bad.error], [null, 'HTTP 429']);
  const down = await judgeTurn({ answer: 'a' }, { apiKey: 'x', fetchFn: async () => { throw new Error('ECONNRESET'); } });
  assert.deepEqual([down.verdict, down.error], [null, 'network error']);
});
