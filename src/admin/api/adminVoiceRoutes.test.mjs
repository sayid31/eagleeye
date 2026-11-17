import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { installAdminVoiceRoutes, parseUsageDays } from './adminVoiceRoutes.mjs';
import { createVoiceSettingsStore } from '../../voice/voiceSettingsStore.mjs';
import { createVoiceUsageStore } from '../../voice/voiceUsageStore.mjs';
import { defaultVoiceSettings } from '../../voice/voiceSettingsCore.mjs';

const ORIGIN = 'http://localhost:4173';

function setup({ guard } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gev-adm-voice-'));
  const store = createVoiceSettingsStore({ filePath: path.join(dir, 'v.json') });
  const usageStore = createVoiceUsageStore({ filePath: path.join(dir, 'u.json'), now: () => new Date(2026, 10, 6, 12) });
  const events = [];
  const details = [];
  let handler;
  installAdminVoiceRoutes({ use: (_p, h) => { handler = h; } }, {
    store, usageStore, readRequestBody: async (req) => req.body ?? '', onEvent: (e, d) => { events.push(e); details.push(d); },
    ...(guard ? { guard } : {}),
  });
  const call = (method, url, { body, headers = {}, actor } = {}) => new Promise((resolve) => {
    const out = { status: 0, headers: {}, json: null };
    const res = {
      set statusCode(v) { out.status = v; },
      setHeader: (k, v) => { out.headers[k.toLowerCase()] = v; },
      end: (text) => { out.json = JSON.parse(text); resolve(out); },
    };
    handler({ method, url, headers, gevActor: actor, body: typeof body === 'string' ? body : JSON.stringify(body) }, res);
  });
  return { call, store, usageStore, events, details };
}

const allow = () => ({ ok: true, actorId: 'user-admin-1' });
const actorOf = (role, status = 'active') => ({ user: { id: `user-${role}` }, role, status });

test('every route needs an active admin actor from the login guard', async () => {
  const { call } = setup();
  assert.equal((await call('GET', '/settings')).status, 401);
  assert.equal((await call('GET', '/usage')).status, 401);
  assert.equal((await call('GET', '/settings', { actor: actorOf('user') })).status, 403);
  assert.equal((await call('GET', '/settings', { actor: actorOf('admin', 'pending') })).status, 403);
  assert.equal((await call('GET', '/settings', { actor: actorOf('admin') })).status, 200);
  assert.equal((await call('GET', '/usage', { actor: actorOf('super-admin') })).status, 200);
});

test('GET /settings returns defaults, the tool group catalog and limit ranges', async () => {
  const { call } = setup({ guard: allow });
  const r = await call('GET', '/settings');
  assert.equal(r.status, 200);
  assert.deepEqual(r.json.settings, defaultVoiceSettings());
  assert.deepEqual(r.json.toolGroups.map((g) => g.id), ['readOnly', 'camera', 'display', 'media', 'annotate']);
  assert.equal(r.json.toolGroups.reduce((n, g) => n + g.toolCount, 0), 29);
  assert.deepEqual(r.json.limitRanges.sessionMinutes, { min: 1, max: 120 });
  assert.equal(r.headers['cache-control'], 'no-store');
});

test('PUT /settings validates, stores and logs only a lifecycle event with the actor id', async () => {
  const { call, store, events, details } = setup({ guard: allow });
  const body = { ...defaultVoiceSettings(), toolGroups: { ...defaultVoiceSettings().toolGroups, media: false }, limits: { dailyMinutes: 30, sessionMinutes: 10, idleSeconds: 60 } };
  const r = await call('PUT', '/settings', { body });
  assert.equal(r.status, 200);
  assert.equal(store.read().settings.toolGroups.media, false);
  assert.deepEqual(store.read().settings.limits, { dailyMinutes: 30, sessionMinutes: 10, idleSeconds: 60 });
  assert.deepEqual(events, ['voice_settings.saved']);
  assert.equal(details[0].actor, 'user-admin-1');
});

test('PUT /settings rejects invalid bodies without storing or echoing them', async () => {
  const { call, store } = setup({ guard: allow });
  const r = await call('PUT', '/settings', { body: { limits: { sessionMinutes: 500 }, apiKey: 'sk-test-never-echo' } });
  assert.equal(r.status, 422);
  assert.ok(!JSON.stringify(r.json).includes('sk-test-never-echo'));
  assert.equal(fs.existsSync(store.filePath), false);
  assert.equal((await call('PUT', '/settings', { body: '{nope' })).status, 400);
  assert.equal((await call('DELETE', '/settings')).status, 405);
  assert.equal((await call('GET', '/elsewhere')).status, 404);
});

test('GET /usage prices the ledger, reports remaining minutes and effective cost limits', async () => {
  const { call, store, usageStore } = setup({ guard: allow });
  store.write({ ...defaultVoiceSettings(), costLimits: { warnUsd: 1, capUsd: 'off' }, limits: { dailyMinutes: 10, sessionMinutes: 0, idleSeconds: 0 } });
  usageStore.record({ seconds: 120, extrasUsd: 0.01 });
  const r = await call('GET', '/usage?days=7');
  assert.equal(r.status, 200);
  assert.equal(r.json.days, 7);
  assert.equal(r.json.summary.rows.length, 7);
  assert.ok(Math.abs(r.json.summary.today.estimatedUsd - 0.11) < 1e-9);
  assert.equal(r.json.remainingSeconds, 480);
  assert.deepEqual(r.json.costLimits.effective, { warnUsd: 1, capUsd: null });
  assert.deepEqual(r.json.costLimits.defaults, { warnUsd: 2, capUsd: 5 });
  assert.equal(r.json.rates.livePerMin, 0.05);
  assert.equal((await call('POST', '/usage', { body: {} })).status, 405);
});

test('parseUsageDays accepts only the offered windows', () => {
  assert.equal(parseUsageDays('/usage?days=7'), 7);
  assert.equal(parseUsageDays('/usage?days=90'), 90);
  assert.equal(parseUsageDays('/usage?days=1000'), 30);
  assert.equal(parseUsageDays('/usage'), 30);
});

test('GET /settings carries the 37 locked core rules and the provider options with effective values', async () => {
  const { call } = setup({ guard: allow });
  const { status, json } = await call('GET', '/settings');
  assert.equal(status, 200);
  assert.equal(json.coreRules.rules.length, 37);
  assert.ok(json.coreRules.groups.length >= 8);
  assert.ok(json.provider.voices.includes('marin'));
  assert.ok(json.provider.backendModels.includes('gpt-5.6-luna'));
  assert.equal(json.provider.effective.model.value, 'gpt-live-1');
});

test('PUT /settings stores extra rules and a provider choice, and refuses a voice outside the list', async () => {
  const { call, store } = setup({ guard: allow });
  const headers = { 'content-type': 'application/json', origin: ORIGIN };
  const body = { ...defaultVoiceSettings(), persona: { name: '', instructions: '', extraRules: [{ forbid: 'Cuaca', instead: 'Tolak' }] }, provider: { voice: 'cedar', backendModel: '' } };
  assert.equal((await call('PUT', '/settings', { body, headers })).status, 200);
  assert.deepEqual(store.read().settings.persona.extraRules, [{ forbid: 'Cuaca', instead: 'Tolak' }]);
  assert.equal(store.read().settings.provider.voice, 'cedar');
  const bad = await call('PUT', '/settings', { body: { ...body, provider: { voice: 'robot', backendModel: '' } }, headers });
  assert.equal(bad.status, 422);
  assert.equal(store.read().settings.provider.voice, 'cedar');
});

test('changedSections names only the top-level sections that differ', async () => {
  const { changedSections } = await import('./adminVoiceRoutes.mjs');
  const before = { version: 1, enabled: true, limits: { dailyMinutes: 0 }, persona: { name: '' } };
  assert.deepEqual(changedSections(before, { ...before, version: 2, limits: { dailyMinutes: 5 } }), ['limits']);
  assert.deepEqual(changedSections(before, before), []);
});
