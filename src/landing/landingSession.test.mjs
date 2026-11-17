import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchMe, ME_ENDPOINT } from './landingSession.js';
import { ME_FETCH_TIMEOUT_MS } from './landingConfig.js';

const jsonResponse = (body, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => body });

test('returns the /api/me payload and sends the session cookie same-origin', async () => {
  const payload = { configured: true, signedIn: true, user: { id: 'u1', role: 'user' }, home: '/app' };
  const calls = [];
  const result = await fetchMe({
    fetchFn: async (url, init) => { calls.push({ url, init }); return jsonResponse(payload); },
    warn: () => assert.fail('no warning on success'),
  });
  assert.deepEqual(result, payload);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, ME_ENDPOINT);
  assert.equal(calls[0].init.credentials, 'same-origin');
  assert.ok(calls[0].init.signal instanceof AbortSignal);
});

test('HTTP errors, network errors and non-object bodies resolve to null with a warning', async () => {
  const cases = [
    [async () => jsonResponse({ error: 'X' }, 500), /HTTP 500/],
    [async () => { throw new TypeError('Failed to fetch'); }, /Failed to fetch/],
    [async () => jsonResponse(null), /not a JSON object/],
    [async () => ({ ok: true, status: 200, json: async () => { throw new SyntaxError('Unexpected token <'); } }), /Unexpected token/],
  ];
  for (const [fetchFn, expected] of cases) {
    const warnings = [];
    assert.equal(await fetchMe({ fetchFn, warn: (message) => warnings.push(message) }), null);
    assert.equal(warnings.length, 1);
    assert.match(warnings[0], expected);
  }
});

test('a hanging /api/me is aborted after the timeout and resolves to null', async () => {
  const warnings = [];
  const hanging = (url, { signal }) => new Promise((resolve, reject) => {
    signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
  });
  const started = Date.now();
  assert.equal(await fetchMe({ fetchFn: hanging, timeoutMs: 20, warn: (m) => warnings.push(m) }), null);
  assert.ok(Date.now() - started < 1000, 'gave up promptly');
  assert.match(warnings[0], /timed out after 20 ms/);
});

test('the default timeout is short enough not to stall the landing CTA', () => {
  assert.ok(Number.isInteger(ME_FETCH_TIMEOUT_MS));
  assert.ok(ME_FETCH_TIMEOUT_MS > 0 && ME_FETCH_TIMEOUT_MS <= 5000);
});
