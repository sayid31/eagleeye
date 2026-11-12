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

// This file never gets the real fetch back. node --test runs each file in its
// own process, so the dispatcher below makes the network unreachable for the
// whole run: a sweep that outlives its test (e.g. if aborts ever regress) falls
// through to the next mirror and must hit this wall, not overpass-api.de.
let activeStub = null;
globalThis.fetch = (url, init) => (activeStub
  ? activeStub(url, init)
  : Promise.reject(new Error('network disabled in overpassProxyAbandon.test.mjs')));

/** A road query for an open-ocean box, so no disk or COVER entry can answer it. */
const oceanQuery = (n) => buildOverpassQuery(-40 - n * 0.1, -120, -39.95 - n * 0.1, -119.95, { majorOnly: true, timeoutSec: 12 });

/** Every request sent in a test, so teardown can disconnect what is still pending. */
const sent = [];

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
    const disconnect = () => { if (!res.writableFinished) res.emit('close'); };
    const request = { res, done, disconnect };
    sent.push(request);
    return request;
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

/** Wait until `condition()` holds (the handler awaits disk + COVER before the gate), bounded. */
async function until(condition, timeoutMs = 5000) {
  const started = Date.now();
  while (!condition()) {
    if (Date.now() - started > timeoutMs) return false;
    await new Promise((r) => setTimeout(r, 5));
  }
  return true;
}
/** Let pending handler work settle for a short, fixed wall-clock while. */
const settle = () => new Promise((r) => setTimeout(r, 50));

async function withUpstream(run) {
  const { calls, fetchStub } = hangingUpstream();
  const original = { gate: globalThis.__GEV_OVERPASS_SLOTS__, warn: console.warn, error: console.error };
  activeStub = fetchStub;
  globalThis.__GEV_OVERPASS_SLOTS__ = createSlotGate(2);
  console.warn = () => {};
  console.error = () => {};
  try {
    await run(calls);
  } finally {
    for (const request of sent.splice(0)) request.disconnect();
    await settle();
    activeStub = null; // anything still running now meets the wall above
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
    assert.ok(await until(() => calls.length === 2), 'A and B reach the upstream');
    const c = send(oceanQuery(3));
    await settle();
    assert.equal(calls.length, 2, 'two slots: the third viewport waits');

    a.disconnect(); // camera moved on from A
    assert.ok(await until(() => calls.length === 3), "C starts in A's freed slot instead of waiting 45 s");
    assert.equal(calls[0].aborted, true, "A's upstream query is cancelled");
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
    assert.ok(await until(() => calls.length === 1));
    const joiner = send(oceanQuery(4)); // same viewport from another tab: deduped
    await settle();
    assert.equal(calls.length, 1);

    first.disconnect();
    await settle();
    assert.equal(calls[0].aborted, false, 'the joiner still wants the answer');

    joiner.disconnect();
    assert.ok(await until(() => calls[0].aborted), 'the last client leaving aborts it');
    await Promise.all([first.done, joiner.done]);
  });
});
