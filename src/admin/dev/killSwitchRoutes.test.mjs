import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { OWNER_EMAIL, OWNER_PASSWORD, actorFor } from '../../auth/__fixtures__/authTestServer.mjs';
import { startDevTestServer } from './__fixtures__/devTestServer.mjs';

const PASSWORD = 'fixture-password-long-1'; // test-only
const ROUTE = '/api/admin/kill-switches';
let t;
const cookies = {};

before(async () => {
  t = await startDevTestServer();
  await t.state.services.bootstrap.setSuperAdminPassword(OWNER_EMAIL, OWNER_PASSWORD);
  cookies.owner = (await t.signIn(OWNER_EMAIL, OWNER_PASSWORD)).cookie;
  const owner = await actorFor(t, cookies.owner);
  const make = async (email, role) => {
    const created = await t.state.services.accounts.createUser(owner, { email, name: role, role, password: PASSWORD, capabilities: { layers: true, ai: true, premium: true } });
    assert.equal(created.ok, true, created.code);
    await (await t.state.auth.$context).internalAdapter.updateUser(created.user.id, { mustChangePassword: false });
    return (await t.signIn(email, PASSWORD)).cookie;
  };
  cookies.admin = await make('admin@example.test', 'admin');
  cookies.user = await make('user@example.test', 'user');
});
after(() => t.close());

const kill = (gate, killed, extra = {}, cookie = cookies.owner) => t.put(ROUTE, { gate, killed, reason: 'biaya melonjak', currentPassword: OWNER_PASSWORD, ...extra }, { cookie });

test('non-super_admin accounts get 403 on GET and PUT; anonymous 401', async () => {
  for (const who of ['admin', 'user']) {
    const get = await t.request(ROUTE, { cookie: cookies[who] });
    assert.equal(get.status, 403, who);
    assert.equal((await get.json()).error, 'SUPER_ADMIN_REQUIRED');
    assert.equal((await kill('ai', true, { currentPassword: PASSWORD }, cookies[who])).status, 403, `${who} PUT`);
  }
  assert.equal((await t.request(ROUTE)).status, 401);
  assert.deepEqual(t.rows('SELECT gate FROM kill_switch WHERE killed = 1'), [], 'nothing was switched');
});

test('GET lists every killable gate, all on by default', async () => {
  const res = await t.request(ROUTE, { cookie: cookies.owner });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.deepEqual(body.switches.map((row) => [row.gate, row.killed]), [['layers', false], ['ai', false], ['premium', false]]);
  assert.ok(body.cacheMs <= 2000);
});

test('PUT requires re-auth: missing or wrong password is refused and changes nothing', async () => {
  const missing = await kill('ai', true, { currentPassword: '' });
  assert.equal(missing.status, 403);
  assert.equal((await missing.json()).error, 'REAUTH_FAILED');
  const wrong = await kill('ai', true, { currentPassword: 'not-the-owner-password' });
  assert.equal((await wrong.json()).error, 'REAUTH_FAILED');
  assert.equal(t.rows("SELECT COUNT(*) AS n FROM kill_switch WHERE killed = 1")[0].n, 0);
});

test('PUT validates the body: unknown gate, non-boolean, missing reason when killing, cross-origin', async () => {
  for (const body of [{ gate: 'admin', killed: true, reason: 'xxx' }, { gate: 'ai', killed: 'yes', reason: 'xxx' }, { gate: 'ai', killed: true, reason: ' ' }]) {
    const res = await t.put(ROUTE, { ...body, currentPassword: OWNER_PASSWORD }, { cookie: cookies.owner });
    assert.equal(res.status, 400, JSON.stringify(body));
    assert.equal((await res.json()).error, 'INVALID_INPUT');
  }
  const crossOrigin = await t.put(ROUTE, { gate: 'ai', killed: true, reason: 'xxx', currentPassword: OWNER_PASSWORD }, { cookie: cookies.owner, headers: { origin: 'http://evil.example' } });
  assert.equal(crossOrigin.status, 403);
});

test('a killed gate answers 503 FEATURE_DISABLED for every role, super_admin included; other gates and /dev stay reachable', async () => {
  const res = await kill('layers', true);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.switch.killed, true);
  assert.equal(body.switch.reason, 'biaya melonjak');
  assert.equal(body.switch.updatedBy.emailMasked, 'o***@example.test');
  assert.equal(body.audit, 'written');
  for (const who of ['owner', 'admin', 'user']) {
    const blocked = await t.request('/api/opensky/states', { cookie: cookies[who] });
    assert.equal(blocked.status, 503, who);
    assert.deepEqual(await blocked.json(), { error: 'FEATURE_DISABLED', message: 'Feature is currently turned off by the developer', gate: 'layers' });
    assert.equal((await t.request('/api/openai/hud-summary', { cookie: cookies[who] })).status, 299, `${who}: ai unaffected`);
  }
  assert.equal((await t.request(ROUTE, { cookie: cookies.owner })).status, 200, 'the switch page itself is never killable');
  const restored = await kill('layers', false, { reason: '' });
  assert.equal(restored.status, 200);
  assert.equal((await t.request('/api/opensky/states', { cookie: cookies.owner })).status, 299, 'own change applies on the next request');
});

test('each killable gate is enforced on its own routes', async () => {
  for (const [gate, url] of [['ai', '/api/openai/hud-summary'], ['premium', '/api/google/3dtiles/root.json']]) {
    assert.equal((await kill(gate, true)).status, 200);
    const res = await t.request(url, { cookie: cookies.user });
    assert.equal(res.status, 503, gate);
    assert.equal((await res.json()).gate, gate);
    assert.equal((await t.request('/api/log', { cookie: cookies.user })).status, 299, 'open gate never killed');
    assert.equal((await kill(gate, false)).status, 200);
    assert.equal((await t.request(url, { cookie: cookies.user })).status, 299);
  }
});

test('killswitch.update is audited with actor, gate and reason, never the password', async () => {
  const rows = t.rows("SELECT actorRole, targetType, targetId, summary, meta FROM audit_log WHERE action = 'killswitch.update' ORDER BY createdAt");
  assert.ok(rows.length >= 6);
  assert.deepEqual({ ...rows[0], meta: JSON.parse(rows[0].meta) }, { actorRole: 'super_admin', targetType: 'gate', targetId: 'layers', summary: 'layers off: biaya melonjak', meta: { gate: 'layers', killed: true } });
  assert.doesNotMatch(JSON.stringify(rows), new RegExp(OWNER_PASSWORD));
});

test('switch state persists across a restart (new boot on the same database)', async () => {
  assert.equal((await kill('premium', true)).status, 200);
  const second = await startDevTestServer({ dir: t.dir, env: { BETTER_AUTH_SECRET: t.env.BETTER_AUTH_SECRET } });
  try {
    assert.notEqual(second.state.killSwitches, t.state.killSwitches);
    assert.equal(second.state.killSwitches.isKilled('premium'), true);
    assert.equal(second.state.killSwitches.list().find((row) => row.gate === 'premium').reason, 'biaya melonjak');
  } finally {
    await second.close();
    await kill('premium', false);
  }
});
