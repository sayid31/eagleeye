import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LAYER_LOCK_REASON, PENDING_BANNER, UNKNOWN_BANNER, planAccountAccess } from './accountAccessPlan.js';
import { lockDataLayers, resolveAccountAccess } from './accountChrome.js';

test('an active account gets the app exactly as before: keyed basemaps, layers, voice, no banner', () => {
  assert.deepEqual(planAccountAccess({ authenticated: true, role: 'user', status: 'active' }), {
    mode: 'full', redirect: null, keyedBasemaps: true, layers: true, voice: true, showAdmin: false, banner: null,
  });
  assert.equal(planAccountAccess({ authenticated: true, role: 'admin', status: 'active' }).showAdmin, true);
  assert.equal(planAccountAccess({ authenticated: true, role: 'super-admin', status: 'active' }).showAdmin, true);
});

test('a pending account sees the map on the keyless basemap only, with the banner', () => {
  for (const role of ['user', 'admin']) {
    assert.deepEqual(planAccountAccess({ authenticated: true, role, status: 'pending' }), {
      mode: 'pending', redirect: null, keyedBasemaps: false, layers: false, voice: false, showAdmin: false, banner: PENDING_BANNER,
    });
  }
  assert.match(PENDING_BANNER, /menunggu persetujuan admin/);
});

test('signed-out and banned visitors leave; an unreadable status fails closed but keeps the basemap', () => {
  assert.equal(planAccountAccess({ authenticated: false, configured: true }).redirect, '/login?notice=session');
  assert.equal(planAccountAccess({ authenticated: true, role: 'user', status: 'banned' }).redirect, '/login?notice=banned');
  const unknown = planAccountAccess(null);
  assert.deepEqual([unknown.mode, unknown.layers, unknown.voice, unknown.keyedBasemaps, unknown.banner], ['unknown', false, false, false, UNKNOWN_BANNER]);
});

test('resolveAccountAccess turns a failed /api/me into the restricted plan', async () => {
  const warn = console.warn;
  const warned = [];
  console.warn = (message) => warned.push(message);
  try {
    assert.equal((await resolveAccountAccess({ load: async () => { throw new Error('HTTP 503'); } })).mode, 'unknown');
  } finally { console.warn = warn; }
  assert.match(warned[0], /HTTP 503/);
  assert.equal((await resolveAccountAccess({ load: async () => ({ authenticated: true, role: 'user', status: 'active' }) })).mode, 'full');
});

test('the layer lock refuses every enable, allows disable, greys the list, and can be released', () => {
  const guards = new Set();
  const manager = { addVisibilityGuard: (guard) => { guards.add(guard); return () => guards.delete(guard); } };
  const classes = new Set();
  const attributes = new Map();
  const list = {
    classList: { add: (c) => classes.add(c), remove: (c) => classes.delete(c) },
    setAttribute: (k, v) => attributes.set(k, v),
    removeAttribute: (k) => attributes.delete(k),
  };
  const release = lockDataLayers(manager, list);
  const [guard] = guards;
  for (const origin of ['user', 'restore', 'share-link', 'voice', 'programmatic']) {
    assert.equal(guard({ layerId: 'flights', enabled: true, origin }), LAYER_LOCK_REASON, origin);
  }
  assert.equal(guard({ layerId: 'flights', enabled: false, origin: 'user' }), null);
  assert.ok(classes.has('account-locked'));
  assert.equal(attributes.get('aria-disabled'), 'true');
  release();
  assert.equal(guards.size, 0);
  assert.ok(!classes.has('account-locked'));
  assert.equal(lockDataLayers(manager, null)(), undefined, 'a missing toggle list is tolerated');
});
