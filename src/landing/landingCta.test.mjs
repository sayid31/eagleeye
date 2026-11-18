import test from 'node:test';
import assert from 'node:assert/strict';
import { landingCta, LANDING_ROUTES } from './landingCta.js';

const me = (role, extra = {}) => ({
  configured: true,
  signedIn: true,
  user: { id: 'u1', name: 'Uji', email: 'uji@example.test', role, mustChangePassword: false, capabilities: {}, ...extra },
  home: '/app',
});
const labels = (cta) => [cta.primary.label, ...cta.secondary.map((item) => item.label)];
const SIGN_OUT = { label: 'Sign out', action: 'sign-out' };

test('signed out, unconfigured, failed and malformed /api/me all show "Masuk" with no secondary', () => {
  const signedOut = { primary: { label: 'Sign in', href: '/login' }, secondary: [] };
  assert.deepEqual(landingCta({ configured: true, signedIn: false, home: '/' }), signedOut);
  assert.deepEqual(landingCta({ configured: false, signedIn: false }), signedOut);
  assert.deepEqual(landingCta(null), signedOut, 'fetch failure or timeout');
  assert.deepEqual(landingCta(undefined), signedOut);
  assert.deepEqual(landingCta({ configured: true, signedIn: true }), signedOut, 'signedIn without a user');
  assert.deepEqual(landingCta({ ...me('admin'), configured: false }), signedOut, 'unconfigured wins over a stray user');
});

test('an unknown or prototype-named role falls back to "Masuk" instead of throwing', () => {
  assert.equal(landingCta(me('guest')).primary.label, 'Sign in');
  assert.equal(landingCta(me('toString')).primary.label, 'Sign in');
  assert.equal(landingCta(me(undefined)).primary.href, '/login');
});

test('user → Buka Konsol, with Akun and Keluar', () => {
  assert.deepEqual(landingCta(me('user')), {
    primary: { label: 'Open Console', href: '/app' },
    secondary: [{ label: 'Account', href: '/account' }, SIGN_OUT],
  });
});

test('admin → Panel Admin, with Buka Konsol and Keluar', () => {
  assert.deepEqual(landingCta(me('admin')), {
    primary: { label: 'Panel Admin', href: '/admin' },
    secondary: [{ label: 'Open Console', href: '/app' }, SIGN_OUT],
  });
});

test('super_admin → Developer Console, with Panel Admin, Konsol and Keluar', () => {
  assert.deepEqual(landingCta(me('super_admin')), {
    primary: { label: 'Developer Console', href: '/dev' },
    secondary: [{ label: 'Panel Admin', href: '/admin' }, { label: 'Konsol', href: '/app' }, SIGN_OUT],
  });
});

test('mustChangePassword outranks every role: Ganti Password + Keluar only', () => {
  for (const role of ['user', 'admin', 'super_admin']) {
    assert.deepEqual(landingCta(me(role, { mustChangePassword: true })), {
      primary: { label: 'Ganti Password', href: '/account/password' },
      secondary: [SIGN_OUT],
    }, role);
  }
});

test('"Minta akses" appears only for signed-out visitors and only when a contact is configured', () => {
  const contact = 'mailto:akses@example.test';
  assert.deepEqual(landingCta(null, { accessContact: contact }).secondary, [{ label: 'Request access', href: contact }]);
  assert.deepEqual(landingCta(null, { accessContact: null }).secondary, []);
  assert.deepEqual(landingCta(null, { accessContact: '' }).secondary, []);
  assert.deepEqual(labels(landingCta(me('user'), { accessContact: contact })), ['Open Console', 'Account', 'Sign out']);
});

test('no row ever offers a sign-up button', () => {
  const states = [null, me('user'), me('admin'), me('super_admin'), me('user', { mustChangePassword: true })];
  for (const state of states) assert.ok(!labels(landingCta(state, { accessContact: 'https://example.test' })).includes('Daftar'));
});

test('returned objects are copies: mutating one result does not leak into the next', () => {
  const first = landingCta(me('admin'));
  first.primary.label = 'X';
  first.secondary.push({ label: 'Y', href: '/y' });
  first.secondary[1].label = 'Z';
  assert.deepEqual(labels(landingCta(me('admin'))), ['Panel Admin', 'Open Console', 'Sign out']);
  assert.equal(LANDING_ROUTES.app, '/app');
  assert.ok(Object.isFrozen(LANDING_ROUTES));
});
