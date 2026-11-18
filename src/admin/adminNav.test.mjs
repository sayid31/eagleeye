import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ADMIN_AREAS, PAGE_TABLE, adminArea, adminBasename, areaHome, areaLeaves, areaSwitchFor,
  groupRedirects, navForArea, pathIsUnder, roleLabel,
} from './adminNav.js';
import { breadcrumbTrail, navItems } from '../components/app/navModel.js';
import { ROUTE_FEATURES } from './routes/index.js';
import { loadPage, page } from './routes/pageRef.js';

/** Menu as the sidebar lists it: `[group title, [item label, path]…]` (hidden items are routable, not listed). */
const menu = (area) => navForArea(area).map((group) => [group.title, group.items.filter((item) => !item.hidden).map((item) => [item.label, item.path])]);

test('basename follows the browser path: /dev and below → /dev, everything else → /admin', () => {
  assert.equal(adminBasename('/dev'), '/dev');
  assert.equal(adminBasename('/dev/ai/usage'), '/dev');
  assert.equal(adminBasename('/admin'), '/admin');
  assert.equal(adminBasename('/admin/users'), '/admin');
  assert.equal(adminBasename('/developer'), '/admin');
  assert.equal(adminArea('/dev/'), 'dev');
  assert.equal(pathIsUnder('/devx', '/dev'), false);
});

test('/admin menu is the original four items: Ringkasan, Pengguna, Login Log, Audit', () => {
  assert.deepEqual(menu('admin'), [[null, [['Overview', '/'], ['Users', '/users'], ['Login Log', '/login-log'], ['Audit', '/audit']]]]);
});

test('/dev menu is the original list: fourteen pages, AI Configuration and Server Log as labelled sub-lists, Audit last', () => {
  assert.deepEqual(menu('dev'), [
    [null, [['System Overview', '/'], ['Users & Admins', '/users'], ['Login Log', '/login-log'], ['Kill switch', '/kill-switches'],
      ['Usage', '/usage'], ['API Keys', '/api-keys']]],
    ['AI Configuration', [['General', '/ai/general'], ['AI Provider', '/ai/provider'], ['Persona', '/ai/persona'], ['Usage & Cost', '/ai/usage']]],
    ['Server Log', [['Server Log', '/server-log'], ['Audit Log', '/server-log/audit'], ['System Health', '/server-log/health']]],
    [null, [['Audit', '/audit']]],
  ]);
});

test('the menu has no tabs, no regrouping headings and none of the replaced terms', () => {
  const text = JSON.stringify(navForArea('dev')) + JSON.stringify(navForArea('admin'));
  assert.doesNotMatch(text, /"tabs"|Access|Controls|Emergency switch|Server log|Activity|Audit trail|Budget/);
  assert.match(text, /Kill switch/);
  assert.match(text, /Server Log/);
});

test('only the bare /ai group path redirects (Server Log is its own first page)', () => {
  assert.deepEqual(groupRedirects('dev'), [{ path: '/ai', to: '/ai/general' }]);
  assert.deepEqual(groupRedirects('admin'), []);
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

test('group ids are unique per area', () => {
  for (const area of ADMIN_AREAS) {
    const groups = navForArea(area);
    assert.equal(new Set(groups.map((g) => g.id)).size, groups.length, `${area} group ids`);
  }
});

test('an unknown area is refused', () => {
  assert.throws(() => navForArea('root'), /Unknown admin area: root/);
  assert.throws(() => navForArea('constructor'), /Unknown admin area/);
});

test('each area home is its overview page at the area root', () => {
  for (const area of ADMIN_AREAS) {
    assert.equal(areaHome(area), '/', area);
    assert.ok(areaLeaves(area).some((leaf) => leaf.path === areaHome(area)), area);
  }
});

test('every route path is unique within an area', () => {
  for (const area of ADMIN_AREAS) {
    const paths = areaLeaves(area).map((l) => l.path);
    assert.equal(new Set(paths).size, paths.length, `${area}: ${paths.join(', ')}`);
  }
});

/** Crumb labels the header shows for a path (the same trail AppHeader renders). */
const breadcrumbFor = (area, pathname) => breadcrumbTrail(navForArea(area), pathname).map((crumb) => crumb.label);

test('breadcrumb trail names the group (when titled and not the page itself) and the page', () => {
  assert.deepEqual(breadcrumbFor('dev', '/ai/usage'), ['AI Configuration', 'Usage & Cost']);
  assert.deepEqual(breadcrumbFor('dev', '/ai/general'), ['AI Configuration', 'General']);
  assert.deepEqual(breadcrumbFor('dev', '/server-log'), ['Server Log']);
  assert.deepEqual(breadcrumbFor('dev', '/server-log/audit'), ['Server Log', 'Audit Log']);
  assert.deepEqual(breadcrumbFor('dev', '/server-log/health'), ['Server Log', 'System Health']);
  assert.deepEqual(breadcrumbFor('dev', '/kill-switches'), ['Kill switch']);
  assert.deepEqual(breadcrumbFor('dev', '/'), ['System Overview']);
  assert.deepEqual(breadcrumbFor('admin', '/'), ['Overview']);
  assert.deepEqual(breadcrumbFor('admin', '/audit'), ['Audit']);
  assert.deepEqual(breadcrumbFor('admin', '/activity/audit'), []);
  assert.deepEqual(breadcrumbFor('admin', '/nope'), []);
});

test('labels: role label', () => {
  assert.equal(roleLabel('super_admin'), 'Super admin');
  assert.equal(roleLabel('admin'), 'Admin');
  assert.equal(roleLabel('user'), '');
  assert.equal(roleLabel('toString'), '');
});

test('only a super_admin gets the link to the other area', () => {
  assert.deepEqual(areaSwitchFor('admin', 'super_admin'), { href: '/dev', label: 'Open Developer area' });
  assert.deepEqual(areaSwitchFor('dev', 'super_admin'), { href: '/admin', label: 'Open Admin area' });
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
  assert.deepEqual(breadcrumbFor('dev', '/ui-kit'), ['Component catalog']);
  assert.equal(navItems(navForArea('admin')).some((item) => item.id === 'ui-kit'), false);
});
