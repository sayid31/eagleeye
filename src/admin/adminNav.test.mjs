import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ADMIN_AREAS, adminArea, adminBasename, areaHome, areaLabel, areaLeaves, areaSwitchFor, breadcrumbFor,
  groupLanding, groupRedirects, navForArea, pathIsUnder, roleLabel,
} from './adminNav.js';

test('basename follows the browser path: /dev and below → /dev, everything else → /admin', () => {
  assert.equal(adminBasename('/dev'), '/dev');
  assert.equal(adminBasename('/dev/ai/general'), '/dev');
  assert.equal(adminBasename('/admin'), '/admin');
  assert.equal(adminBasename('/admin/users'), '/admin');
  assert.equal(adminBasename('/developer'), '/admin');
  assert.equal(adminArea('/dev/'), 'dev');
  assert.equal(pathIsUnder('/devx', '/dev'), false);
});

test('/admin lists the people pages, all placeholders for now', () => {
  assert.deepEqual(navForArea('admin').map((g) => [g.label, g.path]),
    [['Ringkasan', '/'], ['Pengguna', '/users'], ['Log Login', '/login-log'], ['Audit', '/audit']]);
  assert.ok(areaLeaves('admin').every((leaf) => !leaf.page));
});

test('/dev lists the system pages with the built ones wired to their page ids', () => {
  assert.deepEqual(navForArea('dev').map((g) => g.label),
    ['Ringkasan sistem', 'Pengguna & Admin', 'Kill switch', 'Pemakaian', 'API Keys', 'Konfigurasi AI', 'Server Log', 'Audit']);
  const built = areaLeaves('dev').filter((leaf) => leaf.page).map((leaf) => [leaf.path, leaf.page]);
  assert.deepEqual(built, [
    ['/', 'dev-overview'], ['/kill-switches', 'dev-kill-switches'], ['/usage', 'dev-usage'],
    ['/api-keys', 'api-keys'], ['/ai/general', 'ai-general'], ['/ai/provider', 'ai-provider'], ['/ai/persona', 'ai-persona'],
    ['/ai/usage', 'ai-usage'], ['/server-log', 'server-log'], ['/server-log/audit', 'server-log-audit'],
    ['/server-log/health', 'server-log-health'],
  ]);
  const placeholders = areaLeaves('dev').filter((leaf) => !leaf.page).map((leaf) => leaf.path);
  assert.deepEqual(placeholders, ['/users', '/audit']);
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

test('no group redirect points at its own path (that route would render nothing)', () => {
  assert.deepEqual(groupRedirects('admin'), []);
  assert.deepEqual(groupRedirects('dev').map((g) => [g.path, groupLanding(g)]), [['/ai', '/ai/general']]);
  for (const area of ADMIN_AREAS) {
    for (const group of groupRedirects(area)) assert.notEqual(groupLanding(group), group.path, group.id);
  }
});

test('every route path is unique within an area, across group redirects and pages', () => {
  for (const area of ADMIN_AREAS) {
    const paths = [...groupRedirects(area).map((g) => g.path), ...areaLeaves(area).map((l) => l.path)];
    assert.equal(new Set(paths).size, paths.length, `${area}: ${paths.join(', ')}`);
  }
});

test('groupLanding is the first child, or the group itself without children', () => {
  const [, , , , apiKeys, ai, serverLog] = navForArea('dev');
  assert.equal(groupLanding(ai), '/ai/general');
  assert.equal(groupLanding(serverLog), '/server-log');
  assert.equal(groupLanding(apiKeys), '/api-keys');
});

test('breadcrumbFor names the group and page, one crumb for a top-level page', () => {
  assert.deepEqual(breadcrumbFor('dev', '/ai/general'), ['Konfigurasi AI', 'Umum']);
  assert.deepEqual(breadcrumbFor('dev', '/api-keys'), ['API Keys']);
  assert.deepEqual(breadcrumbFor('dev', '/server-log'), ['Server Log']);
  assert.deepEqual(breadcrumbFor('dev', '/'), ['Ringkasan sistem']);
  assert.deepEqual(breadcrumbFor('admin', '/'), ['Ringkasan']);
  assert.deepEqual(breadcrumbFor('admin', '/api-keys'), []);
  assert.deepEqual(breadcrumbFor('admin', '/nope'), []);
});

test('labels: area sub-label and role label', () => {
  assert.equal(areaLabel('admin'), 'Admin');
  assert.equal(areaLabel('dev'), 'Dev');
  assert.equal(roleLabel('super_admin'), 'Super admin');
  assert.equal(roleLabel('admin'), 'Admin');
  assert.equal(roleLabel('user'), '');
  assert.equal(roleLabel('toString'), '');
});

test('only a super_admin gets the link to the other area', () => {
  assert.deepEqual(areaSwitchFor('admin', 'super_admin'), { href: '/dev', label: 'Buka area Dev' });
  assert.deepEqual(areaSwitchFor('dev', 'super_admin'), { href: '/admin', label: 'Buka area Admin' });
  assert.equal(areaSwitchFor('admin', 'admin'), null);
  assert.equal(areaSwitchFor('admin', undefined), null);
});
