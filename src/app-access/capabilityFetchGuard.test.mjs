import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installCapabilityFetchGuard } from './capabilityFetchGuard.js';

const ORIGIN = 'http://localhost:4173'; // test-only
const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

function setup({ locks = {}, reply = () => json(200, { ok: true }) } = {}) {
  const network = [];
  const denials = [];
  const target = { location: { origin: ORIGIN }, fetch: async (input) => { network.push(String(input?.url ?? input)); return reply(String(input)); } };
  const lockState = new Map(Object.entries(locks));
  const uninstall = installCapabilityFetchGuard({
    target,
    lockKindOf: (gate) => lockState.get(gate) ?? null,
    onDenied: (denial) => { denials.push(denial); lockState.set(denial.gate, denial.kind); },
  });
  return { target, network, denials, uninstall };
}

test('a locked gate is answered locally: no network call, the server refusal shape', async () => {
  const { target, network } = setup({ locks: { layers: 'plan' } });
  const response = await target.fetch('/api/opensky/states/all');
  assert.equal(response.status, 403);
  assert.deepEqual(await response.json(), { error: 'CAPABILITY_REQUIRED', message: 'Belum diizinkan admin', gate: 'layers' });
  assert.deepEqual(network, []);
});

test('the HUD summary of a locked ai gate resolves quietly as "not configured"', async () => {
  const { target, network } = setup({ locks: { ai: 'plan' } });
  const response = await target.fetch('/api/openai/hud-summary', { method: 'POST', body: '{}' });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).configured, false);
  assert.deepEqual(network, []);
});

test('a real 403 CAPABILITY_REQUIRED locks the gate once; the poller then stays off the network', async () => {
  const { target, network, denials } = setup({ reply: () => json(403, { error: 'CAPABILITY_REQUIRED', message: 'x', gate: 'layers' }) });
  const first = await target.fetch('/api/firms?bbox=1');
  assert.equal(first.status, 403);
  assert.equal((await first.json()).gate, 'layers', 'the caller still reads the original body');
  for (let poll = 0; poll < 5; poll += 1) await target.fetch('/api/firms?bbox=1');
  assert.deepEqual(denials, [{ gate: 'layers', kind: 'revoked' }]);
  assert.equal(network.length, 1);
});

test('503 FEATURE_DISABLED (kill switch) locks as killed and later calls get 503 locally', async () => {
  const { target, denials } = setup({ reply: () => json(503, { error: 'FEATURE_DISABLED', message: 'x', gate: 'ai' }) });
  await target.fetch('/api/live/session', { method: 'POST' });
  assert.deepEqual(denials, [{ gate: 'ai', kind: 'killed' }]);
  assert.equal((await target.fetch('/api/voice/usage', { method: 'POST' })).status, 503);
});

test('open routes, other origins, other refusals and non-JSON 403s pass through untouched', async () => {
  const { target, network, denials } = setup({
    reply: (url) => (url.includes('tomtom') ? new Response('nope', { status: 403, headers: { 'Content-Type': 'text/plain' } }) : json(403, { error: 'ORIGIN_NOT_ALLOWED' })),
  });
  await target.fetch('/api/terrain/heights?x=1');
  await target.fetch('https://earthquake.usgs.gov/fdsnws/event/1/query');
  await target.fetch('/api/tomtom/status');
  await target.fetch('/api/google/geocode?address=x');
  await target.fetch('/api/google/geocode?address=y');
  assert.deepEqual(network, ['/api/terrain/heights?x=1', 'https://earthquake.usgs.gov/fdsnws/event/1/query', '/api/tomtom/status', '/api/google/geocode?address=x', '/api/google/geocode?address=y']);
  assert.deepEqual(denials, []);
});

test('uninstall restores the previous fetch', () => {
  const { target, uninstall } = setup();
  const guarded = target.fetch;
  uninstall();
  assert.notEqual(target.fetch, guarded);
});
