import test from 'node:test';
import assert from 'node:assert/strict';
import {
  defaultVoiceSettings, normalizeStoredSettings, publicVoiceConfig, validateVoiceSettings,
} from './voiceSettingsCore.mjs';

test('default settings: enabled, no limits override, no persona or extra rules, topic list OFF, no provider choice', () => {
  const d = defaultVoiceSettings();
  assert.equal(d.enabled, true);
  assert.deepEqual(d.costLimits, { warnUsd: null, capUsd: null });
  assert.deepEqual(d.persona, { name: '', instructions: '', extraRules: [] });
  assert.deepEqual(d.topics, { enabled: false, allowed: [], refusal: '' });
  assert.deepEqual(d.provider, { voice: '', backendModel: '' });
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

test('publicVoiceConfig exposes only enabled, assistantName, costLimits, limits', () => {
  const s = validateVoiceSettings({
    persona: { name: 'Ela', instructions: 'private rules' },
    topics: { enabled: true, allowed: ['x'], refusal: 'No.' },
    toolGroups: { media: false },
    limits: { sessionMinutes: 15 },
  }).value;
  const pub = publicVoiceConfig(s);
  assert.deepEqual(Object.keys(pub).sort(), ['assistantName', 'costLimits', 'enabled', 'limits']);
  assert.equal(pub.limits.sessionMinutes, 15);
  assert.ok(!JSON.stringify(pub).includes('private rules'));
  assert.ok(!('toolGroups' in pub));
});

test('defaults keep every tool group on and every session limit off', () => {
  const d = defaultVoiceSettings();
  assert.deepEqual(d.toolGroups, { readOnly: true, camera: true, display: true, media: true, annotate: true });
  assert.deepEqual(d.limits, { dailyMinutes: 0, sessionMinutes: 0, idleSeconds: 0 });
});

test('a file saved before toolGroups/limits existed still reads as valid', () => {
  const legacy = { version: 1, enabled: true, costLimits: { warnUsd: 1, capUsd: 2 }, persona: { name: 'A', instructions: '' }, topics: { enabled: false, allowed: [], refusal: '' } };
  const r = normalizeStoredSettings(legacy);
  assert.equal(r.valid, true);
  assert.equal(r.settings.toolGroups.media, true);
  assert.equal(r.settings.limits.dailyMinutes, 0);
});

test('toolGroups: booleans only, unknown group rejected', () => {
  assert.equal(validateVoiceSettings({ toolGroups: { annotate: false } }).value.toolGroups.annotate, false);
  assert.equal(validateVoiceSettings({ toolGroups: { annotate: 'no' } }).ok, false);
  const r = validateVoiceSettings({ toolGroups: { shell: true } });
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.startsWith('toolGroups.shell')));
});

test('limits: whole numbers in the jenna-admin ranges, 0 = off', () => {
  const ok = validateVoiceSettings({ limits: { dailyMinutes: 1440, sessionMinutes: 120, idleSeconds: 10 } });
  assert.deepEqual(ok.value.limits, { dailyMinutes: 1440, sessionMinutes: 120, idleSeconds: 10 });
  assert.deepEqual(validateVoiceSettings({ limits: { dailyMinutes: 0, sessionMinutes: null } }).value.limits,
    { dailyMinutes: 0, sessionMinutes: 0, idleSeconds: 0 });
  for (const [field, bad] of [['dailyMinutes', 1441], ['dailyMinutes', -5], ['sessionMinutes', 121], ['sessionMinutes', 1.5],
    ['idleSeconds', 9], ['idleSeconds', 3601], ['idleSeconds', '30']]) {
    assert.equal(validateVoiceSettings({ limits: { [field]: bad } }).ok, false, `${field}=${bad}`);
  }
  assert.equal(validateVoiceSettings({ limits: { monthlyUsd: 5 } }).ok, false);
});

test('persona.extraRules: valid pairs are stored, control characters collapse to spaces', () => {
  const r = validateVoiceSettings({ persona: { extraRules: [{ forbid: 'Bahas\ncuaca', instead: 'Tolak  singkat' }] } });
  assert.equal(r.ok, true);
  assert.deepEqual(r.value.persona.extraRules, [{ forbid: 'Bahas cuaca', instead: 'Tolak singkat' }]);
});

test('persona.extraRules: half-filled, unknown keys, too long or too many are rejected without echo', () => {
  const bad = [
    [{ forbid: 'x', instead: '' }],
    [{ forbid: 'x', instead: 'y', loosen: 'core' }],
    [{ forbid: 'secret-text'.repeat(30), instead: 'y' }],
    Array.from({ length: 21 }, () => ({ forbid: 'f', instead: 'i' })),
    'not-a-list',
  ];
  for (const extraRules of bad) {
    const r = validateVoiceSettings({ persona: { extraRules } });
    assert.equal(r.ok, false);
    assert.ok(r.errors.every((e) => !e.includes('secret-text')));
  }
});

test('provider: allowlisted voice/backend model are stored; anything else is rejected', () => {
  assert.deepEqual(validateVoiceSettings({ provider: { voice: 'cedar', backendModel: 'gpt-6-luna' } }).value.provider,
    { voice: 'cedar', backendModel: 'gpt-6-luna' });
  assert.equal(validateVoiceSettings({ provider: { voice: 'robot' } }).ok, false);
  assert.equal(validateVoiceSettings({ provider: { model: 'gpt-live-2' } }).ok, false);
});
