import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultVoiceSettings, validateVoiceSettings } from '../../voice/voiceSettingsCore.mjs';
import { describeEnforced, generalFormFromSettings, parseLimit, settingsFromGeneralForm } from './generalForm.js';

const RANGES = { dailyMinutes: { min: 1, max: 1440 }, sessionMinutes: { min: 1, max: 120 }, idleSeconds: { min: 10, max: 3600 } };

test('an untouched default form round-trips to settings the server accepts unchanged', () => {
  const base = defaultVoiceSettings();
  const r = settingsFromGeneralForm(base, generalFormFromSettings(base), RANGES);
  assert.equal(r.ok, true);
  assert.deepEqual(r.settings, base);
  assert.deepEqual(validateVoiceSettings(r.settings).value, base);
});

test('limits show empty for off and parse back to whole numbers', () => {
  const base = { ...defaultVoiceSettings(), limits: { dailyMinutes: 30, sessionMinutes: 0, idleSeconds: 90 } };
  const form = generalFormFromSettings(base);
  assert.deepEqual(form.limits, { dailyMinutes: '30', sessionMinutes: '', idleSeconds: '90' });
  const r = settingsFromGeneralForm(base, { ...form, limits: { ...form.limits, sessionMinutes: ' 15 ' } }, RANGES);
  assert.deepEqual(r.settings.limits, { dailyMinutes: 30, sessionMinutes: 15, idleSeconds: 90 });
});

test('parseLimit: empty/0 = off, decimals, words and out-of-range rejected', () => {
  assert.deepEqual(parseLimit('', RANGES.idleSeconds), { ok: true, value: 0 });
  assert.deepEqual(parseLimit('0', RANGES.idleSeconds), { ok: true, value: 0 });
  assert.deepEqual(parseLimit('10', RANGES.idleSeconds), { ok: true, value: 10 });
  for (const bad of ['9', '3601', '1.5', 'ten', '-5']) assert.equal(parseLimit(bad, RANGES.idleSeconds).ok, false, bad);
});

test('bad limits and an empty topic list block the save with every message', () => {
  const base = defaultVoiceSettings();
  const form = generalFormFromSettings(base);
  const r = settingsFromGeneralForm(base, { ...form, topicsEnabled: true, limits: { ...form.limits, sessionMinutes: '500', idleSeconds: '5' } }, RANGES);
  assert.equal(r.ok, false);
  assert.equal(r.errors.length, 3);
  assert.match(r.errors[0], /Maximum session length: whole minutes 1–120/);
});

test('the save keeps fields this page does not own (cost limits) and maps tool switches', () => {
  const base = { ...defaultVoiceSettings(), costLimits: { warnUsd: 1, capUsd: 'off' } };
  const form = generalFormFromSettings(base);
  const r = settingsFromGeneralForm(base, { ...form, toolGroups: { ...form.toolGroups, annotate: false }, name: ' Ela ', topics: ' kapal \n\n' }, RANGES);
  assert.deepEqual(r.settings.costLimits, { warnUsd: 1, capUsd: 'off' });
  assert.equal(r.settings.toolGroups.annotate, false);
  assert.equal(r.settings.toolGroups.camera, true);
  assert.equal(r.settings.persona.name, 'Ela');
  assert.deepEqual(r.settings.topics.allowed, ['kapal']);
  assert.equal(validateVoiceSettings(r.settings).ok, true);
});

test('describeEnforced summarizes the saved state', () => {
  assert.equal(describeEnforced(defaultVoiceSettings()), 'Voice ON · core rules ON · topic list OFF · all tool groups on');
  const s = { ...defaultVoiceSettings(), enabled: false, topics: { enabled: true, allowed: ['a', 'b'], refusal: '' }, toolGroups: { ...defaultVoiceSettings().toolGroups, media: false, annotate: false } };
  assert.equal(describeEnforced(s), 'Voice OFF · core rules ON · topic list ON (2) · 2 tool groups off');
});

test('saving General keeps the Persona extra rules and the provider choice', () => {
  const base = { ...defaultVoiceSettings(), persona: { name: '', instructions: '', extraRules: [{ forbid: 'Cuaca', instead: 'Tolak' }] }, provider: { voice: 'cedar', backendModel: '' } };
  const ranges = { dailyMinutes: { min: 1, max: 1440 }, sessionMinutes: { min: 1, max: 120 }, idleSeconds: { min: 10, max: 3600 } };
  const r = settingsFromGeneralForm(base, { ...generalFormFromSettings(base), name: 'Ela' }, ranges);
  assert.equal(r.ok, true);
  assert.deepEqual(r.settings.persona.extraRules, [{ forbid: 'Cuaca', instead: 'Tolak' }]);
  assert.equal(r.settings.persona.name, 'Ela');
  assert.equal(r.settings.provider.voice, 'cedar');
});
