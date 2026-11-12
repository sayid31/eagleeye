// Local log 2026-11-12 14:23–14:25: panning while Overpass was slow gave
// "/api/overpass answered HTTP 503" ×9 (proxy busy) and "no Overpass slot free
// within 45 s": requests for viewports the user had left kept their slots.
// These drive the real /api/overpass middleware with a stubbed upstream — no
// request leaves the machine.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { Readable } from 'node:stream';
import { overpassProxy } from '../../vite.config.js';
import { buildOverpassQuery } from './trafficOverpassQuery.js';
import { createSlotGate } from './overpassSlots.mjs';

/** A road query for an open-ocean box, so no disk or COVER entry can answer it. */
const oceanQuery = (n) => buildOverpassQuery(-40 - n * 0.1, -120, -39.95 - n * 0.1, -119.95, { majorOnly: true, timeoutSec: 12 });

function mount() {
  let handler = null;
  overpassProxy().configureServer({ middlewares: { use: (prefix, fn) => { if (prefix === '/api/overpass') handler = fn; } } });
  return (query) => {
    const req = Readable.from([Buffer.from(`data=${encodeURIComponent(query)}`)]);
    Object.assign(req, { method: 'POST', url: '/', headers: {}, socket: { remoteAddress: '127.0.0.1' } });
    const res = Object.assign(new EventEmitter(), {
      writableFinished: false,
      statusCode: 0,
      headersSent: false,
      writeHead(status) { this.statusCode = status; this.headersSent = true; },
      setHeader() {},
      end() { this.writableFinished = true; this.emit('close'); },
    });
    const done = handler(req, res);
    /** The browser aborts its fetch: the socket closes before an answer. */
    const disconnect = () => res.emit('close');
    return { res, done, disconnect };
  };
}

/** Upstream that never answers; each call can be inspected and is aborted via its signal. */
function hangingUpstream() {
  const calls = [];
  const fetchStub = (url, init) => new Promise((resolve, reject) => {
    const call = { body: String(init.body), aborted: false };
    calls.push(call);
    init.signal.addEventListener('abort', () => {
      call.aborted = true;
      reject(Object.assign(new Error('aborted'), { name: 'AbortError' }));
    });
  });
  return { calls, fetchStub };
}

const tick = async (n = 20) => { for (let i = 0; i < n; i += 1) await new Promise((r) => setImmediate(r)); };

async function withUpstream(run) {
  const { calls, fetchStub } = hangingUpstream();
  const original = { fetch: globalThis.fetch, gate: globalThis.__GEV_OVERPASS_SLOTS__, warn: console.warn, error: console.error };
  globalThis.fetch = fetchStub;
  globalThis.__GEV_OVERPASS_SLOTS__ = createSlotGate(2);
  console.warn = () => {};
  console.error = () => {};
  try {
    await run(calls);
  } finally {
    globalThis.fetch = original.fetch;
    globalThis.__GEV_OVERPASS_SLOTS__ = original.gate;
    console.warn = original.warn;
    console.error = original.error;
  }
}

test('a left viewport gives its slot to the one the user is looking at', async () => {
  await withUpstream(async (calls) => {
    const send = mount();
    const a = send(oceanQuery(1));
    const b = send(oceanQuery(2));
    await tick();
    const c = send(oceanQuery(3));
    await tick();
    assert.equal(calls.length, 2, 'two slots: the third viewport waits');

    a.disconnect(); // camera moved on from A
    await tick();
    assert.equal(calls[0].aborted, true, "A's upstream query is cancelled");
    assert.equal(calls.length, 3, "C starts in A's freed slot instead of waiting 45 s");
    assert.equal(a.res.headersSent, false, 'nobody to answer for A');

    b.disconnect();
    c.disconnect();
    await Promise.all([a.done, b.done, c.done]);
    assert.ok(calls.every((call) => call.aborted));
    assert.deepEqual(globalThis.__GEV_OVERPASS_SLOTS__.stats(), { limit: 2, active: 0, waiting: 0 });
  });
});

test('a shared query keeps running while any client still waits for it', async () => {
  await withUpstream(async (calls) => {
    const send = mount();
    const first = send(oceanQuery(4));
    await tick();
    const joiner = send(oceanQuery(4)); // same viewport from another tab: deduped
    await tick();
    assert.equal(calls.length, 1);

    first.disconnect();
    await tick();
    assert.equal(calls[0].aborted, false, 'the joiner still wants the answer');

    joiner.disconnect();
    await tick();
    assert.equal(calls[0].aborted, true);
    await Promise.all([first.done, joiner.done]);
  });
});
