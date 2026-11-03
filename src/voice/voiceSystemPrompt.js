// src/voice/voiceSystemPrompt.js
/**
 * Single source of truth for the EagleEye Voice Control persona + tool-usage
 * contract sent to any LLM voice backend.
 *
 * `GEV_VOICE_SYSTEM_PROMPT_LINES` was mechanically relocated out of
 * `vite.config.js`'s formerly-inline `instructions: [...].join('\n')`
 * literal on the `/api/live/session` voice session-config —
 * the array content is byte-for-byte the same data, only the module
 * boundary changed (see `voiceSystemPrompt.test.mjs`'s sha256 pin, which
 * follows the same protect-the-refactor pattern as `toolSchemas.test.mjs`'s
 * pin on `GEV_TOOL_SCHEMAS`).
 *
 * The GPT-Live session route (`/api/live/session`, server-side) reads from
 * this one array as the session `instructions`.
 *
 * SPLIT 2026-10-28: the instruction text grew past the 20,000-character
 * file-health limit, so it now lives in four siblings — persona, answering,
 * control, annotation — and this module is the aggregator that joins them in
 * the one order the wire format depends on. The split moved no bytes: the
 * sha256 pin in `voiceSystemPrompt.test.mjs` is over the JOINED string, so it
 * passes only if every line survived in its original position. That is why the
 * split could be done mechanically rather than by re-reading 19 KB of prose.
 *
 * The section boundaries are the array's own: a line answers "who are you"
 * (persona), "how do you answer a question" (answering), "how do you drive the
 * app" (control), or "how do you draw on the map" (annotation). ORDER IS PART
 * OF THE CONTRACT — later lines in the original referred backward ("where a
 * rule below pins an exact failure sentence"), so the concatenation order here
 * is not a style choice. Add a new instruction to the sibling it belongs to,
 * at the END of that sibling, and re-pin the hash deliberately.
 *
 * Pure data — no DOM, no network, no imports beyond the four siblings.
 *
 * @module voice/voiceSystemPrompt
 */

import { VOICE_ANNOTATION_LINES } from './voiceSystemPromptAnnotation.js';
import { VOICE_ANSWERING_LINES } from './voiceSystemPromptAnswering.js';
import { VOICE_CONTROL_LINES } from './voiceSystemPromptControl.js';
import { VOICE_PERSONA_LINES } from './voiceSystemPromptPersona.js';

export const GEV_VOICE_SYSTEM_PROMPT_LINES = [
  ...VOICE_PERSONA_LINES,
  ...VOICE_ANSWERING_LINES,
  ...VOICE_CONTROL_LINES,
  ...VOICE_ANNOTATION_LINES,
];

/** The joined single-string form, exactly as sent to GPT-Live. */
export const GEV_VOICE_SYSTEM_PROMPT = GEV_VOICE_SYSTEM_PROMPT_LINES.join('\n');
