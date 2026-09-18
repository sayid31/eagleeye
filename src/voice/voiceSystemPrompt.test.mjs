import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {
  GEV_CLAUDE_VOICE_SYSTEM_PROMPT,
  GEV_VOICE_SYSTEM_PROMPT,
  GEV_VOICE_SYSTEM_PROMPT_LINES,
} from './voiceSystemPrompt.js';

test('the OpenAI voice system prompt is byte-identical to the pre-refactor inline literal', () => {
  // Mechanical relocation out of vite.config.js's formerly-inline
  // `instructions: [...].join('\n')` — see this module's header. Pinned so a
  // future edit to the persona/tool-usage contract is a loud, deliberate
  // change to voiceSystemPrompt.js, not a silent vite.config.js edit.
  assert.equal(GEV_VOICE_SYSTEM_PROMPT.length, 18660, 'system prompt length drifted from the pinned release text');
  assert.equal(
    crypto.createHash('sha256').update(GEV_VOICE_SYSTEM_PROMPT).digest('hex'),
    '26fea715dbaca8e70ca556fc90bc7f7d3c2afa92995d99108c5250dc6e0df7b8',
    'the relocated persona/tool-usage contract text must not silently drift',
  );
});

test('GEV_VOICE_SYSTEM_PROMPT is exactly GEV_VOICE_SYSTEM_PROMPT_LINES joined by newlines', () => {
  assert.equal(GEV_VOICE_SYSTEM_PROMPT, GEV_VOICE_SYSTEM_PROMPT_LINES.join('\n'));
  assert.ok(GEV_VOICE_SYSTEM_PROMPT_LINES.length > 20, 'expected the full multi-paragraph instruction set');
});

test('the Claude variant carries every OpenAI instruction plus exactly one push-to-talk clarification line', () => {
  assert.ok(GEV_CLAUDE_VOICE_SYSTEM_PROMPT.startsWith(`${GEV_VOICE_SYSTEM_PROMPT}\n`));
  const appended = GEV_CLAUDE_VOICE_SYSTEM_PROMPT.slice(GEV_VOICE_SYSTEM_PROMPT.length + 1);
  assert.equal(appended.includes('\n'), false, 'exactly one extra line should be appended, not more');
  assert.match(appended, /push-to-talk speech recognition/);
  assert.doesNotMatch(GEV_VOICE_SYSTEM_PROMPT, /push-to-talk speech recognition/);
});

test('the mission-mapping paragraph that first-run relies on is present and active', () => {
  assert.match(GEV_VOICE_SYSTEM_PROMPT, /\nNAMED VIEWS are shorthand/);
  const mapping = GEV_VOICE_SYSTEM_PROMPT.slice(GEV_VOICE_SYSTEM_PROMPT.indexOf('NAMED VIEWS are shorthand'));
  const paragraph = mapping.slice(0, mapping.indexOf('\n'));
  for (const layerId of [
    'local-datacenters', 'local-dams', 'telegeography-submarine-cables', 'local-firms', 'earthquakes',
  ]) {
    assert.ok(paragraph.includes(layerId), `mapping must name the existing ${layerId} enum value`);
  }
  assert.ok(paragraph.includes('zoom_to_globe'));
  assert.ok(paragraph.includes('set_layer_visibility'));
});
