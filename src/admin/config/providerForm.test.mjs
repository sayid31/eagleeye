import test from 'node:test';
import assert from 'node:assert/strict';
import { choiceView, describeSource, overrideFromItem, providerFormFromSettings, settingsFromProviderForm, USE_DEFAULT } from './providerForm.js';
import { isDirty } from './dirtyState.js';
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
  const refused = settingsFromProviderForm(defaultVoiceSettings(), { voice: 'robot', backendModel: 'x' }, OPTIONS);
  assert.equal(refused.ok, false);
  assert.deepEqual(Object.keys(refused.errors), ['voice', 'backendModel']);
  assert.equal(describeSource('admin'), 'chosen here');
  assert.equal(describeSource('env'), 'from .env');
  assert.equal(describeSource(undefined), 'built-in default');
});

const IN_USE = { value: 'marin', source: 'default' };
const labels = (view) => view.items.map((item) => item.label);

test('no override: the select shows the value in use, marked as the default, and lists the real values', () => {
  const view = choiceView({ selected: '', saved: '', effective: IN_USE, options: OPTIONS.voices });
  assert.equal(view.value, USE_DEFAULT);
  assert.deepEqual(labels(view), ['marin (default)', 'cedar'], 'the default appears once, as the default item');
  assert.deepEqual(choiceView({ selected: '', saved: '', effective: { value: 'gpt-5.6-luna', source: 'env' }, options: OPTIONS.backendModels }).items[0].label, 'gpt-5.6-luna (default)');
});

test('a default that comes from .env and is not in the list is still shown (and is the default item)', () => {
  const view = choiceView({ selected: '', saved: '', effective: { value: 'custom-voice', source: 'env' }, options: OPTIONS.voices });
  assert.deepEqual(labels(view), ['custom-voice (default)', 'marin', 'cedar']);
});

test('override set: the select shows the override and offers a labelled reset to the default', () => {
  const view = choiceView({ selected: 'cedar', saved: 'cedar', effective: { value: 'cedar', source: 'admin' }, options: OPTIONS.voices });
  assert.equal(view.value, 'cedar');
  assert.deepEqual(labels(view), ['Use default (.env or app default)', 'marin', 'cedar']);
  const pending = choiceView({ selected: 'cedar', saved: '', effective: IN_USE, options: OPTIONS.voices });
  assert.deepEqual(labels(pending), ['Use default (marin)', 'cedar'], 'before saving, the default value is still known and named');
});

test('picking the default item clears the override; picking a value sets it', () => {
  assert.equal(overrideFromItem(USE_DEFAULT), '');
  assert.equal(overrideFromItem('cedar'), 'cedar');
  const reset = choiceView({ selected: '', saved: 'cedar', effective: { value: 'cedar', source: 'admin' }, options: OPTIONS.voices });
  assert.equal(reset.value, USE_DEFAULT, 'a pending reset shows the default item');
});

test('dirty state: choosing the default with no override is not a change; choosing another value, or resetting an override, is', () => {
  const none = providerFormFromSettings(defaultVoiceSettings());
  assert.equal(isDirty({ ...none, voice: overrideFromItem(USE_DEFAULT) }, none), false);
  assert.equal(isDirty({ ...none, voice: overrideFromItem('cedar') }, none), true);
  const overridden = { voice: 'cedar', backendModel: '' };
  assert.equal(isDirty({ ...overridden, voice: overrideFromItem(USE_DEFAULT) }, overridden), true);
  const stored = settingsFromProviderForm(defaultVoiceSettings(), { ...overridden, voice: overrideFromItem(USE_DEFAULT) }, OPTIONS);
  assert.equal(stored.settings.provider.voice, '', 'the API still receives an empty override');
});
