import { test } from 'node:test';
import assert from 'node:assert/strict';
import { areaLeaves, redirectsFor } from './adminNav.js';

/**
 * The information architecture before the UI refactor (route paths without basename), each with the page id it showed.
 * These must keep working: bookmarks, the old links inside pages (`/login-log?userId=`), docs.
 */
const OLD_ROUTES = {
  admin: {
    '/': 'users-overview', '/users': 'users', '/login-log': 'login-log', '/audit': 'account-audit',
  },
  dev: {
    '/': 'dev-overview', '/users': 'users', '/login-log': 'login-log', '/kill-switches': 'dev-kill-switches', '/usage': 'dev-usage',
    '/api-keys': 'api-keys', '/ai/general': 'ai-general', '/ai/provider': 'ai-provider', '/ai/persona': 'ai-persona',
    '/ai/usage': 'ai-usage', '/server-log': 'server-log', '/server-log/audit': 'server-log-audit',
    '/server-log/health': 'server-log-health', '/audit': 'account-audit',
  },
};

/** Old bare group paths that used to redirect to their first page. */
const OLD_GROUP_PATHS = { dev: { '/ai': 'ai-general' } };

/** Where a path ends up: a live page id, following at most one redirect (chains are a bug, see below). */
function landing(area, path) {
  const leaves = new Map(areaLeaves(area).map((leaf) => [leaf.path, leaf.page]));
  const redirects = redirectsFor(area);
  if (Object.hasOwn(redirects, path)) return leaves.get(redirects[path]);
  if (leaves.has(path)) return leaves.get(path);
  // A tab parent (`/usage`) is not a leaf: it redirects to its first tab through the router's index route.
  const firstTab = areaLeaves(area).find((leaf) => leaf.path.startsWith(`${path}/`));
  return firstTab?.page;
}

test('every pre-refactor route still lands on the page it used to show', () => {
  for (const area of Object.keys(OLD_ROUTES)) {
    for (const [path, pageId] of Object.entries({ ...OLD_ROUTES[area], ...(OLD_GROUP_PATHS[area] ?? {}) })) {
      assert.equal(landing(area, path), pageId, `${area} ${path}`);
    }
  }
});

test('every redirect target is a live page of the same area, never another redirect (no chains, no loops)', () => {
  for (const area of ['admin', 'dev']) {
    const livePaths = new Set(areaLeaves(area).map((leaf) => leaf.path));
    for (const [from, to] of Object.entries(redirectsFor(area))) {
      assert.ok(livePaths.has(to), `${area}: ${from} → ${to} must be a live page`);
      assert.ok(!Object.hasOwn(redirectsFor(area), to), `${area}: ${from} → ${to} chains into another redirect`);
      assert.notEqual(from, to);
    }
  }
});

test('a redirect never shadows a live page, and redirects are only declared for paths that moved', () => {
  for (const area of ['admin', 'dev']) {
    const livePaths = new Set(areaLeaves(area).map((leaf) => leaf.path));
    for (const from of Object.keys(redirectsFor(area))) {
      assert.ok(!livePaths.has(from), `${area}: ${from} is both a page and a redirect`);
      assert.ok(from.startsWith('/'), from);
    }
  }
});

test('the redirect table of /dev (the documented old → new map)', () => {
  assert.deepEqual({ ...redirectsFor('dev') }, {
    '/login-log': '/activity/login',
    '/audit': '/activity/audit',
    '/ai/usage': '/usage/ai',
    '/server-log': '/logs/server',
    '/server-log/audit': '/logs/audit',
    '/server-log/health': '/logs/health',
    '/api-keys': '/providers/keys',
    '/ai': '/general',
    '/ai/general': '/general',
    '/ai/provider': '/providers/ai',
    '/ai/persona': '/persona',
  });
  assert.deepEqual({ ...redirectsFor('admin') }, { '/login-log': '/activity/login', '/audit': '/activity/audit' });
});
