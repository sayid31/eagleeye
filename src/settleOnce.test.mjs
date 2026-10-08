import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSettleOnce } from './settleOnce.js';

test('settle resolves the promise with the first value only', async () => {
  const gate = createSettleOnce();
  assert.equal(gate.isSettled(), false);
  assert.equal(gate.settle('first'), true);
  assert.equal(gate.settle('second'), false);
  assert.equal(gate.isSettled(), true);
  assert.equal(await gate.promise, 'first');
});

test('the promise stays pending until settled', async () => {
  const gate = createSettleOnce();
  let resolved = false;
  void gate.promise.then(() => { resolved = true; });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(resolved, false);
  gate.settle();
  await gate.promise;
  assert.equal(resolved, true);
});
