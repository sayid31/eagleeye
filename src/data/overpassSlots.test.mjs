import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSlotGate, OVERPASS_DEFAULT_SLOTS, overpassSlotLimit } from './overpassSlots.mjs';

test('the slot count defaults to Overpass per-IP limit and honours a sane override', () => {
  assert.equal(OVERPASS_DEFAULT_SLOTS, 2);
  assert.equal(overpassSlotLimit({}), 2);
  assert.equal(overpassSlotLimit({ GEV_OVERPASS_UPSTREAM_SLOTS: '3' }), 3);
  assert.equal(overpassSlotLimit({ GEV_OVERPASS_UPSTREAM_SLOTS: '99' }), 8);
  for (const junk of ['0', '-1', '1.5', 'abc', '']) assert.equal(overpassSlotLimit({ GEV_OVERPASS_UPSTREAM_SLOTS: junk }), 2, junk);
});

test('a third query waits for a slot instead of running, then runs in FIFO order', async () => {
  const gate = createSlotGate(2);
  const r1 = await gate.acquire();
  const r2 = await gate.acquire();
  const order = [];
  const third = gate.acquire().then((release) => { order.push('third'); return release; });
  const fourth = gate.acquire().then((release) => { order.push('fourth'); return release; });
  await Promise.resolve();
  assert.deepEqual(gate.stats(), { limit: 2, active: 2, waiting: 2 });
  assert.deepEqual(order, []);
  r1();
  r1(); // idempotent: a double release must not free a second slot
  const r3 = await third;
  assert.deepEqual(order, ['third']);
  assert.deepEqual(gate.stats(), { limit: 2, active: 2, waiting: 1 });
  r2();
  const r4 = await fourth;
  assert.deepEqual(order, ['third', 'fourth']);
  r3();
  r4();
  assert.deepEqual(gate.stats(), { limit: 2, active: 0, waiting: 0 });
});

test('a wait that outlives its budget is rejected and leaves the queue', async () => {
  let fire = null;
  const gate = createSlotGate(1, { setTimer: (fn) => { fire = fn; return 1; }, clearTimer: () => {} });
  const held = await gate.acquire();
  const waiting = gate.acquire({ timeoutMs: 30_000 });
  fire();
  await assert.rejects(waiting, (error) => error.code === 'SLOT_WAIT_TIMEOUT' && /within 30 s \(1 in use\)/.test(error.message));
  assert.deepEqual(gate.stats(), { limit: 1, active: 1, waiting: 0 });
  held();
  assert.deepEqual(gate.stats(), { limit: 1, active: 0, waiting: 0 });
});

test('an abandoned wait is dropped so newer queries are not stuck behind it', async () => {
  const gate = createSlotGate(1);
  const held = await gate.acquire();
  const controller = new AbortController();
  const abandoned = gate.acquire({ signal: controller.signal });
  const wanted = gate.acquire();
  controller.abort(new Error('all clients disconnected'));
  await assert.rejects(abandoned, /all clients disconnected/);
  held();
  const release = await wanted;
  assert.deepEqual(gate.stats(), { limit: 1, active: 1, waiting: 0 });
  release();
  await assert.rejects(gate.acquire({ signal: AbortSignal.abort() }), (error) => error.name === 'AbortError');
});
