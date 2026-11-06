import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildLiveSessionConfig,
  LIVE_ALLOWED_SERVER_EVENTS,
  OPENAI_LIVE_MODEL_DEFAULT,
  OPENAI_LIVE_BACKEND_MODEL_DEFAULT,
} from './openAiLiveProxy.mjs';

const TOOLS = [{ type: 'function', name: 'toggle_layer', parameters: { type: 'object', properties: {} } }];
const build = (over = {}) => buildLiveSessionConfig({
  model: OPENAI_LIVE_MODEL_DEFAULT,
  backendModel: OPENAI_LIVE_BACKEND_MODEL_DEFAULT,
  voice: 'marin',
  instructions: 'sys',
  tools: TOOLS,
  ...over,
});

test('omits audio.format (WebSocket-only; a WebRTC 400 otherwise)', () => {
  const s = build();
  assert.ok(s.audio, 'has audio block');
  assert.equal(s.audio.format, undefined, 'audio.format must be absent for WebRTC');
  assert.equal(s.audio.output.voice, 'marin');
});

test('uses responses-mode delegation with the backend model and tools', () => {
  const s = build();
  assert.equal(s.model, 'gpt-live-1');
  assert.equal(s.delegation.type, 'responses');
  assert.equal(s.delegation.responses.model, OPENAI_LIVE_BACKEND_MODEL_DEFAULT);
  assert.deepEqual(s.delegation.responses.tools, TOOLS);
  assert.equal(s.delegation.responses.tool_choice, 'auto');
});

test('tool_choice is overridable', () => {
  assert.equal(build({ toolChoice: 'required' }).delegation.responses.tool_choice, 'required');
});

test('allowlist entries are objects, never bare strings', () => {
  for (const entry of LIVE_ALLOWED_SERVER_EVENTS) {
    assert.equal(typeof entry, 'object', 'each allowed_server_events entry is an object');
    assert.equal(typeof entry.type, 'string');
  }
});

test('response.event entries carry a string response_event selector', () => {
  const responseEvents = LIVE_ALLOWED_SERVER_EVENTS.filter((e) => e.type === 'response.event');
  assert.ok(responseEvents.length >= 1, 'at least one response.event entry');
  for (const e of responseEvents) {
    assert.equal(typeof e.response_event, 'string', 'response.event needs a string selector');
  }
  const selectors = responseEvents.map((e) => e.response_event);
  assert.ok(selectors.includes('response.output_item.done'), 'forwards function_call carrier');
  assert.ok(selectors.includes('response.output_text.delta'), 'forwards spoken text');
});

test('plain delegation/usage events are allowlisted for the data channel', () => {
  const plain = new Set(LIVE_ALLOWED_SERVER_EVENTS.filter((e) => !e.response_event).map((e) => e.type));
  assert.ok(plain.has('session.delegation.created'));
  assert.ok(plain.has('session.usage.updated'));
});

test('session body is embedded whole under the WebRTC transport request', () => {
  // The route wraps this as { session, transport:{type:'webrtc', sdp} }; the
  // builder must not itself nest a `session`/`transport` key.
  const s = build();
  assert.equal(s.session, undefined);
  assert.equal(s.transport, undefined);
});

test('installLiveSessionRoute: owner off-switch returns 403 before any upstream call', async () => {
  const { installLiveSessionRoute } = await import('./openAiLiveProxy.mjs');
  let handler;
  let upstreamCalls = 0;
  installLiveSessionRoute({ use: (_p, h) => { handler = h; } }, {
    readRequestBody: async () => 'v=0',
    enforceRateLimit: () => true,
    tools: TOOLS,
    instructions: () => 'sys',
    isEnabled: () => false,
    fetchImpl: async () => { upstreamCalls += 1; return { status: 200, headers: new Map(), text: async () => '' }; },
  });
  const res = { headers: {}, setHeader() {}, end(t) { this.body = t; } };
  await handler({ method: 'POST' }, res);
  assert.equal(res.statusCode, 403);
  assert.match(res.body, /voice_disabled/);
  assert.equal(upstreamCalls, 0);
});

test('installLiveSessionRoute: instructions getter is evaluated per session', async () => {
  const { installLiveSessionRoute } = await import('./openAiLiveProxy.mjs');
  const previous = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = 'test-only-not-a-real-key'; // test-only
  let handler;
  const sent = [];
  let n = 0;
  installLiveSessionRoute({ use: (_p, h) => { handler = h; } }, {
    readRequestBody: async () => 'v=0',
    enforceRateLimit: () => true,
    tools: TOOLS,
    instructions: () => `prompt-${++n}`,
    fetchImpl: async (_u, opts) => { sent.push(JSON.parse(opts.body).session.instructions); return { status: 200, headers: new Map(), text: async () => '{}' }; },
  });
  try {
    const mk = () => ({ headers: {}, setHeader() {}, end() {} });
    await handler({ method: 'POST' }, mk());
    await handler({ method: 'POST' }, mk());
  } finally {
    if (previous === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = previous;
  }
  assert.deepEqual(sent, ['prompt-1', 'prompt-2']);
});

test('installLiveSessionRoute: admitSession refusal (daily cap) is sent before any upstream call', async () => {
  const { installLiveSessionRoute } = await import('./openAiLiveProxy.mjs');
  let handler;
  let upstreamCalls = 0;
  installLiveSessionRoute({ use: (_p, h) => { handler = h; } }, {
    readRequestBody: async () => 'v=0',
    enforceRateLimit: () => true,
    tools: TOOLS,
    instructions: () => 'sys',
    admitSession: () => ({ status: 429, error: 'voice_daily_limit' }),
    fetchImpl: async () => { upstreamCalls += 1; return { status: 200, headers: new Map(), text: async () => '' }; },
  });
  const res = { headers: {}, setHeader() {}, end(t) { this.body = t; } };
  await handler({ method: 'POST' }, res);
  assert.equal(res.statusCode, 429);
  assert.match(res.body, /voice_daily_limit/);
  assert.equal(upstreamCalls, 0);
});

test('installLiveSessionRoute: a tools getter is evaluated per session', async () => {
  const { installLiveSessionRoute } = await import('./openAiLiveProxy.mjs');
  const previous = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = 'test-only-not-a-real-key'; // test-only
  let handler;
  const sent = [];
  const declared = [[{ type: 'function', name: 'a' }, { type: 'function', name: 'b' }], [{ type: 'function', name: 'a' }]];
  installLiveSessionRoute({ use: (_p, h) => { handler = h; } }, {
    readRequestBody: async () => 'v=0',
    enforceRateLimit: () => true,
    tools: () => declared.shift(),
    instructions: 'sys',
    fetchImpl: async (_u, opts) => {
      sent.push(JSON.parse(opts.body).session.delegation.responses.tools.map((t) => t.name));
      return { status: 200, headers: new Map(), text: async () => '{}' };
    },
  });
  try {
    const mk = () => ({ headers: {}, setHeader() {}, end() {} });
    await handler({ method: 'POST' }, mk());
    await handler({ method: 'POST' }, mk());
  } finally {
    if (previous === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = previous;
  }
  assert.deepEqual(sent, [['a', 'b'], ['a']]);
});
