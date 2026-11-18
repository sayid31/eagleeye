import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MAX_NAME_LENGTH } from '../auth/authHooks.mjs';
import { MAX_NAME_LENGTH_CLIENT, fetchSessionUser, revokeOtherSessions, updateDisplayName } from './accountApi.js';
import { accountPageState, accountTab, backLinkFor, hasPasswordSignIn, nameProblem, roleLabel } from './accountView.js';
import { ACCOUNT_COPY } from '../copy/en/login.js';

const me = (user = {}) => ({ configured: true, signedIn: true, home: '/admin', googleSignIn: false, user: { role: 'admin', mustChangePassword: false, ...user } });

test('hasPasswordSignIn: any recorded setter means a password; a Google-created account has none', () => {
  for (const setBy of ['cli', 'admin', 'self']) assert.equal(hasPasswordSignIn({ passwordSetBy: setBy }), true, setBy);
  for (const user of [{ passwordSetBy: null }, { passwordSetBy: '' }, {}, null, undefined]) assert.equal(hasPasswordSignIn(user), false);
});

test('accountPageState: no session → login with notice; forced change → /account/password; Google-only hides password', () => {
  assert.deepEqual(accountPageState({ configured: true, signedIn: false }, null), { view: 'redirect', location: '/login?next=%2Faccount&notice=session' });
  assert.deepEqual(accountPageState(me({ mustChangePassword: true }), { passwordSetBy: 'admin' }), { view: 'redirect', location: '/account/password' });
  assert.deepEqual(accountPageState(me(), { passwordSetBy: 'self' }), { view: 'account', showPassword: true, home: '/admin' });
  assert.deepEqual(accountPageState(me({ role: 'super_admin' }), { passwordSetBy: null }), { view: 'account', showPassword: false, home: '/admin' });
});

test('nameProblem mirrors the server rule (trimmed, 1–80)', () => {
  assert.equal(MAX_NAME_LENGTH_CLIENT, MAX_NAME_LENGTH, 'client limit tracks the update-user hook');
  assert.equal(nameProblem('  Budi  '), null);
  assert.equal(nameProblem('   '), ACCOUNT_COPY.nameRequired);
  assert.equal(nameProblem('x'.repeat(80)), null);
  assert.equal(nameProblem('x'.repeat(81)), 'Nama maksimal 80 karakter.');
});

test('roleLabel: Indonesian role names, unknown passes through', () => {
  assert.equal(roleLabel('user'), 'Pengguna');
  assert.equal(roleLabel('admin'), 'Admin');
  assert.match(roleLabel('super_admin'), /Developer/);
  assert.equal(roleLabel('auditor'), 'auditor');
});

test('accountApi: update-user sends the trimmed name only; refusals come back as codes', async () => {
  const calls = [];
  const fake = (status, body) => async (url, init) => {
    calls.push({ url, init });
    return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  };
  assert.deepEqual(await updateDisplayName('  Budi Baru ', fake(200, { status: true })), { ok: true });
  assert.equal(calls[0].url, '/api/auth/update-user');
  assert.deepEqual(JSON.parse(calls[0].init.body), { name: 'Budi Baru' });
  assert.deepEqual(await revokeOtherSessions(fake(403, { error: 'PASSWORD_CHANGE_REQUIRED' })), { ok: false, status: 403, code: 'PASSWORD_CHANGE_REQUIRED' });
  assert.equal(calls[1].url, '/api/auth/revoke-other-sessions');
  assert.equal(calls[1].init.method, 'POST');
  assert.deepEqual(await fetchSessionUser(fake(200, { user: { id: 'u1', passwordSetBy: 'cli' } })), { id: 'u1', passwordSetBy: 'cli' });
  assert.equal(await fetchSessionUser(fake(200, null)), null);
  await assert.rejects(fetchSessionUser(fake(500, {})), /HTTP 500/);
});

test('backLinkFor names where the way back goes: map, Admin or Developer', () => {
  assert.deepEqual(backLinkFor('/app'), { href: '/app', label: 'Kembali ke peta' });
  assert.deepEqual(backLinkFor('/admin'), { href: '/admin', label: 'Kembali ke Admin' });
  assert.deepEqual(backLinkFor('/dev'), { href: '/dev', label: 'Kembali ke Developer' });
  assert.deepEqual(backLinkFor('/dev/users'), { href: '/dev/users', label: 'Kembali ke Developer' });
  assert.deepEqual(backLinkFor('/devices'), { href: '/devices', label: 'Kembali ke peta' }, 'only /dev and /dev/… are Developer');
  assert.deepEqual(backLinkFor(''), { href: '/app', label: 'Kembali ke peta' });
});

test('accountTab: ?tab=security opens Keamanan, anything else the profile', () => {
  assert.equal(accountTab(new URLSearchParams('tab=security')), 'security');
  assert.equal(accountTab(new URLSearchParams('tab=profile')), 'profile');
  assert.equal(accountTab(new URLSearchParams('tab=constructor')), 'profile');
  assert.equal(accountTab(new URLSearchParams('')), 'profile');
});
