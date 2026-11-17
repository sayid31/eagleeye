import { test } from 'node:test';
import assert from 'node:assert/strict';
import { changePassword, fetchMe, signInWithPassword, signOutAndLeave, startGoogleSignIn } from './authClientApi.js';

const reply = (status, body) => async () => ({ ok: status >= 200 && status < 300, status, json: async () => body });
function recorder(status, body) {
  const calls = [];
  const fetchFn = async (url, init) => { calls.push({ url, init }); return reply(status, body)(); };
  return { calls, fetchFn };
}

test('signInWithPassword posts JSON to the allowlisted endpoint and maps refusals to codes', async () => {
  const ok = recorder(200, {});
  assert.deepEqual(await signInWithPassword({ email: 'a@b.cd', password: 'p' }, ok.fetchFn), { ok: true });
  assert.equal(ok.calls[0].url, '/api/auth/sign-in/email');
  assert.deepEqual(JSON.parse(ok.calls[0].init.body), { email: 'a@b.cd', password: 'p', rememberMe: true });
  assert.deepEqual(await signInWithPassword({ email: 'a', password: 'b' }, reply(401, { code: 'INVALID_EMAIL_OR_PASSWORD' })), { ok: false, status: 401, code: 'INVALID_EMAIL_OR_PASSWORD' });
  assert.equal((await signInWithPassword({ email: 'a', password: 'b' }, reply(429, {}))).code, 'RATE_LIMITED');
});

test('changePassword and fetchMe', async () => {
  assert.deepEqual(await changePassword({ currentPassword: 'a', newPassword: 'b' }, reply(400, { code: 'PASSWORD_WEAK' })), { ok: false, status: 400, code: 'PASSWORD_WEAK' });
  assert.deepEqual(await fetchMe(reply(200, { signedIn: false })), { signedIn: false });
  await assert.rejects(fetchMe(reply(503, {})), /HTTP 503/);
});

test('startGoogleSignIn sends only the provider (the server fixes the return URLs)', async () => {
  const google = recorder(200, { url: 'https://accounts.google.com/o' });
  let went = null;
  await startGoogleSignIn({ fetchFn: google.fetchFn, assign: (url) => { went = url; } });
  assert.deepEqual(JSON.parse(google.calls[0].init.body), { provider: 'google' });
  assert.equal(went, 'https://accounts.google.com/o');
  await assert.rejects(startGoogleSignIn({ fetchFn: reply(404, { code: 'PROVIDER_NOT_FOUND' }), assign: () => {} }), /PROVIDER_NOT_FOUND/);
});

test('signOutAndLeave always ends on /login', async () => {
  let went = null;
  const warn = console.warn;
  console.warn = () => {};
  try {
    await signOutAndLeave({ fetchFn: reply(500, {}), assign: (url) => { went = url; } });
  } finally {
    console.warn = warn;
  }
  assert.equal(went, '/login');
});
