import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BACKEND_MODEL_OPTIONS, VOICE_OPTIONS, defaultProviderSettings, readProviderSettings, resolveLiveProvider,
} from './voiceProviderOptions.mjs';

test('the voice allowlist is the 31 built-in Live voices and includes the default', () => {
  assert.equal(VOICE_OPTIONS.length, 31);
  assert.equal(new Set(VOICE_OPTIONS).size, 31);
  assert.ok(VOICE_OPTIONS.includes('marin'));
  assert.deepEqual(BACKEND_MODEL_OPTIONS, ['gpt-5.6-luna', 'gpt-6-luna', 'gpt-6-sol']);
});

test('never-saved settings resolve exactly as before: env first, then built-in default', () => {
  const none = resolveLiveProvider(defaultProviderSettings(), {});
  assert.deepEqual(none, {
    model: { value: 'gpt-live-1', source: 'default' },
    backendModel: { value: 'gpt-5.6-luna', source: 'default' },
    voice: { value: 'marin', source: 'default' },
  });
  const env = resolveLiveProvider({}, { OPENAI_LIVE_VOICE: 'cedar', OPENAI_LIVE_BACKEND_MODEL: 'gpt-6-luna' });
  assert.deepEqual(env.voice, { value: 'cedar', source: 'env' });
  assert.deepEqual(env.backendModel, { value: 'gpt-6-luna', source: 'env' });
});

test('a saved choice wins over the env var', () => {
  const r = resolveLiveProvider({ voice: 'sage', backendModel: 'gpt-6-sol' }, { OPENAI_LIVE_VOICE: 'cedar' });
  assert.deepEqual(r.voice, { value: 'sage', source: 'admin' });
  assert.deepEqual(r.backendModel, { value: 'gpt-6-sol', source: 'admin' });
});

test('readProviderSettings accepts allowlisted values and empty, rejects anything else without echoing it', () => {
  const ok = [];
  assert.deepEqual(readProviderSettings({ voice: 'ash', backendModel: '' }, ok), { voice: 'ash', backendModel: '' });
  assert.deepEqual(ok, []);
  const errors = [];
  const out = readProviderSettings({ voice: 'robot-x', backendModel: 42 }, errors);
  assert.deepEqual(out, { voice: '', backendModel: '' });
  assert.equal(errors.length, 2);
  assert.ok(errors.every((e) => !e.includes('robot-x')));
});
