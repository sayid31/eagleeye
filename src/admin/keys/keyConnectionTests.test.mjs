import { test } from 'node:test';
import assert from 'node:assert/strict';
import { KEY_SETUP_KEYS } from '../../keySetupCore.mjs';
import { KEY_TEST_NOTES, testProviderKey } from './keyConnectionTests.mjs';

// test-only fixtures, not real credentials
const FAKE = 'test-only-key-0123456789abcdef';
const entry = (id) => KEY_SETUP_KEYS.find((k) => k.id === id);
const ENV = {
  OPENAI_API_KEY: FAKE, FIRMS_MAP_KEY: FAKE, CESIUM_ION_TOKEN: FAKE, TOMTOM_API_KEY: FAKE,
  OPENSKY_CLIENT_ID: 'client', OPENSKY_CLIENT_SECRET: FAKE, LL2_API_TOKEN: FAKE, AISSTREAM_API_KEY: FAKE,
};

function fakeFetch(status, json = {}) {
  const calls = [];
  const fn = async (url, init) => { calls.push({ url, init }); return { ok: status >= 200 && status < 300, status, json: async () => json }; };
  return { fn, calls };
}

test('every registry entry has a test note', () => {
  for (const key of KEY_SETUP_KEYS) assert.ok(KEY_TEST_NOTES[key.id], key.id);
});

test('2xx is ok, 401/403 is rejected, other statuses and network errors are unreachable', async () => {
  assert.equal((await testProviderKey(entry('openai'), { env: ENV, fetchFn: fakeFetch(200).fn })).result, 'ok');
  assert.deepEqual(await testProviderKey(entry('openai'), { env: ENV, fetchFn: fakeFetch(401).fn }),
    { result: 'rejected', httpStatus: 401, message: 'The provider rejected the key.' });
  assert.equal((await testProviderKey(entry('tomtom'), { env: ENV, fetchFn: fakeFetch(503).fn })).result, 'unreachable');
  const down = await testProviderKey(entry('cesium-ion'), { env: ENV, fetchFn: async () => { throw new Error(`boom ${FAKE}`); } });
  assert.equal(down.result, 'unreachable');
  assert.ok(!JSON.stringify(down).includes(FAKE), 'no upstream error text');
});

test('the key goes only where the provider expects it', async () => {
  const openai = fakeFetch(200);
  await testProviderKey(entry('openai'), { env: ENV, fetchFn: openai.fn });
  assert.equal(openai.calls[0].url, 'https://api.openai.com/v1/models');
  assert.equal(openai.calls[0].init.headers.Authorization, `Bearer ${FAKE}`);
  const ll2 = fakeFetch(200);
  await testProviderKey(entry('launch-library'), { env: ENV, fetchFn: ll2.fn });
  assert.equal(ll2.calls[0].init.headers.Authorization, `Token ${FAKE}`);
  const opensky = fakeFetch(200);
  await testProviderKey(entry('opensky'), { env: ENV, fetchFn: opensky.fn });
  assert.equal(opensky.calls[0].init.method, 'POST');
  assert.match(opensky.calls[0].init.body, /^grant_type=client_credentials&client_id=client&client_secret=/);
});

test('FIRMS needs a transaction_limit in the body to count as accepted', async () => {
  assert.equal((await testProviderKey(entry('firms'), { env: ENV, fetchFn: fakeFetch(200, { transaction_limit: 5000 }).fn })).result, 'ok');
  assert.equal((await testProviderKey(entry('firms'), { env: ENV, fetchFn: fakeFetch(200, { error: 'Invalid' }).fn })).result, 'rejected');
});

test('missing key is not_set; Google Maps is untestable from the server', async () => {
  assert.equal((await testProviderKey(entry('openai'), { env: {}, fetchFn: fakeFetch(200).fn })).result, 'not_set');
  assert.equal((await testProviderKey(entry('opensky'), { env: { OPENSKY_CLIENT_ID: 'x' }, fetchFn: fakeFetch(200).fn })).result, 'not_set');
  const google = await testProviderKey(entry('google-maps'), { env: { GOOGLE_MAPS_API_KEY: FAKE } });
  assert.equal(google.result, 'untestable');
});

class FakeSocket {
  static mode = 'message';
  static last = null;
  constructor(url) {
    this.url = url;
    this.sent = [];
    this.closed = false;
    FakeSocket.last = this;
    queueMicrotask(() => {
      // 'refused' = AISStream's 429 at the handshake: the socket never opens.
      if (FakeSocket.mode === 'refused') { this.onerror?.(); this.onclose?.({ code: 1006 }); return; }
      this.onopen?.();
      if (FakeSocket.mode === 'message') this.onmessage?.({ data: '{}' });
      if (FakeSocket.mode === 'close') this.onclose?.({ code: 1006 });
    });
  }
  send(text) { this.sent.push(JSON.parse(text)); }
  close() { this.closed = true; }
}

test('AISStream: a first message is ok, a close without one is rejected; the socket is closed', async () => {
  FakeSocket.mode = 'message';
  const ok = await testProviderKey(entry('aisstream'), { env: ENV, WebSocketImpl: FakeSocket });
  assert.equal(ok.result, 'ok');
  assert.equal(FakeSocket.last.sent[0].APIKey, FAKE);
  assert.equal(FakeSocket.last.closed, true);
  FakeSocket.mode = 'close';
  assert.equal((await testProviderKey(entry('aisstream'), { env: ENV, WebSocketImpl: FakeSocket })).result, 'rejected');
});

test('AISStream: a socket refused before it opened (connection limit) is unreachable, not rejected', async () => {
  FakeSocket.mode = 'refused';
  const r = await testProviderKey(entry('aisstream'), { env: ENV, WebSocketImpl: FakeSocket });
  assert.equal(r.result, 'unreachable');
  assert.match(r.message, /limits connections per key/);
});

test('AISStream: a live feed proves the key without opening a socket; auth-failed rejects', async () => {
  FakeSocket.last = null;
  const live = await testProviderKey(entry('aisstream'), { env: ENV, WebSocketImpl: FakeSocket, aisFeedEvidence: () => ({ status: 'live' }) });
  assert.equal(live.result, 'ok');
  assert.match(live.message, /live vessel feed/);
  assert.equal(FakeSocket.last, null, 'no second connection');
  const refused = await testProviderKey(entry('aisstream'), { env: ENV, WebSocketImpl: FakeSocket, aisFeedEvidence: () => ({ status: 'auth-failed' }) });
  assert.equal(refused.result, 'rejected');
  assert.equal(FakeSocket.last, null);
});

test('AISStream: an idle/stale feed or a throwing status reader falls back to the probe', async () => {
  FakeSocket.mode = 'message';
  for (const aisFeedEvidence of [() => ({ status: 'idle' }), () => ({ status: 'stale' }), () => { throw new Error('boom'); }]) {
    FakeSocket.last = null;
    const warn = console.warn;
    console.warn = () => {};
    try {
      assert.equal((await testProviderKey(entry('aisstream'), { env: ENV, WebSocketImpl: FakeSocket, aisFeedEvidence })).result, 'ok');
    } finally { console.warn = warn; }
    assert.ok(FakeSocket.last, 'probe ran');
  }
});
