import test from 'node:test';
import assert from 'node:assert/strict';
import { describeSource, providerFormFromSettings, settingsFromProviderForm } from './providerForm.js';
import { defaultVoiceSettings } from '../../voice/voiceSettingsCore.mjs';

const OPTIONS = { voices: ['marin', 'cedar'], backendModels: ['gpt-5.6-luna', 'gpt-6-luna'] };

test('defaults load as "not chosen" and save back unchanged', () => {
  const base = defaultVoiceSettings();
  const form = providerFormFromSettings(base);
  assert.deepEqual(form, { voice: '', backendModel: '' });
  const r = settingsFromProviderForm(base, form, OPTIONS);
  assert.equal(r.ok, true);
  assert.deepEqual(r.settings, base);
});

test('a choice replaces only provider; other sections survive', () => {
  const base = { ...defaultVoiceSettings(), enabled: false };
  const r = settingsFromProviderForm(base, { voice: 'cedar', backendModel: 'gpt-6-luna' }, OPTIONS);
  assert.deepEqual(r.settings.provider, { voice: 'cedar', backendModel: 'gpt-6-luna' });
  assert.equal(r.settings.enabled, false);
});

test('values outside the server lists are refused; sources read as plain words', () => {
  assert.equal(settingsFromProviderForm(defaultVoiceSettings(), { voice: 'robot', backendModel: '' }, OPTIONS).ok, false);
  assert.equal(describeSource('admin'), 'chosen here');
  assert.equal(describeSource('env'), 'from .env');
  assert.equal(describeSource(undefined), 'built-in default');
});
