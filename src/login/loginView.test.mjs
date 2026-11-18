import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findGlossaryViolations } from '../copy/id/glossary.js';
import { LOGIN_COPY, LOGIN_NOTICES, SIGN_IN_ERRORS, SIGN_IN_GENERIC_ERROR } from '../copy/id/login.js';
import { MAX_NEXT_HASH_LENGTH, afterSignInLocation, loginFieldProblems, loginMessage, loginPageState, nextWithHash, showGoogleButton, signInErrorText, signInFocusTarget } from './loginView.js';

const q = (query) => new URLSearchParams(query);
const signedIn = (role, home, extra = {}) => ({ configured: true, signedIn: true, home, googleSignIn: false, user: { role, mustChangePassword: false, ...extra } });

test('loginPageState: not configured → no form; signed in → role home (not next); otherwise the form', () => {
  assert.deepEqual(loginPageState({ configured: false, signedIn: false }), { view: 'not-configured' });
  assert.deepEqual(loginPageState(signedIn('admin', '/admin')), { view: 'redirect', location: '/admin' });
  assert.deepEqual(loginPageState(signedIn('super_admin', '/dev')), { view: 'redirect', location: '/dev' });
  assert.deepEqual(loginPageState(signedIn('user', '/app', { mustChangePassword: true })), { view: 'redirect', location: '/account/password' });
  assert.deepEqual(loginPageState({ configured: true, signedIn: false }), { view: 'sign-in' });
  assert.deepEqual(loginPageState(null), { view: 'sign-in' });
});

test('nextWithHash: valid next keeps the share hash; refused next drops both', () => {
  assert.equal(nextWithHash(q('next=/app'), '#cam=1,2,3&layers=adsb'), '/app#cam=1,2,3&layers=adsb');
  assert.equal(nextWithHash(q('next=/app?welcome=1'), '#v=2'), '/app?welcome=1#v=2');
  assert.equal(nextWithHash(q('next=/app'), ''), '/app');
  assert.equal(nextWithHash(q('next=/app'), '#'), '/app', 'a bare # adds nothing');
  assert.equal(nextWithHash(q('next=/app'), 'no-hash-sign'), '/app');
  assert.equal(nextWithHash(q('next=/app'), `#${'x'.repeat(MAX_NEXT_HASH_LENGTH)}`), '/app', 'over-long hash dropped');
  assert.equal(nextWithHash(q('next=/app'), '#a\u0000b'), '/app', 'control characters dropped');
  for (const bad of ['//evil.example', '/\\evil.example', '/%2fevil', 'https://evil.example/app', '/elsewhere', '/app/../admin']) {
    assert.equal(nextWithHash(q(`next=${encodeURIComponent(bad)}`), '#x=1'), null, bad);
  }
  assert.equal(nextWithHash(q(''), '#x=1'), null, 'no next → the hash belongs to /login, not carried');
});

test('afterSignInLocation: forced change wins; else next+hash; else home', () => {
  assert.equal(afterSignInLocation(q('next=/dev'), signedIn('super_admin', '/dev', { mustChangePassword: true }), '#x'), '/account/password');
  assert.equal(afterSignInLocation(q('next=/app'), signedIn('user', '/app'), '#share=abc'), '/app#share=abc');
  assert.equal(afterSignInLocation(q('next=//evil.example'), signedIn('admin', '/admin'), '#share=abc'), '/admin');
  assert.equal(afterSignInLocation(q(''), signedIn('admin', '/admin')), '/admin');
  assert.equal(afterSignInLocation(q(''), { signedIn: true }), '/app');
});

test('Google button: only with next=/dev… AND googleSignIn from /api/me', () => {
  const me = { configured: true, signedIn: false, googleSignIn: true };
  assert.equal(showGoogleButton(q('next=/dev'), me), true);
  assert.equal(showGoogleButton(q('next=/dev/keys'), me), true);
  assert.equal(showGoogleButton(q('next=/dev?tab=1'), me), true);
  assert.equal(showGoogleButton(q(''), me), false);
  assert.equal(showGoogleButton(q('next=/devices'), me), false);
  assert.equal(showGoogleButton(q('next=/admin'), me), false);
  assert.equal(showGoogleButton(q('next=/app'), me), false);
  assert.equal(showGoogleButton(q('next=//dev'), me), false);
  assert.equal(showGoogleButton(q('next=/dev'), { ...me, googleSignIn: false }), false);
  assert.equal(showGoogleButton(q('next=/dev'), null), false);
});

test('signInErrorText: every outcome in Indonesian; wrong/throttled share one generic text', () => {
  assert.equal(signInErrorText('INVALID_EMAIL_OR_PASSWORD'), 'Email atau password salah.');
  assert.equal(signInErrorText('INVALID_EMAIL'), signInErrorText('INVALID_EMAIL_OR_PASSWORD'));
  assert.equal(signInErrorText('ACCOUNT_DISABLED'), 'Akun dinonaktifkan, hubungi admin.');
  assert.equal(signInErrorText('GOOGLE_SIGN_IN_REQUIRED'), 'Akun ini masuk lewat Google.');
  assert.match(signInErrorText('RATE_LIMITED'), /Terlalu banyak percobaan/);
  assert.match(signInErrorText('NETWORK'), /tidak bisa dihubungi/);
  assert.equal(signInErrorText('whatever'), SIGN_IN_GENERIC_ERROR);
  assert.equal(signInErrorText('toString'), SIGN_IN_GENERIC_ERROR, 'prototype keys are not codes');
  assert.ok(Object.isFrozen(SIGN_IN_ERRORS));
});

test('loginMessage: session notice; Google refusals always generic whatever the error code', () => {
  assert.deepEqual(loginMessage(q('notice=session')), LOGIN_NOTICES.session);
  assert.equal(LOGIN_NOTICES.session.tone, 'warn');
  for (const error of ['GOOGLE_NOT_ALLOWED', 'account_not_linked', 'ACCOUNT_DISABLED', 'state_mismatch', '']) {
    assert.deepEqual(loginMessage(q(`next=/dev&notice=google&error=${error}`)), LOGIN_NOTICES.google, error);
  }
  assert.doesNotMatch(LOGIN_NOTICES.google.text, /password|dinonaktifkan/i, 'reveals nothing about the account');
  assert.deepEqual(loginMessage(q('error=ACCOUNT_DISABLED')), { tone: 'error', text: 'Akun dinonaktifkan, hubungi admin.' });
  assert.equal(loginMessage(q('notice=bogus')), null);
  assert.equal(loginMessage(q('')), null);
});
