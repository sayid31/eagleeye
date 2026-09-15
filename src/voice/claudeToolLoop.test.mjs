import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildToolResultMessage,
  extractFinalText,
  extractToolUseBlocks,
  hasExceededToolLoopLimit,
  MAX_HISTORY_TURNS,
  MAX_TOOL_LOOP_ITERATIONS,
  trimConversationHistory,
} from './claudeToolLoop.js';

test('hasExceededToolLoopLimit trips at, not just past, the configured max', () => {
  assert.equal(hasExceededToolLoopLimit(0, 5), false);
  assert.equal(hasExceededToolLoopLimit(4, 5), false);
  assert.equal(hasExceededToolLoopLimit(5, 5), true);
  assert.equal(hasExceededToolLoopLimit(6, 5), true);
});

test('hasExceededToolLoopLimit defaults to MAX_TOOL_LOOP_ITERATIONS', () => {
  assert.equal(hasExceededToolLoopLimit(MAX_TOOL_LOOP_ITERATIONS - 1), false);
  assert.equal(hasExceededToolLoopLimit(MAX_TOOL_LOOP_ITERATIONS), true);
});

test('extractToolUseBlocks filters to only tool_use blocks, tolerating non-array content', () => {
  const content = [
    { type: 'text', text: 'checking...' },
    { type: 'tool_use', id: 'a', name: 'fly_to_location', input: {} },
    { type: 'tool_use', id: 'b', name: 'set_layer_visibility', input: {} },
  ];
  assert.deepEqual(extractToolUseBlocks(content).map((b) => b.id), ['a', 'b']);
  assert.deepEqual(extractToolUseBlocks(null), []);
  assert.deepEqual(extractToolUseBlocks(undefined), []);
});

test('extractFinalText joins only text blocks, trims each, and drops blanks', () => {
  const content = [
    { type: 'text', text: '  Flying to Tokyo.  ' },
    { type: 'tool_use', id: 'a', name: 'x', input: {} },
    { type: 'text', text: '   ' },
    { type: 'text', text: 'Satellites enabled.' },
  ];
  assert.equal(extractFinalText(content), 'Flying to Tokyo. Satellites enabled.');
  assert.equal(extractFinalText(null), '');
});

test('buildToolResultMessage pairs each execution with its tool_use_id, JSON-stringifying the result', () => {
  const executions = [
    { block: { id: 'toolu_1' }, result: { ok: true, action: 'fly_to_location' } },
    { block: { id: 'toolu_2' }, result: undefined },
  ];
  const message = buildToolResultMessage(executions);
  assert.equal(message.role, 'user');
  assert.equal(message.content[0].type, 'tool_result');
  assert.equal(message.content[0].tool_use_id, 'toolu_1');
  assert.equal(message.content[0].content, JSON.stringify({ ok: true, action: 'fly_to_location' }));
  assert.equal(message.content[1].tool_use_id, 'toolu_2');
  assert.equal(message.content[1].content, 'null');
});

test('trimConversationHistory keeps the last N complete turns, never splitting a turn', () => {
  // 3 turns: each a [user-text, assistant, tool_result] triple.
  const history = [];
  for (let i = 0; i < 3; i += 1) {
    history.push({ role: 'user', content: `utterance ${i}` });
    history.push({ role: 'assistant', content: [{ type: 'text', text: `reply ${i}` }] });
    history.push({ role: 'user', content: [{ type: 'tool_result', tool_use_id: 'x', content: '{}' }] });
  }
  const trimmed = trimConversationHistory(history, 2);
  assert.equal(trimmed.length, 6);
  assert.equal(trimmed[0].content, 'utterance 1');
});

test('trimConversationHistory is a no-op when under the cap, and tolerant of non-array input', () => {
  const history = [{ role: 'user', content: 'hi' }];
  assert.deepEqual(trimConversationHistory(history, 6), history);
  assert.deepEqual(trimConversationHistory(null), []);
});

test('trimConversationHistory defaults to MAX_HISTORY_TURNS', () => {
  const history = [];
  for (let i = 0; i < MAX_HISTORY_TURNS + 2; i += 1) {
    history.push({ role: 'user', content: `u${i}` });
  }
  const trimmed = trimConversationHistory(history);
  assert.equal(trimmed.length, MAX_HISTORY_TURNS);
  assert.equal(trimmed[0].content, `u${2}`);
});
