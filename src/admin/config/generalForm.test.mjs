import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultVoiceSettings, validateVoiceSettings } from '../../voice/voiceSettingsCore.mjs';
import { MAX_LIVE_SESSION_MINUTES } from '../../voice/liveSessionLimits.js';
import { TOOL_GROUP_TEXT, describeToolGroup, enforcedChips, generalFormFromSettings, hardCapNote, limitErrors, parseLimit, sessionCapWarning, settingsFromGeneralForm, withDefaultLimits } from './generalForm.js';
import { VOICE_TOOL_GROUP_IDS } from '../../voice/voiceToolGroups.js';

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

test('bad limits block the save with one message per field, keyed by the field', () => {
  const base = defaultVoiceSettings();
  const form = generalFormFromSettings(base);
  const r = settingsFromGeneralForm(base, { ...form, limits: { ...form.limits, sessionMinutes: '500', idleSeconds: '5' } }, RANGES);
  assert.equal(r.ok, false);
  assert.deepEqual(Object.keys(r.errors), ['sessionMinutes', 'idleSeconds']);
  assert.match(r.errors.sessionMinutes, /Maximum session length: enter a whole number from 1 to 120 minutes/);
  assert.deepEqual(limitErrors(form.limits, RANGES), {}, 'untouched defaults are valid');
});

test('a session length above the hard cap is accepted but warned about, next to the cap note', () => {
  assert.equal(sessionCapWarning('30'), null);
  assert.equal(sessionCapWarning(''), null);
  assert.match(sessionCapWarning('45'), /45 menit melebihi batas keras.*30 menit/);
  assert.match(hardCapNote(), new RegExp(`${MAX_LIVE_SESSION_MINUTES} minutes`));
  const base = defaultVoiceSettings();
  const r = settingsFromGeneralForm(base, { ...generalFormFromSettings(base), limits: { ...generalFormFromSettings(base).limits, sessionMinutes: '45' } }, RANGES);
  assert.equal(r.ok, true, 'the server still accepts up to 120');
  assert.equal(r.settings.limits.sessionMinutes, 45);
});

test('withDefaultLimits resets only the limits', () => {
  const form = { ...generalFormFromSettings(defaultVoiceSettings()), name: 'Ela', limits: { dailyMinutes: '5', sessionMinutes: '6', idleSeconds: '70' } };
  const reset = withDefaultLimits(form);
  assert.equal(reset.name, 'Ela');
  assert.deepEqual(reset.limits, generalFormFromSettings(defaultVoiceSettings()).limits);
});

test('the save keeps fields this page does not own (cost limits, topics) and maps tool switches', () => {
  const base = { ...defaultVoiceSettings(), costLimits: { warnUsd: 1, capUsd: 'off' }, topics: { enabled: true, allowed: ['kapal'], refusal: '' } };
  const form = generalFormFromSettings(base);
  assert.ok(!('topics' in form), 'topic fields moved to Persona');
  const r = settingsFromGeneralForm(base, { ...form, toolGroups: { ...form.toolGroups, annotate: false }, name: ' Ela ' }, RANGES);
  assert.deepEqual(r.settings.costLimits, { warnUsd: 1, capUsd: 'off' });
  assert.equal(r.settings.toolGroups.annotate, false);
  assert.equal(r.settings.toolGroups.camera, true);
  assert.equal(r.settings.persona.name, 'Ela');
  assert.deepEqual(r.settings.topics.allowed, ['kapal']);
  assert.equal(validateVoiceSettings(r.settings).ok, true);
});

test('enforcedChips summarize the saved state as on/off capabilities', () => {
  const groups = Object.keys(defaultVoiceSettings().toolGroups).map((id) => ({ id }));
  assert.deepEqual(enforcedChips(defaultVoiceSettings(), groups).map((c) => [c.name, c.enabled]), [
    ['Voice', true], ['Core rules', true], ['Topic restriction', false], [`Tool groups (${groups.length} of ${groups.length})`, true]]);
  const s = { ...defaultVoiceSettings(), enabled: false, topics: { enabled: true, allowed: ['a', 'b'], refusal: '' }, toolGroups: { ...defaultVoiceSettings().toolGroups, media: false, annotate: false } };
  const chips = enforcedChips(s, groups);
  assert.deepEqual(chips.map((c) => c.enabled), [false, true, true, true]);
  assert.equal(chips[2].name, 'Topic restriction (2)');
  assert.equal(chips[3].name, `Tool groups (${groups.length - 2} of ${groups.length})`);
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

test('every tool group has Indonesian display text; an unknown group falls back to the server text', () => {
  assert.deepEqual(Object.keys(TOOL_GROUP_TEXT).sort(), [...VOICE_TOOL_GROUP_IDS].sort());
  assert.deepEqual(describeToolGroup({ id: 'camera', label: 'Camera & navigation', description: 'x', toolCount: 9 }),
    { title: 'Camera & navigation (9 tools)', description: TOOL_GROUP_TEXT.camera.description });
  assert.deepEqual(describeToolGroup({ id: 'future', label: 'Future', description: 'Later.', toolCount: 1 }),
    { title: 'Future (1 tools)', description: 'Later.' });
});
