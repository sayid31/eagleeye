import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_VOICE_CONFIG, loadVoiceConfig } from './voiceConfigClient.js';

const respond = (ok, body) => async () => ({ ok, async json() { return body; } });

test('reads the public slice from the endpoint', async () => {
  const cfg = await loadVoiceConfig({ fetchImpl: respond(true, { enabled: false, assistantName: 'Ela', costLimits: { warnUsd: 1, capUsd: 'off' } }) });
  assert.deepEqual(cfg, { enabled: false, assistantName: 'Ela', costLimits: { warnUsd: 1, capUsd: 'off' } });
});

test('fails open to the pre-settings defaults on HTTP error, network error, or junk', async () => {
  assert.deepEqual(await loadVoiceConfig({ fetchImpl: respond(false, {}) }), DEFAULT_VOICE_CONFIG);
  assert.deepEqual(await loadVoiceConfig({ fetchImpl: async () => { throw new Error('down'); } }), DEFAULT_VOICE_CONFIG);
  const junk = await loadVoiceConfig({ fetchImpl: respond(true, null) });
  assert.equal(junk.enabled, true);
  assert.deepEqual(junk.costLimits, { warnUsd: null, capUsd: null });
});
