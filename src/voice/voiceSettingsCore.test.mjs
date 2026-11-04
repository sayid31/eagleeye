import test from 'node:test';
import assert from 'node:assert/strict';
import {
  defaultVoiceSettings, normalizeStoredSettings, publicVoiceConfig, validateVoiceSettings,
} from './voiceSettingsCore.mjs';

test('default settings mean old behavior: enabled, no limits override, no persona, topics OFF', () => {
  const d = defaultVoiceSettings();
  assert.equal(d.enabled, true);
  assert.deepEqual(d.costLimits, { warnUsd: null, capUsd: null });
  assert.deepEqual(d.persona, { name: '', instructions: '' });
  assert.deepEqual(d.topics, { enabled: false, allowed: [], refusal: '' });
});

test('empty object validates to the defaults', () => {
  const r = validateVoiceSettings({});
  assert.equal(r.ok, true);
  assert.deepEqual(r.value, defaultVoiceSettings());
});

test('absent / null / corrupt stored settings fall back to defaults', () => {
  assert.deepEqual(normalizeStoredSettings(null).settings, defaultVoiceSettings());
  assert.equal(normalizeStoredSettings(null).valid, true);
  const bad = normalizeStoredSettings({ enabled: 'yes' });
  assert.equal(bad.valid, false);
  assert.deepEqual(bad.settings, defaultVoiceSettings());
});

test('rejects non-object bodies and unknown fields (no key smuggling)', () => {
  for (const body of [null, 'x', 5, [], undefined]) assert.equal(validateVoiceSettings(body).ok, false);
  const r = validateVoiceSettings({ apiKey: 'sk-test', persona: { name: 'A', openaiKey: 'x' } });
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.startsWith('apiKey')));
  assert.ok(r.errors.some((e) => e.startsWith('persona.openaiKey')));
  assert.ok(!JSON.stringify(r.errors).includes('sk-test'));
});

test('cost limits: numeric range, off sentinel, cap >= warn', () => {
  assert.equal(validateVoiceSettings({ costLimits: { warnUsd: 1, capUsd: 3 } }).ok, true);
  assert.equal(validateVoiceSettings({ costLimits: { warnUsd: 'off', capUsd: 'off' } }).value.costLimits.capUsd, 'off');
  for (const bad of [0, -1, 0.05, 1001, NaN, Infinity, '5', true]) {
    assert.equal(validateVoiceSettings({ costLimits: { capUsd: bad } }).ok, false, String(bad));
  }
  assert.equal(validateVoiceSettings({ costLimits: { warnUsd: 5, capUsd: 2 } }).ok, false);
});

test('persona: length caps, newline kept in instructions, control chars dropped', () => {
  assert.equal(validateVoiceSettings({ persona: { name: 'x'.repeat(41) } }).ok, false);
  assert.equal(validateVoiceSettings({ persona: { instructions: 'x'.repeat(1001) } }).ok, false);
  const r = validateVoiceSettings({ persona: { name: 'Ela ', instructions: 'a\nbc' } });
  assert.equal(r.value.persona.name, 'Ela');
  assert.equal(r.value.persona.instructions, 'a\nbc');
  assert.equal(validateVoiceSettings({ persona: { name: 5 } }).ok, false);
});

test('topics: enabling needs a list; caps, dedupe, one-sentence refusal', () => {
  assert.equal(validateVoiceSettings({ topics: { enabled: true } }).ok, false);
  const ok = validateVoiceSettings({
    topics: { enabled: true, allowed: ['Penerbangan', 'penerbangan', 'Kapal'], refusal: 'Maaf, itu di luar topik.' },
  });
  assert.deepEqual(ok.value.topics.allowed, ['Penerbangan', 'Kapal']);
  assert.equal(validateVoiceSettings({ topics: { allowed: Array(21).fill('a') } }).ok, false);
  assert.equal(validateVoiceSettings({ topics: { allowed: ['x'.repeat(61)] } }).ok, false);
  assert.equal(validateVoiceSettings({ topics: { refusal: 'x'.repeat(161) } }).ok, false);
  assert.equal(validateVoiceSettings({ topics: { refusal: 'a\nb' } }).ok, false);
});

test('publicVoiceConfig exposes only enabled, assistantName, costLimits', () => {
  const s = validateVoiceSettings({
    persona: { name: 'Ela', instructions: 'private rules' },
    topics: { enabled: true, allowed: ['x'], refusal: 'No.' },
  }).value;
  const pub = publicVoiceConfig(s);
  assert.deepEqual(Object.keys(pub).sort(), ['assistantName', 'costLimits', 'enabled']);
  assert.ok(!JSON.stringify(pub).includes('private rules'));
});
