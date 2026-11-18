import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFormDefaults, createFormReady, createPayload, editPayload, handoverMessage, passwordRequirements } from './userFormView.js';

test('create form: owner defaults (layers + ai ON, premium OFF, generated password, role user)', () => {
  assert.deepEqual(createFormDefaults(), {
    email: '', name: '', role: 'user', capabilities: { layers: true, ai: true, premium: false }, passwordMode: 'generate', password: '',
  });
  const form = createFormDefaults();
  form.capabilities.premium = true;
  assert.equal(createFormDefaults().capabilities.premium, false, 'defaults are a fresh copy');
});

test('createPayload: generate vs typed; role only when the area manages roles; toggles only for users', () => {
  const form = { ...createFormDefaults(), email: ' a@example.test ', name: ' Ani ' };
  assert.deepEqual(createPayload(form, false), { email: 'a@example.test', name: 'Ani', capabilities: { layers: true, ai: true, premium: false }, generate: true });
  assert.deepEqual(createPayload({ ...form, role: 'admin', passwordMode: 'typed', password: 'p'.repeat(15) }, true),
    { email: 'a@example.test', name: 'Ani', role: 'admin', password: 'p'.repeat(15) });
  assert.equal(createPayload({ ...form, role: 'admin' }, false).role, undefined, 'a role picked outside /dev is never sent');
});

test('createFormReady: needs an email, a name and, for a typed password, every requirement met', () => {
  const form = { ...createFormDefaults(), email: 'a@example.test', name: 'Ani' };
  assert.equal(createFormReady(form, false), true);
  assert.equal(createFormReady({ ...form, email: 'nope' }, false), false);
  assert.equal(createFormReady({ ...form, name: '  ' }, false), false);
  const typed = { ...form, passwordMode: 'typed', password: 'short' };
  assert.equal(createFormReady(typed, false), false);
  assert.equal(createFormReady({ ...typed, password: 'x'.repeat(12) }, false), true, 'users need 12');
  assert.equal(createFormReady({ ...typed, role: 'admin', password: 'x'.repeat(12) }, true), false, 'admins need 15');
  assert.equal(createFormReady({ ...typed, role: 'admin', password: 'x'.repeat(15) }, true), true);
});

test('editPayload: only changed, permitted fields; the three toggles always go together; null when unchanged', () => {
  const current = { name: 'Ani', email: 'ani@example.test', capabilities: { layers: true, ai: true, premium: false } };
  const all = { name: true, email: true, capabilities: true };
  assert.equal(editPayload(current, { ...current, capabilities: { ...current.capabilities } }, all), null);
  assert.equal(editPayload(current, { ...current, email: ' ANI@example.test ' }, all), null, 'email compares normalized');
  assert.deepEqual(editPayload(current, { ...current, name: ' Ani B ' }, all), { name: 'Ani B' });
  assert.deepEqual(editPayload(current, { ...current, capabilities: { layers: true, ai: false, premium: false } }, all), { capabilities: { layers: true, ai: false, premium: false } });
  assert.equal(editPayload(current, { name: 'Lain', email: 'lain@example.test', capabilities: current.capabilities }, { name: true, email: false, capabilities: false }).email, undefined, 'not permitted → not sent');
});

test('passwordRequirements: role length, upper bound and identity are checked live', () => {
  const met = (input) => Object.fromEntries(passwordRequirements(input).map((item) => [item.id, item.met]));
  assert.deepEqual(met({ password: '', role: 'user' }), { min: false, max: true, identity: true });
  assert.deepEqual(met({ password: 'x'.repeat(12), role: 'user' }), { min: true, max: true, identity: true });
  assert.equal(met({ password: 'x'.repeat(12), role: 'admin' }).min, false);
  assert.equal(met({ password: 'x'.repeat(129), role: 'user' }).max, false);
  assert.equal(met({ password: 'ani@example.test', role: 'user', email: 'ani@example.test' }).identity, false);
  assert.match(passwordRequirements({ password: '', role: 'admin' })[0].label, /15 karakter/);
});

test('handoverMessage: Indonesian, login URL from the origin, email, temp password, must-change note', () => {
  const text = handoverMessage({ origin: 'https://eagle-eye.example.test/', email: 'ani@example.test', password: 'Tmp9xYzAbc' });
  assert.equal(text, [
    'Your EagleEye account has been created.',
    '',
    'Alamat login: https://eagle-eye.example.test/login',
    'Email: ani@example.test',
    'Password sementara: Tmp9xYzAbc',
    '',
    'Note: this password must be changed at first login. Do not share this message with anyone else.',
  ].join('\n'));
  assert.match(handoverMessage({ origin: 'http://localhost:4173', email: 'a@b.test', password: 'x', reset: true }), /^Password akun EagleEye Anda sudah direset\.\n\nAlamat login: http:\/\/localhost:4173\/login/);
});
