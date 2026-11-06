import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MERGE_WINDOW_MS, mergeLogEvent, normalizeLogEvent, pruneLog, queryLog, redactText } from './serverLogCore.mjs';

const T0 = Date.UTC(2026, 10, 6, 10);
// test-only fixtures, not real credentials
const FAKE_KEY = 'sk-proj-abcdefghijklmnop1234567890';

test('redactText removes emails, keys, bearer tokens, JWTs, secret query params and long tokens', () => {
  const out = redactText(`user a.b@example.com used ${FAKE_KEY} and Bearer xyz.123 and AIzaSyA1234567890abcdefghijklmn and https://x/y?key=abc&ok=1 and eyJhbGciOiJIUzI1.eyJzdWIiOiIxMjM0.sig and ${'q'.repeat(40)}`);
  for (const leak of ['a.b@example.com', FAKE_KEY, 'xyz.123', 'AIzaSy', 'key=abc', 'eyJhbG', 'q'.repeat(40)]) assert.ok(!out.includes(leak), leak);
  assert.match(out, /\[email\].*\[key\].*Bearer \[redacted\].*key=\[redacted\]&ok=1/);
  assert.equal(redactText('x'.repeat(10), 5), 'xxxx…');
});

test('normalizeLogEvent validates level/source/code and drops sensitive detail keys', () => {
  assert.equal(normalizeLogEvent({ level: 'debug', source: 'voice', code: 'voice.x' }), null);
  assert.equal(normalizeLogEvent({ level: 'info', source: 'nope', code: 'voice.x' }), null);
  assert.equal(normalizeLogEvent({ level: 'info', source: 'voice', code: 'Bad Code' }), null);
  assert.equal(normalizeLogEvent({ level: 'info', source: 'admin', code: 'admin.x' }, { allowedSources: ['voice'] }), null);
  const e = normalizeLogEvent({
    level: 'warn', source: 'voice', code: 'voice.tool_failed', message: `failed for ${FAKE_KEY}`,
    detail: { tool: 'fly_to_location', seconds: 3, apiKey: 'x', userEmail: 'a@b.co', transcript: 'secret words', nested: { a: 1 } },
  }, { client: { version: '0.1.1', browser: 'Chrome 141' } });
  assert.deepEqual(e, {
    level: 'warn', source: 'voice', code: 'voice.tool_failed', message: 'failed for [key]',
    detail: { tool: 'fly_to_location', seconds: 3 }, client: { version: '0.1.1', browser: 'Chrome 141' },
  });
});

test('identical events within the window merge into one row with a count; others stay separate', () => {
  const ev = { level: 'warn', source: 'proxy', code: 'proxy.failing', message: '/api/tomtom' };
  let entries = mergeLogEvent([], ev, T0);
  entries = mergeLogEvent(entries, { level: 'info', source: 'voice', code: 'voice.session_started', message: '' }, T0 + 1);
  entries = mergeLogEvent(entries, ev, T0 + 1000);
  assert.equal(entries.length, 2);
  const merged = entries.find((e) => e.code === 'proxy.failing');
  assert.deepEqual([merged.count, merged.firstAt, merged.lastAt], [2, T0, T0 + 1000]);
  assert.equal(entries[entries.length - 1].code, 'proxy.failing', 'the merged row moves to newest');
  entries = mergeLogEvent(entries, ev, T0 + 1000 + MERGE_WINDOW_MS + 1);
  assert.equal(entries.filter((e) => e.code === 'proxy.failing').length, 2, 'outside the window = new row');
});

test('pruneLog keeps 30 days; queryLog filters, searches and pages newest first', () => {
  const rows = [
    { id: 'a', level: 'error', source: 'voice', code: 'voice.session_failed', message: 'ICE', lastAt: T0 - 31 * 86_400_000 },
    { id: 'b', level: 'warn', source: 'proxy', code: 'proxy.failing', message: '/api/tomtom', lastAt: T0 - 1000 },
    { id: 'c', level: 'error', source: 'browser', code: 'browser.js_error', message: 'TypeError x', lastAt: T0 },
  ];
  const kept = pruneLog(rows, T0);
  assert.deepEqual(kept.map((r) => r.id), ['b', 'c']);
  assert.deepEqual(queryLog(kept).entries.map((r) => r.id), ['c', 'b']);
  assert.deepEqual(queryLog(kept, { level: 'warn' }).entries.map((r) => r.id), ['b']);
  assert.deepEqual(queryLog(kept, { source: 'browser' }).entries.map((r) => r.id), ['c']);
  assert.deepEqual(queryLog(kept, { q: 'tomtom' }).entries.map((r) => r.id), ['b']);
  const page1 = queryLog(kept, { limit: 1 });
  assert.equal(page1.nextOffset, 1);
  assert.deepEqual(queryLog(kept, { limit: 1, offset: 1 }).entries.map((r) => r.id), ['b']);
  assert.deepEqual(page1.counts, { error: 1, warn: 1, info: 0 });
});
