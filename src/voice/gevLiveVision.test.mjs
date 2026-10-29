import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createViewportReader, READ_SCREEN_TOOL_NAME, LIVE_VISION_URL } from './gevLiveVision.js';

const DATA_URL = 'data:image/jpeg;base64,AAAA';
const okFetch = (text) => async () => ({ ok: true, status: 200, async json() { return { text }; } });

test('readScreen captures the viewport and POSTs it to the vision endpoint', async () => {
  const calls = [];
  const reader = createViewportReader({
    captureImage: async () => DATA_URL,
    fetchImpl: async (url, opts) => { calls.push({ url, body: JSON.parse(opts.body) }); return { ok: true, status: 200, async json() { return { text: 'A harbor at dusk.' }; } }; },
  });
  const out = await reader.readScreen({ question: 'where am i' });
  assert.equal(out.ok, true);
  assert.equal(out.text, 'A harbor at dusk.');
  assert.equal(calls[0].url, LIVE_VISION_URL);
  assert.equal(calls[0].body.image, DATA_URL);
  assert.equal(calls[0].body.question, 'where am i');
});

test('a null capture resolves to a spoken fallback, never a throw', async () => {
  const reader = createViewportReader({ captureImage: async () => null, fetchImpl: okFetch('unused') });
  const out = await reader.readScreen({});
  assert.equal(out.ok, false);
  assert.equal(out.error, 'no_viewport');
  assert.match(out.text, /cannot read the screen/i);
});

test('a capture that throws is caught and spoken, not propagated', async () => {
  const reader = createViewportReader({ captureImage: async () => { throw new Error('canvas gone'); }, fetchImpl: okFetch('x') });
  const out = await reader.readScreen({});
  assert.equal(out.ok, false);
  assert.match(out.error, /canvas gone/);
  assert.ok(out.text);
});

test('a non-OK HTTP response becomes a spoken failure', async () => {
  const reader = createViewportReader({ captureImage: async () => DATA_URL, fetchImpl: async () => ({ ok: false, status: 500, async json() { return {}; } }) });
  const out = await reader.readScreen({});
  assert.equal(out.ok, false);
  assert.match(out.error, /500/);
  assert.match(out.text, /HTTP 500/);
});

test('an empty text payload is reported as empty rather than a false success', async () => {
  const reader = createViewportReader({ captureImage: async () => DATA_URL, fetchImpl: okFetch('   ') });
  const out = await reader.readScreen({});
  assert.equal(out.ok, false);
  assert.equal(out.error, 'empty');
});

test('a network error resolves to a spoken fallback', async () => {
  const reader = createViewportReader({ captureImage: async () => DATA_URL, fetchImpl: async () => { throw new Error('offline'); } });
  const out = await reader.readScreen({});
  assert.equal(out.ok, false);
  assert.match(out.error, /offline/);
});

test('the tool name is stable', () => {
  assert.equal(READ_SCREEN_TOOL_NAME, 'read_screen');
});
