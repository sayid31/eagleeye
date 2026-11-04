import test from 'node:test';
import assert from 'node:assert/strict';
import { describeSaveError, formFromSettings, settingsFromForm, textToLimit } from './voiceSettingsForm.js';
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

test('form save keeps fields it does not own (topic rules) and sends no key field', () => {
  const base = { ...defaultVoiceSettings(), topics: { enabled: true, allowed: ['a'], refusal: 'No.' } };
  const form = { ...formFromSettings(base), warn: '1', cap: '3', name: ' Ela ' };
  const r = settingsFromForm(base, form);
  assert.deepEqual(r.settings.topics, base.topics);
  assert.deepEqual(r.settings.costLimits, { warnUsd: 1, capUsd: 3 });
  assert.equal(r.settings.persona.name, 'Ela');
  assert.deepEqual(Object.keys(r.settings).sort(), ['costLimits', 'enabled', 'persona', 'topics', 'version']);
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
