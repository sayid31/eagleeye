// Field finding 2026-11-11: overpass-api.de grants one IP 2 query slots and
// answers a third concurrent query with 429 in < 1 s. Mapped Installations
// queries run ~20–40 s, so panning produced instant 503s while the upstream
// was healthy, and the Server Log said only "HTTP 503". These tests drive the
// real fetchOverpassPayload with a stubbed fetch.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { overpassEndpointAvailable, resetOverpassBreaker } from './overpassBreaker.mjs';
import { OVERPASS_UPSTREAMS } from './overpassCore.mjs';
import { fetchOverpassPayload } from './overpassFetch.mjs';
import { createSlotGate } from './overpassSlots.mjs';

const json = (body = '{"elements":[]}', status = 200) => new Response(body, { status, headers: { 'Content-Type': 'application/json' } });

async function withFetch(stub, run) {
  const originalFetch = globalThis.fetch;
  resetOverpassBreaker();
  globalThis.fetch = stub;
  try {
    return await run();
  } finally {
    globalThis.fetch = originalFetch;
    resetOverpassBreaker();
  }
}

test('no more than the slot count of queries is ever on the wire at once', async () => {
  let inFlight = 0;
  let peak = 0;
  const pending = [];
  await withFetch((url, init) => {
    inFlight += 1;
    peak = Math.max(peak, inFlight);
    return new Promise((resolve) => {
      pending.push(() => { inFlight -= 1; resolve(json()); });
      init.signal.addEventListener('abort', () => { inFlight -= 1; });
    });
  }, async () => {
    const gate = createSlotGate(2);
    const queries = [1, 2, 3, 4].map((n) => fetchOverpassPayload(`data=q${n}`, undefined, { gate }));
    for (let round = 0; round < 4; round += 1) {
      await new Promise((resolve) => setImmediate(resolve));
      pending.shift()?.();
    }
    const results = await Promise.all(queries);
    assert.equal(peak, 2, 'a third concurrent query is exactly what Overpass refuses with 429');
    assert.ok(results.every((r) => r.status === 200));
    assert.deepEqual(gate.stats(), { limit: 2, active: 0, waiting: 0 });
  });
});

test('a rate-limited sweep explains itself per mirror', async () => {
  await withFetch(async () => json('rate_limited', 429), async () => {
    const payload = await fetchOverpassPayload('data=busy', undefined, { gate: createSlotGate(2) });
    assert.equal(payload.rateLimited, true);
    assert.deepEqual(payload.attempts, OVERPASS_UPSTREAMS.map((url) => `${new URL(url).host}: HTTP 429 rate-limited`));
  });
});

test('a total failure throws with every mirror outcome in the message', async () => {
  await withFetch(async (url) => {
    if (url === OVERPASS_UPSTREAMS[0]) return json('{"remark":"runtime error: Query timed out"}');
    if (url === OVERPASS_UPSTREAMS[1]) return json('<html>bad gateway</html>', 502);
    throw Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNREFUSED' } });
  }, async () => {
    const error = await fetchOverpassPayload('data=down', undefined, { gate: createSlotGate(2) }).then(() => null, (e) => e);
    assert.ok(error, 'must reject');
    const [a, b, c] = OVERPASS_UPSTREAMS.map((url) => new URL(url).host);
    assert.deepEqual(error.attempts, [
      `${a}: HTTP 200 runtime error (query timeout/out of memory)`,
      `${b}: HTTP 502`,
      `${c}: TypeError: fetch failed`,
    ]);
    assert.match(error.message, /^All Overpass mirrors failed — /);
    assert.ok(error.message.includes(`${b}: HTTP 502`));
  });
});

test('parked mirrors are named in the summary', async () => {
  await withFetch(async (url) => {
    if (url === OVERPASS_UPSTREAMS[0]) throw Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' });
    return json();
  }, async () => {
    const gate = createSlotGate(2);
    await fetchOverpassPayload('data=first', undefined, { gate });
    const second = await fetchOverpassPayload('data=second', undefined, { gate });
    assert.equal(second.attempts[0], `${new URL(OVERPASS_UPSTREAMS[0]).host}: parked after recent failures`);
  });
});

test('an abandoned query leaves the queue and blames no mirror', async () => {
  const release = [];
  await withFetch((url, init) => new Promise((resolve, reject) => {
    release.push(() => resolve(json()));
    init.signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
  }), async () => {
    const gate = createSlotGate(1);
    const holder = fetchOverpassPayload('data=holder', undefined, { gate });
    await new Promise((resolve) => setImmediate(resolve));
    const controller = new AbortController();
    const abandoned = fetchOverpassPayload('data=old-view', undefined, { gate, signal: controller.signal });
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(gate.stats().waiting, 1);
    controller.abort(new Error('all clients disconnected'));
    await assert.rejects(abandoned, /all clients disconnected/);
    assert.equal(gate.stats().waiting, 0);
    release.shift()();
    await holder;

    const running = new AbortController();
    const inFlight = fetchOverpassPayload('data=running', undefined, { gate, signal: running.signal });
    await new Promise((resolve) => setImmediate(resolve));
    running.abort(new Error('client left'));
    await assert.rejects(inFlight);
    assert.equal(overpassEndpointAvailable(OVERPASS_UPSTREAMS[0]), true, 'a client leaving is not a host fault');
    assert.deepEqual(gate.stats(), { limit: 1, active: 0, waiting: 0 });
  });
});

test('queueing behind a slow query does not eat the attempt it waited for', async () => {
  const holders = [];
  await withFetch((url, init) => new Promise((resolve, reject) => {
    holders.push(() => resolve(json()));
    init.signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
  }), async () => {
    const gate = createSlotGate(1);
    // The queued query may wait up to 200 ms; the whole request may take 1 s.
    const options = { gate, slotWaitMs: 200, totalBudgetMs: 1000 };
    const first = fetchOverpassPayload('data=first', undefined, options);
    await new Promise((resolve) => setImmediate(resolve));
    const second = fetchOverpassPayload('data=second', undefined, options);
    await new Promise((resolve) => setTimeout(resolve, 150));
    holders.shift()(); // first answers after 150 ms of the second's queue time
    await first;
    await new Promise((resolve) => setTimeout(resolve, 100));
    holders.shift()(); // second still has its own attempt budget
    const answer = await second;
    assert.equal(answer.status, 200);
  });
});

test('a query that cannot get a slot in time fails with the queue as the reason', async () => {
  const holders = [];
  await withFetch(() => new Promise((resolve) => holders.push(() => resolve(json()))), async () => {
    const gate = createSlotGate(1);
    const first = fetchOverpassPayload('data=first', undefined, { gate });
    await new Promise((resolve) => setImmediate(resolve));
    const error = await fetchOverpassPayload('data=second', undefined, { gate, slotWaitMs: 50 }).then(() => null, (e) => e);
    assert.ok(error);
    assert.match(error.message, /no Overpass slot free within 0 s \(1 in use\)/);
    holders.shift()();
    await first;
  });
});

test('the request ceiling stays under the 100 s Cloudflare origin timeout', async () => {
  const { OVERPASS_TOTAL_BUDGET_MS, OVERPASS_SLOT_WAIT_MS } = await import('./overpassFetch.mjs');
  assert.ok(OVERPASS_TOTAL_BUDGET_MS < 100_000);
  assert.ok(OVERPASS_SLOT_WAIT_MS < OVERPASS_TOTAL_BUDGET_MS);
});
