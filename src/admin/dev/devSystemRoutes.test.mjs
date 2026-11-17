import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { OWNER_EMAIL, OWNER_PASSWORD, actorFor } from '../../auth/__fixtures__/authTestServer.mjs';
import { startDevTestServer } from './__fixtures__/devTestServer.mjs';

const NOW = 1_800_000_000_000;
const PASSWORD = 'fixture-password-long-1'; // test-only
const KEY_VALUE = 'sk-test-never-shown-1234567890'; // test-only: must never appear in a reply
const src = {
  now: () => NOW,
  env: {},
  appVersion: '9.9.9',
  startedAt: NOW - 3_600_000,
  settingsStore: { read: () => ({ settings: { enabled: true, limits: { dailyMinutes: 30 } } }) },
  usageStore: { read: () => ({ version: 1, days: { '2026-11-17': { seconds: 600, sessions: 2, extrasUsd: 0, judgeCalls: 3, judgeUsd: 0.01 } } }), today: () => '2026-11-17' },
  keyStore: { status: () => ({ keys: [{ id: 'openai', title: 'OPENAI', set: true, value: KEY_VALUE }, { id: 'tomtom', title: 'TOMTOM', set: false }, { id: 'opensky', title: 'OPENSKY', set: true }] }) },
  openSkyCredits: () => ({ remaining: 300, at: NOW - 1000 }),
  openSkyWarnAt: 400,
  openSkyTtlMs: () => 300_000,
  tomtomBudget: () => null,
  judgeMax: 300,
  serverLog: { query: ({ level }) => ({ entries: [{ level, lastAt: NOW - 1000 }, { level, lastAt: NOW - 3 * 86_400_000 }] }) },
};
let t;
const cookies = {};

before(async () => {
  t = await startDevTestServer({ src });
  src.env = { ...t.env, HOST: '0.0.0.0' };
  await t.state.services.bootstrap.setSuperAdminPassword(OWNER_EMAIL, OWNER_PASSWORD);
  cookies.owner = (await t.signIn(OWNER_EMAIL, OWNER_PASSWORD)).cookie;
  const owner = await actorFor(t, cookies.owner);
  const created = await t.state.services.accounts.createUser(owner, { email: 'admin@example.test', name: 'A', role: 'admin', password: PASSWORD });
  await (await t.state.auth.$context).internalAdapter.updateUser(created.user.id, { mustChangePassword: false });
  cookies.admin = (await t.signIn('admin@example.test', PASSWORD)).cookie;
});
after(() => t.close());

test('GET /api/admin/system: version, runtime, auth, key presence, kill switches, recent errors, doctor warnings', async () => {
  const res = await t.request('/api/admin/system', { cookie: cookies.owner });
  assert.equal(res.status, 200);
  const text = await res.text();
  const body = JSON.parse(text);
  assert.equal(body.app.version, '9.9.9');
  assert.equal(body.app.uptimeSeconds, 3600);
  assert.equal(body.app.runtime.name, 'Node');
  assert.deepEqual(body.auth, { configured: true, googleSignIn: false });
  assert.deepEqual(body.keys.map((key) => [key.id, key.set]), [['openai', true], ['tomtom', false], ['opensky', true]]);
  assert.deepEqual(body.killSwitches.map((row) => row.killed), [false, false, false]);
  assert.equal(body.serverLog.recentErrors, 1);
  const exposure = body.doctor.find((item) => item.id === 'auth.exposure');
  assert.equal(exposure.level, 'warn', 'HOST=0.0.0.0 with password-only admins');
  assert.equal(exposure.params.passwordOnlyAdmins, 2);
  for (const secret of [KEY_VALUE, t.env.BETTER_AUTH_SECRET, OWNER_EMAIL, 'admin@example.test']) assert.ok(!text.includes(secret), 'no secret or email in the reply');
});

test('GET /api/admin/usage: composed from the injected counters', async () => {
  const res = await t.request('/api/admin/usage', { cookie: cookies.owner });
  assert.equal(res.status, 200);
  const { providers } = await res.json();
  const byId = Object.fromEntries(providers.map((item) => [item.id, item]));
  assert.deepEqual(byId.opensky.data, { remaining: 300, at: NOW - 1000, warnAt: 400, ttlMs: 300_000 });
  assert.equal(byId.opensky.status, 'warn');
  assert.deepEqual([byId.tomtom.status, byId.tomtom.data], ['off', null], 'no key, no fetch → empty state');
  assert.equal(byId.openai.data.todaySeconds, 600);
  assert.equal(byId.openai.data.judgeCalls, 3);
  assert.equal(byId.openai.data.days.length, 7);
});

test('both routes: super_admin only, GET only, no sub-paths', async () => {
  for (const url of ['/api/admin/system', '/api/admin/usage']) {
    assert.equal((await t.request(url, { cookie: cookies.admin })).status, 403, `${url} admin`);
    assert.equal((await t.request(url)).status, 401, `${url} anonymous`);
    const post = await t.post(url, {}, { cookie: cookies.owner });
    assert.equal(post.status, 405);
    assert.equal((await post.json()).error, 'METHOD_NOT_ALLOWED');
    assert.equal((await t.request(`${url}/x`, { cookie: cookies.owner })).status, 404);
  }
});
