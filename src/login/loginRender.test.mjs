// Render tests (react-dom/server): the a11y structure of the auth pages — labels bound to inputs, role=alert, aria-pressed
// on the show-password toggle, autocomplete tokens, one <h1>, and the Google button only when it is allowed.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createJsxLoader } from '../testing/jsxLoader.mjs';
import { PASSWORD_MIN_USER } from '../auth/passwordPolicy.mjs';

const loader = await createJsxLoader();
after(() => loader.close());
const load = (name) => loader.load(`src/login/${name}.jsx`);
const render = (element) => renderToStaticMarkup(element);
const noop = () => {};
const labelFor = (html, text) => {
  const id = new RegExp(`<label[^>]*for="([^"]+)"[^>]*>${text}`).exec(html)?.[1];
  assert.ok(id, `a <label for> reads "${text}"`);
  assert.match(html, new RegExp(`<input[^>]*\\sid="${id.replace(/:/g, '\\:')}"`), `the input with id ${id} exists`);
  return id;
};
const tag = (html, name) => new RegExp(`<input[^>]*name="${name}"[^>]*>`).exec(html)?.[0] ?? '';

test('LoginForm: labelled email + password, correct autocomplete, autofocus on email, paste not blocked, submit in the form', async () => {
  const { LoginForm } = await load('LoginForm');
  const html = render(h(LoginForm, { message: null, error: null, busy: null, onSubmit: noop, onGoogle: null }));
  labelFor(html, 'Email');
  labelFor(html, 'Password');
  const email = tag(html, 'email');
  assert.match(email, /autoComplete="username"|autocomplete="username"/i);
  assert.match(email, /type="email"/);
  assert.match(tag(html, 'password'), /autocomplete="current-password"/i);
  assert.doesNotMatch(html, /onpaste|autocomplete="off"/i, 'paste and password managers stay allowed');
  assert.match(html, /<form[^>]*novalidate/i, 'Indonesian inline messages instead of browser bubbles');
  assert.match(html, /<button[^>]*type="submit"[^>]*>(?:(?!<\/button>).)*Masuk<\/button>/);
  assert.match(html, /aria-pressed="false"[^>]*aria-label="Tampilkan password"|aria-label="Tampilkan password"[^>]*aria-pressed="false"/);
  assert.doesNotMatch(html, /role="alert"/, 'no banner without a message');
  assert.doesNotMatch(html, /Masuk dengan Google/, 'Google only when allowed');
  assert.match(html, /Lupa password\?/);
});

test('LoginForm: a refusal renders one role=alert banner and flags the password field when retrying it is the fix', async () => {
  const { LoginForm } = await load('LoginForm');
  const html = render(h(LoginForm, { message: null, error: { code: 'INVALID_EMAIL_OR_PASSWORD', text: 'Incorrect email or password.' }, busy: null, onSubmit: noop, onGoogle: null }));
  assert.equal((html.match(/role="alert"/g) ?? []).length, 1);
  assert.match(html, /<div[^>]*role="alert"[^>]*tabindex="-1"[^>]*>|<div[^>]*tabindex="-1"[^>]*role="alert"[^>]*>/i, 'focusable banner');
  assert.match(html, /Email atau password salah\./);
  assert.match(tag(html, 'password'), /\saria-invalid="true"/);
  assert.match(tag(html, 'password'), /aria-describedby="[^"]*login-alert/);
  const other = render(h(LoginForm, { message: null, error: { code: 'ACCOUNT_DISABLED', text: 'Account deactivated, contact an admin.' }, busy: null, onSubmit: noop, onGoogle: null }));
  assert.doesNotMatch(tag(other, 'password'), /\saria-invalid=/);
});

test('LoginForm: pending state disables the buttons, marks them busy and keeps the label; Google button + separator when allowed', async () => {
  const { LoginForm } = await load('LoginForm');
  const html = render(h(LoginForm, { message: { tone: 'warn', text: 'Session ended. Please sign in again.' }, error: null, busy: 'password', onSubmit: noop, onGoogle: noop }));
  assert.match(html, /<button[^>]*type="submit"[^>]*disabled=""[^>]*aria-busy="true"|<button[^>]*aria-busy="true"[^>]*disabled=""[^>]*type="submit"|<button[^>]*disabled=""[^>]*type="submit"/);
  assert.match(html, /readonly=""/i, 'inputs keep focus (read-only), they are not disabled');
  assert.match(html, /Masuk<\/button>/);
  assert.match(html, /Memproses…/);
  assert.match(html, /Masuk dengan Google/);
  assert.match(html, />atau</);
  assert.match(html, /Sesi berakhir/);
});

test('LoginApp: the card has exactly one <h1>, the title, the way back home and no form while loading', async () => {
  const { LoginApp } = await load('LoginApp');
  const { MemoryRouter } = await import('react-router');
  const { ThemeProvider } = await loader.load('src/lib/theme.jsx');
  const html = render(h(ThemeProvider, null, h(MemoryRouter, null, h(LoginApp))));
  assert.equal((html.match(/<h1/g) ?? []).length, 1);
  assert.match(html, /Masuk ke EagleEye View/);
  assert.match(html, /<main id="main-content"/);
  assert.match(html, /href="\/"[^>]*>(?:(?!<\/a>).)*Kembali ke beranda/);
  assert.match(html, /role="status"/);
  assert.match(html, /aria-busy="true"/);
  assert.doesNotMatch(html, /<form/, 'the form waits for /api/me');
});

test('PasswordChangeForm: three labelled fields with the right autocomplete, requirement list from the shared minimum', async () => {
  const { PasswordChangeForm } = await load('PasswordChangeForm');
  const html = render(h(PasswordChangeForm, { identity: { email: 'budi@example.test', name: 'Budi', role: 'user' }, onChanged: noop }));
  labelFor(html, 'Current password');
  labelFor(html, 'New password');
  labelFor(html, 'Repeat new password');
  assert.match(tag(html, 'current'), /autocomplete="current-password"/i);
  assert.match(tag(html, 'next'), /autocomplete="new-password"/i);
  assert.match(tag(html, 'confirm'), /autocomplete="new-password"/i);
  assert.match(html, new RegExp(`Minimal ${PASSWORD_MIN_USER} karakter<span class="sr-only">: belum terpenuhi`));
  assert.match(html, /<ul[^>]*aria-label="Syarat password baru"/);
  const listId = /<ul id="([^"]+)"/.exec(html)[1];
  assert.ok(tag(html, 'next').includes(listId), 'the new-password input points at its requirement list');
  assert.equal((html.match(/aria-pressed="false"/g) ?? []).length, 3, 'one show/hide toggle per field');
});

test('BrandMark: painted with currentColor (never the fixed cyan) and its tint token clears 3:1 on the card in both themes', async () => {
  const { BrandMark } = await load('BrandMark');
  const html = render(h(BrandMark, { className: 'text-primary' }));
  assert.match(html, /fill="currentColor"/);
  assert.match(html, /aria-hidden="true"/);
  assert.doesNotMatch(html, /#00d4ff/i);
  const { checkTokenContrast } = await import('../../scripts/ui-contrast.mjs');
  const rows = checkTokenContrast().rows.filter((row) => row.fg === 'primary' && row.bg === 'card' && row.kind === 'ui');
  assert.deepEqual(rows.map((row) => row.theme).sort(), ['dark', 'light']);
  for (const row of rows) assert.ok(row.ratio >= 3, `${row.theme}: ${row.ratio}`);
});
