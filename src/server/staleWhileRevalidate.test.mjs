import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cacheDecision } from './staleWhileRevalidate.mjs';

const base = { now: 100_000, ttlMs: 10_000, failureBackoffMs: 5_000 };

test('a copy inside its TTL is served with no refresh', () => {
  assert.deepEqual(cacheDecision({ ...base, entry: { at: 95_000 } }), { serve: 'fresh', refresh: false });
});

test('a past-TTL copy is served at once and refreshed in the background', () => {
  assert.deepEqual(cacheDecision({ ...base, entry: { at: 1 } }), { serve: 'stale', refresh: true });
});

test('a past-TTL copy right after a failed refresh is served without another attempt', () => {
  assert.deepEqual(cacheDecision({ ...base, entry: { at: 1 }, lastFailureAt: 98_000 }), { serve: 'stale', refresh: false });
  assert.deepEqual(cacheDecision({ ...base, entry: { at: 1 }, lastFailureAt: 90_000 }), { serve: 'stale', refresh: true });
});

test('only a cold cache waits, and not again right after a failure', () => {
  assert.deepEqual(cacheDecision({ ...base, entry: null }), { serve: 'wait', refresh: true });
  assert.deepEqual(cacheDecision({ ...base, entry: null, lastFailureAt: 99_000 }), { serve: 'unavailable', refresh: false });
  assert.deepEqual(cacheDecision({ ...base, entry: undefined, lastFailureAt: 1 }), { serve: 'wait', refresh: true });
});

test('an entry without a valid timestamp is treated as stale, never fresh', () => {
  assert.equal(cacheDecision({ ...base, entry: { at: Number.NaN } }).serve, 'stale');
});
