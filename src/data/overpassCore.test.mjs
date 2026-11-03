// Overpass sweep budgeting (field test 2026-10-27): the public mirrors answer
// the traffic layer's own `majorOnly` query in 37–55 s — their QUEUE, not their
// query execution, since the QL already asks for `[timeout:12]` and the 502
// body reads "All query workers are busy". The old 22 s per-mirror deadline
// aborted answers already in flight, so the breaker parked every mirror and
// traffic rendered nothing in an uncached viewport. Raising that deadline needs
// a whole-sweep ceiling or one hanging host (measured: 60 s, zero bytes) would
// strand a request for minutes. Pure-function tests, no network or timers.
//
// Run with: npm test   (node --test)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { overpassAttemptTimeoutMs } from './overpassCore.mjs';

test('a fresh sweep gives the first mirror its full per-mirror budget', () => {
  assert.equal(overpassAttemptTimeoutMs(0, 60_000, 75_000), 60_000);
});

test('the real answer window fits: 55 s is inside one attempt', () => {
  // The measured success envelope. If this ever has to shrink below the
  // observed 37–55 s range, traffic goes dark again in uncached viewports.
  assert.ok(overpassAttemptTimeoutMs(0, 60_000, 75_000) >= 55_000);
});

test('a later mirror is capped by what the sweep has left, not the per-mirror budget', () => {
  // 40 s already spent on a slow first mirror: the second gets the remaining
  // 35 s, not another full 60 s.
  assert.equal(overpassAttemptTimeoutMs(40_000, 60_000, 75_000), 35_000);
});

test('an exhausted sweep returns 0 — the caller must stop, not retry briefly', () => {
  assert.equal(overpassAttemptTimeoutMs(75_000, 60_000, 75_000), 0);
  assert.equal(overpassAttemptTimeoutMs(90_000, 60_000, 75_000), 0, 'overspent is still 0, never negative');
});

test('three hanging hosts cannot cost three full timeouts', () => {
  // The regression the ceiling exists to prevent: without it, 3 × 60 s = 180 s
  // for one request. Walk the worst case and assert the total is bounded.
  const perMirror = 60_000;
  const budget = 75_000;
  let elapsed = 0;
  let attempts = 0;
  for (let i = 0; i < 3; i += 1) {
    const allowed = overpassAttemptTimeoutMs(elapsed, perMirror, budget);
    if (allowed === 0) break;
    attempts += 1;
    elapsed += allowed; // worst case: the host hangs for the whole allowance
  }
  assert.equal(attempts, 2, 'the third hanging host is never even tried');
  assert.equal(elapsed, budget, 'total wall clock is the sweep budget, not 3x the per-mirror one');
  assert.ok(elapsed < 3 * perMirror);
});

test('a budget shorter than one mirror attempt still yields one bounded try', () => {
  // Defensive: the two constants are independent, so a future edit that sets
  // the ceiling below the per-mirror budget must not produce a zero-length
  // (instantly-aborting) first attempt.
  const allowed = overpassAttemptTimeoutMs(0, 60_000, 20_000);
  assert.equal(allowed, 20_000);
  assert.ok(allowed > 0);
});

test('non-finite elapsed time is treated as a fresh sweep, never as a failure', () => {
  // Date.now() arithmetic upstream must not be able to turn into NaN and
  // silently abandon every mirror.
  assert.equal(overpassAttemptTimeoutMs(NaN, 60_000, 75_000), 60_000);
  assert.equal(overpassAttemptTimeoutMs(undefined, 60_000, 75_000), 60_000);
  assert.equal(overpassAttemptTimeoutMs(-5_000, 60_000, 75_000), 60_000, 'a clock step back is not extra budget');
});

test('the shipped defaults leave room for a second mirror after a slow first one', () => {
  // Called with no overrides, so this pins the real constants' relationship:
  // one full attempt must not consume the entire sweep.
  const first = overpassAttemptTimeoutMs(0);
  const second = overpassAttemptTimeoutMs(first);
  assert.ok(first > 0);
  assert.ok(second > 0, 'a single slow mirror must not exhaust the sweep by itself');
});
