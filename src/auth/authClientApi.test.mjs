import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fetchMe, signOut, signOutAndLeave, startGoogleSignIn } from './authClientApi.js';

const ok = (body) => ({ ok: true, status: 200, json: async () => body });

test('fetchMe returns the payload and throws with the status on failure', async () => {
  const me = { authenticated: true, role: 'user', status: 'pending' };
  let seen;
  assert.deepEqual(await fetchMe(async (url, init) => { seen = { url, init }; return ok(me); }), me);
  assert.equal(seen.url, '/api/me');
  assert.equal(seen.init.credentials, 'same-origin');
  await assert.rejects(fetchMe(async () => ({ ok: false, status: 503 })), /HTTP 503/);
});

test('startGoogleSignIn posts the Google provider with relative callbacks and follows the URL', async () => {
  let seen;
  const assigned = [];
  await startGoogleSignIn({
    fetchFn: async (url, init) => { seen = { url, init }; return ok({ url: 'https://accounts.google.com/o/oauth2/v2/auth?x=1', redirect: true }); },
    assign: (url) => assigned.push(url),
  });
  assert.equal(seen.url, '/api/auth/sign-in/social');
  assert.equal(seen.init.method, 'POST');
  assert.deepEqual(JSON.parse(seen.init.body), { provider: 'google', callbackURL: '/', errorCallbackURL: '/login' });
  assert.deepEqual(assigned, ['https://accounts.google.com/o/oauth2/v2/auth?x=1']);
  await assert.rejects(
    startGoogleSignIn({ fetchFn: async () => ({ ok: false, status: 403, json: async () => ({ code: 'ORIGIN_NOT_ALLOWED' }) }), assign: () => {} }),
    /HTTP 403 ORIGIN_NOT_ALLOWED/,
  );
});

test('signOut posts JSON; signOutAndLeave always ends on /login', async () => {
  let seen;
  await signOut(async (url, init) => { seen = { url, init }; return ok({ success: true }); });
  assert.equal(seen.url, '/api/auth/sign-out');
  assert.equal(seen.init.headers['Content-Type'], 'application/json');
  const assigned = [];
  const warn = console.warn;
  console.warn = () => {};
  try {
    await signOutAndLeave({ fetchFn: async () => ({ ok: false, status: 500 }), assign: (url) => assigned.push(url) });
  } finally { console.warn = warn; }
  assert.deepEqual(assigned, ['/login']);
});
