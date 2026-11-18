import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { StaticRouter } from 'react-router';
import { createJsxLoader } from '../../testing/jsxLoader.mjs';

const loader = await createJsxLoader();
after(() => loader.close());
const load = (name) => loader.load(`src/components/app/${name}.jsx`);
const render = (element) => renderToStaticMarkup(element);
const ids = (html, attr) => [...html.matchAll(new RegExp(`${attr}="([^"]+)"`, 'g'))].flatMap((m) => m[1].split(' '));

test('StatusBadge pairs colour with an icon and a word; the capability chip says on/off in text, never strike-through', async () => {
  const { StatusBadge, CapabilityChip } = await load('StatusBadge');
  const active = render(h(StatusBadge, { status: 'active' }));
  assert.match(active, />Aktif</);
  assert.match(active, /<svg[^>]*aria-hidden="true"/);
  assert.match(active, /text-success/);
  const on = render(h(CapabilityChip, { name: 'Data layers', enabled: true }));
  const off = render(h(CapabilityChip, { name: 'Voice & AI', enabled: false }));
  assert.match(on, /Layer data<span class="sr-only">: aktif<\/span>/);
  assert.match(off, /Voice &amp; AI<span class="sr-only">: nonaktif<\/span>/);
  assert.doesNotMatch(on + off, /line-through/);
});

test('LoadingState announces one busy status with an sr-only label; EmptyState and ErrorState speak plainly', async () => {
  const { LoadingState } = await load('LoadingState');
  const { EmptyState } = await load('EmptyState');
  const { ErrorState } = await load('ErrorState');
  const loading = render(h(LoadingState, { label: 'Memuat pengguna' }));
  assert.match(loading, /role="status"[^>]*aria-busy="true"/);
  assert.match(loading, /<span class="sr-only">Memuat pengguna<\/span>/);
  const empty = render(h(EmptyState, { title: 'No users yet', description: 'Buat pengguna pertama.', action: h('button', null, 'Create user') }));
  assert.match(empty, /Belum ada pengguna/);
  assert.match(empty, /<button>Buat pengguna<\/button>/);
  const failed = render(h(ErrorState, { error: { code: 'FEATURE_DISABLED', status: 503 }, onRetry() {} }));
  assert.match(failed, /role="alert"/);
  assert.match(failed, /dimatikan sementara oleh administrator/);
  assert.doesNotMatch(failed, /FEATURE_DISABLED|503/, 'no raw code or status reaches the screen');
  assert.match(failed, />Coba lagi</);
  assert.doesNotMatch(render(h(ErrorState, { error: 'INTERNAL_ERROR' })), /Coba lagi/, 'no retry button without a handler');
});

test('FormField wires label, description and error with id / aria-invalid / aria-describedby', async () => {
  const { FormField } = await load('FormField');
  const html = render(h(FormField, { label: 'Email', description: 'Used to sign in.', error: 'The email field is not valid.', required: true }, h('input', { type: 'email' })));
  const id = /<input[^>]*\sid="([^"]+)"/.exec(html)[1];
  assert.match(html, new RegExp(`<label[^>]*for="${id.replace(/[:]/g, '\\:')}"`));
  assert.match(html, /aria-invalid="true"/);
  const described = ids(html, 'aria-describedby');
  assert.equal(described.length, 2);
  for (const target of described) assert.match(html, new RegExp(`\\sid="${target.replace(/[:]/g, '\\:')}"`));
  assert.match(html, /role="alert"[^>]*>Isian email tidak valid\./);
  const clean = render(h(FormField, { label: 'Name' }, h('input')));
  assert.doesNotMatch(clean, /aria-invalid|aria-describedby/);
  const viaFunction = render(h(FormField, { label: 'Role' }, (control) => h('button', { id: control.id }, 'x')));
  assert.match(viaFunction, /<button id=/);
});

test('PasswordInput: masked by default, toggle has aria-pressed and a state-aware label, autocomplete and paste are not blocked', async () => {
  const { PasswordInput } = await load('PasswordInput');
  const html = render(h(PasswordInput, { name: 'password', autoComplete: 'new-password', minLength: 15 }));
  assert.match(html, /type="password"/);
  assert.match(html, /autoComplete="new-password"|autocomplete="new-password"/i);
  assert.match(html, /aria-pressed="false"/);
  assert.match(html, /aria-label="Tampilkan password"/);
  assert.doesNotMatch(html, /onpaste|onPaste/i);
  assert.match(render(h(PasswordInput, {})), /autocomplete="current-password"/i);
});

test('CopyField: read-only labelled value, Salin button, aria-live confirmation, optional primary "Salin pesan"', async () => {
  const { CopyField } = await load('CopyField');
  const html = render(h(CopyField, { label: 'Temporary password', value: 'abc-123' }));
  assert.match(html, /readOnly|readonly/i);
  assert.match(html, /aria-label="Password sementara"/);
  assert.match(html, />Salin</);
  assert.match(html, /role="status"[^>]*aria-live="polite"/);
  const both = render(h(CopyField, { label: 'Password', value: 'abc', extraCopy: { label: 'Copy message', text: 'Pesan lengkap' } }));
  assert.match(both, />Salin pesan</);
  assert.ok(both.indexOf('Copy message') < both.indexOf('>Salin<'), 'the message copy comes first');
});

test('DataTable ready: sr-only caption, scope=col headers, md table + stacked cards, "x–y of z" and page size', async () => {
  const { DataTable } = await load('DataTable');
  const rows = [{ id: 'a', name: 'Ani' }, { id: 'b', name: 'Budi' }];
  const props = {
    caption: 'User list', rows, getRowId: (row) => row.id,
    columns: [{ id: 'name', header: 'Name', cell: (row) => row.name }, { id: 'act', header: 'Actions', srOnlyHeader: true, cell: () => 'x' }],
    renderCard: (row) => h('b', null, `kartu ${row.name}`),
    pagination: { total: 45, limit: 20, offset: 20, onOffsetChange() {}, onLimitChange() {} },
  };
  const html = render(h(DataTable, props));
  assert.match(html, /<caption[^>]*sr-only[^>]*>Daftar pengguna<\/caption>/);
  assert.equal((html.match(/<th[^>]*scope="col"/g) ?? []).length, 2);
  assert.match(html, /<span class="sr-only">Aksi<\/span>/);
  assert.match(html, /hidden md:block/);
  assert.match(html, /<ul[^>]*md:hidden[^>]*aria-label="Daftar pengguna"/);
  assert.match(html, /kartu Ani/);
  assert.match(html, /21–40 dari 45/);
  assert.match(html, /<nav[^>]*aria-label="Halaman data"/);
  assert.match(html, />Sebelumnya</);
  const single = render(h(DataTable, { ...props, pagination: { ...props.pagination, total: 2, offset: 0 } }));
  assert.doesNotMatch(single, /dari 2/, 'no pager when everything fits');
});

test('DataTable states: loading skeleton, human error with retry, empty vs filtered-empty, no table markup outside ready', async () => {
  const { DataTable } = await load('DataTable');
  const base = { caption: 'Tabel uji', columns: [{ id: 'c', header: 'C', cell: () => 'x' }], rows: [], getRowId: (r) => r.id };
  assert.match(render(h(DataTable, { ...base, loading: true })), /role="status"[^>]*aria-busy="true"/);
  const error = render(h(DataTable, { ...base, error: { code: 'AUTH_REQUIRED' }, onRetry() {} }));
  assert.match(error, /role="alert"/);
  assert.match(error, /Sesi Anda berakhir/);
  assert.doesNotMatch(error, /AUTH_REQUIRED/);
  assert.match(render(h(DataTable, { ...base, empty: h('p', null, 'No users yet') })), /Belum ada pengguna/);
  assert.match(render(h(DataTable, { ...base, filtered: true })), /Tidak ada hasil/);
  for (const html of [render(h(DataTable, { ...base, loading: true })), error]) assert.doesNotMatch(html, /<table/);
  assert.match(render(h(DataTable, { ...base, toolbar: h('input', { 'aria-label': 'Search' }) })), /aria-label="Cari"/);
});

test('RowActions renders an accessible trigger and nothing when every action is hidden', async () => {
  const { RowActions } = await load('RowActions');
  const html = render(h(RowActions, { label: 'Actions for ani@contoh.test', items: [{ id: 'edit', label: 'Edit', onSelect() {} }] }));
  assert.match(html, /<button[^>]*aria-label="Aksi untuk ani@contoh.test"[^>]*aria-haspopup="menu"/);
  assert.equal(render(h(RowActions, { label: 'x', items: [{ id: 'a', label: 'A', onSelect() {}, hidden: true }] })), '');
});

test('ConfirmDialog renders nothing while closed (the dialog body is portalled and only mounts when open)', async () => {
  const { ConfirmDialog } = await load('ConfirmDialog');
  assert.equal(render(h(ConfirmDialog, { open: false, onOpenChange() {}, title: 'T', impact: 'I', actionLabel: 'A', onConfirm() {} })), '');
});

test('ThemeToggle and UserMenu expose labelled controls inside the providers', async () => {
  const { AppProviders } = await load('AppProviders');
  const { ThemeToggle } = await load('ThemeToggle');
  const html = render(h(AppProviders, null, h(ThemeToggle)));
  assert.match(html, /aria-label="Tema tampilan"/);
  assert.match(html, /aria-haspopup="menu"/);
});

test('AppShell (dev): skip link first, one labelled sidebar nav with group titles and every visible item, Developer badge, labelled breadcrumb, focusable <main>', async () => {
  const { AppShell } = await load('AppShell');
  const { AppProviders } = await load('AppProviders');
  const { navForArea, areaSwitchFor } = await loader.load('src/admin/adminNav.js');
  const user = { id: 'u', name: 'Dev Owner', email: 'dev@example.test', role: 'super_admin' };
  const html = render(h(AppProviders, null, h(StaticRouter, { location: '/ai/usage' }, h(AppShell, {
    area: 'dev', brand: { name: 'EagleEye View', badge: 'Developer' }, groups: navForArea('dev'), pathname: '/ai/usage', user,
    areaLink: areaSwitchFor('dev', user.role), onSignOut() {},
  }, h('h1', null, 'Isi halaman')))));
  assert.ok(html.indexOf('Skip to content') < html.indexOf('data-slot="sidebar-wrapper"'), 'skip link precedes everything');
  assert.match(html, /<a href="#main-content"/);
  assert.match(html, /<main id="main-content" tabindex="-1"/);
  assert.equal((html.match(/<main/g) ?? []).length, 1, 'exactly one main landmark');
  assert.match(html, /<nav aria-label="Navigasi Developer"/);
  assert.match(html, /<nav aria-label="Breadcrumb"/);
  const labels = ['System Overview', 'User &amp; Admin', 'Login Log', 'Kill switch', 'Usage', 'API Keys', 'AI Configuration', 'General', 'AI Provider', 'Persona',
    'Pemakaian &amp; Biaya', 'Server Log', 'Audit Log', 'System Health', 'Audit'];
  let at = 0;
  for (const text of labels) {
    const next = html.indexOf(`>${text}<`, at);
    assert.ok(next >= at, `sidebar has "${text}" after the previous item (original order)`);
    at = next;
  }
  for (const gone of ['Akses', 'Kendali', 'Aktivitas', 'Sakelar', 'Log server']) assert.ok(!html.includes(gone), `no "${gone}"`);
  assert.ok(!html.includes('Component catalog'), 'hidden item is not in the sidebar');
  assert.match(html, />Developer</);
  assert.match(html, /aria-current="page"[^>]*>(?:<svg[^>]*><\/svg>|<svg[\s\S]*?<\/svg>)<span>Pemakaian &amp; Biaya/);
  assert.match(html, /data-account-menu[^>]*>[\s\S]*?<span class="sr-only">Menu akun: <\/span>dev@example\.test/, 'the account menu name contains its visible text');
  assert.doesNotMatch(html, /aria-label="Menu akun/, 'no aria-label that would differ from the visible text (WCAG 2.5.3)');
  assert.match(html, /<h1>Isi halaman<\/h1>/);
  assert.match(html, /aria-label="Buka atau tutup menu samping"/);
});

test('AppShell (admin): no Developer badge and the four admin items', async () => {
  const { AppShell } = await load('AppShell');
  const { AppProviders } = await load('AppProviders');
  const { navForArea } = await loader.load('src/admin/adminNav.js');
  const html = render(h(AppProviders, null, h(StaticRouter, { location: '/' }, h(AppShell, {
    area: 'admin', brand: { name: 'EagleEye View' }, groups: navForArea('admin'), pathname: '/', user: { email: 'a@b.test', role: 'admin' }, onSignOut() {},
  }, null))));
  assert.doesNotMatch(html, />Developer</);
  assert.match(html, /<nav aria-label="Navigasi Admin"/);
  for (const text of ['Overview', 'Users', 'Login Log', 'Audit']) assert.ok(html.includes(`>${text}<`), text);
  assert.ok(!html.includes('Aktivitas'));
});

test('AppShell (dev): a nested page marks only itself current, not its parent page (/server-log/audit vs /server-log)', async () => {
  const { AppShell } = await load('AppShell');
  const { AppProviders } = await load('AppProviders');
  const { navForArea } = await loader.load('src/admin/adminNav.js');
  const html = render(h(AppProviders, null, h(StaticRouter, { location: '/server-log/audit' }, h(AppShell, {
    area: 'dev', brand: { name: 'EagleEye View' }, groups: navForArea('dev'), pathname: '/server-log/audit', user: { email: 'a@b.test', role: 'super_admin' }, onSignOut() {},
  }, null))));
  const current = [...html.matchAll(/aria-current="page"[^>]*>(?:<svg[\s\S]*?<\/svg>)?<span>([^<]*)</g)].map((m) => m[1]);
  assert.deepEqual(current, ['Audit Log']);
});
