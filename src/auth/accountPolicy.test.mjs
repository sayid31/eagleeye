import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LOGIN_THROTTLE_MAX_MS, LOGIN_THROTTLE_THRESHOLD, isAccountClosed, isThrottled, throttleDelayMs } from './accountPolicy.mjs';
import { parseTrustedProxies, resolveClientIp } from './clientIp.mjs';

const MINUTE = 60 * 1000;

test('throttle: nothing below 5 failures, then 1, 2, 4, 8 minutes, capped at 15', () => {
  assert.equal(LOGIN_THROTTLE_THRESHOLD, 5);
  assert.deepEqual([0, 1, 4].map(throttleDelayMs), [0, 0, 0]);
  assert.deepEqual([5, 6, 7, 8].map(throttleDelayMs), [MINUTE, 2 * MINUTE, 4 * MINUTE, 8 * MINUTE]);
  assert.deepEqual([9, 10, 50, 5000].map(throttleDelayMs), [15 * MINUTE, 15 * MINUTE, 15 * MINUTE, 15 * MINUTE]);
  assert.equal(LOGIN_THROTTLE_MAX_MS, 15 * MINUTE);
  assert.equal(throttleDelayMs(NaN), 0);
});

test('isThrottled reads Date, ISO string and epoch; past or empty → false', () => {
  const now = Date.parse('2026-11-17T10:00:00Z');
  assert.equal(isThrottled(new Date(now + 1000), now), true);
  assert.equal(isThrottled('2026-11-17T10:00:01.000Z', now), true);
  assert.equal(isThrottled(now + 1, now), true);
  assert.equal(isThrottled('2026-11-17T09:59:59.000Z', now), false);
  for (const empty of [null, undefined, '', 'garbage']) assert.equal(isThrottled(empty, now), false);
});

test('isAccountClosed: banned (bool or SQLite 1) or tombstoned', () => {
  assert.equal(isAccountClosed({ banned: true }), true);
  assert.equal(isAccountClosed({ banned: 1 }), true);
  assert.equal(isAccountClosed({ banned: false, deletedAt: '2026-11-17T00:00:00Z' }), true);
  assert.equal(isAccountClosed({ banned: false, deletedAt: null }), false);
  assert.equal(isAccountClosed(null), false);
});

test('client IP: the socket peer unless it is a trusted proxy; X-Forwarded-For read right to left', () => {
  const none = parseTrustedProxies('');
  assert.equal(resolveClientIp('203.0.113.9', '1.2.3.4', none), '203.0.113.9', 'no trusted proxies: header ignored');
  assert.equal(resolveClientIp('::ffff:127.0.0.1', undefined, none), '127.0.0.1');
  const trusted = parseTrustedProxies('127.0.0.1, 10.0.0.0/8, ::1, bogus, 10.0.0.0/x');
  assert.deepEqual(trusted.invalid, ['bogus', '10.0.0.0/x']);
  assert.equal(resolveClientIp('127.0.0.1', '198.51.100.7', trusted), '198.51.100.7');
  assert.equal(resolveClientIp('127.0.0.1', 'spoofed-by-client, 198.51.100.7, 10.1.1.1', trusted), '198.51.100.7', 'trusted hops skipped');
  assert.equal(resolveClientIp('127.0.0.1', '6.6.6.6, 198.51.100.7', trusted), '198.51.100.7', 'a client-prepended hop is never chosen');
  assert.equal(resolveClientIp('127.0.0.1', 'not-an-ip', trusted), '127.0.0.1');
  assert.equal(resolveClientIp('203.0.113.9', '198.51.100.7', trusted), '203.0.113.9', 'untrusted peer: header ignored');
  assert.equal(resolveClientIp('::1', ['198.51.100.7'], trusted), '198.51.100.7');
});
