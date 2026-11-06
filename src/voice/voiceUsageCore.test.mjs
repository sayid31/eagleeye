import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  USAGE_RETENTION_DAYS, addUsage, dailyLimitRefusal, emptyLedger, localDayKey, normalizeLedger, pruneLedger,
  remainingDailySeconds, shiftDayKey, summarizeUsage, validateUsageReport,
} from './voiceUsageCore.mjs';
import { createVoiceUsageStore } from './voiceUsageStore.mjs';

test('localDayKey and shiftDayKey use the local calendar, across month ends', () => {
  assert.equal(localDayKey(new Date(2026, 0, 5, 23, 59)), '2026-01-05');
  assert.equal(shiftDayKey('2026-03-01', 1), '2026-02-28');
  assert.equal(shiftDayKey('2026-01-01', 1), '2025-12-31');
  assert.equal(shiftDayKey('2026-11-06', 0), '2026-11-06');
});

test('validateUsageReport accepts seconds + optional extras and rejects junk', () => {
  assert.deepEqual(validateUsageReport({ seconds: 90 }).value, { seconds: 90, extrasUsd: 0 });
  assert.deepEqual(validateUsageReport({ seconds: 0, extrasUsd: 0.002 }).value, { seconds: 0, extrasUsd: 0.002 });
  for (const bad of [null, [], 'x', {}, { seconds: -1 }, { seconds: 86_401 }, { seconds: '9' }, { seconds: NaN },
    { seconds: 1, extrasUsd: -1 }, { seconds: 1, extrasUsd: 101 }, { seconds: 1, userEmail: 'a@b.c' }]) {
    assert.equal(validateUsageReport(bad).ok, false, JSON.stringify(bad));
  }
});

test('addUsage sums seconds, sessions and extras per day without mutating', () => {
  const start = emptyLedger();
  const one = addUsage(start, '2026-11-06', { seconds: 60, extrasUsd: 0.01 });
  const two = addUsage(one, '2026-11-06', { seconds: 30, extrasUsd: 0 });
  assert.deepEqual(two.days['2026-11-06'], { seconds: 90, sessions: 2, extrasUsd: 0.01 });
  assert.deepEqual(start.days, {});
});

test('pruneLedger keeps exactly the retention window', () => {
  const ledger = { version: 1, days: {
    [shiftDayKey('2026-11-06', USAGE_RETENTION_DAYS - 1)]: { seconds: 1, sessions: 1, extrasUsd: 0 },
    [shiftDayKey('2026-11-06', USAGE_RETENTION_DAYS)]: { seconds: 1, sessions: 1, extrasUsd: 0 },
  } };
  assert.equal(Object.keys(pruneLedger(ledger, '2026-11-06').days).length, 1);
});

test('remainingDailySeconds: null when off, clamps at zero', () => {
  const ledger = addUsage(emptyLedger(), '2026-11-06', { seconds: 600, extrasUsd: 0 });
  assert.equal(remainingDailySeconds(ledger, '2026-11-06', 0), null);
  assert.equal(remainingDailySeconds(ledger, '2026-11-06', 15), 300);
  assert.equal(remainingDailySeconds(ledger, '2026-11-06', 5), 0);
  assert.equal(remainingDailySeconds(ledger, '2026-11-07', 5), 300);
});

test('summarizeUsage fills empty days, newest first, and prices audio + extras', () => {
  let ledger = addUsage(emptyLedger(), '2026-11-06', { seconds: 120, extrasUsd: 0.01 });
  ledger = addUsage(ledger, '2026-11-04', { seconds: 60, extrasUsd: 0 });
  const s = summarizeUsage(ledger, '2026-11-06', { days: 7, ratePerMin: 0.05 });
  assert.equal(s.rows.length, 7);
  assert.equal(s.rows[0].day, '2026-11-06');
  assert.equal(s.rows[1].seconds, 0);
  assert.ok(Math.abs(s.today.estimatedUsd - 0.11) < 1e-9);
  assert.equal(s.total.sessions, 2);
  assert.ok(Math.abs(s.total.estimatedUsd - 0.16) < 1e-9);
});

test('normalizeLedger drops malformed days and values', () => {
  const n = normalizeLedger({ days: { '2026-11-06': { seconds: 5, sessions: 1.7, extrasUsd: -3 }, nope: {}, '2026-11-05': 'x' } });
  assert.deepEqual(n.days, { '2026-11-06': { seconds: 5, sessions: 1, extrasUsd: 0 } });
  assert.deepEqual(normalizeLedger('junk').days, {});
});

test('usage store: missing file is empty, record persists 0600, corrupt file reads empty', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gev-vu-'));
  const store = createVoiceUsageStore({ filePath: path.join(dir, 'u.json'), now: () => new Date(2026, 10, 6, 12) });
  assert.deepEqual(store.read().days, {});
  store.record({ seconds: 45, extrasUsd: 0 });
  assert.deepEqual(store.read().days['2026-11-06'], { seconds: 45, sessions: 1, extrasUsd: 0 });
  assert.equal(fs.statSync(store.filePath).mode & 0o777, 0o600);
  assert.equal(store.today(), '2026-11-06');
  fs.writeFileSync(store.filePath, '{broken');
  const warn = console.warn;
  console.warn = () => {};
  try { assert.deepEqual(store.read().days, {}); } finally { console.warn = warn; }
});

test('dailyLimitRefusal refuses only when the cap is on and used up', () => {
  const ledger = addUsage(emptyLedger(), '2026-11-06', { seconds: 300, extrasUsd: 0 });
  assert.equal(dailyLimitRefusal(ledger, '2026-11-06', 0), null);
  assert.equal(dailyLimitRefusal(ledger, '2026-11-06', 10), null);
  assert.deepEqual(dailyLimitRefusal(ledger, '2026-11-06', 5), { status: 429, error: 'voice_daily_limit' });
});
