import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseLiveMessage,
  extractFunctionCall,
  createLiveChannelHandler,
} from './gevLiveEvents.js';

const fnEvent = (name, args, callId = 'call_1') => ({
  type: 'response.event',
  event: { type: 'response.output_item.done', item: { type: 'function_call', name, call_id: callId, arguments: args } },
});

test('parseLiveMessage tolerates JSON strings, objects, and junk', () => {
  assert.deepEqual(parseLiveMessage('{"type":"error"}'), { type: 'error' });
  assert.deepEqual(parseLiveMessage({ type: 'error' }), { type: 'error' });
  assert.equal(parseLiveMessage('not json'), null);
  assert.equal(parseLiveMessage({ foo: 1 }), null, 'object without type is rejected');
  assert.equal(parseLiveMessage(null), null);
});

test('extractFunctionCall parses JSON-string arguments', () => {
  const fc = extractFunctionCall(fnEvent('toggle_layer', '{"layer":"ships"}').event);
  assert.deepEqual(fc, { name: 'toggle_layer', call_id: 'call_1', arguments: { layer: 'ships' } });
});

test('extractFunctionCall degrades malformed arguments to {} rather than throwing', () => {
  const fc = extractFunctionCall(fnEvent('toggle_layer', '{bad json').event);
  assert.deepEqual(fc.arguments, {});
});

test('extractFunctionCall ignores non-function-call items', () => {
  assert.equal(extractFunctionCall({ type: 'response.output_item.done', item: { type: 'message' } }), null);
  assert.equal(extractFunctionCall({ type: 'response.output_item.added', item: { type: 'function_call' } }), null);
});

test('handler runs the tool and answers with function_call_output + response.create', async () => {
  const sent = [];
  const calls = [];
  const handle = createLiveChannelHandler({
    runner: async (name, args) => { calls.push({ name, args }); return { ok: true, visible: true }; },
    send: (e) => sent.push(e),
    isOpen: () => true,
  });
  const res = await handle(JSON.stringify(fnEvent('set_layer_visibility', '{"layer":"ships","visible":true}')));
  assert.deepEqual(calls, [{ name: 'set_layer_visibility', args: { layer: 'ships', visible: true } }]);
  assert.equal(sent.length, 2);
  assert.equal(sent[0].type, 'response.item.create');
  assert.equal(sent[0].item.type, 'function_call_output');
  assert.equal(sent[0].item.call_id, 'call_1');
  assert.deepEqual(JSON.parse(sent[0].item.output), { ok: true, visible: true });
  assert.equal(sent[1].type, 'response.create');
  assert.deepEqual(res.functionCall.arguments, { layer: 'ships', visible: true });
});

test('a call_id is answered exactly once even if it arrives twice', async () => {
  const sent = [];
  let runs = 0;
  const handle = createLiveChannelHandler({
    runner: async () => { runs += 1; return { ok: true }; },
    send: (e) => sent.push(e),
    isOpen: () => true,
  });
  const raw = JSON.stringify(fnEvent('toggle_layer', '{}', 'dup'));
  await handle(raw);
  await handle(raw);
  assert.equal(runs, 1, 'runner invoked once');
  assert.equal(sent.filter((e) => e.type === 'response.item.create').length, 1);
});

test('a throwing tool still answers the call with an error output', async () => {
  const sent = [];
  let reported = null;
  const handle = createLiveChannelHandler({
    runner: async () => { throw new Error('viewer gone'); },
    send: (e) => sent.push(e),
    isOpen: () => true,
    onError: (err) => { reported = err; },
  });
  const res = await handle(JSON.stringify(fnEvent('toggle_layer', '{}')));
  assert.equal(res.result.ok, false);
  assert.match(res.result.error, /viewer gone/);
  assert.equal(sent[0].item.type, 'function_call_output');
  assert.deepEqual(JSON.parse(sent[0].item.output), { ok: false, error: 'viewer gone' });
  assert.ok(reported instanceof Error);
});

test('a closed channel skips the output send but still ran the tool', async () => {
  const sent = [];
  let ran = false;
  const handle = createLiveChannelHandler({
    runner: async () => { ran = true; return { ok: true }; },
    send: (e) => sent.push(e),
    isOpen: () => false,
  });
  await handle(JSON.stringify(fnEvent('toggle_layer', '{}')));
  assert.equal(ran, true);
  assert.equal(sent.length, 0, 'nothing sent on a closed channel');
});

test('output_text + session transcript deltas feed onTranscript', async () => {
  const deltas = [];
  const handle = createLiveChannelHandler({ runner: async () => ({}), onTranscript: (d) => deltas.push(d) });
  await handle(JSON.stringify({ type: 'response.event', event: { type: 'response.output_text.delta', delta: 'Marking ' } }));
  await handle(JSON.stringify({ type: 'session.output_transcript.delta', delta: 'Surabaya.' }));
  assert.deepEqual(deltas, ['Marking ', 'Surabaya.']);
});

test('usage + error events dispatch to their callbacks', async () => {
  let usage = null;
  let err = null;
  const handle = createLiveChannelHandler({ runner: async () => ({}), onUsage: (u) => { usage = u; }, onError: (e) => { err = e; } });
  await handle(JSON.stringify({ type: 'session.usage.updated', usage: { seconds: 12 } }));
  await handle(JSON.stringify({ type: 'error', error: { message: 'boom' } }));
  assert.deepEqual(usage, { seconds: 12 });
  assert.deepEqual(err, { message: 'boom' });
});
