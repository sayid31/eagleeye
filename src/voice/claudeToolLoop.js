// src/voice/claudeToolLoop.js
/**
 * Pure bookkeeping for `gevClaudeVoice.js`'s multi-turn tool-use loop:
 * iteration-limit check, response content-block extraction, and
 * conversation-history trimming. Split out of `gevClaudeVoice.js` to keep
 * that controller under the service/use-case file-size ceiling (see
 * CLAUDE.md Rule 8) — this module has no DOM/network/Cesium dependency, so
 * it is directly unit-testable with plain objects.
 *
 * @module voice/claudeToolLoop
 */

/**
 * Hard cap on tool-call round-trips per utterance (plan design decision #4).
 * On exceeding this, the loop stops and speaks whatever partial confirmation
 * is available rather than hanging silently on a runaway model/tool pair.
 */
export const MAX_TOOL_LOOP_ITERATIONS = 5;

/**
 * How many user utterances of conversational context to keep. Mirrors
 * `OPENAI_REALTIME_CONTEXT_TOKENS`'s "short conversational window"
 * philosophy — current map state is re-fetched fresh every turn (tool calls
 * always read live state), so old turns only need to carry enough text for
 * pronoun/follow-up continuity, not a full transcript.
 */
export const MAX_HISTORY_TURNS = 6;

/** True once the loop has used up its round-trip budget. */
export function hasExceededToolLoopLimit(iteration, maxIterations = MAX_TOOL_LOOP_ITERATIONS) {
  return iteration >= maxIterations;
}

/** The `tool_use` content blocks of one Messages API response, if any. */
export function extractToolUseBlocks(content) {
  return Array.isArray(content) ? content.filter((block) => block?.type === 'tool_use') : [];
}

/** All `text` content blocks of one response, joined into one spoken string. */
export function extractFinalText(content) {
  if (!Array.isArray(content)) return '';
  return content
    .filter((block) => block?.type === 'text' && typeof block.text === 'string')
    .map((block) => block.text.trim())
    .filter(Boolean)
    .join(' ');
}

/**
 * The `tool_result` message sent back to Claude for one round of tool calls.
 * @param {Array<{block: object, result: object}>} executions
 */
export function buildToolResultMessage(executions) {
  return {
    role: 'user',
    content: executions.map(({ block, result }) => ({
      type: 'tool_result',
      tool_use_id: block.id,
      content: JSON.stringify(result ?? null),
    })),
  };
}

/** A turn starts with a plain-string user message (the actual utterance), never a tool_result array. */
function isTurnStartMessage(message) {
  return message?.role === 'user' && typeof message.content === 'string';
}

/**
 * Keep only the last `maxTurns` complete utterance-turns, dropping the
 * oldest ones wholesale (never mid-turn, which would strand a `tool_result`
 * without the assistant `tool_use` it answers).
 */
export function trimConversationHistory(history, maxTurns = MAX_HISTORY_TURNS) {
  if (!Array.isArray(history)) return [];
  const turnStarts = [];
  history.forEach((message, index) => { if (isTurnStartMessage(message)) turnStarts.push(index); });
  if (turnStarts.length <= maxTurns) return history.slice();
  return history.slice(turnStarts[turnStarts.length - maxTurns]);
}
