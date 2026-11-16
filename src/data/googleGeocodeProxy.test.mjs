// src/data/googleGeocodeProxy.test.mjs — the /api/google/geocode proxy that
// keeps GOOGLE_MAPS_API_KEY server-side for forward and reverse geocoding.
// Same fake req/res template as googlePlacesKeyless.test.mjs; the upstream
// fetch is injected.
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  GOOGLE_GEOCODE_MAX_ADDRESS_LENGTH,
  GOOGLE_GEOCODE_ROUTE,
  createGoogleGeocodeHandler,
  googleGeocodeProxy,
  parseGoogleGeocodeQuery,
} from './googleGeocodeProxy.mjs';
import { makeOptInRateLimiter } from '../server/proxyInfra.mjs';

const FAKE_KEY = 'AIzaFAKE-geocode-key-0123456789'; // test-only

function invoke(handler, { method = 'GET', url = '/', remoteAddress = '127.0.0.1' } = {}) {
  return new Promise((resolve, reject) => {
    const headers = new Map();
    const req = { method, url, headers: {}, socket: { remoteAddress } };
    const res = {
      statusCode: 200,
      setHeader(name, value) {
        headers.set(String(name).toLowerCase(), String(value));
      },
      end(body = '') {
        resolve({ statusCode: this.statusCode, headers: Object.fromEntries(headers), text: String(body) });
      },
    };
    Promise.resolve(handler(req, res)).catch(reject);
  });
}

function upstreamStub(respond) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    const parsed = new URL(String(url));
    calls.push({ url: parsed, init });
    return respond(parsed);
  };
  return { calls, fetchImpl };
}

const OK_PAYLOAD = {
  status: 'OK',
  results: [{
    formatted_address: 'Austin, TX, USA',
    types: ['locality', 'political'],
    geometry: { location: { lat: 30.2672, lng: -97.7431 } },
  }],
};

test('forward query validation: address required, bounds checked, control characters refused', () => {
  const forward = parseGoogleGeocodeQuery('/?address=%20austin%20&bounds=30.1,-97.9|30.4,-97.6');
  assert.equal(forward.ok, true);
  assert.equal(forward.mode, 'forward');
  assert.equal(forward.params.get('address'), 'austin');
  assert.equal(forward.params.get('bounds'), '30.1,-97.9|30.4,-97.6');

  for (const bad of [
    '/',
    '/?address=%20%20',
    `/?address=${'a'.repeat(GOOGLE_GEOCODE_MAX_ADDRESS_LENGTH + 1)}`,
    '/?address=austin%0Akey%3Dx',
    '/?address=austin&bounds=30.1,-97.9',
    '/?address=austin&bounds=91,0|92,1',
    '/?address=austin&bounds=a,b|c,d',
    '/?address=austin&latlng=1,2',
  ]) {
    assert.equal(parseGoogleGeocodeQuery(bad).ok, false, `must reject ${bad}`);
  }
});

test('reverse query validation: latlng must be an in-range pair and excludes bounds', () => {
  const reverse = parseGoogleGeocodeQuery('/?latlng=-6.2,106.8166');
  assert.equal(reverse.ok, true);
  assert.equal(reverse.mode, 'reverse');
  assert.equal(reverse.params.get('latlng'), '-6.2,106.8166');
  for (const bad of ['/?latlng=', '/?latlng=95,10', '/?latlng=10,181', '/?latlng=1;2', '/?latlng=1,2&bounds=0,0|1,1']) {
    assert.equal(parseGoogleGeocodeQuery(bad).ok, false, `must reject ${bad}`);
  }
});

test('forward geocode: the server adds its key, forwards only validated params, returns Google shape', async () => {
  const { calls, fetchImpl } = upstreamStub(() => Response.json({ ...OK_PAYLOAD, error_message: 'ignored' }));
  const handler = createGoogleGeocodeHandler({ fetchImpl, getApiKey: () => FAKE_KEY });
  const response = await invoke(handler, {
    url: '/?address=austin&bounds=30.1,-97.9|30.4,-97.6&key=client-key&components=country:US',
  });
  assert.equal(response.statusCode, 200);
  assert.equal(response.headers['cache-control'], 'no-store');
  assert.deepEqual(JSON.parse(response.text), OK_PAYLOAD);
  assert.equal(calls.length, 1);
  const upstream = calls[0].url;
  assert.equal(`${upstream.origin}${upstream.pathname}`, 'https://maps.googleapis.com/maps/api/geocode/json');
  assert.deepEqual(upstream.searchParams.getAll('key'), [FAKE_KEY], 'client key dropped, server key added');
  assert.equal(upstream.searchParams.get('address'), 'austin');
  assert.equal(upstream.searchParams.get('bounds'), '30.1,-97.9|30.4,-97.6');
  assert.equal(upstream.searchParams.has('components'), false, 'unlisted params are not forwarded');
  assert.equal(calls[0].init.redirect, 'error');
});

test('reverse geocode forwards latlng only', async () => {
  const { calls, fetchImpl } = upstreamStub(() => Response.json({ status: 'ZERO_RESULTS', results: [] }));
  const handler = createGoogleGeocodeHandler({ fetchImpl, getApiKey: () => FAKE_KEY });
  const response = await invoke(handler, { url: '/?latlng=48.8566,2.3522' });
  assert.equal(response.statusCode, 200);
  assert.deepEqual(JSON.parse(response.text), { status: 'ZERO_RESULTS', results: [] });
  assert.deepEqual([...calls[0].url.searchParams.keys()].sort(), ['key', 'latlng']);
});

test('invalid params → 400 INVALID_REQUEST without an upstream call', async () => {
  const { calls, fetchImpl } = upstreamStub(() => Response.json(OK_PAYLOAD));
  const handler = createGoogleGeocodeHandler({ fetchImpl, getApiKey: () => FAKE_KEY });
  const response = await invoke(handler, { url: '/?latlng=999,0' });
  assert.equal(response.statusCode, 400);
  assert.equal(JSON.parse(response.text).status, 'INVALID_REQUEST');
  const post = await invoke(handler, { method: 'POST', url: '/?address=austin' });
  assert.equal(post.statusCode, 405);
  assert.equal(calls.length, 0);
});

test('no configured key → 503 NOT_CONFIGURED and no upstream call', async () => {
  const { calls, fetchImpl } = upstreamStub(() => Response.json(OK_PAYLOAD));
  const handler = createGoogleGeocodeHandler({ fetchImpl, getApiKey: () => '' });
  const response = await invoke(handler, { url: '/?address=austin' });
  assert.equal(response.statusCode, 503);
  assert.deepEqual(JSON.parse(response.text), {
    status: 'NOT_CONFIGURED',
    error: 'google_maps_key_not_configured',
    results: [],
  });
  assert.equal(calls.length, 0);
});

test('upstream failures are sanitized: no key in the response or the log', async () => {
  const lines = [];
  const logger = { warn: (...args) => lines.push(args.join(' ')) };
  let mode = 'http';
  const fetchImpl = async (url) => {
    if (mode === 'http') return new Response(`denied for ${new URL(String(url)).searchParams.get('key')}`, { status: 500 });
    throw new TypeError(`fetch failed: ${String(url)}`);
  };
  const handler = createGoogleGeocodeHandler({ fetchImpl, getApiKey: () => FAKE_KEY, logger });
  const httpError = await invoke(handler, { url: '/?address=austin' });
  assert.equal(httpError.statusCode, 502);
  assert.equal(JSON.parse(httpError.text).status, 'UPSTREAM_ERROR');
  mode = 'network';
  const networkError = await invoke(handler, { url: '/?latlng=1,2' });
  assert.equal(networkError.statusCode, 502);
  for (const text of [httpError.text, networkError.text, ...lines]) {
    assert.equal(text.includes(FAKE_KEY), false, 'the key must never be echoed');
  }
  assert.ok(lines.some((line) => line.includes('[redacted]')));
});

test('the opt-in Google limiter throttles geocoding like Places', async () => {
  const limiter = makeOptInRateLimiter('2'); // same factory as GEV_RATELIMIT_GOOGLE_PER_MIN=2
  const { calls, fetchImpl } = upstreamStub(() => Response.json(OK_PAYLOAD));
  const handler = createGoogleGeocodeHandler({ fetchImpl, getApiKey: () => FAKE_KEY, getRateLimiter: () => limiter });
  const statuses = [];
  for (let i = 0; i < 3; i += 1) {
    statuses.push((await invoke(handler, { url: '/?address=austin', remoteAddress: '10.9.9.9' })).statusCode);
  }
  assert.deepEqual(statuses, [200, 200, 429]);
  assert.equal(calls.length, 2, 'a throttled request never reaches Google');
});

test('the plugin mounts on both the dev and the preview server', () => {
  for (const hook of ['configureServer', 'configurePreviewServer']) {
    const mounts = [];
    googleGeocodeProxy()[hook]({ middlewares: { use: (path, handler) => mounts.push([path, typeof handler]) } });
    assert.deepEqual(mounts, [[GOOGLE_GEOCODE_ROUTE, 'function']]);
  }
});
