import assert from 'node:assert/strict';
import test from 'node:test';
import { GevClaudeVoiceController, MAX_TOOL_LOOP_ITERATIONS } from './gevClaudeVoice.js';

// Pure tool-loop bookkeeping (iteration guard, block extraction, history
// trimming) lives in claudeToolLoop.js and is tested there directly —
// this file only exercises the stateful controller, with mocked fetch and
// a mocked action runner (no real Web Speech API / network).

/* ------------------------------------------------------------------ *
 * CONTROLLER — mocked fetch + mocked runner, no real Web Speech API
 * ------------------------------------------------------------------ */

function fakeSpeechGlobal({ transcript = 'fly to tokyo' } = {}) {
  const recognitionInstances = [];
  class FakeRecognition {
    constructor() { recognitionInstances.push(this); }
    start() {
      // Fire the result on the next microtask, like a real async recognizer.
      queueMicrotask(() => {
        this.onresult?.({ results: [[{ transcript }]] });
        this.onend?.();
      });
    }
    stop() { this.onend?.(); }
    abort() { this.onend?.(); }
  }
  const spoken = [];
  const synth = {
    cancel() {},
    speak(utterance) {
      spoken.push(utterance.text);
      queueMicrotask(() => utterance.onend?.());
    },
  };
  class FakeUtterance {
    constructor(text) { this.text = text; }
  }
  return {
    globalObject: {
      SpeechRecognition: FakeRecognition,
      speechSynthesis: synth,
      SpeechSynthesisUtterance: FakeUtterance,
    },
    spoken,
    recognitionInstances,
  };
}

function jsonResponse(body, { ok = true, status = 200 } = {}) {
  return {
    ok,
    status,
    statusText: ok ? 'OK' : 'Error',
    json: async () => body,
    text: async () => JSON.stringify(body),
  };
}

function waitForStatus(controller, status, { timeoutMs = 500 } = {}) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const tick = () => {
      if (controller.status === status) return resolve();
      if (Date.now() - start > timeoutMs) return reject(new Error(`timed out waiting for status "${status}", stuck at "${controller.status}"`));
      setTimeout(tick, 1);
    };
    tick();
  });
}

test('a text-only response speaks immediately without invoking the runner', async () => {
  const { globalObject, spoken } = fakeSpeechGlobal();
  const runner = async () => { throw new Error('should not be called'); };
  const fetchImpl = async () => jsonResponse({
    content: [{ type: 'text', text: 'Already flying there.' }],
    stop_reason: 'end_turn',
    usage: { input_tokens: 100, output_tokens: 20 },
  });

  const controller = new GevClaudeVoiceController({ runner, fetchImpl, globalObject });
  controller.start();
  await waitForStatus(controller, 'idle');
  assert.deepEqual(spoken, ['Already flying there.']);
});

test('executes tool_use blocks via the runner, sends tool_result back, then speaks the final text', async () => {
  const { globalObject, spoken } = fakeSpeechGlobal();
  const calls = [];
  const runner = async (name, input) => {
    calls.push({ name, input });
    return { ok: true, action: name };
  };

  let requestCount = 0;
  const fetchImpl = async (url, init) => {
    requestCount += 1;
    const body = JSON.parse(init.body);
    if (requestCount === 1) {
      assert.equal(body.messages[body.messages.length - 1].content, 'fly to tokyo');
      return jsonResponse({
        content: [{ type: 'tool_use', id: 'toolu_1', name: 'fly_to_location', input: { location: 'Tokyo' } }],
        stop_reason: 'tool_use',
        usage: { input_tokens: 50, output_tokens: 10 },
      });
    }
    // Second round-trip: the tool_result must have been appended.
    const last = body.messages[body.messages.length - 1];
    assert.equal(last.role, 'user');
    assert.equal(last.content[0].type, 'tool_result');
    assert.equal(last.content[0].tool_use_id, 'toolu_1');
    return jsonResponse({
      content: [{ type: 'text', text: 'Flying to Tokyo now.' }],
      stop_reason: 'end_turn',
      usage: { input_tokens: 60, output_tokens: 15 },
    });
  };

  const controller = new GevClaudeVoiceController({ runner, fetchImpl, globalObject });
  controller.start();
  await waitForStatus(controller, 'idle');

  assert.equal(requestCount, 2);
  assert.deepEqual(calls, [{ name: 'fly_to_location', input: { location: 'Tokyo' } }]);
  assert.deepEqual(spoken, ['Flying to Tokyo now.']);
});

test('a runner failure is folded into the tool_result rather than aborting the turn', async () => {
  const { globalObject, spoken } = fakeSpeechGlobal();
  const runner = async () => { throw new Error('layer not found'); };
  let requestCount = 0;
  const fetchImpl = async (url, init) => {
    requestCount += 1;
    if (requestCount === 1) {
      return jsonResponse({
        content: [{ type: 'tool_use', id: 'toolu_1', name: 'set_layer_visibility', input: {} }],
        stop_reason: 'tool_use',
        usage: { input_tokens: 10, output_tokens: 5 },
      });
    }
    const body = JSON.parse(init.body);
    const toolResult = body.messages[body.messages.length - 1].content[0];
    assert.match(toolResult.content, /layer not found/);
    return jsonResponse({
      content: [{ type: 'text', text: "Couldn't do that." }],
      stop_reason: 'end_turn',
      usage: { input_tokens: 10, output_tokens: 5 },
    });
  };

  const controller = new GevClaudeVoiceController({ runner, fetchImpl, globalObject });
  controller.start();
  await waitForStatus(controller, 'idle');
  assert.deepEqual(spoken, ["Couldn't do that."]);
});

test('the tool loop halts at MAX_TOOL_LOOP_ITERATIONS instead of looping forever', async () => {
  const { globalObject, spoken } = fakeSpeechGlobal();
  const runner = async () => ({ ok: true });
  let requestCount = 0;
  const fetchImpl = async () => {
    requestCount += 1;
    // Always ask for another tool call — a runaway model.
    return jsonResponse({
      content: [{ type: 'tool_use', id: `toolu_${requestCount}`, name: 'noop', input: {} }],
      stop_reason: 'tool_use',
      usage: { input_tokens: 5, output_tokens: 5 },
    });
  };

  const controller = new GevClaudeVoiceController({ runner, fetchImpl, globalObject });
  controller.start();
  await waitForStatus(controller, 'idle');

  assert.equal(requestCount, MAX_TOOL_LOOP_ITERATIONS);
  assert.equal(spoken.length, 1);
  assert.match(spoken[0], /tool-call limit/i);
});

test('a fetch failure ends the turn gracefully with a spoken apology, not a hang', async () => {
  const { globalObject, spoken } = fakeSpeechGlobal();
  const runner = async () => ({ ok: true });
  const fetchImpl = async () => { throw new Error('network down'); };

  const controller = new GevClaudeVoiceController({ runner, fetchImpl, globalObject });
  controller.start();
  await waitForStatus(controller, 'idle');
  assert.deepEqual(spoken, ['Sorry, something went wrong reaching Claude.']);
});

test('an HTTP error status is treated as a failure, not parsed as a normal response', async () => {
  const { globalObject, spoken } = fakeSpeechGlobal();
  const runner = async () => ({ ok: true });
  const fetchImpl = async () => jsonResponse({ error: 'rate limited' }, { ok: false, status: 429 });

  const controller = new GevClaudeVoiceController({ runner, fetchImpl, globalObject });
  controller.start();
  await waitForStatus(controller, 'idle');
  assert.deepEqual(spoken, ['Sorry, something went wrong reaching Claude.']);
});

test('start() is a no-op while already active, and isActive() reflects mid-turn state', async () => {
  const { globalObject } = fakeSpeechGlobal();
  const runner = async () => ({ ok: true });
  let resolveFetch;
  const fetchImpl = () => new Promise((resolve) => { resolveFetch = resolve; });

  const controller = new GevClaudeVoiceController({ runner, fetchImpl, globalObject });
  assert.equal(controller.start(), true);
  await waitForStatus(controller, 'thinking');
  assert.equal(controller.isActive(), true);
  assert.equal(controller.start(), false, 'a second start() while active must be rejected');

  resolveFetch(jsonResponse({ content: [{ type: 'text', text: 'ok' }], stop_reason: 'end_turn', usage: {} }));
  await waitForStatus(controller, 'idle');
});

test('stop() invalidates the in-flight turn so a late response never speaks', async () => {
  const { globalObject, spoken } = fakeSpeechGlobal();
  const runner = async () => ({ ok: true });
  let resolveFetch;
  const fetchImpl = () => new Promise((resolve) => { resolveFetch = resolve; });

  const controller = new GevClaudeVoiceController({ runner, fetchImpl, globalObject });
  controller.start();
  await waitForStatus(controller, 'thinking');
  controller.stop();
  assert.equal(controller.status, 'idle');

  resolveFetch(jsonResponse({ content: [{ type: 'text', text: 'too late' }], stop_reason: 'end_turn', usage: {} }));
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.deepEqual(spoken, [], 'a response arriving after stop() must never be spoken');
});

test('start() reports unsupported browsers via the error status instead of throwing', () => {
  const runner = async () => ({ ok: true });
  const controller = new GevClaudeVoiceController({ runner, fetchImpl: async () => jsonResponse({}), globalObject: {} });
  assert.equal(controller.start(), false);
  assert.equal(controller.status, 'error');
  assert.equal(controller.isActive(), false);
});

test('syncCostUi paints the shared cost readout element from the tracker state', async () => {
  const { globalObject } = fakeSpeechGlobal();
  const runner = async () => ({ ok: true });
  const fetchImpl = async () => jsonResponse({
    content: [{ type: 'text', text: 'done' }],
    stop_reason: 'end_turn',
    usage: { input_tokens: 1_000_000, output_tokens: 1_000_000 },
  });
  const costValue = { textContent: '', dataset: {} };
  const controller = new GevClaudeVoiceController({ runner, fetchImpl, globalObject, ui: { costValue } });

  assert.equal(costValue.textContent, '~$0.00');
  controller.start();
  await waitForStatus(controller, 'idle');
  // standard tier: 1M input @ $1/1M + 1M output @ $5/1M = $6.00
  assert.equal(costValue.textContent, '~$6.00');
  assert.equal(costValue.dataset.level, 'cap');
});
