import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultVoiceSettings, validateVoiceSettings } from '../../voice/voiceSettingsCore.mjs';
import { costFormFromSettings, formatDuration, formatEstimate, limitToText, effectiveLimitsLine, settingsFromCostForm, textToLimit, todayView } from './usageView.js';

test('formatDuration covers zero, seconds, minutes and hours', () => {
  assert.equal(formatDuration(0), '0 min');
  assert.equal(formatDuration(5), '0 min 05 dtk');
  assert.equal(formatDuration(245.9), '4 min 05 dtk');
  assert.equal(formatDuration(600), '10 min');
  assert.equal(formatDuration(7380), '2 j 03 min');
  assert.equal(formatDuration(-3), '0 min');
});

test('formatEstimate marks money as an estimate', () => {
  assert.equal(formatEstimate(0.111), '~$0.11');
});

test('todayView: no limit, some left, used up', () => {
  const at = (dailyMinutes, remainingSeconds) => todayView({ dailyMinutes, remainingSeconds, summary: { today: { seconds: 600, estimatedUsd: 0.5 } } });
  assert.equal(at(0, null).line, '10 min terpakai hari ini. Tanpa batas harian.');
  assert.equal(at(0, null).meter, null);
  const some = at(30, 1200);
  assert.equal(some.line, '10 min dari 30 menit terpakai hari ini. Sisa 20 min.');
  assert.deepEqual([some.meter.tone, some.meter.percent, some.meter.valueMax], ['success', 33, 30]);
  assert.equal(some.cost, '~$0.50');
  const close = at(12, 120);
  assert.equal(close.meter.tone, 'warning');
  const gone = at(10, 0);
  assert.equal(gone.reached, true);
  assert.equal(gone.meter.tone, 'destructive');
  assert.match(gone.line, /sesi baru ditolak sampai tengah malam/);
});

test('effectiveLimitsLine words the limits in force', () => {
  assert.equal(effectiveLimitsLine({ costLimits: { effective: { warnUsd: 1, capUsd: null } } }), 'Berlaku sekarang: peringatan ~$1.00, batas keras nonaktif.');
});

test('cost form: empty = built-in default, off = none, number = USD; base fields survive', () => {
  assert.deepEqual(costFormFromSettings({ warnUsd: null, capUsd: 'off' }), { warn: '', cap: 'off' });
  const base = { ...defaultVoiceSettings(), limits: { dailyMinutes: 30, sessionMinutes: 0, idleSeconds: 0 } };
  const r = settingsFromCostForm(base, { warn: '1,5', cap: 'off' });
  assert.deepEqual(r.settings.costLimits, { warnUsd: 1.5, capUsd: 'off' });
  assert.equal(r.settings.limits.dailyMinutes, 30);
  assert.equal(validateVoiceSettings(r.settings).ok, true);
  assert.deepEqual(Object.keys(settingsFromCostForm(base, { warn: 'abc', cap: '' }).errors), ['warn']);
});

test('textToLimit / limitToText: empty = default, off = disabled, number, garbage rejected', () => {
  assert.deepEqual(textToLimit(''), { ok: true, value: null });
  assert.deepEqual(textToLimit(' OFF '), { ok: true, value: 'off' });
  assert.deepEqual(textToLimit('2,5'), { ok: true, value: 2.5 });
  assert.deepEqual(textToLimit('abc'), { ok: false });
  assert.equal(limitToText(null), '');
  assert.equal(limitToText('off'), 'off');
  assert.equal(limitToText(3), '3');
});
