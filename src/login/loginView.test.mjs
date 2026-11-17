import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loginMessage, loginPageState } from './loginView.js';

const q = (query) => new URLSearchParams(query);

test('notices from the server guard and errors from Better Auth become Indonesian messages', () => {
  assert.deepEqual(loginMessage(q('notice=banned')), { tone: 'error', text: 'Akun ini diblokir. Hubungi admin bila menurutmu ini keliru.' });
  assert.equal(loginMessage(q('notice=session')).tone, 'warn');
  assert.match(loginMessage(q('error=access_denied')).text, /dibatalkan/);
  assert.match(loginMessage(q('error=state_mismatch')).text, /coba lagi/);
  assert.equal(loginMessage(q('error=brand_new_code')).text, 'Gagal masuk. Silakan coba lagi.');
  assert.equal(loginMessage(q('error=access_denied&notice=session')).tone, 'error', 'an error outranks a notice');
  assert.equal(loginMessage(q('notice=unknown')), null);
  assert.equal(loginMessage(q('')), null);
});

test('page state: not configured lists names, a signed-in visitor goes to the map, everyone else signs in', () => {
  assert.deepEqual(loginPageState({ authenticated: false, configured: false, missing: ['GOOGLE_CLIENT_ID'], invalid: ['BETTER_AUTH_URL'] }), {
    view: 'not-configured', missing: ['GOOGLE_CLIENT_ID'], invalid: ['BETTER_AUTH_URL'],
  });
  assert.deepEqual(loginPageState({ authenticated: true, configured: true, status: 'pending' }), { view: 'redirect', location: '/' });
  assert.deepEqual(loginPageState({ authenticated: true, configured: true, status: 'banned' }), { view: 'sign-in' });
  assert.deepEqual(loginPageState({ authenticated: false, configured: true }), { view: 'sign-in' });
  assert.deepEqual(loginPageState(null), { view: 'sign-in' });
});
