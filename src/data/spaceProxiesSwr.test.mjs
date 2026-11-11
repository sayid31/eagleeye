// Space Missions enable latency (task b418199c, measured 2026-11-11): a
// past-TTL cache made /api/launches wait 6 s for LL2 and /api/celestrak/active
// 14 s for CelesTrak — up to the 20 s timeout when the upstream failed — even
// though a usable copy was on disk. These tests drive both proxies with a
// stubbed upstream and an injected clock: a stale copy must answer at once.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { celestrakProxy, TLE_FAILURE_BACKOFF_MS, TLE_TTL_MS } from './celestrakProxy.mjs';
import { LL2_CACHE_TTL_MS, LL2_FAILURE_BACKOFF_MS, rocketLaunchesProxy } from './rocketLaunchesProxy.mjs';

const TLE = 'ISS (ZARYA)\n1 25544U 98067A   26315.5 .00016717 00000-0 10270-3 0  9005\n2 25544  51.6400 208.9163 0006317  69.9862  25.2906 15.49560720  1234\n';

function mount(plugin, route) {
  let handler = null;
  plugin.configureServer({ middlewares: { use: (prefix, fn) => { if (prefix === route) handler = fn; } } });
  return (url) => new Promise((resolve) => {
    const res = {
      headers: {},
      headersSent: false,
      writeHead(status, headers) { this.status = status; Object.assign(this.headers, headers); this.headersSent = true; },
      end(body) { resolve({ status: this.status, headers: this.headers, body: String(body ?? '') }); },
    };
    handler({ url, method: 'GET' }, res);
  });
}

/** Stub fetch: each call returns the next scripted answer (a function may delay or throw). */
async function withUpstream(script, run) {
  const original = globalThis.fetch;
  const warn = console.warn;
  const calls = [];
  const warnings = [];
  globalThis.fetch = async (url) => {
    calls.push(String(url));
    const next = script.shift();
    return typeof next === 'function' ? next() : next;
  };
  console.warn = (...args) => warnings.push(args.join(' '));
  try {
    await run({ calls, warnings });
  } finally {
    globalThis.fetch = original;
    console.warn = warn;
  }
}

const settle = () => new Promise((resolve) => setImmediate(resolve));
const never = () => new Promise(() => {});

test('CelesTrak: a past-TTL copy answers at once while one refresh runs behind it', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'gev-tle-'));
  let now = 10 * TLE_TTL_MS;
  writeFileSync(path.join(dir, 'celestrak-active.json'), JSON.stringify({ at: now - TLE_TTL_MS - 1, body: 'OLD\n' + TLE }));
  try {
    await withUpstream([never], async ({ calls }) => {
      const get = mount(celestrakProxy({ cacheDir: dir, now: () => now }), '/api/celestrak');
      const first = await get('/active');
      assert.equal(first.status, 200);
      assert.equal(first.headers['x-tle-cache'], 'STALE');
      assert.match(first.body, /^OLD/);
      const second = await get('/active');
      assert.equal(second.headers['x-tle-cache'], 'STALE');
      assert.equal(calls.length, 1, 'one background refresh per group, not one per request');
    });
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('CelesTrak: a failed refresh backs off; a cold group in the backoff fails fast', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'gev-tle-'));
  let now = 10 * TLE_TTL_MS;
  writeFileSync(path.join(dir, 'celestrak-geo.json'), JSON.stringify({ at: 1, body: TLE }));
  try {
    await withUpstream([new Response('busy', { status: 403 }), new Response('busy', { status: 403 })], async ({ calls, warnings }) => {
      const get = mount(celestrakProxy({ cacheDir: dir, now: () => now }), '/api/celestrak');
      assert.equal((await get('/geo')).headers['x-tle-cache'], 'STALE');
      await settle(); await settle();
      assert.match(warnings.join('\n'), /\[celestrak-proxy\] geo refresh failed \(HTTP 403\).*next try in 15 min/);
      assert.equal((await get('/geo')).headers['x-tle-cache'], 'STALE-BACKOFF');
      assert.equal(calls.length, 1, 'no second upstream call inside the backoff');

      const cold = await get('/stations');
      assert.equal(cold.status, 502);
      assert.equal(calls.length, 2, 'a cold group still tries once');
      now += 1000;
      const coldAgain = await get('/stations');
      assert.equal(coldAgain.headers['x-tle-cache'], 'BACKOFF');
      assert.equal(calls.length, 2, 'and then fails fast instead of waiting 20 s again');

      now += TLE_FAILURE_BACKOFF_MS;
      await withUpstream([new Response(TLE, { status: 200 })], async () => {
        assert.equal((await get('/geo')).headers['x-tle-cache'], 'STALE');
        await settle(); await settle();
        assert.equal((await get('/geo')).headers['x-tle-cache'], 'HIT', 'the background refresh landed');
      });
    });
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('CelesTrak: a cold group waits for the upstream once and then serves it', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'gev-tle-'));
  try {
    await withUpstream([new Response(TLE, { status: 200 })], async () => {
      const get = mount(celestrakProxy({ cacheDir: dir, now: () => 1000 }), '/api/celestrak');
      const miss = await get('/visual');
      assert.equal(miss.status, 200);
      assert.equal(miss.headers['x-tle-cache'], 'MISS');
      assert.equal((await get('/visual')).headers['x-tle-cache'], 'HIT');
    });
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

const launches = (tag) => JSON.stringify({ results: [{ id: tag }] });

test('Launch Library: a past-TTL copy answers at once while one refresh runs behind it', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'gev-ll2-'));
  const cachePath = path.join(dir, 'll2.json');
  let now = 100 * LL2_CACHE_TTL_MS;
  writeFileSync(cachePath, JSON.stringify({ at: now - LL2_CACHE_TTL_MS - 1, body: launches('old') }));
  try {
    await withUpstream([() => new Response(launches('new'), { status: 200 })], async ({ calls }) => {
      const get = mount(rocketLaunchesProxy({ cachePath, now: () => now }), '/api/launches');
      const first = await get('/');
      assert.equal(first.status, 200);
      assert.equal(first.headers['X-GEV-Cache'], 'STALE');
      assert.match(first.body, /"old"/);
      await settle(); await settle(); await settle();
      const second = await get('/');
      assert.equal(second.headers['X-GEV-Cache'], 'HIT');
      assert.match(second.body, /"new"/);
      assert.equal(calls.length, 1);
      // The disk write is fire-and-forget; let it land before the temp dir goes.
      for (let i = 0; i < 100 && !readFileSync(cachePath, 'utf8').includes('new'); i += 1) await settle();
    });
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('Launch Library: a failed refresh is logged once and not retried inside the backoff', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'gev-ll2-'));
  const cachePath = path.join(dir, 'll2.json');
  let now = 100 * LL2_CACHE_TTL_MS;
  writeFileSync(cachePath, JSON.stringify({ at: 1, body: launches('old') }));
  try {
    await withUpstream([new Response('{"detail":"throttled"}', { status: 429 })], async ({ calls, warnings }) => {
      const get = mount(rocketLaunchesProxy({ cachePath, now: () => now }), '/api/launches');
      assert.equal((await get('/')).headers['X-GEV-Cache'], 'STALE');
      await settle(); await settle(); await settle();
      const refreshWarnings = warnings.filter((w) => w.includes('refresh failed'));
      assert.equal(refreshWarnings.length, 1, warnings.join(' || '));
      assert.match(refreshWarnings[0], /\[launch-library-proxy\] refresh failed \(upstream HTTP 429\) — next try in 5 min/);
      now += LL2_FAILURE_BACKOFF_MS - 1;
      assert.equal((await get('/')).headers['X-GEV-Cache'], 'STALE-BACKOFF');
      assert.equal(calls.length, 1);
    });
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
