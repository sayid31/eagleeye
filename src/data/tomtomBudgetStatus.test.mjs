import { test } from 'node:test';
import assert from 'node:assert/strict';
import { noteTomTomFetch, tomtomBudgetStatus } from './tomtomBudgetStatus.mjs';

test('the status is null until a fetch is counted, then follows the counter', () => {
  assert.equal(tomtomBudgetStatus(), null);
  noteTomTomFetch({ date: '2026-11-09', count: 1 }, 100, () => {});
  assert.deepEqual(tomtomBudgetStatus(), { date: '2026-11-09', used: 1, budget: 100 });
});

test('exactly one warning when the count reaches 80% of the budget', () => {
  const logged = [];
  for (const count of [79, 80, 81]) noteTomTomFetch({ date: '2026-11-09', count }, 100, (e) => logged.push(e));
  assert.deepEqual(logged.map((e) => [e.code, e.detail.used, e.detail.budget]), [['proxy.quota_low', 80, 100]]);
});
