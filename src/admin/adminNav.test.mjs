import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ADMIN_HOME_PATH, ADMIN_NAV, adminLeaves, breadcrumbFor, groupLanding, groupRedirects } from './adminNav.js';

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
