import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSharedAbortRegistry } from './sharedAbort.mjs';

test('the shared signal aborts only when the last waiting client leaves', () => {
  const registry = createSharedAbortRegistry();
  let abandoned = 0;
  const a = registry.join('jakarta', () => { abandoned += 1; });
  const b = registry.join('jakarta');
  assert.equal(a.signal, b.signal);
  a.leave();
  assert.equal(a.signal.aborted, false, 'another client still wants the answer');
  b.leave();
  assert.equal(a.signal.aborted, true);
  assert.match(a.signal.reason.message, /all clients disconnected/);
  assert.equal(abandoned, 1);
  assert.equal(a.left, true);
  assert.equal(registry.size(), 0);
});

test('an answered client never aborts the upstream for others', () => {
  const registry = createSharedAbortRegistry();
  const a = registry.join('k');
  const b = registry.join('k');
  a.done();
  a.leave(); // a late close after the answer is ignored
  assert.equal(b.signal.aborted, false);
  b.done();
  assert.equal(b.signal.aborted, false);
  assert.equal(a.left, false);
  assert.equal(registry.size(), 0);
});

test('a new request after abandonment gets a fresh signal', () => {
  const registry = createSharedAbortRegistry();
  const old = registry.join('k');
  old.leave();
  const fresh = registry.join('k');
  assert.notEqual(fresh.signal, old.signal);
  assert.equal(fresh.signal.aborted, false);
  fresh.done();
});
