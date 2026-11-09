import { test } from 'node:test';
import assert from 'node:assert/strict';
import { OPENSKY_CACHE_MS, openSkyCreditStatus, openskyAdaptiveTtlMs, recordOpenSkyCredits } from './openSkyCredits.mjs';

test('the adaptive TTL stretches as daily credits thin', () => {
  assert.equal(openskyAdaptiveTtlMs(NaN), OPENSKY_CACHE_MS);
  assert.equal(openskyAdaptiveTtlMs(3000), OPENSKY_CACHE_MS);
  assert.equal(openskyAdaptiveTtlMs(2000), 30_000);
  assert.equal(openskyAdaptiveTtlMs(800), 90_000);
  assert.equal(openskyAdaptiveTtlMs(100), 300_000);
});

test('recordOpenSkyCredits keeps the status, warns only when low, and returns the TTL', () => {
  const logged = [];
  assert.equal(recordOpenSkyCredits(NaN, { log: (e) => logged.push(e) }), OPENSKY_CACHE_MS);
  assert.equal(openSkyCreditStatus(), null, 'a missing header records nothing');
  assert.equal(recordOpenSkyCredits(3000, { now: 5, log: (e) => logged.push(e) }), OPENSKY_CACHE_MS);
  assert.deepEqual(openSkyCreditStatus(), { remaining: 3000, at: 5 });
  assert.equal(logged.length, 0);
  assert.equal(recordOpenSkyCredits(350, { now: 6, log: (e) => logged.push(e) }), 300_000);
  assert.deepEqual(logged.map((e) => [e.code, e.detail.remaining]), [['proxy.quota_low', 350]]);
});
