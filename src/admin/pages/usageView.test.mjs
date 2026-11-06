import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultVoiceSettings, validateVoiceSettings } from '../../voice/voiceSettingsCore.mjs';
import { costFormFromSettings, describeDailyCap, formatDuration, formatEstimate, settingsFromCostForm } from './usageView.js';

test('formatDuration covers zero, seconds, minutes and hours', () => {
  assert.equal(formatDuration(0), '0 min');
  assert.equal(formatDuration(5), '0 min 05 s');
  assert.equal(formatDuration(245.9), '4 min 05 s');
  assert.equal(formatDuration(600), '10 min');
  assert.equal(formatDuration(7380), '2 h 03 min');
  assert.equal(formatDuration(-3), '0 min');
});

test('formatEstimate marks money as an estimate', () => {
  assert.equal(formatEstimate(0.111), '~$0.11');
});

test('describeDailyCap: no limit, some left, used up', () => {
  const at = (dailyMinutes, remainingSeconds) => describeDailyCap({ dailyMinutes, remainingSeconds, summary: { today: { seconds: 600 } } });
  assert.equal(at(0, null), '10 min used today · no daily limit');
  assert.equal(at(30, 1200), '10 min of 30 min used today · 20 min left');
  assert.match(at(10, 0), /limit reached, new sessions are refused until midnight/);
});

test('cost form: empty = built-in default, off = none, number = USD; base fields survive', () => {
  assert.deepEqual(costFormFromSettings({ warnUsd: null, capUsd: 'off' }), { warn: '', cap: 'off' });
  const base = { ...defaultVoiceSettings(), limits: { dailyMinutes: 30, sessionMinutes: 0, idleSeconds: 0 } };
  const r = settingsFromCostForm(base, { warn: '1,5', cap: 'off' });
  assert.deepEqual(r.settings.costLimits, { warnUsd: 1.5, capUsd: 'off' });
  assert.equal(r.settings.limits.dailyMinutes, 30);
  assert.equal(validateVoiceSettings(r.settings).ok, true);
  assert.equal(settingsFromCostForm(base, { warn: 'abc', cap: '' }).ok, false);
});
