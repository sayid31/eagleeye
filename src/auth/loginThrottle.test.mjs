import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { LOGIN_THROTTLE_MAX_MS, LOGIN_THROTTLE_THRESHOLD } from './accountPolicy.mjs';
import { LOGIN_THROTTLE_ROW_TTL_MS, createLoginThrottle } from './loginThrottle.mjs';
import { startAuthTestServer } from './__fixtures__/authTestServer.mjs';

let t;
let clock;
let throttle;
const MINUTE = 60 * 1000;
const START = Date.parse('2026-11-17T08:00:00Z'); // test-only

before(async () => {
  t = await startAuthTestServer();
  clock = START;
  throttle = createLoginThrottle({ getContext: () => t.state.auth.$context, secret: 'throttle-test-secret', now: () => clock }); // test-only
});
after(() => t.close());

const count = () => t.rows('SELECT COUNT(*) AS n FROM login_throttle')[0].n;

test('row TTL equals the longest throttle delay', () => {
  assert.equal(LOGIN_THROTTLE_ROW_TTL_MS, LOGIN_THROTTLE_MAX_MS);
});

test('a write prunes unknown-email rows idle past the longest delay, keeps recent ones', async () => {
  await throttle.recordFailure('old-1@example.test');
  await throttle.recordFailure('old-2@example.test');
  clock += 5 * MINUTE;
  await throttle.recordFailure('recent@example.test');
  assert.equal(count(), 3);
  // 16 minutes after the old rows' last write (11 after the recent one): only the old ones go.
  clock = START + LOGIN_THROTTLE_ROW_TTL_MS + MINUTE;
  await throttle.recordFailure('new@example.test');
  const hashes = t.rows('SELECT failedCount FROM login_throttle ORDER BY updatedAt').map((row) => row.failedCount);
  assert.equal(count(), 2);
  assert.deepEqual(hashes, [1, 1]);
});

test('a row still inside its delay is never pruned; an expired idle counter restarts at 1', async () => {
  for (let i = 0; i < LOGIN_THROTTLE_THRESHOLD; i += 1) await throttle.recordFailure('busy@example.test');
  assert.equal((await throttle.check('busy@example.test')).throttled, true);
  clock += LOGIN_THROTTLE_ROW_TTL_MS - 1000;
  await throttle.recordFailure('other@example.test');
  assert.equal(t.rows('SELECT MAX(failedCount) AS n FROM login_throttle')[0].n, LOGIN_THROTTLE_THRESHOLD, 'busy row kept');
  clock += 2 * LOGIN_THROTTLE_ROW_TTL_MS;
  assert.equal((await throttle.check('busy@example.test')).throttled, false, 'its delay is over anyway');
  const again = await throttle.recordFailure('busy@example.test');
  assert.equal(again.failures, 1);
  assert.equal(again.throttleUntil, null);
});

test('the table stays bounded: 50 idle rows are gone after one later write', async () => {
  for (let i = 0; i < 50; i += 1) await throttle.recordFailure(`spray-${i}@example.test`);
  assert.ok(count() >= 50);
  clock += LOGIN_THROTTLE_ROW_TTL_MS + 1;
  await throttle.recordFailure('last@example.test');
  assert.equal(count(), 1);
});
