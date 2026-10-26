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
  // Re-pinned 2026-09-27: merging feature/esri-dark-gray-canvas-basemap
  // (which itself re-pinned this on 2026-09-17 for the "dark gray"/"dark
  // mode"/"dark canvas" disambiguation clause) into main alongside the
  // rest of the split-program branches changed the prompt text again —
  // see CHANGELOG.md "Esri Dark Gray Canvas" for the original rationale;
  // this second re-pin has no independent content change of its own.
  // Re-pinned 2026-10-26: added the SPEAK THE USER'S LANGUAGE clause. The
  // prompt previously said nothing about language at all, so Indonesian
  // replies were left to model default rather than contract — see the
  // dedicated language test below for what the clause must keep guaranteeing.
  assert.equal(GEV_VOICE_SYSTEM_PROMPT.length, 19496, 'system prompt length drifted from the pinned release text');
  assert.equal(
    crypto.createHash('sha256').update(GEV_VOICE_SYSTEM_PROMPT).digest('hex'),
    '1aba2a9d7f6830d2af4378faa00d70867c449d8f53ffe7dcedbc52232b33740e',
    'the relocated persona/tool-usage contract text must not silently drift',
  );
});

test('the language clause tells the model to follow the speaker while freezing tool identifiers', () => {
  // The whole point of the clause: a reply in the user's language, without
  // translating anything the tool layer parses by exact value. Both halves
  // are asserted so a future trim cannot drop the identifier guard and leave
  // a model free to send a translated layer id.
  assert.match(GEV_VOICE_SYSTEM_PROMPT, /SPEAK THE USER'S LANGUAGE/);
  assert.match(GEV_VOICE_SYSTEM_PROMPT, /reply in the language the user is speaking/);
  assert.match(GEV_VOICE_SYSTEM_PROMPT, /when they speak Indonesian, answer in natural conversational Indonesian/);
  const clause = GEV_VOICE_SYSTEM_PROMPT_LINES.find((line) => line.startsWith("SPEAK THE USER'S LANGUAGE"));
  assert.ok(clause, 'the language clause must be its own instruction line');
  for (const frozen of ['a tool name', 'an argument key', 'a layer id', 'a style id']) {
    assert.ok(clause.includes(frozen), `the clause must forbid translating ${frozen}`);
  }
  assert.match(clause, /callsigns, registrations, airport and station codes/);
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
