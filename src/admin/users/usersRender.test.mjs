import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { StaticRouter } from 'react-router';
import { createJsxLoader } from '../../testing/jsxLoader.mjs';

const loader = await createJsxLoader();
after(() => loader.close());
const load = (name) => loader.load(`src/admin/users/${name}.jsx`);
const render = (element) => renderToStaticMarkup(h(StaticRouter, { location: '/users' }, element));

const superMe = { id: 'S1', role: 'super_admin' };
const adminMe = { id: 'A1', role: 'admin' };
const USERS = [
  { id: 'U1', name: 'Sari Lestari', email: 'sari@contoh.test', role: 'user', active: true, throttled: false, mustChangePassword: false, capabilities: { layers: true, ai: false, premium: true }, createdAt: '2026-11-18T01:00:00.000Z' },
  { id: 'U2', name: 'Muhammad Abdurrahman Wijayakusuma Prasetyaningrum', email: 'muhammad.abdurrahman@divisi.contoh.test', role: 'user', active: false, throttled: false, capabilities: { layers: false, ai: false, premium: false }, createdAt: '2026-11-10T01:00:00.000Z' },
  { id: 'S1', name: 'Dev Owner', email: 'dev@example.test', role: 'super_admin', active: true, capabilities: { layers: true, ai: true, premium: true }, createdAt: '2026-11-01T01:00:00.000Z' },
  { id: 'S2', name: 'Other Owner', email: 'other@example.test', role: 'super_admin', active: true, capabilities: { layers: true, ai: true, premium: true }, createdAt: '2026-11-01T01:00:00.000Z' },
];
const props = (extra) => ({ users: USERS, loading: false, error: null, onRetry() {}, me: superMe, area: 'dev', toolbar: null, filtered: false, pagination: { total: 4, limit: 20, offset: 0, onOffsetChange() {}, onLimitChange() {} }, onOpen() {}, ...extra });

test('UsersTable: named table, scoped headers, row menu per account, "Anda" on your own row, both table and card list', async () => {
  const { UsersTable } = await load('UsersTable');
  const html = render(h(UsersTable, props()));
  assert.match(html, /<caption[^>]*sr-only[^>]*>Daftar pengguna<\/caption>/);
  for (const header of ['Users', 'Role', 'Status', 'Permissions', 'Created']) assert.match(html, new RegExp(`scope="col"[^>]*>${header}<`), header);
  assert.match(html, /<span class="sr-only">Aksi<\/span>/, 'actions header is sr-only');
  assert.match(html, /aria-label="Aksi untuk sari@contoh\.test"/);
  assert.match(html, /aria-label="Aksi untuk dev@example\.test"/, 'own row: edit name + sign-out + nothing else, still a menu');
  assert.match(html, /<ul class="grid gap-3 md:hidden" aria-label="Daftar pengguna">/, 'mobile card list');
  assert.equal((html.match(/>Anda</g) ?? []).length >= 2, true, 'the marker shows in table and card');
  assert.match(html, /aria-label="Aksi untuk other@example\.test"/, 'another super_admin still offers its read-only log links');
  assert.match(html, /title="Muhammad Abdurrahman Wijayakusuma Prasetyaningrum"/, 'long names keep the full text in a title');
});

test('UsersTable: capability chips say on/off in words; status badges carry text; /admin hides the role column', async () => {
  const { UsersTable } = await load('UsersTable');
  const html = render(h(UsersTable, props()));
  assert.match(html, /Layer<span class="sr-only">: aktif<\/span>/);
  assert.match(html, /AI<span class="sr-only">: nonaktif<\/span>/);
  assert.match(html, />Nonaktif</);
  assert.match(html, />Semua izin</, 'admins and super admins hold everything');
  const admin = render(h(UsersTable, props({ me: adminMe, area: 'admin', users: [USERS[0]] })));
  assert.doesNotMatch(admin, /scope="col"[^>]*>Role</);
});

test('UsersTable: loading skeleton, empty state with the call to action, filtered empty, error with retry', async () => {
  const { UsersTable } = await load('UsersTable');
  assert.match(render(h(UsersTable, props({ users: [], loading: true }))), /role="status"[^>]*aria-busy="true"/);
  const empty = render(h(UsersTable, props({ users: [] })));
  assert.match(empty, /Belum ada pengguna/);
  assert.match(empty, /Buat pengguna pertama/);
  assert.match(render(h(UsersTable, props({ users: [], filtered: true }))), /Tidak ada pengguna yang cocok/);
  const failed = render(h(UsersTable, props({ users: [], error: Object.assign(new Error('x'), { code: 'ADMIN_REQUIRED', status: 403 }) })));
  assert.match(failed, /role="alert"/);
  assert.match(failed, /Hanya admin yang boleh membuka ini\./);
  assert.match(failed, /Coba lagi/);
});

test('CapabilitySwitches: a fieldset with a legend, one labelled switch per capability, each with its cost line', async () => {
  const { CapabilitySwitches } = await load('UserFormFields');
  const html = render(h(CapabilitySwitches, { value: { layers: true, ai: true, premium: false }, onChange() {} }));
  assert.match(html, /<legend[^>]*>Izin fitur<\/legend>/);
  assert.equal((html.match(/role="switch"/g) ?? []).length, 3);
  for (const title of ['Data layers', 'Voice &amp; AI', 'Peta premium &amp; search']) assert.match(html, new RegExp(`<label[^>]*>${title}</label>`), title);
  assert.match(html, /aria-checked="true"/);
  assert.match(html, /Berbiaya per permintaan \(Google Maps\)/);
  assert.equal((html.match(/aria-describedby="[^"]+-description"/g) ?? []).length, 3);
});

test('PasswordChoice: radio group with both options; the typed case shows a labelled field and the live requirement list', async () => {
  const { PasswordChoice } = await load('UserFormFields');
  const generated = render(h(PasswordChoice, { mode: 'generate', password: '', role: 'user', onMode() {}, onPassword() {} }));
  assert.match(generated, /role="radiogroup"[^>]*aria-label="Password awal"/);
  assert.match(generated, />Buat otomatis</);
  assert.match(generated, />Ketik sendiri</);
  assert.doesNotMatch(generated, /type="password"/);
  const typed = render(h(PasswordChoice, { mode: 'typed', password: 'pendek', role: 'admin', onMode() {}, onPassword() {} }));
  assert.match(typed, /type="password"/);
  assert.match(typed, /autoComplete="new-password"|autocomplete="new-password"/i);
  assert.match(typed, /Minimal 15 karakter<span class="sr-only">: belum terpenuhi<\/span>/);
  assert.match(typed, /Berbeda dari email dan nama<span class="sr-only">: terpenuhi<\/span>/);
});

test('TimeCell and IpCell: relative text with the absolute value in title and for screen readers; compact IP keeps the full one', async () => {
  const { TimeCell } = await load('TimeCell');
  const { IpCell, DeviceCell } = await load('ActivityCells');
  const time = render(h(TimeCell, { iso: '2026-11-17T09:18:10.338Z' }));
  assert.match(time, /<time dateTime="2026-11-17T09:18:10.338Z" title="[^"]*2026[^"]*" class="whitespace-nowrap">/);
  assert.match(time, /<span class="sr-only"> \(/);
  const ip = render(h(IpCell, { ip: '0000:0000:0000:0000:0000:0000:0000:0001' }));
  assert.match(ip, />::1<span class="sr-only"> \(0000:0000/);
  assert.match(ip, /title="Alamat IP lengkap: 0000/);
  assert.match(render(h(DeviceCell, { userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/145.0 Safari/537.36' })), /Chrome · macOS/);
});

test('LoginResultCell: success and failure badges carry icon + word, failure adds its reason', async () => {
  const { LoginResultCell } = await load('ActivityCells');
  const ok = render(h(LoginResultCell, { entry: { success: true } }));
  assert.match(ok, />Berhasil</);
  const bad = render(h(LoginResultCell, { entry: { success: false, reason: 'throttled' } }));
  assert.match(bad, />Gagal</);
  assert.match(bad, /Ter-throttle/);
  assert.match(bad, /<svg[^>]*aria-hidden="true"/);
});

test('UsersOverviewPage: one h1, a busy skeleton before the stats arrive, and the three shortcuts', async () => {
  const { UsersOverviewPage } = await load('UsersOverviewPage');
  const html = render(h(UsersOverviewPage));
  assert.equal((html.match(/<h1/g) ?? []).length, 1);
  assert.match(html, /role="status"[^>]*aria-busy="true"/);
  for (const link of ['Manage users', 'View login log', 'View audit']) assert.match(html, new RegExp(link));
  assert.match(html, /href="\/login-log"/);
});
