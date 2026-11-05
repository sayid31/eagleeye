import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createToken, parseCookies, safeEqual, serializeCookie, verifyToken } from './adminSession.mjs';

const SECRET = 'a'.repeat(32); // test-only
const base = { secret: SECRET, ttlMs: 1000, now: 10_000 };

test('a fresh token verifies and carries its claims', () => {
  const token = createToken({ email: 'a@b.co' }, { ...base, kind: 'session' });
  assert.equal(verifyToken(token, { kind: 'session', secret: SECRET, now: 10_500 }).email, 'a@b.co');
});

test('expired, forged, wrong-secret and wrong-kind tokens are refused', () => {
  const token = createToken({ email: 'a@b.co' }, { ...base, kind: 'session' });
  assert.equal(verifyToken(token, { kind: 'session', secret: SECRET, now: 11_001 }), null);
  assert.equal(verifyToken(token, { kind: 'session', secret: 'b'.repeat(32), now: 10_500 }), null);
  assert.equal(verifyToken(token, { kind: 'pending', secret: SECRET, now: 10_500 }), null);
  const [body, sig] = token.split('.');
  const forged = Buffer.from(JSON.stringify({ email: 'evil@x.co', kind: 'session', exp: 99_999_999 })).toString('base64url');
  assert.equal(verifyToken(`${forged}.${sig}`, { kind: 'session', secret: SECRET, now: 10_500 }), null);
  assert.equal(verifyToken(`${body}.`, { kind: 'session', secret: SECRET }), null);
});

test('garbage input never throws', () => {
  for (const bad of [undefined, '', 'abc', 'a.b.c', '.', null, 42]) {
    assert.equal(verifyToken(bad, { kind: 'session', secret: SECRET }), null);
  }
});

test('cookies parse and serialize with the security attributes', () => {
  assert.deepEqual(parseCookies('a=1; gev_admin_session=tok; junk'), { a: '1', gev_admin_session: 'tok' });
  assert.deepEqual(parseCookies(undefined), {});
  assert.equal(serializeCookie('n', 'v', { maxAgeSec: 60, secure: true, sameSite: 'Strict' }), 'n=v; Path=/; HttpOnly; SameSite=Strict; Max-Age=60; Secure');
  assert.ok(!serializeCookie('n', 'v', { maxAgeSec: 0, secure: false, sameSite: 'Lax' }).includes('Secure'));
});

test('safeEqual compares by value, including different lengths', () => {
  assert.equal(safeEqual('abc', 'abc'), true);
  assert.equal(safeEqual('abc', 'abd'), false);
  assert.equal(safeEqual('abc', 'abcd'), false);
});
