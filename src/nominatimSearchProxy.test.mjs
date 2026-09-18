// src/nominatimSearchProxy.test.mjs — the /api/nominatim/search proxy
// (2026-09). Server-side because Nominatim's usage policy requires a custom
// User-Agent, which browser fetch cannot set — see vite.config.js's
// nominatimSearchProxy(). Follows googlePlacesKeyless.test.mjs's exact
// route-registration + fake req/res template.
import assert from 'node:assert/strict';
import test from 'node:test';
import { nominatimSearchProxy } from '../vite.config.js';

function installNominatimRoutes() {
  const routes = new Map();
  nominatimSearchProxy().configureServer({
    middlewares: {
      use(path, handler) {
        routes.set(path, handler);
      },
    },
  });
  return routes;
}

function invokeRoute(handler, { method = 'GET', url = '/', remoteAddress = '127.0.0.1' } = {}) {
  return new Promise((resolve, reject) => {
    const headers = new Map();
    const req = {
      method,
      url,
      headers: {},
      socket: { remoteAddress },
    };
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

/** Stub globalThis.fetch for one call, restoring it afterward. */
async function withFetchStub(fetchImpl, fn) {
  const priorFetch = globalThis.fetch;
  globalThis.fetch = fetchImpl;
  try {
    return await fn();
  } finally {
    globalThis.fetch = priorFetch;
  }
}

/**
 * A fetch() Response stand-in shaped for vite.config.js's
 * readResponseJsonCapped/readResponseTextCapped, which read
 * `response.headers.get('content-length')` and either `response.body`'s
 * reader or `response.text()` — a bare `{ok, json}` stub (as the sibling
 * googlePlacesKeyless.test.mjs style would use) is not enough here because
 * fetchNominatimSearch goes through those capped readers, not response.json().
 */
function jsonResponse(body, { ok = true } = {}) {
  const text = JSON.stringify(body);
  return {
    ok,
    headers: { get: () => null },
    body: null,
    text: async () => text,
  };
}

test('rejects non-GET with 405', async () => {
  const routes = installNominatimRoutes();
  const search = routes.get('/api/nominatim/search');
  const response = await invokeRoute(search, { method: 'POST' });
  assert.equal(response.statusCode, 405);
});

// NOTE ON ORDERING: nominatimSearchRateLimiter() in vite.config.js lazily
// builds its limiter on first call and caches the result (null = unlimited)
// for the life of the process — exactly like the pre-existing
// googleRateLimiter(). Every GET request past the 405 check calls it, so this
// test (the only one in this file that sets GEV_RATELIMIT_NOMINATIM_PER_MIN)
// must run before any other test makes a GET request, or its env var change
// would be read only after the unlimited default is already cached.
test('the opt-in rate limiter applies to this route like the other Google/regional proxies', async () => {
  const previousLimit = process.env.GEV_RATELIMIT_NOMINATIM_PER_MIN;
  process.env.GEV_RATELIMIT_NOMINATIM_PER_MIN = '1';
  try {
    const routes = installNominatimRoutes();
    const search = routes.get('/api/nominatim/search');
    await withFetchStub(
      async () => jsonResponse([]),
      async () => {
        const first = await invokeRoute(search, { url: '/?q=austin', remoteAddress: '10.0.0.9' });
        assert.equal(first.statusCode, 200);
        const second = await invokeRoute(search, { url: '/?q=austin', remoteAddress: '10.0.0.9' });
        assert.equal(second.statusCode, 429);
      },
    );
  } finally {
    if (previousLimit === undefined) delete process.env.GEV_RATELIMIT_NOMINATIM_PER_MIN;
    else process.env.GEV_RATELIMIT_NOMINATIM_PER_MIN = previousLimit;
  }
});

// NOTE: every invokeRoute() below this point passes a distinct remoteAddress.
// The rate-limit test above permanently caches nominatimSearchRateLimiter()
// at max=1 request/IP/minute for the rest of this process (mirrors
// googleRateLimiter()'s real lazy-once-cached behavior) — reusing an IP
// across tests would spuriously 429 the second one.

test('rejects a blank q with 400 without calling fetch', async () => {
  const routes = installNominatimRoutes();
  const search = routes.get('/api/nominatim/search');
  await withFetchStub(
    async () => { throw new Error('fetch must not be called without a query'); },
    async () => {
      const response = await invokeRoute(search, { url: '/?q=', remoteAddress: '10.0.0.1' });
      assert.equal(response.statusCode, 400);
    },
  );
});

test('calls Nominatim with the required User-Agent/Referer and forwards the top hit', async () => {
  const routes = installNominatimRoutes();
  const search = routes.get('/api/nominatim/search');
  const requestedUrls = [];
  const requestedHeaders = [];
  const hits = [{
    lat: '30.2672',
    lon: '-97.7431',
    display_name: 'Austin, Travis County, Texas, USA',
    place_rank: 16,
    addresstype: 'city',
    boundingbox: ['30.10', '30.50', '-97.95', '-97.55'],
  }];
  const response = await withFetchStub(
    async (url, init) => {
      requestedUrls.push(String(url));
      requestedHeaders.push(init?.headers || {});
      return jsonResponse(hits);
    },
    () => invokeRoute(search, { url: '/?q=austin', remoteAddress: '10.0.0.2' }),
  );
  assert.equal(response.statusCode, 200);
  assert.equal(response.headers['cache-control'], 'no-store');
  assert.deepEqual(response.body, hits);

  assert.ok(requestedUrls[0].startsWith('https://nominatim.openstreetmap.org/search?'));
  const params = new URL(requestedUrls[0]).searchParams;
  assert.equal(params.get('q'), 'austin');
  assert.equal(params.get('format'), 'jsonv2');
  assert.equal(params.get('limit'), '1');
  assert.match(requestedHeaders[0]['User-Agent'], /EagleEyeView/);
  assert.ok(requestedHeaders[0].Referer);
});

test('forwards an optional viewbox param through to Nominatim', async () => {
  const routes = installNominatimRoutes();
  const search = routes.get('/api/nominatim/search');
  const requestedUrls = [];
  await withFetchStub(
    async (url) => {
      requestedUrls.push(String(url));
      return jsonResponse([]);
    },
    () => invokeRoute(search, { url: '/?q=sixth+street&viewbox=-97.95%2C30.5%2C-97.55%2C30.1', remoteAddress: '10.0.0.3' }),
  );
  const params = new URL(requestedUrls[0]).searchParams;
  assert.equal(params.get('viewbox'), '-97.95,30.5,-97.55,30.1');
});

test('an empty Nominatim response resolves to an empty array, not a crash', async () => {
  const routes = installNominatimRoutes();
  const search = routes.get('/api/nominatim/search');
  const response = await withFetchStub(
    async () => jsonResponse([]),
    () => invokeRoute(search, { url: '/?q=nowhere+at+all', remoteAddress: '10.0.0.4' }),
  );
  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.body, []);
});

test('an upstream failure surfaces as 502, not an unhandled rejection', async () => {
  const routes = installNominatimRoutes();
  const search = routes.get('/api/nominatim/search');
  const response = await withFetchStub(
    async () => jsonResponse({}, { ok: false }),
    () => invokeRoute(search, { url: '/?q=austin', remoteAddress: '10.0.0.5' }),
  );
  assert.equal(response.statusCode, 502);
});
