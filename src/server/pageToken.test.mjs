import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPageTokenStore, extractPageToken, normalizePageToken, PAGE_TOKEN_TTL_MS } from './pageToken.mjs';

const STREAM = 'https://host.example/zm/cgi-bin/nph-zms?monitor=120';
const TOKEN_A = 'aaaaaaaaaaaaaaaaaaaa.bbbbbbbbbbbbbbbbbbbb.cccccccccccccccccccc';
const TOKEN_B = 'dddddddddddddddddddd.eeeeeeeeeeeeeeeeeeee.ffffffffffffffffffff';
const page = (token) => `<div data-url="${STREAM}&amp;token=${token}"></div><div data-url="${STREAM}1&amp;token=zzzzzzzzzzzzzzzzzzzzzzzz"></div>`;

test('normalizePageToken requires a same-origin http(s) page', () => {
  assert.deepEqual(normalizePageToken({ pageUrl: 'https://host.example/v2/' }, STREAM), { pageUrl: 'https://host.example/v2/' });
  assert.equal(normalizePageToken({ pageUrl: 'https://evil.example/v2/' }, STREAM), undefined);
  assert.equal(normalizePageToken({ pageUrl: 'javascript:alert(1)' }, STREAM), undefined);
  assert.equal(normalizePageToken(undefined, STREAM), undefined);
});

test('extractPageToken picks the token of that exact stream, decoding &amp;', () => {
  assert.equal(extractPageToken(page(TOKEN_A), STREAM), TOKEN_A);
  // monitor=120 must not match the monitor=1201 card
  assert.equal(extractPageToken(`<a data-url="${STREAM}1&amp;token=${TOKEN_B}">`, STREAM), '');
  assert.equal(extractPageToken('<html></html>', STREAM), '');
});

function store(initial) {
  const clock = { t: 0 };
  let html = page(initial);
  let fetches = 0;
  const fetchFn = async () => { fetches += 1; return new Response(html, { status: 200 }); };
  const tokens = createPageTokenStore({ userAgent: 'ua', fetchFn, now: () => clock.t });
  return { tokens, clock, setHtml: (h) => { html = h; }, fetches: () => fetches };
}
const source = { url: STREAM, pageToken: { pageUrl: 'https://host.example/v2/' } };

test('resolveUrl appends the token, caches the page and refreshes after the TTL', async () => {
  const s = store(TOKEN_A);
  assert.equal(await s.tokens.resolveUrl(source), `${STREAM}&token=${TOKEN_A}`);
  await s.tokens.resolveUrl(source);
  assert.equal(s.fetches(), 1);
  s.setHtml(page(TOKEN_B));
  s.clock.t = PAGE_TOKEN_TTL_MS + 1;
  assert.equal(await s.tokens.resolveUrl(source), `${STREAM}&token=${TOKEN_B}`);
  assert.equal(s.fetches(), 2);
});

test('forceRefresh re-reads the page, but not more than once per cool-down', async () => {
  const s = store(TOKEN_A);
  await s.tokens.resolveUrl(source);
  s.setHtml(page(TOKEN_B));
  await s.tokens.resolveUrl(source, { forceRefresh: true });
  assert.equal(s.fetches(), 1, 'inside the cool-down');
  s.clock.t = 31_000;
  assert.equal(await s.tokens.resolveUrl(source, { forceRefresh: true }), `${STREAM}&token=${TOKEN_B}`);
  assert.equal(s.fetches(), 2);
});

test('concurrent resolves share one page fetch; a page without the token rejects', async () => {
  const s = store(TOKEN_A);
  await Promise.all([s.tokens.resolveUrl(source), s.tokens.resolveUrl(source), s.tokens.resolveUrl(source)]);
  assert.equal(s.fetches(), 1);
  const empty = createPageTokenStore({ userAgent: 'ua', fetchFn: async () => new Response('<html/>') });
  await assert.rejects(() => empty.resolveUrl(source), /prints no token/);
  const down = createPageTokenStore({ userAgent: 'ua', fetchFn: async () => new Response('', { status: 503 }) });
  await assert.rejects(() => down.resolveUrl(source), /HTTP 503/);
});
