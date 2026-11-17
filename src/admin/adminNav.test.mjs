import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ADMIN_HOME_PATH, ADMIN_NAV, adminLeaves, breadcrumbFor, groupLanding, groupRedirects, navForActor } from './adminNav.js';

test('no group redirect points at its own path (that route would render nothing)', () => {
  for (const group of groupRedirects()) assert.notEqual(groupLanding(group), group.path, group.id);
  assert.deepEqual(groupRedirects().map((g) => g.id), ['ai-config']);
});

test('every route path is unique across group redirects and pages', () => {
  const paths = [...groupRedirects().map((g) => g.path), ...adminLeaves().map((l) => l.path)];
  assert.equal(new Set(paths).size, paths.length, paths.join(', '));
});

test('the home path is a real page, and every group lands on one of its children', () => {
  assert.ok(adminLeaves().some((leaf) => leaf.path === ADMIN_HOME_PATH));
  for (const group of ADMIN_NAV.filter((g) => g.children)) {
    assert.ok(group.children.some((c) => c.path === groupLanding(group)), group.id);
  }
});

test('breadcrumbFor names the group and page, one crumb for a top-level page', () => {
  assert.deepEqual(breadcrumbFor('/ai/general'), ['Konfigurasi AI', 'Umum']);
  assert.deepEqual(breadcrumbFor('/api-keys'), ['API Keys']);
  assert.deepEqual(breadcrumbFor('/server-log'), ['Server Log']);
  assert.deepEqual(breadcrumbFor('/nope'), []);
});

test('API Keys is shown to an active super-admin only; an admin keeps every other page', () => {
  const superAdmin = { role: 'super-admin', status: 'active' };
  const admin = { role: 'admin', status: 'active' };
  assert.ok(navForActor(superAdmin).some((group) => group.id === 'api-keys'));
  assert.ok(!navForActor(admin).some((group) => group.id === 'api-keys'));
  assert.ok(!adminLeaves(admin).some((leaf) => leaf.path === '/api-keys'));
  assert.equal(adminLeaves(admin).length, adminLeaves(superAdmin).length - 1);
  assert.ok(adminLeaves(admin).some((leaf) => leaf.path === ADMIN_HOME_PATH));
});
