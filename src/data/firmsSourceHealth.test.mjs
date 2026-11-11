// Staging 2026-11-11: NOAA-20 and NOAA-21 failed, SNPP answered 200 with no
// rows, and the proxy cached that as a fresh empty world for 30 min — the
// layer read "Live" with no fires. These pin the usable-data rule (pure) and
// drive the real proxy with a stubbed upstream.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { firmsPartialFailureReason, firmsRefreshUsable, firmsSourceSummary } from './firmsSourceHealth.js';
import { firmsProxy } from './firmsProxy.mjs';
import { layerFeedState } from './managerFeedState.js';

const STAGING = [
  { source: 'VIIRS_NOAA20_NRT', count: 0, ok: false, error: 'timeout 60 s' },
  { source: 'VIIRS_NOAA21_NRT', count: 0, ok: false, error: 'HTTP 429' },
  { source: 'VIIRS_SNPP_NRT', count: 0, ok: true },
];

test('a refresh whose only success is an empty source is not usable', () => {
  assert.equal(firmsRefreshUsable(STAGING), false);
  assert.equal(firmsRefreshUsable([{ ok: true, count: 3 }, { ok: false, count: 0 }]), true);
  assert.equal(firmsRefreshUsable([]), false);
  assert.equal(firmsRefreshUsable(undefined), false);
});

test('the summary names every source outcome for the log', () => {
  assert.equal(firmsSourceSummary(STAGING), 'NOAA-20: timeout 60 s; NOAA-21: HTTP 429; SNPP: 0 rows');
});

test('a partial failure reads degraded on the chip, never Live', () => {
  const sources = [{ source: 'VIIRS_NOAA20_NRT', count: 62018, ok: true }, STAGING[1]];
  const reason = firmsPartialFailureReason(sources);
  assert.equal(reason, 'sumber FIRMS gagal: NOAA-21');
  assert.equal(firmsPartialFailureReason([{ source: 'VIIRS_NOAA20_NRT', count: 5, ok: true }]), null);
  assert.equal(layerFeedState({ count: 62018, lastUpdate: 1, degraded: true, error: reason }), 'degraded');
});

// --- proxy integration ---------------------------------------------------

const HEADER = 'latitude,longitude,bright_ti4,scan,track,acq_date,acq_time,satellite,instrument,confidence,version,bright_ti5,frp,daynight';

function csvRow(lat, lon) {
  const t = new Date(Date.now() - 60 * 60_000);
  const date = t.toISOString().slice(0, 10);
  const time = `${String(t.getUTCHours()).padStart(2, '0')}${String(t.getUTCMinutes()).padStart(2, '0')}`;
  return `${lat},${lon},330.1,0.4,0.4,${date},${time},N,VIIRS,n,2.0NRT,290.2,5.5,D`;
}

function mount(cacheDir) {
  let handler = null;
  firmsProxy({ cacheDir }).configureServer({ middlewares: { use: (prefix, fn) => { if (prefix === '/api/firms') handler = fn; } } });
  return () => new Promise((resolve) => {
    const res = {
      headersSent: false,
      writeHead(status) { this.status = status; this.headersSent = true; },
      end(body) { resolve({ status: this.status, body: JSON.parse(body) }); },
    };
    handler({ url: '/' }, res);
  });
}

async function withStubs(answer, run) {
  const original = { fetch: globalThis.fetch, warn: console.warn, key: process.env.FIRMS_MAP_KEY };
  const warnings = [];
  process.env.FIRMS_MAP_KEY = 'test-key'; // test-only
  globalThis.fetch = async (url) => answer(String(url));
  console.warn = (...args) => warnings.push(args.join(' '));
  try {
    await run(warnings);
  } finally {
    globalThis.fetch = original.fetch;
    console.warn = original.warn;
    if (original.key === undefined) delete process.env.FIRMS_MAP_KEY;
    else process.env.FIRMS_MAP_KEY = original.key;
  }
}

/** NOAA-20/21 fail, SNPP answers a header-only CSV: the staging shape. */
const stagingUpstream = (url) => {
  if (url.includes('VIIRS_SNPP_NRT')) return new Response(`${HEADER}\n`, { status: 200 });
  if (url.includes('VIIRS_NOAA21_NRT')) return new Response('Too many', { status: 429 });
  throw new TypeError('fetch failed');
};

test('proxy: staging shape with no cache answers 502 and logs why', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'gev-firms-'));
  try {
    await withStubs(stagingUpstream, async (warnings) => {
      const result = await mount(dir)();
      assert.equal(result.status, 502);
      const log = warnings.join('\n');
      assert.match(log, /no FIRMS source returned detections \(NOAA-20: fetch failed; NOAA-21: HTTP 429; SNPP: 0 rows\)/);
      assert.ok(!log.includes('test-key'), 'the MAP_KEY never reaches a log line');
    });
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('proxy: staging shape keeps serving the last good fires, marked stale', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'gev-firms-'));
  const good = { at: Date.now() - 31 * 60_000, sources: [{ source: 'VIIRS_NOAA20_NRT', count: 1, ok: true }], fires: [] };
  try {
    // Build a real good entry through the proxy's own parser first.
    await withStubs((url) => (url.includes('VIIRS_NOAA20_NRT')
      ? new Response(`${HEADER}\n${csvRow(-2.5, 113.9)}\n`, { status: 200 })
      : new Response(`${HEADER}\n`, { status: 200 })), async () => {
      const first = await mount(dir)();
      assert.equal(first.status, 200);
      assert.equal(first.body.count, 1);
      good.fires = first.body.fires;
    });
    // Age the good entry past its TTL, then hit the staging failure.
    writeFileSync(path.join(dir, 'firms.json'), JSON.stringify(good));
    await withStubs(stagingUpstream, async () => {
      const result = await mount(dir)();
      assert.equal(result.status, 200);
      assert.equal(result.body.stale, true);
      assert.equal(result.body.count, 1, 'good fires are not replaced by an empty world');
    });
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('proxy: an empty entry already on disk is never served as fresh', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'gev-firms-'));
  writeFileSync(path.join(dir, 'firms.json'), JSON.stringify({ at: Date.now() - 60_000, sources: STAGING, fires: [] }));
  let calls = 0;
  try {
    await withStubs((url) => {
      calls += 1;
      return new Response(`${HEADER}\n${url.includes('NOAA20') ? csvRow(-0.5, 101.4) : ''}\n`, { status: 200 });
    }, async () => {
      const result = await mount(dir)();
      assert.equal(calls, 3, 'the empty entry triggered a refresh');
      assert.equal(result.status, 200);
      assert.equal(result.body.count, 1);
      assert.equal(result.body.stale, false);
    });
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('proxy: a partial failure is cached with each failed source and its reason', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'gev-firms-'));
  try {
    await withStubs((url) => {
      if (url.includes('VIIRS_NOAA20_NRT')) return new Response(`${HEADER}\n${csvRow(-6.2, 106.8)}\n`, { status: 200 });
      return stagingUpstream(url);
    }, async () => {
      const result = await mount(dir)();
      assert.equal(result.status, 200);
      assert.equal(result.body.count, 1);
      assert.deepEqual(result.body.sources.map(({ source, ok, error }) => [source, ok, error]), [
        ['VIIRS_NOAA20_NRT', true, undefined],
        ['VIIRS_NOAA21_NRT', false, 'HTTP 429'],
        ['VIIRS_SNPP_NRT', true, undefined],
      ]);
      assert.equal(firmsPartialFailureReason(result.body.sources), 'sumber FIRMS gagal: NOAA-21');
    });
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
