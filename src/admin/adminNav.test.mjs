import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ADMIN_AREAS, PAGE_TABLE, adminArea, adminBasename, areaHome, areaLabel, areaLeaves, areaSwitchFor, breadcrumbFor,
  navForArea, pathIsUnder, redirectsFor, roleLabel,
} from './adminNav.js';
import { navItems } from '../components/app/navModel.js';
import { ROUTE_FEATURES } from './routes/index.js';
import { loadPage, page } from './routes/pageRef.js';

const itemLabels = (area) => navForArea(area).map((group) => [group.title, group.items.filter((item) => !item.hidden).map((item) => item.label)]);

test('basename follows the browser path: /dev and below → /dev, everything else → /admin', () => {
  assert.equal(adminBasename('/dev'), '/dev');
  assert.equal(adminBasename('/dev/usage/ai'), '/dev');
  assert.equal(adminBasename('/admin'), '/admin');
  assert.equal(adminBasename('/admin/users'), '/admin');
  assert.equal(adminBasename('/developer'), '/admin');
  assert.equal(adminArea('/dev/'), 'dev');
  assert.equal(pathIsUnder('/devx', '/dev'), false);
});

test('/admin IA: Ringkasan · Pengguna · Aktivitas (tabs Log Login | Audit)', () => {
  assert.deepEqual(itemLabels('admin'), [[null, ['Ringkasan', 'Pengguna', 'Aktivitas']]]);
  const activity = navItems(navForArea('admin')).find((item) => item.id === 'activity');
  assert.deepEqual(activity.tabs.map((tab) => [tab.label, tab.path, tab.page]), [
    ['Log Login', '/activity/login', 'login-log'], ['Audit', '/activity/audit', 'account-audit'],
  ]);
});

test('/dev IA: overview + Akses, Kendali, Konfigurasi, Sistem, in that order, with the merged pages as tabs', () => {
  assert.deepEqual(itemLabels('dev'), [
    [null, ['Ringkasan sistem']],
    ['Akses', ['Pengguna & Admin', 'Aktivitas']],
    ['Kendali', ['Sakelar darurat', 'Pemakaian & Biaya']],
    ['Konfigurasi', ['Penyedia & API Keys', 'Umum', 'Persona']],
    ['Sistem', ['Log server']],
  ]);
  const tabsOf = (id) => navItems(navForArea('dev')).find((item) => item.id === id).tabs.map((tab) => tab.path);
  assert.deepEqual(tabsOf('usage'), ['/usage/budget', '/usage/ai']);
  assert.deepEqual(tabsOf('logs'), ['/logs/server', '/logs/audit', '/logs/health']);
  assert.deepEqual(tabsOf('activity'), ['/activity/login', '/activity/audit']);
  assert.deepEqual(tabsOf('providers'), ['/providers/keys', '/providers/ai']);
});

test('menu copy follows the glossary: Sakelar darurat and Log server, not Kill switch / Server Log', () => {
  const labels = JSON.stringify(navForArea('dev'));
  assert.match(labels, /Sakelar darurat/);
  assert.match(labels, /Log server/);
  assert.doesNotMatch(labels, /Kill switch|Server Log|Audit Log/i);
});

test('every routable page of both areas is registered by a feature and has a loader', () => {
  for (const area of ADMIN_AREAS) {
    for (const leaf of areaLeaves(area)) {
      assert.ok(leaf.page, `${area} ${leaf.path} names a page id`);
      assert.ok(Object.hasOwn(PAGE_TABLE, leaf.page), `${area} ${leaf.path}: page "${leaf.page}" is registered`);
      assert.equal(typeof PAGE_TABLE[leaf.page].loader, 'function');
    }
  }
});

test('page ids are unique across features, and each feature id is unique', () => {
  const ids = ROUTE_FEATURES.flatMap((feature) => Object.keys(feature.pages));
  assert.equal(new Set(ids).size, ids.length, ids.join(','));
  assert.equal(new Set(ROUTE_FEATURES.map((feature) => feature.id)).size, ROUTE_FEATURES.length);
});

test('feature nav fragments do not collide: group ids unique per area, orders unique per area', () => {
  for (const area of ADMIN_AREAS) {
    const groups = navForArea(area);
    assert.equal(new Set(groups.map((g) => g.id)).size, groups.length, `${area} group ids`);
    assert.equal(new Set(groups.map((g) => g.order)).size, groups.length, `${area} group orders`);
    assert.deepEqual(groups.map((g) => g.order), [...groups.map((g) => g.order)].sort((a, b) => a - b));
  }
});

test('an unknown area is refused', () => {
  assert.throws(() => navForArea('root'), /Unknown admin area: root/);
  assert.throws(() => navForArea('constructor'), /Unknown admin area/);
  assert.throws(() => redirectsFor('root'), /Unknown admin area/);
});

test('each area home is its overview page at the area root', () => {
  for (const area of ADMIN_AREAS) {
    assert.equal(areaHome(area), '/', area);
    assert.ok(areaLeaves(area).some((leaf) => leaf.path === areaHome(area)), area);
  }
});

test('every route path is unique within an area, across pages and redirects', () => {
  for (const area of ADMIN_AREAS) {
    const paths = [...areaLeaves(area).map((l) => l.path), ...Object.keys(redirectsFor(area))];
    assert.equal(new Set(paths).size, paths.length, `${area}: ${paths.join(', ')}`);
  }
});

test('breadcrumbFor names the group (when titled), the page and the tab', () => {
  assert.deepEqual(breadcrumbFor('dev', '/usage/ai'), ['Kendali', 'Pemakaian & Biaya', 'Pemakaian AI']);
  assert.deepEqual(breadcrumbFor('dev', '/kill-switches'), ['Kendali', 'Sakelar darurat']);
  assert.deepEqual(breadcrumbFor('dev', '/general'), ['Konfigurasi', 'Umum']);
  assert.deepEqual(breadcrumbFor('dev', '/'), ['Ringkasan sistem']);
  assert.deepEqual(breadcrumbFor('admin', '/'), ['Ringkasan']);
  assert.deepEqual(breadcrumbFor('admin', '/activity/audit'), ['Aktivitas', 'Audit']);
  assert.deepEqual(breadcrumbFor('admin', '/providers'), []);
  assert.deepEqual(breadcrumbFor('admin', '/nope'), []);
});

test('labels: area label (Developer badge) and role label', () => {
  assert.equal(areaLabel('admin'), 'Admin');
  assert.equal(areaLabel('dev'), 'Developer');
  assert.equal(roleLabel('super_admin'), 'Super admin');
  assert.equal(roleLabel('admin'), 'Admin');
  assert.equal(roleLabel('user'), '');
  assert.equal(roleLabel('toString'), '');
});

test('only a super_admin gets the link to the other area', () => {
  assert.deepEqual(areaSwitchFor('admin', 'super_admin'), { href: '/dev', label: 'Buka area Developer' });
  assert.deepEqual(areaSwitchFor('dev', 'super_admin'), { href: '/admin', label: 'Buka area Admin' });
  assert.equal(areaSwitchFor('admin', 'admin'), null);
  assert.equal(areaSwitchFor('admin', undefined), null);
});

test('loadPage resolves a named export or a pick() result, and fails loudly on a missing export', async () => {
  const Component = () => null;
  assert.equal((await loadPage(page(async () => ({ Thing: Component }), 'Thing'))).default, Component);
  assert.equal((await loadPage(page(async () => ({ MAP: { a: Component } }), (m) => m.MAP.a))).default, Component);
  await assert.rejects(loadPage(page(async () => ({}), 'Missing')), /Page export not found: Missing/);
});

test('the component gallery is routable for /dev but not listed in the sidebar, and /admin has none', () => {
  const kit = navItems(navForArea('dev')).find((item) => item.id === 'ui-kit');
  assert.deepEqual([kit.path, kit.hidden, kit.page], ['/ui-kit', true, 'ui-kit']);
  assert.deepEqual(breadcrumbFor('dev', '/ui-kit'), ['Sistem', 'Katalog komponen']);
  assert.equal(navItems(navForArea('admin')).some((item) => item.id === 'ui-kit'), false);
});
