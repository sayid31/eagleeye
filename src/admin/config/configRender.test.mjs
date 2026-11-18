import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { createJsxLoader } from '../../testing/jsxLoader.mjs';
import { defaultVoiceSettings } from '../../voice/voiceSettingsCore.mjs';
import { providerRows } from './providerKeysView.js';
import { CORE_RULE_GROUPS, VOICE_CORE_RULES } from '../../voice/voiceCoreRules.js';

const loader = await createJsxLoader();
after(() => loader.close());
const load = (name) => loader.load(`src/admin/config/${name}.jsx`);
const render = (element) => renderToStaticMarkup(h(MemoryRouter, null, element));

const PAYLOAD = {
  store: 'env-file',
  keys: [
    { id: 'openai', title: 'OPENAI', envVars: ['OPENAI_API_KEY'], set: true, managed: 'file', tier: 'metered', getUrl: 'https://x.test' },
    { id: 'opensky', title: 'OPENSKY', envVars: ['A', 'B'], set: false, managed: null, tier: 'free', getUrl: 'https://x.test' },
    { id: 'tomtom', title: 'TOMTOM', envVars: ['T'], set: true, managed: 'external', tier: 'free', getUrl: 'https://x.test' },
  ],
};
const noop = () => {};

test('provider table: caption, scoped headers, status + source words, one labelled action per row, no key values', async () => {
  const { ProviderTable } = await load('ProviderTable');
  const html = render(h(ProviderTable, { rows: providerRows(PAYLOAD, { openai: { result: 'ok', at: Date.UTC(2026, 10, 18, 7, 2) } }), loading: false, error: null, onRetry: noop, onOpen: noop, busy: false }));
  assert.match(html, /<caption[^>]*sr-only[^>]*>Providers and API key status<\/caption>/);
  assert.equal([...html.matchAll(/<th[^>]*scope="col"/g)].length, 5);
  assert.match(html, /aria-label="Change OpenAI key"/);
  assert.match(html, /aria-label="Add OpenSky key"/);
  assert.match(html, /Key set/);
  assert.match(html, />Not set</);
  assert.match(html, /Keychain or shell/);
  assert.match(html, /Success •/);
  assert.match(html, /Not tested/);
  assert.match(html, /<ul[^>]*aria-label="Providers and API key status"/, 'stacked cards for mobile');
  assert.doesNotMatch(html, /sk-|OPENAI_API_KEY/);
});

test('provider table states: skeleton, error with retry, empty', async () => {
  const { ProviderTable } = await load('ProviderTable');
  const base = { onRetry: noop, onOpen: noop, busy: false };
  assert.match(render(h(ProviderTable, { ...base, rows: [], loading: true, error: null })), /aria-busy="true"/);
  const failed = render(h(ProviderTable, { ...base, rows: [], loading: false, error: { status: 403 } }));
  assert.match(failed, /role="alert"/);
  assert.match(failed, /Try again/);
  assert.match(render(h(ProviderTable, { ...base, rows: [], loading: false, error: null })), /No providers/);
});

test('save bar: live status, submit button, disabled while clean, failures as an alert', async () => {
  const { SaveBar } = await load('SaveBar');
  const clean = render(h(SaveBar, { dirty: false, saving: false, savedAt: null, onDiscard: noop }));
  assert.match(clean, /role="status"[^>]*aria-live="polite"/);
  assert.match(clean, /All changes are saved/);
  assert.match(clean, /type="submit" disabled="">Save changes/);
  const dirty = render(h(SaveBar, { dirty: true, saving: false, savedAt: '14:02', messages: ['Failed.'], onDiscard: noop }));
  assert.match(dirty, /Unsaved changes/);
  assert.match(dirty, /role="alert"/);
  assert.doesNotMatch(dirty, /type="submit" disabled/);
  assert.match(render(h(SaveBar, { dirty: false, saving: false, savedAt: '14:02', onDiscard: noop })), /Saved • 14:02/);
});

test('Umum: the 30-minute hard cap is stated next to the limits and a larger value is warned about', async () => {
  const { LimitsCard } = await load('GeneralSections');
  const ranges = { dailyMinutes: { min: 1, max: 1440 }, sessionMinutes: { min: 1, max: 120 }, idleSeconds: { min: 10, max: 3600 } };
  const form = { limits: { dailyMinutes: '60', sessionMinutes: '30', idleSeconds: '300' } };
  const base = { form, ranges, errors: {}, onChange: noop, onReset: noop };
  const html = render(h(LimitsCard, base));
  assert.match(html, /Hard limit of 30 minutes/);
  assert.match(html, /<label[^>]*>Maximum session length<\/label>/);
  const over = render(h(LimitsCard, { ...base, form: { limits: { ...form.limits, sessionMinutes: '60' } }, errors: { idleSeconds: 'Wrong.' } }));
  assert.match(over, /Nilai 60 menit melebihi batas keras/);
  assert.match(over, /aria-invalid="true"/);
  assert.match(over, /Wrong\./);
});

test('Umum assistant card: labelled switch with its impact sentence and a character counter', async () => {
  const { AssistantCard } = await load('GeneralSections');
  const html = render(h(AssistantCard, { form: { enabled: true, name: 'Ela', instructions: 'Hangat.' }, patch: noop, onToggleVoice: noop }));
  assert.match(html, /role="switch"[^>]*aria-describedby=/);
  assert.match(html, /Voice assistant on/);
  assert.match(html, /7\/1000 characters/);
});

test('Persona: core rules are read-only with their guard, extra rules are labelled fieldsets, topics have guidance', async () => {
  const { CoreRulesCard, ExtraRulesCard, TopicsCard } = await load('PersonaSections');
  const core = render(h(CoreRulesCard, { rules: { groups: CORE_RULE_GROUPS, rules: VOICE_CORE_RULES } }));
  assert.match(core, /<details[^>]*open/);
  assert.match(core, /Forbidden:/);
  assert.doesNotMatch(core, /<input|<textarea/, 'locked rules have no controls');
  const empty = render(h(ExtraRulesCard, { rows: [], focusIndex: null, onChange: noop }));
  assert.match(empty, /No extra rules yet/);
  assert.match(empty, /Add rule/);
  const rows = render(h(ExtraRulesCard, { rows: [{ forbid: 'Cuaca', instead: 'Tolak' }], focusIndex: null, onChange: noop }));
  assert.match(rows, /<legend[^>]*>Extra rule 1<\/legend>/);
  assert.match(rows, /aria-label="Delete extra rule 1"/);
  assert.match(rows, /5\/200 characters/);
  const topics = render(h(TopicsCard, { topics: { topicsEnabled: true, topics: 'cuaca', refusal: '' }, onChange: noop }));
  assert.match(topics, /One per line, at most 20/);
  assert.match(topics, /aria-checked="true"/);
});

test('Pemakaian & Biaya: cost + audio, a labelled progress meter, per-day table and the empty state', async () => {
  const { TodayCard, DailyCard } = await load('AiUsageSections');
  const day = { day: '2026-11-18', sessions: 2, seconds: 600, extrasUsd: 0.01, judgeCalls: 3, estimatedUsd: 0.5 };
  const usage = {
    dailyMinutes: 30, remainingSeconds: 1200, dayOptions: [7, 30, 90],
    summary: { today: { seconds: 600, estimatedUsd: 0.5 }, rows: [day], total: { sessions: 2, seconds: 600, judgeCalls: 3, estimatedUsd: 0.5 } },
  };
  const today = render(h(TodayCard, { usage }));
  assert.match(today, /role="progressbar"[^>]*aria-valuemax="30"[^>]*aria-valuenow="10"/);
  assert.match(today, /~\$0\.50/);
  const daily = render(h(DailyCard, { usage, days: 30, onDays: noop, loading: false }));
  assert.match(daily, /aria-pressed="true"[^>]*>30 days</);
  assert.match(daily, /<caption[^>]*sr-only[^>]*>Daily usage/);
  const none = render(h(DailyCard, { usage: { ...usage, summary: { ...usage.summary, rows: [{ ...day, sessions: 0 }] } }, days: 7, onDays: noop, loading: false }));
  assert.match(none, /No usage yet/);
});

test('setting switch ties the label and the description to the switch', async () => {
  const { SettingSwitch } = await load('SettingSwitch');
  const html = render(h(SettingSwitch, { title: 'Active', description: 'Dampaknya.', checked: false, onCheckedChange: noop }));
  const id = html.match(/<label for="([^"]+)"/)[1];
  assert.match(html, new RegExp(`id="${id}"[^>]*role="switch"|role="switch"[^>]*id="${id}"`));
  assert.match(html, new RegExp(`aria-describedby="${id}-description"`));
  assert.equal(defaultVoiceSettings().enabled, true);
});
