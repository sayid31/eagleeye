// src/voice/voiceCost.test.mjs
// The spend-guard thresholds are the only thing standing between a hot mic and
// an open-ended bill, so the default values, the "disabled" spellings and the
// junk-input fallback are pinned here.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  VOICE_COST_LIMIT_OFF,
  VOICE_COST_LIMITS,
  formatCostUsd,
  normalizeCostLimits,
} from './voiceCost.js';

/* -------------------------------------------------------------- *
 * display formatting
 * -------------------------------------------------------------- */

test('cost readout formats to two decimals with a tilde', () => {
  assert.equal(formatCostUsd(0), '~$0.00');
  assert.equal(formatCostUsd(0.42), '~$0.42');
  assert.equal(formatCostUsd(12.5), '~$12.50');
});

test('a nonzero but sub-cent cost never displays as $0.00', () => {
  // "$0.00" while tokens are burning reads as broken/free.
  assert.equal(formatCostUsd(0.0004), '~$0.01');
});

test('formatCostUsd clamps junk to zero', () => {
  assert.equal(formatCostUsd(NaN), '~$0.00');
  assert.equal(formatCostUsd(-3), '~$0.00');
  assert.equal(formatCostUsd(undefined), '~$0.00');
});

/* -------------------------------------------------------------- *
 * limits config
 * -------------------------------------------------------------- */

test('default limits are generous and ordered warn < cap', () => {
  assert.equal(VOICE_COST_LIMITS.warnUsd, 2);
  assert.equal(VOICE_COST_LIMITS.capUsd, 5);
  assert.ok(VOICE_COST_LIMITS.warnUsd < VOICE_COST_LIMITS.capUsd);
});

test('normalizeCostLimits fills gaps from the defaults', () => {
  assert.deepEqual(normalizeCostLimits({ warnUsd: 1 }), { warnUsd: 1, capUsd: 5 });
  assert.deepEqual(normalizeCostLimits({}), { warnUsd: 2, capUsd: 5 });
  assert.deepEqual(normalizeCostLimits(null), { warnUsd: 2, capUsd: 5 });
});

test('zero or negative thresholds mean "disabled", not "stop immediately"', () => {
  // A stored 0 must never brick the mic by capping at the first token.
  const limits = normalizeCostLimits({ warnUsd: 0, capUsd: -1 });
  assert.equal(limits.warnUsd, Infinity);
  assert.equal(limits.capUsd, Infinity);
});

test('unparseable thresholds fall back to defaults', () => {
  assert.deepEqual(normalizeCostLimits({ warnUsd: 'abc', capUsd: 'xyz' }), {
    warnUsd: 2,
    capUsd: 5,
  });
});

test("the 'off' sentinel disables a threshold, case-insensitively", () => {
  const limits = normalizeCostLimits({ warnUsd: 'off', capUsd: 'OFF' });
  assert.equal(limits.warnUsd, Infinity);
  assert.equal(limits.capUsd, Infinity);
  assert.equal(VOICE_COST_LIMIT_OFF, 'off');
});
