import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LIMITED_BANNER, UNKNOWN_BANNER, planAccountAccess } from './accountAccessPlan.js';

const me = (role, capabilities, extra = {}) => ({ configured: true, signedIn: true, home: '/app', user: { id: '1', name: 'A', email: 'a@example.test', role, mustChangePassword: false, capabilities, ...extra } });

test('each toggle maps to one part of the map: layers, ai → voice, premium → keyed basemaps', () => {
  const plan = planAccountAccess(me('user', { layers: true, ai: false, premium: false }));
  assert.deepEqual([plan.mode, plan.layers, plan.voice, plan.keyedBasemaps, plan.banner], ['limited', true, false, false, LIMITED_BANNER]);
  assert.equal(planAccountAccess(me('user', { layers: false, ai: true, premium: true })).voice, true);
  assert.equal(planAccountAccess(me('user', { layers: true, ai: true, premium: true })).mode, 'full');
});

test('admins see the console button pointing at their home; users do not', () => {
  const all = { layers: true, ai: true, premium: true };
  assert.deepEqual([planAccountAccess(me('admin', all)).showAdmin, planAccountAccess(me('admin', all)).adminHref], [true, '/admin']);
  assert.equal(planAccountAccess(me('super_admin', all)).adminHref, '/dev');
  assert.deepEqual([planAccountAccess(me('user', all)).showAdmin, planAccountAccess(me('user', all)).adminHref], [false, null]);
});

test('signed out → login with next=/app; forced password change → /account/password; unreadable → keyless', () => {
  assert.equal(planAccountAccess({ configured: true, signedIn: false, home: '/login' }).redirect, '/login?next=%2Fapp&notice=session');
  assert.equal(planAccountAccess(me('user', {}, { mustChangePassword: true })).redirect, '/account/password');
  const unknown = planAccountAccess(null);
  assert.deepEqual([unknown.mode, unknown.layers, unknown.voice, unknown.keyedBasemaps, unknown.banner], ['unknown', false, false, false, UNKNOWN_BANNER]);
});

test('admins and super_admins get every toggle even when the payload says otherwise', () => {
  const none = { layers: false, ai: false, premium: false };
  for (const role of ['admin', 'super_admin']) {
    const plan = planAccountAccess(me(role, none));
    assert.deepEqual([plan.mode, plan.layers, plan.voice, plan.keyedBasemaps, plan.banner], ['full', true, true, true, null]);
  }
  assert.deepEqual(planAccountAccess(me('user', { layers: 'yes', ai: 1 })).layers, false, 'only literal true counts');
});
