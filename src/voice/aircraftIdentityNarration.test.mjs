import assert from 'node:assert/strict';
import test from 'node:test';
import { GEV_VOICE_SYSTEM_PROMPT } from './voiceSystemPrompt.js';

test('aircraft identity narration acknowledges missing enrichment', () => {
  // Instruction text now lives in voiceSystemPrompt.js (mechanical relocation
  // out of vite.config.js's formerly-inline literal — see that module's
  // header), so the pin reads the live exported prompt string instead of
  // vite.config.js source text.
  const start = GEV_VOICE_SYSTEM_PROMPT.indexOf("For \"what is this aircraft?\" answers");
  assert.ok(start >= 0, 'aircraft identity honesty instruction is missing');
  const text = GEV_VOICE_SYSTEM_PROMPT.slice(start, GEV_VOICE_SYSTEM_PROMPT.indexOf('\n', start));
  assert.match(text, /get_entity_context selected\.properties/);
  assert.match(text, /callsign, operator, registration, type, and route/);
  assert.match(text, /route, routeOrigin, and routeDestination as the only authoritative route fields/);
  assert.match(text, /Every aircraft identity answer MUST explicitly cover operator, type, and route/);
  assert.match(text, /repeat its endpoint codes exactly/);
  assert.match(text, /do not expand airport codes into city names/);
  assert.match(text, /"Operator details are unavailable"/);
  assert.match(text, /"Aircraft type is unavailable"/);
  assert.match(text, /"Route details are unavailable"/);
  assert.match(text, /never silently omit missing enrichment/i);
  assert.match(text, /never .* infer it from the callsign/i);
});
