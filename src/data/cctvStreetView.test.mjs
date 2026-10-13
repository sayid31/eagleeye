import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fetchStreetViewFrame } from './cctvStreetView.mjs';

const okImage = () => ({
  ok: true,
  headers: { get: () => 'image/jpeg' },
  arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
});

test('returns null without calling fetch when key or coordinates are missing', async () => {
  let calls = 0;
  const fetchImpl = async () => { calls += 1; return okImage(); };
  assert.equal(await fetchStreetViewFrame({ lat: 1, lon: 2 }, { apiKey: '', fetchImpl }), null);
  assert.equal(await fetchStreetViewFrame({ lat: NaN, lon: 2 }, { apiKey: 'k', fetchImpl }), null);
  assert.equal(calls, 0);
});

test('builds a clamped Street View request and returns the image', async () => {
  let requested;
  const fetchImpl = async (u) => { requested = new URL(u); return okImage(); };
  const out = await fetchStreetViewFrame(
    { lat: 1.5, lon: 2.5, heading: 90, fov: 500, pitch: -90 },
    { apiKey: 'test-only-key', fetchImpl },
  );
  assert.equal(out.ok, true);
  assert.equal(out.contentType, 'image/jpeg');
  assert.deepEqual([...out.body], [1, 2, 3]);
  assert.equal(requested.searchParams.get('location'), '1.5,2.5');
  assert.equal(requested.searchParams.get('fov'), '120');
  assert.equal(requested.searchParams.get('pitch'), '-40');
  assert.equal(requested.searchParams.get('heading'), '90');
});

test('upstream failure, non-image reply and thrown fetch all fall through to null', async () => {
  const pose = { lat: 1, lon: 2 };
  const bad = (resp) => ({ apiKey: 'k', fetchImpl: async () => resp });
  assert.equal(await fetchStreetViewFrame(pose, bad({ ok: false, headers: { get: () => 'image/jpeg' } })), null);
  assert.equal(await fetchStreetViewFrame(pose, bad({ ok: true, headers: { get: () => 'text/html' } })), null);
  assert.equal(await fetchStreetViewFrame(pose, { apiKey: 'k', fetchImpl: async () => { throw new Error('boom'); } }), null);
});
