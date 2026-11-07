import test from 'node:test';
import assert from 'node:assert/strict';
import { extraRuleRows, groupCoreRules, guardLabel, settingsFromPersonaForm } from './personaForm.js';
import { defaultVoiceSettings } from '../../voice/voiceSettingsCore.mjs';
import { CORE_RULE_GROUPS, VOICE_CORE_RULES } from '../../voice/voiceCoreRules.js';

test('core rules are grouped in display order with every rule shown once', () => {
  const grouped = groupCoreRules(CORE_RULE_GROUPS, VOICE_CORE_RULES);
  assert.deepEqual(grouped.map((g) => g.id), CORE_RULE_GROUPS.map((g) => g.id));
  assert.equal(grouped.reduce((n, g) => n + g.rules.length, 0), 37);
  assert.equal(guardLabel('prompt+code'), 'Prompt + kode');
  assert.equal(guardLabel('unknown'), 'Prompt');
});

test('saving keeps every other section and replaces only extraRules; blank rows are dropped', () => {
  const base = { ...defaultVoiceSettings(), persona: { name: 'Ela', instructions: 'Hangat.', extraRules: [] }, enabled: false };
  const r = settingsFromPersonaForm(base, [{ forbid: ' Bahas cuaca ', instead: 'Tolak' }, { forbid: '', instead: '  ' }]);
  assert.equal(r.ok, true);
  assert.deepEqual(r.settings.persona, { name: 'Ela', instructions: 'Hangat.', extraRules: [{ forbid: 'Bahas cuaca', instead: 'Tolak' }] });
  assert.equal(r.settings.enabled, false);
  assert.deepEqual(extraRuleRows(r.settings), [{ forbid: 'Bahas cuaca', instead: 'Tolak' }]);
});

test('half-filled, too-long and too-many rules are refused with a message', () => {
  const base = defaultVoiceSettings();
  assert.equal(settingsFromPersonaForm(base, [{ forbid: 'x', instead: '' }]).ok, false);
  assert.equal(settingsFromPersonaForm(base, [{ forbid: 'x'.repeat(201), instead: 'y' }]).ok, false);
  const many = Array.from({ length: 21 }, (_, i) => ({ forbid: `f${i}`, instead: 'i' }));
  const r = settingsFromPersonaForm(base, many);
  assert.equal(r.ok, false);
  assert.match(r.errors[0], /Maksimal 20/);
});

test('summarizeCoreRules and describeRuleGroup count rules and code-backed ones', async () => {
  const { summarizeCoreRules, describeRuleGroup } = await import('./personaForm.js');
  const groups = [
    { id: 'topic', label: 'Topik', rules: [{ guard: 'prompt' }, { guard: 'prompt' }] },
    { id: 'actions', label: 'Tindakan', rules: [{ guard: 'prompt+code' }] },
  ];
  assert.equal(summarizeCoreRules(groups), '3 aturan dalam 2 grup · 1 juga dijaga kode aplikasi, sisanya hanya oleh prompt suara');
  assert.equal(describeRuleGroup(groups[0]), '2 aturan');
  assert.equal(describeRuleGroup(groups[1]), '1 aturan · 1 dijaga kode');
});
