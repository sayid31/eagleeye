import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nextTheme, resolveTheme } from './adminTheme.js';
import { ADMIN_HOME_PATH, ADMIN_NAV, adminLeaves, groupLanding } from './adminNav.js';

test('a valid saved theme wins over the OS preference', () => {
  assert.equal(resolveTheme('light', true), 'light');
  assert.equal(resolveTheme('dark', false), 'dark');
});

test('a missing or invalid saved theme follows the OS preference', () => {
  assert.equal(resolveTheme(null, true), 'dark');
  assert.equal(resolveTheme(undefined, false), 'light');
  assert.equal(resolveTheme('<script>', true), 'dark');
});

test('nextTheme toggles between dark and light', () => {
  assert.equal(nextTheme('dark'), 'light');
  assert.equal(nextTheme('light'), 'dark');
});

test('nav lists the agreed menus, with Server Log first and every page built (none marked soon)', () => {
  assert.deepEqual(ADMIN_NAV.map((g) => g.label), ['Server Log', 'AI Configuration', 'API Keys']);
  assert.deepEqual(ADMIN_NAV[0].children.map((c) => [c.label, Boolean(c.soon)]),
    [['Server Log', false], ['Audit Log', false], ['System Health', false]]);
  assert.deepEqual(ADMIN_NAV[1].children.map((c) => c.label), ['General', 'AI Provider', 'Persona', 'Usage & Cost']);
});

test('every leaf path is unique and the home page is the Server Log', () => {
  const paths = adminLeaves().map((l) => l.path);
  assert.equal(new Set(paths).size, paths.length);
  assert.equal(ADMIN_HOME_PATH, '/server-log');
  assert.equal(groupLanding(ADMIN_NAV[1]), '/ai/general');
  assert.equal(groupLanding(ADMIN_NAV[2]), '/api-keys');
});
