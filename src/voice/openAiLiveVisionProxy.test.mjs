import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildVisionRequest,
  extractResponseText,
  isAllowedVisionImage,
  installLiveVisionRoute,
  READ_SCREEN_TOOL,
  LIVE_VISION_URL,
  OPENAI_VISION_MODEL_DEFAULT,
} from './openAiLiveVisionProxy.mjs';
import { READ_SCREEN_TOOL_NAME } from './gevLiveVision.js';

const DATA_URL = 'data:image/jpeg;base64,AAAA';

// --- Pure builders -------------------------------------------------------

test('buildVisionRequest sends input_image at high detail with the user question', () => {
  const body = buildVisionRequest({ model: 'gpt-5.6-luna', question: 'what city is this', imageUrl: DATA_URL });
  assert.equal(body.model, 'gpt-5.6-luna');
  const content = body.input[0].content;
  assert.equal(content[0].type, 'input_text');
  assert.match(content[0].text, /what city is this/);
  assert.equal(content[1].type, 'input_image');
  assert.equal(content[1].image_url, DATA_URL);
  assert.equal(content[1].detail, 'high');
});

test('buildVisionRequest falls back to a default question when none is given', () => {
  const body = buildVisionRequest({ model: 'm', question: '  ', imageUrl: DATA_URL });
  assert.match(body.input[0].content[0].text, /currently visible/);
});

test('extractResponseText prefers output_text, else walks output[].content[]', () => {
  assert.equal(extractResponseText({ output_text: '  hi there  ' }), 'hi there');
  const walked = extractResponseText({
    output: [{ content: [{ type: 'output_text', text: 'coast' }, { type: 'output_text', text: ' and city' }] }],
  });
  assert.equal(walked, 'coast and city');
  assert.equal(extractResponseText(null), '');
  assert.equal(extractResponseText({ output: [] }), '');
});

test('isAllowedVisionImage accepts only image data URLs (SSRF guard)', () => {
  assert.equal(isAllowedVisionImage(DATA_URL), true);
  assert.equal(isAllowedVisionImage('data:image/png;base64,ZZ'), true);
  assert.equal(isAllowedVisionImage('https://evil.example/x.png'), false);
  assert.equal(isAllowedVisionImage('data:text/html;base64,ZZ'), false);
  assert.equal(isAllowedVisionImage(null), false);
});

test('READ_SCREEN_TOOL matches the client tool name and is a function schema', () => {
  assert.equal(READ_SCREEN_TOOL.type, 'function');
  assert.equal(READ_SCREEN_TOOL.name, READ_SCREEN_TOOL_NAME);
  assert.equal(READ_SCREEN_TOOL.parameters.additionalProperties, false);
});

// --- Route ---------------------------------------------------------------

function makeRes() {
  return {
    statusCode: 0,
    headers: {},
    body: null,
    setHeader(k, v) { this.headers[k] = v; },
    end(b) { this.body = b; },
    json() { return JSON.parse(this.body); },
  };
}
function mountVisionRoute(over = {}) {
  let handler = null;
  const middlewares = { use(path, fn) { if (path === LIVE_VISION_URL) handler = fn; } };
  installLiveVisionRoute(middlewares, {
    readRequestBody: over.readRequestBody || (async () => JSON.stringify({ image: DATA_URL, question: 'q' })),
    enforceRateLimit: over.enforceRateLimit || (() => true),
    fetchImpl: over.fetchImpl || (async () => ({ ok: true, status: 200, async text() { return JSON.stringify({ output_text: 'A coastal city.' }); } })),
  });
  return handler;
}

test('a valid POST returns the vision model text', async () => {
  const prev = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = 'sk-test';
  try {
    let sentBody = null;
    const handler = mountVisionRoute({
      fetchImpl: async (url, opts) => { sentBody = JSON.parse(opts.body); return { ok: true, status: 200, async text() { return JSON.stringify({ output_text: 'A coastal city.', usage: { input_tokens: 1000, output_tokens: 20 } }); } }; },
    });
    const res = makeRes();
    await handler({ method: 'POST' }, res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.json().text, 'A coastal city.');
    assert.deepEqual(res.json().usage, { input_tokens: 1000, output_tokens: 20 }, 'usage passed through for cost metering');
    assert.equal(sentBody.model, OPENAI_VISION_MODEL_DEFAULT);
  } finally {
    if (prev === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = prev;
  }
});

test('a non-POST is rejected 405 without touching the model', async () => {
  let fetched = false;
  const handler = mountVisionRoute({ fetchImpl: async () => { fetched = true; return { ok: true, status: 200, async text() { return '{}'; } }; } });
  const res = makeRes();
  await handler({ method: 'GET' }, res);
  assert.equal(res.statusCode, 405);
  assert.equal(fetched, false);
});

test('a missing key returns 503 and never calls upstream', async () => {
  const prev = process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_API_KEY;
  try {
    let fetched = false;
    const handler = mountVisionRoute({ fetchImpl: async () => { fetched = true; return { ok: true, status: 200, async text() { return '{}'; } }; } });
    const res = makeRes();
    await handler({ method: 'POST' }, res);
    assert.equal(res.statusCode, 503);
    assert.equal(fetched, false);
  } finally {
    if (prev !== undefined) process.env.OPENAI_API_KEY = prev;
  }
});

test('a non-data-URL image is rejected 400 (SSRF guard) before any upstream call', async () => {
  const prev = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = 'sk-test';
  try {
    let fetched = false;
    const handler = mountVisionRoute({
      readRequestBody: async () => JSON.stringify({ image: 'https://evil.example/x.png' }),
      fetchImpl: async () => { fetched = true; return { ok: true, status: 200, async text() { return '{}'; } }; },
    });
    const res = makeRes();
    await handler({ method: 'POST' }, res);
    assert.equal(res.statusCode, 400);
    assert.equal(fetched, false);
  } finally {
    if (prev === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = prev;
  }
});

test('an upstream failure surfaces the status, not a 200', async () => {
  const prev = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = 'sk-test';
  try {
    const handler = mountVisionRoute({ fetchImpl: async () => ({ ok: false, status: 429, async text() { return 'rate limited'; } }) });
    const res = makeRes();
    await handler({ method: 'POST' }, res);
    assert.equal(res.statusCode, 429);
    assert.match(res.json().error, /HTTP 429/);
  } finally {
    if (prev === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = prev;
  }
});
