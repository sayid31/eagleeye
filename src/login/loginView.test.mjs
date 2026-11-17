import { test } from 'node:test';
import assert from 'node:assert/strict';
import { afterSignInLocation, loginMessage, loginPageState, showGoogleButton, signInErrorText } from './loginView.js';

const q = (query) => new URLSearchParams(query);
const signedIn = (role, home, extra = {}) => ({ configured: true, signedIn: true, home, googleSignIn: false, user: { role, mustChangePassword: false, ...extra } });

test('loginPageState: not configured (no env names), signed in → next or home, otherwise the form', () => {
  assert.deepEqual(loginPageState({ configured: false, signedIn: false }, q('')), { view: 'not-configured' });
  assert.deepEqual(loginPageState(signedIn('admin', '/admin'), q('')), { view: 'redirect', location: '/admin' });
  assert.deepEqual(loginPageState(signedIn('user', '/app'), q('next=/app?welcome=1')), { view: 'redirect', location: '/app?welcome=1' });
  assert.deepEqual(loginPageState(signedIn('user', '/app'), q('next=//evil.example')), { view: 'redirect', location: '/app' });
  assert.deepEqual(loginPageState({ configured: true, signedIn: false }, q('')), { view: 'sign-in' });
  assert.deepEqual(loginPageState(null, q('')), { view: 'sign-in' });
});

test('afterSignInLocation: a forced password change wins over next', () => {
  assert.equal(afterSignInLocation(q('next=/dev'), signedIn('super_admin', '/dev', { mustChangePassword: true })), '/account/password');
});

test('Google button: only with next=/dev… and Google configured', () => {
  const me = { configured: true, signedIn: false, googleSignIn: true };
  assert.equal(showGoogleButton(q('next=/dev'), me), true);
  assert.equal(showGoogleButton(q('next=/dev/keys'), me), true);
  assert.equal(showGoogleButton(q(''), me), false);
  assert.equal(showGoogleButton(q('next=/devices'), me), false);
  assert.equal(showGoogleButton(q('next=/admin'), me), false);
  assert.equal(showGoogleButton(q('next=/dev'), { ...me, googleSignIn: false }), false);
});

test('messages: notices, Google errors, sign-in codes in Indonesian; unknown → generic', () => {
  assert.equal(loginMessage(q('notice=session')).tone, 'warn');
  assert.match(loginMessage(q('next=/dev&notice=google&error=GOOGLE_NOT_ALLOWED')).text, /tidak terdaftar/);
  assert.equal(signInErrorText('INVALID_EMAIL_OR_PASSWORD'), 'Email atau password salah.');
  assert.equal(signInErrorText('ACCOUNT_DISABLED'), 'Akun dinonaktifkan, hubungi admin.');
  assert.equal(signInErrorText('whatever'), 'Gagal masuk. Silakan coba lagi.');
  assert.equal(loginMessage(q('')), null);
});
