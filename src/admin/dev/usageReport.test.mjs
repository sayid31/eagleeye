import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildUsageReport } from './usageReport.mjs';

const NOW = 1_800_000_000_000;
const summary = (seconds, judgeCalls = 0) => ({
  today: { day: '2026-11-17', seconds, sessions: 2, judgeCalls, estimatedUsd: 0.5 },
  rows: [{ day: '2026-11-17', seconds, sessions: 2, judgeCalls, estimatedUsd: 0.5, extrasUsd: 0 }, { day: '2026-11-16', seconds: 60, sessions: 1, judgeCalls: 0, estimatedUsd: 0.05 }],
  total: { seconds: seconds + 60, estimatedUsd: 0.55 },
});
const voice = (overrides = {}) => ({ enabled: true, dailyMinutes: 30, remainingSeconds: 1200, judgeEnabled: true, judgeMax: 300, summary: summary(600), ...overrides });
const keys = (...set) => ['opensky', 'tomtom', 'openai'].map((id) => ({ id, title: id.toUpperCase(), set: set.includes(id) }));
const base = (overrides = {}) => ({ now: NOW, keys: keys(), opensky: null, openskyWarnAt: 400, openskyTtlMs: null, tomtom: null, voice: voice(), ...overrides });
const card = (report, id) => report.providers.find((item) => item.id === id);

test('no keys and no traffic: every provider is off with no data (empty state)', () => {
  const report = buildUsageReport(base());
  assert.equal(report.generatedAt, NOW);
  assert.deepEqual(report.providers.map((item) => [item.id, item.configured, item.status, item.data]), [
    ['opensky', false, 'off', null], ['tomtom', false, 'off', null], ['openai', false, 'off', null],
  ]);
});

test('configured but no traffic since start: unknown', () => {
  const report = buildUsageReport(base({ keys: keys('opensky', 'tomtom') }));
  assert.equal(card(report, 'opensky').status, 'unknown');
  assert.equal(card(report, 'tomtom').status, 'unknown');
});

test('OpenSky: remaining credits, governor TTL, warn at the threshold; anonymous data still shown', () => {
  const ok = card(buildUsageReport(base({ keys: keys('opensky'), opensky: { remaining: 3000, at: NOW - 5000 }, openskyTtlMs: 9000 })), 'opensky');
  assert.deepEqual(ok, { id: 'opensky', configured: true, status: 'ok', data: { remaining: 3000, at: NOW - 5000, warnAt: 400, ttlMs: 9000 } });
  assert.equal(card(buildUsageReport(base({ opensky: { remaining: 400, at: NOW }, openskyTtlMs: 300000 })), 'opensky').status, 'warn');
  assert.equal(card(buildUsageReport(base({ opensky: { remaining: 900, at: NOW } })), 'opensky').configured, false);
});

test('TomTom: used/budget share → ok, warn at 80 %, error at 100 %', () => {
  const at = (used) => card(buildUsageReport(base({ keys: keys('tomtom'), tomtom: { date: '2026-11-17', used, budget: 1000 } })), 'tomtom');
  assert.deepEqual(at(100).data, { used: 100, budget: 1000, date: '2026-11-17', share: 0.1 });
  assert.equal(at(100).status, 'ok');
  assert.equal(at(800).status, 'warn');
  assert.equal(at(1000).status, 'error');
});

test('OpenAI voice: today minutes vs daily cap, cost estimates, judge calls, per-day rows', () => {
  const ok = card(buildUsageReport(base({ keys: keys('openai') })), 'openai');
  assert.equal(ok.status, 'ok');
  assert.equal(ok.data.todaySeconds, 600);
  assert.equal(ok.data.todayUsd, 0.5);
  assert.equal(ok.data.periodUsd, 0.55);
  assert.equal(ok.data.periodDays, 2);
  assert.deepEqual(ok.data.days[1], { day: '2026-11-16', seconds: 60, sessions: 1, estimatedUsd: 0.05 });
  const status = (v) => card(buildUsageReport(base({ keys: keys('openai'), voice: voice(v) })), 'openai').status;
  assert.equal(status({ summary: summary(1500) }), 'warn', '25 of 30 min');
  assert.equal(status({ summary: summary(1800) }), 'error', 'cap reached');
  assert.equal(status({ summary: summary(60, 300) }), 'warn', 'judge budget used up');
  assert.equal(status({ dailyMinutes: 0, summary: summary(99999) }), 'ok', 'no daily cap');
  assert.equal(status({ enabled: false }), 'off', 'voice turned off in General');
});
