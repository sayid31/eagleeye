// src/voice/gevLiveEvents.js
/**
 * GPT-Live `oai-events` data-channel message handler.
 *
 * GPT-Live delivers the delegated backend's work as `response.event` envelopes
 * that wrap standard Responses streaming events — a DIFFERENT wire shape from
 * OpenAI Realtime (which emits `response.function_call_arguments.done` etc.),
 * so this cannot reuse `gevRealtimeEvents.js`. What it DOES reuse unchanged is
 * the `gevActions` runner: a `function_call` here carries the same
 * `{ name, call_id, arguments }` a Realtime tool call does, and is answered with
 * a `function_call_output` — the one wire difference being that GPT-Live wraps
 * the answer in `response.item.create` (not Realtime's `conversation.item.create`),
 * then `response.create` to continue the turn. Both facts are runtime-proven
 * (see docs/gpt-live-migration.md, Fase 0/1).
 *
 * Pure with respect to the DOM and the network — all effects go through the
 * injected `runner`/`send` callbacks — so the tool round-trip is unit-tested
 * without a browser.
 *
 * @module voice/gevLiveEvents
 */

/**
 * Parse a raw data-channel payload into an event object, tolerating both a JSON
 * string (the real channel) and an already-parsed object (tests). Returns null
 * for anything without a `type`.
 * @param {string|object} raw
 * @returns {object|null}
 */
export function parseLiveMessage(raw) {
  if (raw == null) return null;
  if (typeof raw === 'object') return raw.type ? raw : null;
  try {
    const parsed = JSON.parse(String(raw));
    return parsed && parsed.type ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Extract a tool call from an inner Responses event, if it is a completed
 * `function_call` output item. Arguments arrive as a JSON string; a malformed
 * or absent string degrades to `{}` rather than throwing (a bad-args tool call
 * must still be answered, or the turn strands).
 * @param {object} event The inner event (`msg.event`).
 * @returns {{ name: string, call_id: string, arguments: object }|null}
 */
export function extractFunctionCall(event) {
  if (!event || event.type !== 'response.output_item.done') return null;
  const item = event.item;
  if (!item || item.type !== 'function_call') return null;
  let args = {};
  if (typeof item.arguments === 'string' && item.arguments.trim()) {
    try { args = JSON.parse(item.arguments); } catch { args = {}; }
  } else if (item.arguments && typeof item.arguments === 'object') {
    args = item.arguments;
  }
  return { name: item.name, call_id: item.call_id || item.id, arguments: args };
}

/**
 * Build the stateful channel-message handler. The returned async function takes
 * one raw data-channel payload and drives the matching side effects.
 *
 * @param {object} deps
 * @param {(name: string, args: object, opts?: object) => Promise<any>} deps.runner The gevActions runner.
 * @param {(event: object) => any} [deps.send] Sends a client event over the channel.
 * @param {() => boolean} [deps.isOpen] True while the channel is live and the turn is current.
 * @param {(delta: string) => void} [deps.onTranscript]
 * @param {(fc: object) => void} [deps.onToolStart]
 * @param {(fc: object, result: any) => void} [deps.onToolResult]
 * @param {(usage: object) => void} [deps.onUsage]
 * @param {(error: any) => void} [deps.onError]
 * @param {(tag: string, detail?: object) => void} [deps.debugLog]
 * @returns {(raw: string|object) => Promise<object|null>}
 */
export function createLiveChannelHandler({
  runner,
  send,
  isOpen = () => true,
  onTranscript,
  onToolStart,
  onToolResult,
  onUsage,
  onError,
  debugLog,
} = {}) {
  // call_ids already answered — a function_call surfaces on both
  // output_item.added and .done, and late duplicates can arrive; answering
  // twice would create a second function_call_output for one call.
  const answered = new Set();

  return async function handleLiveMessage(raw) {
    const msg = parseLiveMessage(raw);
    if (!msg) return null;

    switch (msg.type) {
      case 'response.event': {
        const ev = msg.event;
        if (ev?.type === 'response.output_text.delta' && ev.delta) {
          onTranscript?.(ev.delta);
          return { transcript: ev.delta };
        }
        const fc = extractFunctionCall(ev);
        if (fc && fc.call_id && !answered.has(fc.call_id)) {
          answered.add(fc.call_id);
          onToolStart?.(fc);
          let result;
          try {
            result = await runner(fc.name, fc.arguments, { isCurrent: isOpen });
          } catch (error) {
            result = { ok: false, error: error?.message || String(error) };
            onError?.(error);
          }
          debugLog?.('live.tool.result', { name: fc.name, callId: fc.call_id });
          onToolResult?.(fc, result);
          if (isOpen()) {
            send?.({ type: 'response.item.create', item: { type: 'function_call_output', call_id: fc.call_id, output: JSON.stringify(result) } });
            send?.({ type: 'response.create' });
          }
          return { functionCall: fc, result };
        }
        return { event: ev?.type || null };
      }
      case 'session.output_transcript.delta':
        if (msg.delta) onTranscript?.(msg.delta);
        return { transcript: msg.delta || '' };
      case 'session.usage.updated':
        onUsage?.(msg.usage);
        return { usage: msg.usage };
      case 'error':
        onError?.(msg.error || msg);
        return { error: msg.error || msg };
      default:
        return { type: msg.type };
    }
  };
}
