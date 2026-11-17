import { test } from 'node:test';
import assert from 'node:assert/strict';
import { adminGateDecision } from './adminGateDecision.js';

test('/admin renders only for an active admin or super-admin', () => {
  assert.deepEqual(adminGateDecision({ authenticated: true, role: 'admin', status: 'active' }), { redirect: null });
  assert.deepEqual(adminGateDecision({ authenticated: true, role: 'super-admin', status: 'active' }), { redirect: null });
});

test('everyone else leaves: anonymous to /login, banned to the banned notice, others to the map', () => {
  assert.equal(adminGateDecision({ authenticated: false, configured: true }).redirect, '/login?notice=session');
  assert.equal(adminGateDecision(null).redirect, '/login?notice=session');
  assert.equal(adminGateDecision({ authenticated: true, role: 'admin', status: 'banned' }).redirect, '/login?notice=banned');
  assert.equal(adminGateDecision({ authenticated: true, role: 'user', status: 'active' }).redirect, '/');
  assert.equal(adminGateDecision({ authenticated: true, role: 'admin', status: 'pending' }).redirect, '/');
});
