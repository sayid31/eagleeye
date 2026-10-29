import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  estimateLiveCostUsd,
  createLiveCostTracker,
  createLiveCostMeter,
  paintLiveCostUi,
  LIVE_VOICE_RATE_PER_MIN,
} from './liveCost.js';

test('estimateLiveCostUsd prices $0.05/min per second, floors junk at 0', () => {
  assert.equal(estimateLiveCostUsd(60), 0.05);
  assert.equal(estimateLiveCostUsd(120), 0.1);
  assert.equal(estimateLiveCostUsd(30), 0.025);
  assert.equal(estimateLiveCostUsd(0), 0);
  assert.equal(estimateLiveCostUsd(-5), 0);
  assert.equal(estimateLiveCostUsd(NaN), 0);
  assert.equal(estimateLiveCostUsd(60, 0), 0, 'a zero rate bills nothing, not NaN');
});

test('tracker accumulates monotonically and never rolls backward', () => {
  const t = createLiveCostTracker();
  assert.equal(t.recordSeconds(60).totalUsd, 0.05);
  assert.equal(t.recordSeconds(30).totalUsd, 0.05, 'a smaller value is ignored');
  assert.equal(t.recordSeconds(120).totalUsd, 0.1);
  assert.equal(t.state().seconds, 120);
});

test('warn and cap latch exactly once each and level is monotonic', () => {
  // $2 warn / $5 cap at $0.05/min -> 2400s warn, 6000s cap.
  const t = createLiveCostTracker({ limits: { warnUsd: 2, capUsd: 5 } });
  assert.equal(t.recordSeconds(1000).level, 'ok');
  const warn = t.recordSeconds(2400);
  assert.equal(warn.warnCrossed, true);
  assert.equal(warn.level, 'warn');
  assert.equal(t.recordSeconds(3000).warnCrossed, false, 'warn fires only once');
  const cap = t.recordSeconds(6000);
  assert.equal(cap.capCrossed, true);
  assert.equal(cap.capReached, true);
  assert.equal(cap.level, 'cap');
  assert.equal(t.recordSeconds(7000).capCrossed, false, 'cap fires only once');
});

test('reset clears spend and latches for a new session', () => {
  const t = createLiveCostTracker({ limits: { warnUsd: 2, capUsd: 5 } });
  t.recordSeconds(6000);
  const s = t.reset();
  assert.equal(s.totalUsd, 0);
  assert.equal(s.level, 'ok');
  assert.equal(t.recordSeconds(2400).warnCrossed, true, 'warn can fire again after reset');
});

test('paintLiveCostUi writes display, level and a per-minute title', () => {
  const costValue = { dataset: {} };
  const state = createLiveCostTracker().recordSeconds(120);
  paintLiveCostUi({ costValue }, state);
  assert.equal(costValue.textContent, '~$0.10');
  assert.equal(costValue.dataset.level, 'ok');
  assert.match(costValue.title, /\/min live audio/);
  assert.match(costValue.title, /billed separately/);
});

test('paintLiveCostUi is a no-op without a costValue element', () => {
  assert.doesNotThrow(() => paintLiveCostUi(null, createLiveCostTracker().state()));
  assert.doesNotThrow(() => paintLiveCostUi({}, createLiveCostTracker().state()));
});

test('meter.start ticks on wall-clock and fires onCap once past the hard cap', () => {
  let nowMs = 1_000_000;
  let tick = null;
  const capHits = [];
  const meter = createLiveCostMeter({
    limits: { warnUsd: 2, capUsd: 5 },
    onCap: (state) => capHits.push(state),
    now: () => nowMs,
    setIntervalFn: (fn) => { tick = fn; return 1; },
    clearIntervalFn: () => { tick = null; },
  });
  meter.start();
  nowMs += 2400 * 1000; // 2400s -> $2.00 warn
  tick();
  assert.equal(meter.state().level, 'warn');
  assert.equal(capHits.length, 0);
  nowMs += (6000 - 2400) * 1000; // total 6000s -> $5.00 cap
  tick();
  assert.equal(capHits.length, 1);
  assert.equal(capHits[0].capCrossed, true);
  tick(); // keeps ticking in the same closure
  assert.equal(capHits.length, 1, 'onCap fires exactly once');
});

test('meter.recordSeconds folds in an authoritative server duration', () => {
  const meter = createLiveCostMeter({ now: () => 0, setIntervalFn: () => 2, clearIntervalFn: () => {} });
  meter.start();
  const s = meter.recordSeconds(180);
  assert.ok(Math.abs(s.totalUsd - 0.15) < 1e-9);
  assert.equal(meter.state().seconds, 180);
});

test('meter.stop clears the interval', () => {
  let cleared = null;
  const meter = createLiveCostMeter({ now: () => 0, setIntervalFn: () => 42, clearIntervalFn: (id) => { cleared = id; } });
  meter.start();
  meter.stop();
  assert.equal(cleared, 42);
});

test('the published rate is $0.05/min', () => {
  assert.equal(LIVE_VOICE_RATE_PER_MIN, 0.05);
});
