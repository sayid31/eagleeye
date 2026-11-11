import { test } from 'node:test';
import assert from 'node:assert/strict';
import { aisLiveProxy } from './aisLiveProxy.mjs';

/** Mount the plugin on fake middleware and return the /api/ais-live handler + teardown. */
function mountRoute() {
  const routes = new Map();
  const closeHandlers = [];
  aisLiveProxy().configureServer({
    middlewares: { use: (path, handler) => routes.set(path, handler) },
    httpServer: { on: (event, handler) => { if (event === 'close') closeHandlers.push(handler); } },
  });
  return { handler: routes.get('/api/ais-live'), close: () => closeHandlers.forEach((fn) => fn()) };
}

function fakeResponse() {
  const headers = {};
  return {
    headers,
    statusCode: 0,
    body: null,
    setHeader(name, value) { headers[name.toLowerCase()] = value; },
    end(chunk) { this.body = chunk; },
  };
}

test('rows snapshot goes through the compression-aware JSON sender', async () => {
  const priorKey = process.env.AISSTREAM_API_KEY;
  delete process.env.AISSTREAM_API_KEY;
  const { handler, close } = mountRoute();
  try {
    const res = fakeResponse();
    await handler({ url: '/?maxRows=12000', headers: { 'accept-encoding': 'gzip' } }, res);
    assert.equal(res.statusCode, 503);
    assert.equal(res.headers.vary, 'Accept-Encoding');
    assert.equal(res.headers['cache-control'], 'no-store');
    const payload = JSON.parse(Buffer.from(res.body).toString('utf8'));
    assert.deepEqual(payload.rows, []);
    assert.equal(payload.status, 'missing-key');
  } finally {
    close();
    if (priorKey === undefined) delete process.env.AISSTREAM_API_KEY;
    else process.env.AISSTREAM_API_KEY = priorKey;
  }
});
