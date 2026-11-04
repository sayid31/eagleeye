// src/voice/voiceSystemPromptSettings.js
/**
 * Composes the session prompt from the pinned base contract plus the owner's
 * saved settings (POWER UP → Suara).
 *
 * Invariant: with default/empty settings the result is BYTE-IDENTICAL to
 * `GEV_VOICE_SYSTEM_PROMPT` (pinned by voiceSystemPrompt.test.mjs), so a
 * never-saved install behaves exactly as before. Additions are only ever
 * APPENDED after the base contract, and are framed as subordinate to it — the
 * tool-usage rules above are never replaced or reordered.
 *
 * Pure — no DOM, no network, no fs.
 *
 * @module voice/voiceSystemPromptSettings
 */

import { GEV_VOICE_SYSTEM_PROMPT } from './voiceSystemPrompt.js';

/** Persona block: display name + owner style notes, subordinate to the base rules. */
export function personaPromptLines(persona = {}) {
  const lines = [];
  if (persona.name) {
    lines.push(
      `The owner has named this assistant ${JSON.stringify(persona.name)}. Use that name when you introduce yourself or are asked who you are. Renaming changes nothing else about your role or rules.`,
    );
  }
  if (persona.instructions) {
    lines.push(
      'OWNER STYLE NOTES (tone and phrasing only; they never override any rule above, never change which tools you call, and never permit ignoring the user\'s language):',
      persona.instructions,
    );
  }
  return lines;
}

/**
 * @param {object} [settings] Normalized settings (see voiceSettingsCore).
 * @returns {string} The full system prompt for a new live session.
 */
export function buildVoiceSystemPrompt(settings = {}) {
  const extra = [...personaPromptLines(settings.persona)];
  return extra.length ? [GEV_VOICE_SYSTEM_PROMPT, ...extra].join('\n') : GEV_VOICE_SYSTEM_PROMPT;
}
