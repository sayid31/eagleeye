import assert from 'node:assert/strict';
import test from 'node:test';
import { EventEmitter } from 'node:events';
import { anthropicProxy } from '../vite.config.js';
import { GEV_CLAUDE_VOICE_SYSTEM_PROMPT } from './voice/voiceSystemPrompt.js';

function installAnthropicRoutes() {
  const routes = new Map();
  anthropicProxy().configureServer({
    middlewares: {
      use(path, handler) {
        routes.set(path, handler);
      },
    },
  });
  return routes;
}

function fakePostRequest(bodyObject, { remoteAddress = '127.0.0.1' } = {}) {
  const req = new EventEmitter();
  req.method = 'POST';
  req.url = '/api/anthropic/messages';
  req.headers = {};
  req.socket = { remoteAddress };
  queueMicrotask(() => {
    req.emit('data', Buffer.from(JSON.stringify(bodyObject)));
    req.emit('end');
  });
  return req;
}

function invokeRoute(handler, req) {
  return new Promise((resolve, reject) => {
    const headers = new Map();
    const res = {
      statusCode: 200,
      setHeader(name, value) {
        headers.set(String(name).toLowerCase(), String(value));
      },
      end(body = '') {
        resolve({
          statusCode: this.statusCode,
          headers: Object.fromEntries(headers),
          body: body ? JSON.parse(String(body)) : null,
        });
      },
    };
    Promise.resolve(handler(req, res)).catch(reject);
  });
}

test('the Anthropic proxy refuses to run without a server-side key, and never accepts client-supplied tools', async () => {
  const previousKey = process.env.ANTHROPIC_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;
  try {
    const routes = installAnthropicRoutes();
    const messages = routes.get('/api/anthropic/messages');
    assert.equal(typeof messages, 'function');

    const response = await invokeRoute(messages, fakePostRequest({
      messages: [{ role: 'user', content: 'hello' }],
      tools: [{ name: 'evil_tool', description: 'not real', input_schema: {} }],
    }));
    assert.equal(response.statusCode, 503);
    assert.match(response.body.error, /ANTHROPIC_API_KEY is not set/);
  } finally {
    if (previousKey === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = previousKey;
  }
});

test('rejects non-POST methods', async () => {
  const routes = installAnthropicRoutes();
  const messages = routes.get('/api/anthropic/messages');
  const req = new EventEmitter();
  req.method = 'GET';
  req.url = '/api/anthropic/messages';
  req.headers = {};
  req.socket = { remoteAddress: '127.0.0.1' };
  const response = await invokeRoute(messages, req);
  assert.equal(response.statusCode, 405);
});

test('rejects an unparsable request body as 400, not a crash', async () => {
  const previousKey = process.env.ANTHROPIC_API_KEY;
  process.env.ANTHROPIC_API_KEY = 'test-key-not-used-network-mocked-below';
  try {
    const routes = installAnthropicRoutes();
    const messages = routes.get('/api/anthropic/messages');
    const req = new EventEmitter();
    req.method = 'POST';
    req.url = '/api/anthropic/messages';
    req.headers = {};
    req.socket = { remoteAddress: '127.0.0.1' };
    queueMicrotask(() => {
      req.emit('data', Buffer.from('not json'));
      req.emit('end');
    });
    const response = await invokeRoute(messages, req);
    assert.equal(response.statusCode, 400);
  } finally {
    if (previousKey === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = previousKey;
  }
});

test('defaults the system prompt to GEV_CLAUDE_VOICE_SYSTEM_PROMPT when the client sends none', async () => {
  const previousKey = process.env.ANTHROPIC_API_KEY;
  const previousFetch = globalThis.fetch;
  process.env.ANTHROPIC_API_KEY = 'test-key-not-a-real-credential';
  let capturedRequestBody = null;
  globalThis.fetch = async (url, init) => {
    capturedRequestBody = JSON.parse(init.body);
    return new Response(JSON.stringify({ id: 'msg_test', content: [] }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };
  try {
    const routes = installAnthropicRoutes();
    const messages = routes.get('/api/anthropic/messages');
    await invokeRoute(messages, fakePostRequest({ messages: [{ role: 'user', content: 'fly to Tokyo' }] }));
    assert.ok(capturedRequestBody, 'expected the proxy to reach the (mocked) Anthropic endpoint');
    assert.equal(capturedRequestBody.system, GEV_CLAUDE_VOICE_SYSTEM_PROMPT);
  } finally {
    globalThis.fetch = previousFetch;
    if (previousKey === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = previousKey;
  }
});

test('honors a non-blank client-supplied system prompt instead of the default', async () => {
  const previousKey = process.env.ANTHROPIC_API_KEY;
  const previousFetch = globalThis.fetch;
  process.env.ANTHROPIC_API_KEY = 'test-key-not-a-real-credential';
  let capturedRequestBody = null;
  globalThis.fetch = async (url, init) => {
    capturedRequestBody = JSON.parse(init.body);
    return new Response(JSON.stringify({ id: 'msg_test', content: [] }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };
  try {
    const routes = installAnthropicRoutes();
    const messages = routes.get('/api/anthropic/messages');
    await invokeRoute(messages, fakePostRequest({
      messages: [{ role: 'user', content: 'hi' }],
      system: 'a custom override prompt',
    }));
    assert.equal(capturedRequestBody.system, 'a custom override prompt');
  } finally {
    globalThis.fetch = previousFetch;
    if (previousKey === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = previousKey;
  }
});

test('never forwards a client-supplied tools array — the server-derived GEV_TOOL_SCHEMAS always wins', async () => {
  const previousKey = process.env.ANTHROPIC_API_KEY;
  const previousFetch = globalThis.fetch;
  process.env.ANTHROPIC_API_KEY = 'test-key-not-a-real-credential';
  let capturedRequestBody = null;
  globalThis.fetch = async (url, init) => {
    capturedRequestBody = JSON.parse(init.body);
    return new Response(JSON.stringify({ id: 'msg_test', content: [] }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };
  try {
    const routes = installAnthropicRoutes();
    const messages = routes.get('/api/anthropic/messages');
    await invokeRoute(messages, fakePostRequest({
      messages: [{ role: 'user', content: 'hi' }],
      tools: [{ name: 'evil_tool', description: 'not real', input_schema: {} }],
    }));
    assert.ok(Array.isArray(capturedRequestBody.tools));
    assert.ok(capturedRequestBody.tools.length > 20, 'expected the real 28-tool schema, not the client override');
    assert.ok(!capturedRequestBody.tools.some((t) => t.name === 'evil_tool'));
  } finally {
    globalThis.fetch = previousFetch;
    if (previousKey === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = previousKey;
  }
});
