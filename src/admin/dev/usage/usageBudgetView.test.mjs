import { test } from 'node:test';
import assert from 'node:assert/strict';
import { meterProgress, meterTone, providerCard, providerCards, voiceDayRows } from './usageBudgetView.js';

const NOW = Date.UTC(2026, 10, 18, 12, 0, 0);

test('meterProgress: percent, clamped bar, true percent in text, safe against zero/negative', () => {
  assert.deepEqual(meterProgress(830, 1000), { percent: 83, barPercent: 83, valueNow: 830, valueMax: 1000 });
  assert.deepEqual(meterProgress(1200, 1000), { percent: 120, barPercent: 100, valueNow: 1000, valueMax: 1000 });
  assert.deepEqual(meterProgress(5, 0), { percent: 0, barPercent: 0, valueNow: 0, valueMax: 0 });
  assert.equal(meterProgress(-3, 10).percent, 0);
  assert.deepEqual(['ok', 'warn', 'error', 'off'].map(meterTone), ['success', 'warning', 'destructive', 'muted']);
});

test('TomTom card: big number, accessible meter, reset countdown to the next UTC midnight', () => {
  const card = providerCard({ id: 'tomtom', configured: true, status: 'warn', data: { used: 830, budget: 1000, share: 0.83, date: '2026-11-18' } }, NOW);
  assert.equal(card.big.value, '830');
  assert.equal(card.big.unit, 'dari 1.000 tile hari ini');
  assert.equal(card.statusLabel, 'Almost used up');
  const [meter] = card.meters;
  assert.deepEqual([meter.valueNow, meter.valueMax, meter.tone], [830, 1000, 'warning']);
  assert.equal(meter.text, '830 dari 1.000 tile (83%)');
  assert.match(card.note, /Reset pukul 00\.00 UTC, 12 j 00 mnt lagi/);
});

test('OpenSky card has no meter (the API reports remaining credits only) and says how fresh the number is', () => {
  const card = providerCard({ id: 'opensky', configured: true, status: 'ok', data: { remaining: 3000, at: NOW - 240_000, warnAt: 400, ttlMs: 9000 } }, NOW);
  assert.equal(card.meters.length, 0);
  assert.equal(card.big.value, '3.000');
  assert.deepEqual(card.facts.map((f) => f.value), ['400', '9 dtk']);
  assert.match(card.note, /4 menit lalu/);
});

test('OpenAI card: minutes meter only with a daily cap, judge meter only when the judge is on', () => {
  const data = { enabled: true, todaySeconds: 600, dailyMinutes: 30, todayUsd: 0.5, periodUsd: 1.25, judgeEnabled: true, judgeCalls: 3, judgeMax: 300 };
  const card = providerCard({ id: 'openai', configured: true, status: 'ok', data }, NOW);
  assert.deepEqual(card.meters.map((m) => [m.id, m.text]), [['minutes', '10 dari 30 menit (33%)'], ['judge', '3 dari 300 panggilan']]);
  assert.deepEqual(card.facts.map((f) => f.value), ['~$0.50', '~$1.25']);
  const free = providerCard({ id: 'openai', configured: true, status: 'ok', data: { ...data, dailyMinutes: 0, judgeEnabled: false } }, NOW);
  assert.equal(free.meters.length, 0);
  assert.equal(free.big.unit, 'minutes today, no daily limit');
  assert.ok(free.facts.some((f) => f.value === 'Judge off'));
  const off = providerCard({ id: 'openai', configured: true, status: 'off', data: { ...data, enabled: false } }, NOW);
  assert.equal(off.statusLabel, 'Voice off');
});

test('a provider without data shows the right empty state, never zeros', () => {
  assert.equal(providerCard({ id: 'tomtom', configured: false, status: 'off', data: null }, NOW).empty, 'notConfigured');
  assert.equal(providerCard({ id: 'tomtom', configured: true, status: 'unknown', data: null }, NOW).empty, 'noData');
  assert.equal(providerCard({ id: 'tomtom', configured: false, status: 'off', data: null }, NOW).statusLabel, 'Not configured');
  const cards = providerCards({ generatedAt: NOW, providers: [{ id: 'opensky', configured: false, status: 'off', data: null }] });
  assert.equal(cards[0].title, 'OpenSky');
});

test('voiceDayRows marks idle days and formats audio and cost', () => {
  const rows = voiceDayRows([{ day: '2026-11-17', seconds: 600, sessions: 2, estimatedUsd: 0.4 }, { day: '2026-11-16', seconds: 0, sessions: 0, estimatedUsd: 0 }]);
  assert.deepEqual([rows[0].audio, rows[0].cost, rows[0].idle, rows[1].idle], ['10 mnt', '~$0.40', false, true]);
});
