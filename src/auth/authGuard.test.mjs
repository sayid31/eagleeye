import { test } from 'node:test';
import assert from 'node:assert/strict';
import { apiDecision, mePayload } from './authGuard.mjs';

const origin = 'http://localhost:4173';
const user = { role: 'user', capabilities: { layers: true, ai: false, premium: false }, mustChangePassword: false };
const decide = (over) => apiDecision({ method: 'GET', pathname: '/api/x', gates: ['layers'], actor: user, headers: {}, trustedOrigin: origin, ...over });

test('apiDecision: unknown route 404, anonymous 401, cross-site 403, forced password change 403', () => {
  assert.equal(decide({ gates: [] }).status, 404);
  assert.deepEqual(decide({ actor: null }), { action: 'deny', status: 401, code: 'AUTH_REQUIRED', error: 'Login required' });
  assert.equal(decide({ headers: { 'sec-fetch-site': 'cross-site' } }).code, 'CROSS_SITE_REFUSED');
  assert.equal(decide({ headers: { 'sec-fetch-site': 'none' } }).action, 'next', 'typed URL');
  assert.equal(decide({ actor: { ...user, mustChangePassword: true } }).code, 'PASSWORD_CHANGE_REQUIRED');
});

test('apiDecision: capability gates name the gate; every matching gate is required', () => {
  assert.deepEqual(decide({ gates: ['ai'] }), { action: 'deny', status: 403, code: 'CAPABILITY_REQUIRED', error: 'Feature not enabled by an admin', gate: 'ai' });
  assert.equal(decide({ gates: ['layers', 'premium'] }).gate, 'premium');
  assert.equal(decide({ gates: ['open'] }).action, 'next');
  assert.equal(decide({ gates: ['admin'] }).code, 'ADMIN_REQUIRED');
  assert.equal(decide({ gates: ['super'], actor: { role: 'admin' } }).code, 'SUPER_ADMIN_REQUIRED');
  assert.equal(decide({ gates: ['super'], actor: { role: 'super_admin' } }).action, 'next');
});

test('apiDecision: kill switch 503 after the gate check; writes need the exact Origin; admin writes JSON', () => {
  assert.deepEqual(decide({ isKilled: (gate) => gate === 'layers' }), { action: 'deny', status: 503, code: 'FEATURE_DISABLED', error: 'Feature is currently turned off by the developer', gate: 'layers' });
  assert.equal(decide({ method: 'POST' }).code, 'ORIGIN_NOT_ALLOWED');
  assert.equal(decide({ method: 'POST', headers: { origin } }).action, 'next');
  const admin = { role: 'admin' };
  assert.equal(decide({ method: 'POST', pathname: '/api/admin/users', gates: ['admin'], actor: admin, headers: { origin } }).status, 415);
  assert.equal(decide({ method: 'POST', pathname: '/api/admin/users', gates: ['admin'], actor: admin, headers: { origin, 'content-type': 'application/json' } }).action, 'next');
});

test('mePayload: shape v2, no env names when unconfigured', () => {
  assert.deepEqual(mePayload({ configured: false, googleSignIn: true }), { configured: false, signedIn: false, home: '/login', googleSignIn: false });
  const actor = { user: { id: 7, name: 'A', email: 'a@example.test', image: 'x' }, role: 'admin', mustChangePassword: false, capabilities: { layers: true, ai: true, premium: true } };
  assert.deepEqual(mePayload({ configured: true, actor, googleSignIn: true }), {
    configured: true, signedIn: true, home: '/admin', googleSignIn: true,
    user: { id: '7', name: 'A', email: 'a@example.test', role: 'admin', mustChangePassword: false, capabilities: { layers: true, ai: true, premium: true } },
  });
});
