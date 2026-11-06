import test from 'node:test';
import assert from 'node:assert/strict';
import { describeTopicState, describeSaveError, formFromSettings, settingsFromForm, textToLimit } from './voiceSettingsForm.js';
import { defaultVoiceSettings } from './voice/voiceSettingsCore.mjs';

test('textToLimit: empty = default, off = disabled, number, garbage rejected', () => {
  assert.deepEqual(textToLimit(''), { ok: true, value: null });
  assert.deepEqual(textToLimit(' OFF '), { ok: true, value: 'off' });
  assert.deepEqual(textToLimit('2,5'), { ok: true, value: 2.5 });
  assert.equal(textToLimit('abc').ok, false);
});

test('untouched default form round-trips to the default settings', () => {
  const base = defaultVoiceSettings();
  const r = settingsFromForm(base, formFromSettings(base));
  assert.equal(r.ok, true);
  assert.deepEqual(r.settings, base);
});

test('form save maps topic lines, trims blanks, and sends no key field', () => {
  const base = defaultVoiceSettings();
  const form = { ...formFromSettings(base), warn: '1', cap: '3', name: ' Ela ', topicsEnabled: true, topics: ' penerbangan \n\nkapal\n', refusal: ' Maaf. ' };
  const r = settingsFromForm(base, form);
  assert.deepEqual(r.settings.topics, { enabled: true, allowed: ['penerbangan', 'kapal'], refusal: 'Maaf.' });
  assert.deepEqual(r.settings.costLimits, { warnUsd: 1, capUsd: 3 });
  assert.equal(r.settings.persona.name, 'Ela');
  assert.deepEqual(Object.keys(r.settings).sort(), ['costLimits', 'enabled', 'limits', 'persona', 'toolGroups', 'topics', 'version']);
});

test('a POWER UP save keeps the tool groups and limits set from /admin', () => {
  const base = { ...defaultVoiceSettings(), toolGroups: { ...defaultVoiceSettings().toolGroups, media: false }, limits: { dailyMinutes: 30, sessionMinutes: 10, idleSeconds: 60 } };
  const r = settingsFromForm(base, { ...formFromSettings(base), name: 'Ela' });
  assert.equal(r.settings.toolGroups.media, false);
  assert.deepEqual(r.settings.limits, { dailyMinutes: 30, sessionMinutes: 10, idleSeconds: 60 });
});

test('enabling topics with an empty list blocks the save; disabled keeps the list', () => {
  const base = defaultVoiceSettings();
  assert.equal(settingsFromForm(base, { ...formFromSettings(base), topicsEnabled: true, topics: '  \n' }).ok, false);
  const off = settingsFromForm(base, { ...formFromSettings(base), topicsEnabled: false, topics: 'kapal' });
  assert.deepEqual(off.settings.topics.allowed, ['kapal']);
});

test('bad limit text blocks the save with a message', () => {
  const base = defaultVoiceSettings();
  const r = settingsFromForm(base, { ...formFromSettings(base), cap: 'lots' });
  assert.equal(r.ok, false);
  assert.match(r.error, /Batas biaya/);
});

test('describeSaveError joins at most three server details', () => {
  const msg = describeSaveError({ error: 'Pengaturan tidak valid', details: ['a', 'b', 'c', 'd'] }, 422);
  assert.equal(msg, 'Pengaturan tidak valid — a; b; c');
  assert.match(describeSaveError({}, 500), /500/);
});

test('describeTopicState says MATI by default and AKTIF with the topic count', () => {
  assert.match(describeTopicState(defaultVoiceSettings()), /MATI/);
  assert.match(describeTopicState({ topics: { enabled: true, allowed: ['a', 'b'] } }), /AKTIF \(2 topik\)/);
  assert.match(describeTopicState({ topics: { enabled: true, allowed: [] } }), /MATI/);
});
