// src/data/googleTilesProxy.test.mjs — the /api/google/3dtiles proxy that keeps
// GOOGLE_MAPS_API_KEY server-side. Runs the real handler behind a real
// node:http server (so streaming, 304 and header pass-through are exercised
// end to end) with the upstream fetch injected.
import assert from 'node:assert/strict';
import http from 'node:http';
import test from 'node:test';
import { GOOGLE_TILES_ROUTE, createGoogleTilesHandler, googleTilesProxy } from './googleTilesProxy.mjs';
import { buildGoogleTilesUpstreamUrl, resolveGoogleTilesUpstream } from './googleTilesUpstream.mjs';

const FAKE_KEY = 'AIzaFAKE-tiles-key-0123456789'; // test-only

/** Start a server that mounts the handler like connect does (prefix stripped). */
async function startProxy(t, options) {
  const handler = createGoogleTilesHandler(options);
  const server = http.createServer((req, res) => {
    if (!req.url.startsWith(`${GOOGLE_TILES_ROUTE}/`)) {
      res.writeHead(404).end();
      return;
    }
    req.url = req.url.slice(GOOGLE_TILES_ROUTE.length);
    handler(req, res).catch((error) => {
      res.writeHead(500).end(String(error?.message));
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  return `http://127.0.0.1:${server.address().port}${GOOGLE_TILES_ROUTE}`;
}

/** Upstream fetch stub that records every call and answers from `respond`. */
function upstreamStub(respond) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url: new URL(String(url)), init });
    return respond(calls.length, new URL(String(url)), init);
  };
  return { calls, fetchImpl };
}

function memoryLogger() {
  const lines = [];
  return { lines, warn: (...args) => lines.push(args.map(String).join(' ')) };
}

test('path allowlist accepts only Google 3D Tiles paths', () => {
  const root = resolveGoogleTilesUpstream('/root.json');
  assert.equal(root.ok, true);
  assert.equal(root.path, '/v1/3dtiles/root.json');

  const child = resolveGoogleTilesUpstream('/datasets/CgA/files/UlRPVEYuYnVsa2V0ZGF0YQ==.glb?session=abc123');
  assert.equal(child.ok, true);
  assert.equal(child.path, '/v1/3dtiles/datasets/CgA/files/UlRPVEYuYnVsa2V0ZGF0YQ==.glb');
  assert.equal(child.query.get('session'), 'abc123');

  for (const hostile of [
    '/../../maps/api/geocode/json',
    '/datasets/%2e%2e/%2e%2e/maps.glb',
    '/datasets/..%2f..%2fadmin.json',
    '/datasets/a%2Fb.glb',
    '/datasets/a%5Cb.glb',
    '//evil.example/v1/3dtiles/root.json',
    '/https:/evil.example/root.json',
    '/datasets/x@evil.example/a.glb',
    '/datasets/%zz.glb',
    '\\root.json',
  ]) {
    const result = resolveGoogleTilesUpstream(hostile);
    assert.equal(result.ok, false, `must reject ${hostile}`);
  }
  // Not a 3D Tiles resource (other Google APIs, wrong extension) → 404.
  assert.equal(resolveGoogleTilesUpstream('/maps/api/geocode/json').status, 404);
  assert.equal(resolveGoogleTilesUpstream('/datasets/CgA/files/a.html').status, 404);
});

test('the upstream URL is pinned to tile.googleapis.com/v1/3dtiles and carries the server key', () => {
  const target = resolveGoogleTilesUpstream('/datasets/CgA/files/a.json?session=s1&key=client-key&KEY=other');
  assert.equal(target.ok, true);
  assert.equal(target.query.has('key'), false);
  assert.equal(target.query.has('KEY'), false);
  const url = buildGoogleTilesUpstreamUrl(target, FAKE_KEY);
  assert.equal(url.origin, 'https://tile.googleapis.com');
  assert.equal(url.pathname, '/v1/3dtiles/datasets/CgA/files/a.json');
  assert.deepEqual(url.searchParams.getAll('key'), [FAKE_KEY]);
  assert.equal(url.searchParams.get('session'), 's1');
});

test('the server appends its key and drops a client-sent key', async (t) => {
  const { calls, fetchImpl } = upstreamStub(() => new Response('{"asset":{"version":"1.0"}}', {
    status: 200,
    headers: { 'content-type': 'application/json' },
  }));
  const base = await startProxy(t, { fetchImpl, getApiKey: () => FAKE_KEY });
  const response = await fetch(`${base}/root.json?key=attacker-key&session=s9`);
  assert.equal(response.status, 200);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url.origin, 'https://tile.googleapis.com');
  assert.deepEqual(calls[0].url.searchParams.getAll('key'), [FAKE_KEY]);
  assert.equal(calls[0].url.searchParams.get('session'), 's9');
  assert.equal(calls[0].init.redirect, 'error', 'redirects must not carry the key elsewhere');
});

test('no configured key → 503 with a clear error and no upstream call', async (t) => {
  const { calls, fetchImpl } = upstreamStub(() => new Response('unexpected'));
  const base = await startProxy(t, { fetchImpl, getApiKey: () => '  ' });
  const response = await fetch(`${base}/root.json`);
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { error: 'google_maps_key_not_configured' });
  assert.equal(calls.length, 0);
});

test('non-GET methods and rejected paths never reach upstream', async (t) => {
  const { calls, fetchImpl } = upstreamStub(() => new Response('unexpected'));
  const base = await startProxy(t, { fetchImpl, getApiKey: () => FAKE_KEY });
  const post = await fetch(`${base}/root.json`, { method: 'POST', body: '{}' });
  assert.equal(post.status, 405);
  // fetch() would normalize `%2e%2e` away client-side; send the raw path.
  const { hostname, port, pathname } = new URL(base);
  const traversalStatus = await new Promise((resolve, rejectRequest) => {
    http.get({ hostname, port, path: `${pathname}/datasets/%2e%2e/%2e%2e/secret.json` }, (res) => {
      res.resume();
      resolve(res.statusCode);
    }).on('error', rejectRequest);
  });
  assert.equal(traversalStatus, 400);
  assert.equal(calls.length, 0);
});

test('caching headers pass through and the tile body streams unchanged', async (t) => {
  const glb = Buffer.from('glTF\u0002\u0000\u0000\u0000binary-tile-bytes');
  const { fetchImpl } = upstreamStub(() => new Response(glb, {
    status: 200,
    headers: {
      'content-type': 'model/gltf-binary',
      'cache-control': 'private, max-age=3600, stale-while-revalidate=60',
      etag: '"tile-etag-1"',
      expires: 'Wed, 18 Nov 2026 00:00:00 GMT',
      'last-modified': 'Mon, 16 Nov 2026 00:00:00 GMT',
      'set-cookie': 'upstream=1',
    },
  }));
  const base = await startProxy(t, { fetchImpl, getApiKey: () => FAKE_KEY });
  const response = await fetch(`${base}/datasets/CgA/files/tile.glb?session=s`);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-type'), 'model/gltf-binary');
  assert.equal(response.headers.get('cache-control'), 'private, max-age=3600, stale-while-revalidate=60');
  assert.equal(response.headers.get('etag'), '"tile-etag-1"');
  assert.equal(response.headers.get('expires'), 'Wed, 18 Nov 2026 00:00:00 GMT');
  assert.equal(response.headers.get('last-modified'), 'Mon, 16 Nov 2026 00:00:00 GMT');
  assert.equal(response.headers.get('set-cookie'), null, 'only allowlisted headers pass');
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), glb);
});

test('conditional request headers are forwarded and an upstream 304 reaches the client', async (t) => {
  const { calls, fetchImpl } = upstreamStub(() => new Response(null, {
    status: 304,
    headers: { etag: '"tile-etag-1"', 'cache-control': 'private, max-age=3600' },
  }));
  const base = await startProxy(t, { fetchImpl, getApiKey: () => FAKE_KEY });
  const response = await fetch(`${base}/datasets/CgA/files/tile.glb`, {
    headers: {
      'If-None-Match': '"tile-etag-1"',
      'If-Modified-Since': 'Mon, 16 Nov 2026 00:00:00 GMT',
      Cookie: 'session=browser-cookie',
    },
  });
  assert.equal(response.status, 304);
  assert.equal(response.headers.get('etag'), '"tile-etag-1"');
  assert.equal(calls[0].init.headers['if-none-match'], '"tile-etag-1"');
  assert.equal(calls[0].init.headers['if-modified-since'], 'Mon, 16 Nov 2026 00:00:00 GMT');
  assert.equal(calls[0].init.headers.cookie, undefined, 'browser cookies never go to Google');
});

test('no tile body is stored: identical requests always go upstream and get the fresh body', async (t) => {
  const { calls, fetchImpl } = upstreamStub((n) => new Response(`body-${n}`, {
    status: 200,
    headers: { 'content-type': 'application/octet-stream', 'cache-control': 'max-age=86400' },
  }));
  const base = await startProxy(t, { fetchImpl, getApiKey: () => FAKE_KEY });
  const first = await (await fetch(`${base}/datasets/CgA/files/same.glb?session=s`)).text();
  const second = await (await fetch(`${base}/datasets/CgA/files/same.glb?session=s`)).text();
  assert.equal(calls.length, 2, 'a long max-age upstream must not be served from a proxy cache');
  assert.equal(first, 'body-1');
  assert.equal(second, 'body-2');
});

test('the tileset JSON (including copyright/attribution) is passed through byte for byte', async (t) => {
  const json = JSON.stringify({
    asset: { version: '1.0', copyright: 'Google; Landsat / Copernicus' },
    root: { children: [{ content: { uri: '/v1/3dtiles/datasets/CgA/files/a.json?session=s1' } }] },
  });
  const { fetchImpl } = upstreamStub(() => new Response(json, { headers: { 'content-type': 'application/json' } }));
  const base = await startProxy(t, { fetchImpl, getApiKey: () => FAKE_KEY });
  assert.equal(await (await fetch(`${base}/root.json`)).text(), json);
});

test('upstream errors map to clear JSON and neither the response nor the log contains the key', async (t) => {
  const logger = memoryLogger();
  const { fetchImpl } = upstreamStub((n, url) => {
    if (n === 1) {
      return new Response(`{"error":{"message":"API key ${url.searchParams.get('key')} not valid"}}`, { status: 403 });
    }
    if (n === 2) return new Response('busy', { status: 503 });
    throw new TypeError(`fetch failed for ${url.href}`);
  });
  const base = await startProxy(t, { fetchImpl, getApiKey: () => FAKE_KEY, logger });

  const denied = await fetch(`${base}/root.json`);
  const deniedText = await denied.text();
  assert.equal(denied.status, 403);
  assert.deepEqual(JSON.parse(deniedText), { error: 'google_tiles_denied', upstreamStatus: 403 });

  const unavailable = await fetch(`${base}/root.json`);
  assert.equal(unavailable.status, 502);
  const unavailableText = await unavailable.text();
  assert.deepEqual(JSON.parse(unavailableText), { error: 'upstream_error', upstreamStatus: 503 });

  const unreachable = await fetch(`${base}/root.json`);
  assert.equal(unreachable.status, 502);
  const unreachableText = await unreachable.text();
  assert.deepEqual(JSON.parse(unreachableText), { error: 'upstream_unreachable' });

  for (const text of [deniedText, unavailableText, unreachableText, ...logger.lines]) {
    assert.equal(text.includes(FAKE_KEY), false, `key leaked into: ${text.replace(FAKE_KEY, '***')}`);
  }
  assert.ok(logger.lines.some((line) => line.includes('[redacted]')), 'a third-party message with the key is redacted');
});

test('an upstream body over the size cap is refused before streaming', async (t) => {
  const { fetchImpl } = upstreamStub(() => new Response('x'.repeat(64), {
    headers: { 'content-type': 'model/gltf-binary', 'content-length': '64' },
  }));
  const base = await startProxy(t, { fetchImpl, getApiKey: () => FAKE_KEY, maxBytes: 16, logger: memoryLogger() });
  const response = await fetch(`${base}/datasets/CgA/files/big.glb`);
  assert.equal(response.status, 502);
  assert.deepEqual(await response.json(), { error: 'upstream_too_large' });
});

test('an upstream that hangs past the deadline answers 504', async (t) => {
  const fetchImpl = (_url, init) => new Promise((_resolve, rejectFetch) => {
    init.signal.addEventListener('abort', () => rejectFetch(init.signal.reason), { once: true });
  });
  const base = await startProxy(t, { fetchImpl, getApiKey: () => FAKE_KEY, timeoutMs: 50, logger: memoryLogger() });
  const response = await fetch(`${base}/root.json`);
  assert.equal(response.status, 504);
  assert.deepEqual(await response.json(), { error: 'upstream_timeout' });
});

test('the plugin mounts on both the dev and the preview server', () => {
  for (const hook of ['configureServer', 'configurePreviewServer']) {
    const mounts = [];
    googleTilesProxy()[hook]({ middlewares: { use: (path, handler) => mounts.push([path, typeof handler]) } });
    assert.deepEqual(mounts, [[GOOGLE_TILES_ROUTE, 'function']]);
  }
});
