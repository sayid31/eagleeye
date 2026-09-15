// src/voice/claudeVoiceCost.test.mjs
// The spend guard is the only thing standing between a stuck tool loop and
// an open-ended bill, so its arithmetic, its threshold latches, and its
// unknown-tier fallback are all pinned here. The tier resolver is also a
// security boundary: it is what stops an arbitrary string reaching the
// Anthropic API as a model id.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_VOICE_TIER,
  VOICE_COST_LIMIT_OFF,
  VOICE_COST_LIMITS,
  VOICE_MODELS,
  VOICE_TIERS,
  createVoiceCostTracker,
  estimateUsageCostUsd,
  formatCostUsd,
  isKnownVoiceTier,
  mostExpensiveVoiceModel,
  normalizeCostLimits,
  resolveVoiceModel,
  resolveVoiceModelById,
  serializeCostLimits,
} from './claudeVoiceCost.js';

/** A representative Messages API `usage` payload. */
const USAGE = Object.freeze({ input_tokens: 1000, output_tokens: 500 });

/**
 * Usage worth exactly $`usd` on the STANDARD rate table: output is $5/1M, so
 * 200,000 output tokens == $1.00 exactly.
 */
const dollarsOfUsage = (usd) => ({ input_tokens: 0, output_tokens: 200000 * usd });

/* -------------------------------------------------------------- *
 * model registry / tier resolution
 * -------------------------------------------------------------- */

test('registry exposes exactly the two tiers the UI offers', () => {
  assert.deepEqual([...VOICE_TIERS].sort(), ['pro', 'standard']);
  assert.equal(DEFAULT_VOICE_TIER, 'standard');
});

test('standard tier points at Haiku 4.5, the cheap/fast default', () => {
  assert.equal(VOICE_MODELS.standard.id, 'claude-haiku-4-5-20251001');
});

test('pro tier points at Sonnet 5, a distinct smarter model', () => {
  assert.equal(VOICE_MODELS.pro.id, 'claude-sonnet-5');
  assert.notEqual(VOICE_MODELS.pro.id, VOICE_MODELS.standard.id);
});

test('standard is cheaper than pro on every single rate', () => {
  const std = VOICE_MODELS.standard.rates;
  const pro = VOICE_MODELS.pro.rates;
  const keys = Object.keys(std);
  assert.ok(keys.length >= 2, 'rate table covers text input+output');
  for (const key of keys) {
    assert.ok(
      std[key] < pro[key],
      `standard.${key} (${std[key]}) should undercut pro.${key} (${pro[key]})`
    );
  }
});

test('the rate table has no audio/image tiers — Claude never sees audio', () => {
  for (const entry of Object.values(VOICE_MODELS)) {
    assert.deepEqual(Object.keys(entry.rates).sort(), ['textInput', 'textOutput']);
  }
});

test('resolveVoiceModel returns the requested tier', () => {
  assert.equal(resolveVoiceModel('pro').id, 'claude-sonnet-5');
  assert.equal(resolveVoiceModel('standard').id, 'claude-haiku-4-5-20251001');
});

test('resolveVoiceModel tolerates case and whitespace', () => {
  assert.equal(resolveVoiceModel('  PRO ').tier, 'pro');
  assert.equal(resolveVoiceModel('Standard').tier, 'standard');
});

test('unknown, empty, and hostile tiers fall back to standard rather than throwing', () => {
  // This is the guard that keeps an arbitrary querystring out of the
  // Anthropic model field. Every one of these must resolve, never throw.
  for (const bad of [
    undefined,
    null,
    '',
    '   ',
    'claude-opus-5',
    'PRO; DROP',
    'constructor',
    'toString',
    '__proto__',
    42,
    {},
    [],
    true,
  ]) {
    const resolved = resolveVoiceModel(bad);
    assert.equal(resolved.tier, 'standard', `fallback for ${JSON.stringify(bad)}`);
    assert.equal(resolved.id, 'claude-haiku-4-5-20251001');
  }
});

test('isKnownVoiceTier separates real tiers from fallbacks', () => {
  assert.equal(isKnownVoiceTier('pro'), true);
  assert.equal(isKnownVoiceTier('standard'), true);
  assert.equal(isKnownVoiceTier('__proto__'), false);
  assert.equal(isKnownVoiceTier('turbo'), false);
  assert.equal(isKnownVoiceTier(undefined), false);
});

/* -------------------------------------------------------------- *
 * cost arithmetic
 * -------------------------------------------------------------- */

test('standard cost is the exact sum of tokens x per-1M rates', () => {
  // 1000*1 + 500*5 = 3500 / 1e6
  const usd = estimateUsageCostUsd(USAGE, VOICE_MODELS.standard.rates);
  assert.ok(Math.abs(usd - 0.0035) < 1e-9, `expected 0.0035, got ${usd}`);
});

test('pro cost is the exact sum on the pro table', () => {
  // 1000*2 + 500*10 = 7000 / 1e6
  const usd = estimateUsageCostUsd(USAGE, VOICE_MODELS.pro.rates);
  assert.ok(Math.abs(usd - 0.007) < 1e-9, `expected 0.007, got ${usd}`);
});

test('the same usage costs materially less on standard', () => {
  const std = estimateUsageCostUsd(USAGE, VOICE_MODELS.standard.rates);
  const pro = estimateUsageCostUsd(USAGE, VOICE_MODELS.pro.rates);
  assert.ok(std < pro / 1.5, `standard ${std} should undercut pro ${pro}`);
});

test('absent usage or rates cost nothing rather than NaN', () => {
  assert.equal(estimateUsageCostUsd(null, VOICE_MODELS.standard.rates), 0);
  assert.equal(estimateUsageCostUsd(USAGE, null), 0);
  assert.equal(estimateUsageCostUsd({}, VOICE_MODELS.standard.rates), 0);
});

test('junk token counts cost nothing rather than throwing or going negative', () => {
  for (const junk of [{ input_tokens: 'abc' }, { input_tokens: -5, output_tokens: -5 }]) {
    const usd = estimateUsageCostUsd(junk, VOICE_MODELS.standard.rates);
    assert.ok(Number.isFinite(usd) && usd >= 0);
  }
});

test('the $1 test fixture really is $1 on standard rates', () => {
  const usd = estimateUsageCostUsd(dollarsOfUsage(1), VOICE_MODELS.standard.rates);
  assert.ok(Math.abs(usd - 1) < 1e-9, `expected 1, got ${usd}`);
});

/* -------------------------------------------------------------- *
 * display formatting
 * -------------------------------------------------------------- */

test('cost readout formats to two decimals with a tilde', () => {
  assert.equal(formatCostUsd(0), '~$0.00');
  assert.equal(formatCostUsd(0.42), '~$0.42');
  assert.equal(formatCostUsd(12.5), '~$12.50');
});

test('a nonzero but sub-cent cost never displays as $0.00', () => {
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
  const limits = normalizeCostLimits({ warnUsd: 0, capUsd: -1 });
  assert.equal(limits.warnUsd, Infinity);
  assert.equal(limits.capUsd, Infinity);
  const tracker = createVoiceCostTracker({ limits });
  const state = tracker.record(dollarsOfUsage(100));
  assert.equal(state.capReached, false);
  assert.equal(state.level, 'ok');
});

test('unparseable thresholds fall back to defaults', () => {
  assert.deepEqual(normalizeCostLimits({ warnUsd: 'abc', capUsd: 'xyz' }), {
    warnUsd: 2,
    capUsd: 5,
  });
});

/* -------------------------------------------------------------- *
 * tracker state machine
 * -------------------------------------------------------------- */

test('a fresh tracker starts at zero and ok', () => {
  const tracker = createVoiceCostTracker({ tier: 'standard' });
  const state = tracker.state();
  assert.equal(state.totalUsd, 0);
  assert.equal(state.level, 'ok');
  assert.equal(state.capReached, false);
  assert.equal(state.display, '~$0.00');
  assert.equal(state.responses, 0);
});

test('per-response usage accumulates across the tool loop', () => {
  const tracker = createVoiceCostTracker({ tier: 'standard' });
  tracker.record(dollarsOfUsage(1));
  const state = tracker.record(dollarsOfUsage(1));
  assert.ok(Math.abs(state.totalUsd - 2) < 1e-9);
  assert.equal(state.responses, 2);
});

test('the warning fires exactly once, on the crossing record', () => {
  const tracker = createVoiceCostTracker({ tier: 'standard', limits: { warnUsd: 2, capUsd: 5 } });
  assert.equal(tracker.record(dollarsOfUsage(1)).warnCrossed, false); // $1
  const crossing = tracker.record(dollarsOfUsage(1)); // $2 — crosses
  assert.equal(crossing.warnCrossed, true);
  assert.equal(crossing.level, 'warn');
  assert.equal(tracker.record(dollarsOfUsage(1)).warnCrossed, false); // $3 — latched
});

test('the cap fires exactly once and latches capReached', () => {
  const tracker = createVoiceCostTracker({ tier: 'standard', limits: { warnUsd: 2, capUsd: 5 } });
  for (let i = 0; i < 4; i += 1) {
    assert.equal(tracker.record(dollarsOfUsage(1)).capCrossed, false);
  }
  const crossing = tracker.record(dollarsOfUsage(1)); // $5 — crosses
  assert.equal(crossing.capCrossed, true);
  assert.equal(crossing.capReached, true);
  assert.equal(crossing.level, 'cap');
  const after = tracker.record(dollarsOfUsage(1));
  assert.equal(after.capCrossed, false);
  assert.equal(after.capReached, true);
  assert.equal(after.level, 'cap');
});

test('one huge response crosses both thresholds on the same record', () => {
  const tracker = createVoiceCostTracker({ tier: 'standard', limits: { warnUsd: 2, capUsd: 5 } });
  const state = tracker.record(dollarsOfUsage(50));
  assert.equal(state.warnCrossed, true);
  assert.equal(state.capCrossed, true);
  assert.equal(state.level, 'cap');
});

test('level is monotonic — it never steps back down', () => {
  const tracker = createVoiceCostTracker({ tier: 'standard', limits: { warnUsd: 2, capUsd: 5 } });
  tracker.record(dollarsOfUsage(6));
  assert.equal(tracker.state().level, 'cap');
  tracker.record({});
  assert.equal(tracker.state().level, 'cap');
  assert.equal(tracker.state().capReached, true);
});

test('exact-threshold equality counts as crossed', () => {
  const tracker = createVoiceCostTracker({ tier: 'standard', limits: { warnUsd: 1, capUsd: 2 } });
  assert.equal(tracker.record(dollarsOfUsage(1)).warnCrossed, true);
});

test('zero-cost responses do not advance the response counter', () => {
  const tracker = createVoiceCostTracker({ tier: 'standard' });
  const state = tracker.record({});
  assert.equal(state.responses, 0);
  assert.equal(state.totalUsd, 0);
});

test('the standard tracker takes far longer to reach the same cap than pro', () => {
  const std = createVoiceCostTracker({ tier: 'standard', limits: { warnUsd: 2, capUsd: 5 } });
  const pro = createVoiceCostTracker({ tier: 'pro', limits: { warnUsd: 2, capUsd: 5 } });
  let stdTurns = 0;
  let proTurns = 0;
  while (!std.state().capReached && stdTurns < 100000) {
    std.record(USAGE);
    stdTurns += 1;
  }
  while (!pro.state().capReached && proTurns < 100000) {
    pro.record(USAGE);
    proTurns += 1;
  }
  assert.ok(proTurns < stdTurns, `pro ${proTurns} turns should trip the cap sooner than standard ${stdTurns}`);
});

test('the tracker reports the model it is charging against', () => {
  const tracker = createVoiceCostTracker({ tier: 'pro' });
  const state = tracker.state();
  assert.equal(state.tier, 'pro');
  assert.equal(state.modelId, 'claude-sonnet-5');
});

test('an unknown tier tracks at standard rates rather than free', () => {
  const tracker = createVoiceCostTracker({ tier: 'nonsense' });
  assert.equal(tracker.state().tier, 'standard');
  assert.ok(tracker.record(USAGE).totalUsd > 0);
});

/* -------------------------------------------------------------- *
 * pricing by the model actually served, not the tier requested
 * -------------------------------------------------------------- */

test('a known model id resolves to its own rate table', () => {
  assert.equal(resolveVoiceModelById('claude-haiku-4-5-20251001').tier, 'standard');
  assert.equal(resolveVoiceModelById('claude-sonnet-5').tier, 'pro');
  assert.equal(resolveVoiceModelById('claude-sonnet-5').recognized, true);
});

test('an unrecognised model id bills at the most expensive known rates', () => {
  const resolved = resolveVoiceModelById('some-future-model');
  assert.equal(resolved.recognized, false);
  assert.deepEqual(resolved.rates, mostExpensiveVoiceModel().rates);
  assert.equal(resolved.id, 'some-future-model');
});

test('empty/garbage model ids still produce a usable worst-case entry', () => {
  for (const bad of [null, undefined, '', '   ', 42, {}]) {
    const resolved = resolveVoiceModelById(bad);
    assert.equal(resolved.recognized, false);
    assert.ok(resolved.rates.textOutput > 0);
  }
});

test('the most expensive model is derived from the registry, not hardcoded', () => {
  const worst = mostExpensiveVoiceModel();
  for (const entry of Object.values(VOICE_MODELS)) {
    assert.ok(entry.rates.textOutput <= worst.rates.textOutput);
  }
});

test('modelId outranks tier when both are supplied', () => {
  // The env override case: tier says standard, the server actually served pro.
  const tracker = createVoiceCostTracker({ tier: 'standard', modelId: 'claude-sonnet-5' });
  assert.equal(tracker.state().modelId, 'claude-sonnet-5');
  assert.equal(tracker.state().tier, 'pro');
});

test('pricing by tier alone would have under-metered an overridden session', () => {
  const byTier = createVoiceCostTracker({ tier: 'standard' });
  const byModel = createVoiceCostTracker({ tier: 'standard', modelId: 'claude-sonnet-5' });
  const tierCost = byTier.record(USAGE).totalUsd;
  const realCost = byModel.record(USAGE).totalUsd;
  assert.ok(realCost > tierCost, `real ${realCost} vs tier-assumed ${tierCost}`);
});

/* -------------------------------------------------------------- *
 * disabled thresholds must survive serialization
 * -------------------------------------------------------------- */

test('serializeCostLimits encodes a disabled threshold as a sentinel', () => {
  const encoded = serializeCostLimits({ warnUsd: 0, capUsd: 0 });
  assert.equal(encoded.warnUsd, VOICE_COST_LIMIT_OFF);
  assert.equal(encoded.capUsd, VOICE_COST_LIMIT_OFF);
  assert.equal(JSON.parse(JSON.stringify(encoded)).capUsd, VOICE_COST_LIMIT_OFF);
});

test('the sentinel normalizes back to a disabled threshold', () => {
  const limits = normalizeCostLimits({ warnUsd: 'off', capUsd: 'OFF' });
  assert.equal(limits.warnUsd, Infinity);
  assert.equal(limits.capUsd, Infinity);
});

test('JSON round-trip preserves disabled, live, and mixed limits', () => {
  for (const input of [
    { warnUsd: 0, capUsd: 0 },
    { warnUsd: 2, capUsd: 5 },
    { warnUsd: 0, capUsd: 5 },
    { warnUsd: 1.5, capUsd: 0 },
  ]) {
    const expected = normalizeCostLimits(input);
    const restored = normalizeCostLimits(
      JSON.parse(JSON.stringify(serializeCostLimits(input)))
    );
    assert.deepEqual(restored, expected, `round-trip of ${JSON.stringify(input)}`);
  }
});

test('a raw Infinity (pre-sentinel data) is still honoured on read', () => {
  assert.equal(normalizeCostLimits({ capUsd: Infinity }).capUsd, Infinity);
});

/* -------------------------------------------------------------- *
 * incomplete accounting
 * -------------------------------------------------------------- */

test('markIncomplete flags the accounting as partial, without a direction claim', () => {
  const tracker = createVoiceCostTracker({ tier: 'standard' });
  tracker.record(dollarsOfUsage(1));
  assert.equal(tracker.state().incomplete, false);
  assert.equal(tracker.state().display, '~$1.00');
  assert.equal(tracker.state().note, null);

  tracker.markIncomplete();
  assert.equal(tracker.state().incomplete, true);
  assert.equal(tracker.state().display, '~$1.00*');
  assert.match(tracker.state().note, /incomplete/i);
});

test('marking incomplete does not change the accrued total', () => {
  const tracker = createVoiceCostTracker({ tier: 'standard' });
  tracker.record(dollarsOfUsage(2));
  tracker.markIncomplete();
  assert.ok(Math.abs(tracker.state().totalUsd - 2) < 1e-9);
});

test('an incomplete total still trips the cap on the tokens we did see', () => {
  const tracker = createVoiceCostTracker({ tier: 'standard', limits: { warnUsd: 2, capUsd: 5 } });
  tracker.markIncomplete();
  const state = tracker.record(dollarsOfUsage(6));
  assert.equal(state.capReached, true);
  assert.equal(state.incomplete, true);
});

test('reset clears the incomplete marker for the next session', () => {
  const tracker = createVoiceCostTracker({ tier: 'standard' });
  tracker.record(dollarsOfUsage(1));
  tracker.markIncomplete();
  const cleared = tracker.reset();
  assert.equal(cleared.incomplete, false);
  assert.equal(cleared.display, '~$0.00');
});

test('reset clears totals and re-arms both latches for a new session', () => {
  const tracker = createVoiceCostTracker({ tier: 'standard', limits: { warnUsd: 2, capUsd: 5 } });
  tracker.record(dollarsOfUsage(9));
  assert.equal(tracker.state().capReached, true);
  const cleared = tracker.reset();
  assert.equal(cleared.totalUsd, 0);
  assert.equal(cleared.level, 'ok');
  assert.equal(cleared.capReached, false);
  assert.equal(tracker.record(dollarsOfUsage(2)).warnCrossed, true);
});
