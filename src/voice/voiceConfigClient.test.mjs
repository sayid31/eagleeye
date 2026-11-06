import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_VOICE_CONFIG, VOICE_USAGE_URL, loadVoiceConfig, reportVoiceUsage } from './voiceConfigClient.js';

const respond = (ok, body) => async () => ({ ok, async json() { return body; } });

test('reads the public slice from the endpoint', async () => {
  const cfg = await loadVoiceConfig({ fetchImpl: respond(true, { enabled: false, assistantName: 'Ela', costLimits: { warnUsd: 1, capUsd: 'off' } }) });
  assert.deepEqual(cfg, {
    enabled: false,
    assistantName: 'Ela',
    costLimits: { warnUsd: 1, capUsd: 'off' },
    limits: { dailyMinutes: 0, sessionMinutes: 0, idleSeconds: 0 },
    today: { remainingSeconds: null },
  });
});

test('fails open to the pre-settings defaults on HTTP error, network error, or junk', async () => {
  assert.deepEqual(await loadVoiceConfig({ fetchImpl: respond(false, {}) }), DEFAULT_VOICE_CONFIG);
  assert.deepEqual(await loadVoiceConfig({ fetchImpl: async () => { throw new Error('down'); } }), DEFAULT_VOICE_CONFIG);
  const junk = await loadVoiceConfig({ fetchImpl: respond(true, null) });
  assert.equal(junk.enabled, true);
  assert.deepEqual(junk.costLimits, { warnUsd: null, capUsd: null });
});

test('reads session limits and seconds left today; junk limits read as off', async () => {
  const cfg = await loadVoiceConfig({ fetchImpl: respond(true, {
    limits: { dailyMinutes: 30, sessionMinutes: 10, idleSeconds: 'x' }, today: { remainingSeconds: 120 },
  }) });
  assert.deepEqual(cfg.limits, { dailyMinutes: 30, sessionMinutes: 10, idleSeconds: 0 });
  assert.equal(cfg.today.remainingSeconds, 120);
  const junk = await loadVoiceConfig({ fetchImpl: respond(true, { today: { remainingSeconds: '5' } }) });
  assert.equal(junk.today.remainingSeconds, null);
});

test('reportVoiceUsage posts rounded seconds as same-origin JSON with keepalive', async () => {
  const calls = [];
  const ok = await reportVoiceUsage({ seconds: 61.6, extrasUsd: 0.001 }, { fetchImpl: async (url, opts) => { calls.push({ url, opts }); return { ok: true }; } });
  assert.equal(ok, true);
  assert.equal(calls[0].url, VOICE_USAGE_URL);
  assert.equal(calls[0].opts.keepalive, true);
  assert.equal(calls[0].opts.headers['Content-Type'], 'application/json');
  assert.deepEqual(JSON.parse(calls[0].opts.body), { seconds: 62, extrasUsd: 0.001 });
});

test('reportVoiceUsage skips empty sessions and never throws on failure', async () => {
  let calls = 0;
  assert.equal(await reportVoiceUsage({ seconds: 0 }, { fetchImpl: async () => { calls += 1; return { ok: true }; } }), false);
  assert.equal(calls, 0);
  const warn = console.warn;
  const warned = [];
  console.warn = (m) => warned.push(m);
  try {
    assert.equal(await reportVoiceUsage({ seconds: 5 }, { fetchImpl: async () => { throw new Error('offline'); } }), false);
    assert.equal(await reportVoiceUsage({ seconds: 5 }, { fetchImpl: async () => ({ ok: false, status: 403 }) }), false);
  } finally { console.warn = warn; }
  assert.deepEqual(warned, ['[voice] usage report failed: offline', '[voice] usage report rejected: HTTP 403']);
});
