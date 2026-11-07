import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fetchSession, loginErrorMessage, logout } from './adminSessionApi.js';

test('known error codes map to messages; unknown codes fall back; none gives null', () => {
  assert.match(loginErrorMessage('not_admin'), /bukan akun admin/);
  assert.match(loginErrorMessage('something_new'), /Gagal masuk/);
  assert.equal(loginErrorMessage(null), null);
});

test('fetchSession returns the server JSON and throws on HTTP errors', async () => {
  const body = { configured: true, authenticated: false };
  assert.deepEqual(await fetchSession(async () => ({ ok: true, json: async () => body })), body);
  await assert.rejects(fetchSession(async () => ({ ok: false, status: 500 })), /HTTP 500/);
});

test('logout posts JSON with the session cookie and throws on failure', async () => {
  let seen;
  await logout(async (url, init) => { seen = { url, init }; return { ok: true }; });
  assert.equal(seen.url, '/api/admin/auth/logout');
  assert.equal(seen.init.method, 'POST');
  assert.equal(seen.init.headers['Content-Type'], 'application/json');
  await assert.rejects(logout(async () => ({ ok: false, status: 401 })), /HTTP 401/);
});
