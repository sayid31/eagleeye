import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ADMIN_API_PERMISSIONS, API_GATES, assertRouteGate, createKillSwitchCheck, gateForPath, gatesForPath, hasGate, routeMatches,
} from './apiGates.mjs';
import { registerApiRoute, registeredApiRoutes } from './apiRouteRegistry.mjs';
import { requireActor } from './requireActor.mjs';

const fakeApp = () => { const mounted = []; return { mounted, use: (path, fn) => mounted.push([path, fn]) }; };

test('routeMatches follows Connect: case-insensitive, prefix ends the path or is followed by / or .', () => {
  assert.equal(routeMatches('/api/opensky/states/all', '/api/opensky'), true);
  assert.equal(routeMatches('/API/OpenSky', '/api/opensky'), true);
  assert.equal(routeMatches('/api/opensky.json', '/api/opensky'), true);
  assert.equal(routeMatches('/api/opensky-track/x', '/api/opensky'), false);
  assert.equal(routeMatches('/api/openskyx', '/api/opensky'), false);
});

test('gatesForPath/gateForPath: every matching route counts; the strictest wins; no route → null', () => {
  const routes = [{ prefix: '/api/opensky', gate: 'layers' }, { prefix: '/api/opensky-track', gate: 'layers' }, { prefix: '/api/google/3dtiles', gate: 'premium' }, { prefix: '/api/google', gate: 'open' }];
  assert.deepEqual(gatesForPath('/api/opensky-track/a', routes), ['layers']);
  assert.deepEqual(gatesForPath('/api/google/3dtiles/root.json', routes).sort(), ['open', 'premium']);
  assert.equal(gateForPath('/api/google/3dtiles/root.json', routes), 'premium');
  assert.equal(gateForPath('/api/unknown', routes), null);
});

test('hasGate: toggles for users, implicit for admins, role gates exact', () => {
  const user = { role: 'user', capabilities: '{"layers":true,"ai":false,"premium":false}' };
  assert.deepEqual(['layers', 'ai', 'premium', 'open', 'admin', 'super'].map((gate) => hasGate(user, gate)), [true, false, false, true, false, false]);
  const admin = { role: 'admin', capabilities: '{}' };
  assert.deepEqual(API_GATES.map((gate) => hasGate(admin, gate)), [true, true, true, true, true, false]);
  const owner = { role: 'super_admin' };
  assert.deepEqual(API_GATES.map((gate) => hasGate(owner, gate)), [true, true, true, true, true, true]);
  assert.equal(hasGate(null, 'open'), false);
  assert.equal(hasGate(owner, 'nonsense'), false);
});

test('assertRouteGate: missing/unknown gate, non-/api prefix, or admin prefix with the wrong gate throws', () => {
  assert.equal(assertRouteGate('/api/opensky', 'layers'), 'layers');
  assert.throws(() => assertRouteGate('/api/opensky', undefined), /no valid gate/);
  assert.throws(() => assertRouteGate('/api/opensky', 'user'), /no valid gate/);
  assert.throws(() => assertRouteGate('/opensky', 'layers'), /not an \/api/);
  assert.throws(() => assertRouteGate('/api', 'open'), /not an \/api/);
  assert.throws(() => assertRouteGate('/api/admin/keys', 'admin'), /must use gate "super"/);
  assert.equal(assertRouteGate('/api/admin/users', 'admin'), 'admin');
  assert.throws(() => assertRouteGate('/api/admin/new-thing', 'admin'), /must use gate "super"/, 'unmapped admin prefix → super only');
  assert.equal(assertRouteGate('/api/admin/new-thing', 'super'), 'super');
});

test('ADMIN_API_PERMISSIONS: account routes admin, system routes super (plan/auth/04)', () => {
  assert.deepEqual(ADMIN_API_PERMISSIONS, {
    '/api/admin/users': 'admin', '/api/admin/login-log': 'admin', '/api/admin/audit': 'admin', '/api/admin/kill-switches': 'super',
    '/api/admin/keys': 'super', '/api/admin/voice': 'super', '/api/admin/log': 'super', '/api/admin/health': 'super',
  });
});

test('registerApiRoute records the gate per app and mounts the handler; a gate-less route throws at registration', () => {
  const app = fakeApp();
  const handler = () => {};
  registerApiRoute({ middlewares: app }, '/api/opensky', 'layers', handler);
  registerApiRoute(app, '/api/log', 'open', handler);
  assert.deepEqual(registeredApiRoutes(app), [{ prefix: '/api/opensky', gate: 'layers' }, { prefix: '/api/log', gate: 'open' }]);
  assert.deepEqual(app.mounted.map(([path]) => path), ['/api/opensky', '/api/log']);
  assert.throws(() => registerApiRoute(app, '/api/tomtom', undefined, handler), /no valid gate/);
  assert.throws(() => registerApiRoute(app, '/api/opensky', 'open', handler), /registered twice/);
  assert.deepEqual(registeredApiRoutes(fakeApp()), [], 'another server has its own registry');
});

test('kill switch: only layers/ai/premium can be switched off', () => {
  const killed = createKillSwitchCheck(() => ({ ai: true, admin: true }));
  assert.equal(killed('ai'), true);
  assert.equal(killed('layers'), false);
  assert.equal(killed('admin'), false, 'admin/super/open cannot be killed');
  assert.equal(createKillSwitchCheck()('ai'), false, 'default stub: nothing off');
});

test('requireActor: admin vs super permission on the attached actor', () => {
  const req = (role) => ({ gevActor: { user: { id: 'u1' }, role } });
  assert.deepEqual(requireActor({}, 'admin'), { ok: false, status: 401, error: 'Login diperlukan' });
  assert.deepEqual(requireActor(req('user'), 'admin'), { ok: false, status: 403, error: 'Akses ditolak' });
  assert.deepEqual(requireActor(req('admin'), 'admin'), { ok: true, actorId: 'u1' });
  assert.equal(requireActor(req('admin'), 'super').status, 403);
  assert.deepEqual(requireActor(req('super_admin'), 'super'), { ok: true, actorId: 'u1' });
  assert.throws(() => requireActor(req('admin'), 'keys'), /unknown permission/);
});

test('registerApiRoute accepts a Connect-shaped app (a function with methods, as Vite\'s middlewares is)', () => {
  const app = Object.assign(function connectApp() {}, { use() {} });
  registerApiRoute({ middlewares: app }, '/api/opensky', 'layers', () => {});
  assert.deepEqual(registeredApiRoutes(app), [{ prefix: '/api/opensky', gate: 'layers' }]);
});
