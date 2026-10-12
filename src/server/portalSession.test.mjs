import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createPortalSessionStore,
  normalizePortalSession,
  parseSetCookie,
} from './portalSession.mjs';

const SESSION = {
  bootstrapUrl: 'https://portal.example/',
  referer: 'https://portal.example/map',
};
const UA = 'test-agent/1.0';

/** Minimal Response double: status, headers (get + getSetCookie) and a body-cancel spy. */
function fakeResponse(status, { location, cookies = [] } = {}) {
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: {
      get: (name) => (name.toLowerCase() === 'location' ? location ?? null : null),
      getSetCookie: () => cookies,
    },
    body: { cancel: async () => {} },
  };
}

/** Portal that 307s "/" to "/map" setting cookies, and 403s streams without the auth cookie + referer. */
function makePortal({ cookieMaxAge = 3600 } = {}) {
  const calls = [];
  const fetchFn = async (url, init = {}) => {
    calls.push({ url, headers: init.headers || {}, redirect: init.redirect });
    if (url === 'https://portal.example/') {
      return fakeResponse(307, {
        location: '/map',
        cookies: [`auth=tok${calls.length}; Max-Age=${cookieMaxAge}; Path=/; HttpOnly`, 'misc=1; Path=/'],
      });
    }
    if (url === 'https://portal.example/map') return fakeResponse(200);
    const cookie = init.headers?.Cookie || '';
    const ok = /auth=tok/.test(cookie) && init.headers?.Referer === SESSION.referer;
    return fakeResponse(ok ? 200 : 403);
  };
  return { calls, fetchFn };
}

test('parseSetCookie reads name, value and Max-Age', () => {
  assert.deepEqual(parseSetCookie('a=b=c; Max-Age=60; Path=/'), { name: 'a', value: 'b=c', maxAgeSec: 60 });
  assert.equal(parseSetCookie('=x'), null);
  assert.equal(parseSetCookie('noequals'), null);
  assert.equal(parseSetCookie('a=b').maxAgeSec, null);
});

test('normalizePortalSession accepts same-origin URLs and defaults the referer', () => {
  const ok = normalizePortalSession({ bootstrapUrl: 'https://h.example/' }, 'https://h.example/s/1.m3u8');
  assert.deepEqual(ok, { bootstrapUrl: 'https://h.example/', referer: 'https://h.example/' });
});

test('normalizePortalSession rejects cross-origin, malformed and non-http values', () => {
  const src = 'https://h.example/s/1.m3u8';
  assert.equal(normalizePortalSession({ bootstrapUrl: 'https://evil.example/' }, src), undefined);
  assert.equal(normalizePortalSession({ bootstrapUrl: 'https://h.example/', referer: 'https://evil.example/' }, src), undefined);
  assert.equal(normalizePortalSession({ bootstrapUrl: 'ftp://h.example/' }, src), undefined);
  assert.equal(normalizePortalSession({ bootstrapUrl: 'not a url' }, src), undefined);
  assert.equal(normalizePortalSession(null, src), undefined);
  assert.equal(normalizePortalSession('x', src), undefined);
});

test('bootstrap follows the redirect by hand, collects cookies and sends the proxy User-Agent', async () => {
  const { calls, fetchFn } = makePortal();
  const store = createPortalSessionStore({ fetchFn, userAgent: UA });
  const headers = await store.headersFor(SESSION);
  assert.match(headers.Cookie, /auth=tok1/);
  assert.match(headers.Cookie, /misc=1/);
  assert.equal(headers.Referer, SESSION.referer);
  assert.deepEqual(calls.map((c) => c.url), ['https://portal.example/', 'https://portal.example/map']);
  assert.ok(calls.every((c) => c.redirect === 'manual' && c.headers['User-Agent'] === UA));
  assert.match(calls[1].headers.Cookie, /auth=tok1/, 'second hop replays cookies set by the first');
});

test('concurrent requests share one bootstrap and later ones reuse the session', async () => {
  const { calls, fetchFn } = makePortal();
  const store = createPortalSessionStore({ fetchFn, userAgent: UA });
  await Promise.all([store.headersFor(SESSION), store.headersFor(SESSION), store.headersFor(SESSION)]);
  await store.headersFor(SESSION);
  assert.equal(calls.length, 2, 'one bootstrap = two hops, nothing more');
});

test('an expired session bootstraps again', async () => {
  const { calls, fetchFn } = makePortal({ cookieMaxAge: 10 });
  let clock = 1_000_000;
  const store = createPortalSessionStore({ fetchFn, userAgent: UA, now: () => clock });
  await store.headersFor(SESSION);
  clock += 11_000;
  await store.headersFor(SESSION);
  assert.equal(calls.length, 4);
});

test('fetchWithSession attaches cookie and referer to the stream request', async () => {
  const { calls, fetchFn } = makePortal();
  const store = createPortalSessionStore({ fetchFn, userAgent: UA });
  const res = await store.fetchWithSession(SESSION, 'https://portal.example/streams/1.m3u8', { headers: { 'User-Agent': UA } });
  assert.equal(res.status, 200);
  const last = calls.at(-1);
  assert.equal(last.headers.Referer, SESSION.referer);
  assert.equal(last.headers['User-Agent'], UA);
});

test('fetchWithSession refreshes the session once after a 403, then stops', async () => {
  let streamHits = 0;
  let clock = 1_000_000;
  let bootstraps = 0;
  const fetchFn = async (url, init = {}) => {
    if (url === 'https://portal.example/') {
      bootstraps += 1;
      return fakeResponse(200, { cookies: [`auth=tok${bootstraps}; Max-Age=3600`] });
    }
    streamHits += 1;
    // The portal revokes tok1 server-side; only tok2 is accepted.
    return fakeResponse(/auth=tok2/.test(init.headers?.Cookie || '') ? 200 : 403);
  };
  const store = createPortalSessionStore({ fetchFn, userAgent: UA, now: () => clock });
  await store.headersFor(SESSION);
  clock += 60_000; // past the forced-refresh cooldown
  const res = await store.fetchWithSession(SESSION, 'https://portal.example/s.m3u8');
  assert.equal(res.status, 200);
  assert.equal(bootstraps, 2);
  assert.equal(streamHits, 2);
});

test('forced refresh is rate-limited so a permanent 403 cannot hammer the portal', async () => {
  let bootstraps = 0;
  const fetchFn = async (url) => {
    if (url === 'https://portal.example/') {
      bootstraps += 1;
      return fakeResponse(200, { cookies: ['auth=x; Max-Age=3600'] });
    }
    return fakeResponse(403);
  };
  const store = createPortalSessionStore({ fetchFn, userAgent: UA, now: () => 1_000_000 });
  for (let i = 0; i < 5; i += 1) {
    const res = await store.fetchWithSession(SESSION, 'https://portal.example/s.m3u8');
    assert.equal(res.status, 403);
  }
  assert.equal(bootstraps, 1);
});

test('fetchWithSession without a session is a plain fetch', async () => {
  const seen = [];
  const store = createPortalSessionStore({ fetchFn: async (u, i) => { seen.push([u, i]); return fakeResponse(200); }, userAgent: UA });
  await store.fetchWithSession(undefined, 'https://x.example/a', { headers: { A: '1' } });
  assert.deepEqual(seen, [['https://x.example/a', { headers: { A: '1' } }]]);
});

test('bootstrap refuses an off-origin redirect and a cookie-less answer', async () => {
  const offOrigin = createPortalSessionStore({
    userAgent: UA,
    fetchFn: async () => fakeResponse(302, { location: 'https://evil.example/x', cookies: ['a=b'] }),
  });
  await assert.rejects(() => offOrigin.headersFor(SESSION), /off-origin/);
  const noCookies = createPortalSessionStore({ userAgent: UA, fetchFn: async () => fakeResponse(200) });
  await assert.rejects(() => noCookies.headersFor(SESSION), /no cookies/);
  const httpError = createPortalSessionStore({ userAgent: UA, fetchFn: async () => fakeResponse(500) });
  await assert.rejects(() => httpError.headersFor(SESSION), /HTTP 500/);
});

test('a cookie expired by the portal (Max-Age=0) is dropped', async () => {
  const store = createPortalSessionStore({
    userAgent: UA,
    fetchFn: async () => fakeResponse(200, { cookies: ['keep=1; Max-Age=3600', 'gone=1; Max-Age=0'] }),
  });
  const { Cookie } = await store.headersFor(SESSION);
  assert.equal(Cookie, 'keep=1');
});
