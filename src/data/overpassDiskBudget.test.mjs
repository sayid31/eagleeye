// Overpass disk-cache TTL classes and the size bound that makes a long TTL safe.
//
// Measured 2026-10-21: the disk cache had grown to 939 files / 369 MB over 47
// days because nothing ever deleted an entry — `readOverpassDisk` only filtered
// expired ones on READ. Raising the road TTL from 7 to 60 days turns that
// directory into a long-lived store, so it needs a real bound. Eviction
// planning and TTL classification are pure; the sweep is exercised against a
// temp directory.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fsp } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  OVERPASS_DISK_BUDGET_BYTES,
  _resetOverpassSweepCounter,
  enforceOverpassDiskBudget,
  noteOverpassDiskWrite,
  planOverpassDiskEviction,
  statOverpassDiskEntry,
} from './overpassDiskBudget.mjs';
import {
  isOverpassBoundaryQuery,
  isOverpassRoadQuery,
  overpassDiskTtlMs,
  readOverpassDisk,
  writeOverpassDisk,
} from './overpassDiskCache.mjs';

const DAY = 86_400_000;

// The real traffic-layer queries, as buildOverpassQuery() emits them.
const MAJOR_ROADS = '[out:json][timeout:12];(way["highway"~"^(motorway|trunk|primary|secondary)$"](-6.1750,106.6692,-6.1370,106.7192););out geom qt;';
const ALL_ROADS = '[out:json][timeout:25];(way["highway"~"^(motorway|trunk|primary|secondary|tertiary|residential|unclassified)$"](30.1,-97.9,30.5,-97.5););out geom qt;';

test('road queries earn the long disk TTL', () => {
  assert.equal(isOverpassRoadQuery(MAJOR_ROADS), true);
  assert.equal(isOverpassRoadQuery(ALL_ROADS), true);
  assert.equal(overpassDiskTtlMs(MAJOR_ROADS) / DAY, 60);
  assert.equal(overpassDiskTtlMs(ALL_ROADS) / DAY, 60);
});

test('non-road queries keep their existing TTLs', () => {
  const boundary = '[out:json][timeout:25];is_in(37.5,14.2)->.a;area.a["boundary"="administrative"];out tags;';
  const cafes = '[out:json][timeout:25];(node["amenity"="cafe"](around:500,30.27,-97.74););out;';
  assert.equal(overpassDiskTtlMs(boundary) / DAY, 30, 'boundary TTL is unchanged');
  assert.equal(overpassDiskTtlMs(cafes) / DAY, 7, 'the default TTL is unchanged');
  assert.equal(isOverpassRoadQuery(cafes), false);
  assert.equal(isOverpassRoadQuery(''), false);
  assert.equal(isOverpassRoadQuery(null), false);
  // A bare mention of the word must not promote a query to road class.
  assert.equal(isOverpassRoadQuery('[out:json];node["name"="Highway Diner"];out;'), false);
});

test('a boundary query that also filters roads keeps the boundary TTL', () => {
  // Both classes match; boundary wins because it is the expensive one to refetch.
  const both = '[out:json][timeout:25];is_in(37.5,14.2)->.a;way.a["highway"~"motorway"];out geom;';
  assert.equal(isOverpassBoundaryQuery(both), true);
  assert.equal(isOverpassRoadQuery(both), true);
  assert.equal(overpassDiskTtlMs(both) / DAY, 30);
});

test('a cache under budget evicts nothing', () => {
  const entries = [
    { file: 'a.json', size: 100, cachedAt: 1 },
    { file: 'b.json', size: 100, cachedAt: 2 },
  ];
  const plan = planOverpassDiskEviction(entries, 1000);
  assert.deepEqual(plan.evict, []);
  assert.equal(plan.totalBytes, 200);
  assert.equal(plan.freedBytes, 0);
});

test('eviction drops the coldest entries and stops as soon as it fits', () => {
  const entries = [
    { file: 'newest.json', size: 400, cachedAt: 4000 },
    { file: 'coldest.json', size: 400, cachedAt: 1000 },
    { file: 'middle.json', size: 400, cachedAt: 2000 },
  ];
  const plan = planOverpassDiskEviction(entries, 1000);
  assert.deepEqual(plan.evict, ['coldest.json'], 'one eviction is enough to fit 1200 into 1000');
  assert.equal(plan.freedBytes, 400);
  assert.equal(plan.totalBytes, 1200);

  // A tighter budget keeps going, still coldest-first, and never touches the newest.
  const tighter = planOverpassDiskEviction(entries, 500);
  assert.deepEqual(tighter.evict, ['coldest.json', 'middle.json']);
  assert.equal(tighter.freedBytes, 800);
});

test('eviction is deterministic when timestamps tie', () => {
  const entries = [
    { file: 'b.json', size: 500, cachedAt: 1000 },
    { file: 'a.json', size: 500, cachedAt: 1000 },
  ];
  assert.deepEqual(planOverpassDiskEviction(entries, 600).evict, ['a.json']);
});

test('planning tolerates empty, missing, and malformed entry lists', () => {
  assert.deepEqual(planOverpassDiskEviction([], 10).evict, []);
  assert.deepEqual(planOverpassDiskEviction(null, 10).evict, []);
  const messy = planOverpassDiskEviction(
    [null, { size: 10 }, { file: 'ok.json', size: 'x', cachedAt: null }],
    0,
  );
  assert.deepEqual(messy.evict, [], 'a zero-size entry cannot help, so it is not evicted');
});

test('the budget leaves real-world usage alone', () => {
  // 369 MB was 47 days of ordinary exploration; it must not trigger eviction.
  const observed = 369 * 1024 * 1024;
  assert.ok(
    OVERPASS_DISK_BUDGET_BYTES > observed,
    'a budget below observed normal use would evict during ordinary work',
  );
  assert.ok(OVERPASS_DISK_BUDGET_BYTES <= 1024 * 1024 * 1024, 'and must still bound the disk');
});

test('the sweep deletes the coldest files on disk and leaves the rest readable', async () => {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'gev-overpass-budget-'));
  try {
    const write = (name, cachedAt, padBytes) => fsp.writeFile(
      path.join(dir, name),
      JSON.stringify({ status: 200, body: 'x'.repeat(padBytes), contentType: 'application/json', cachedAt }),
    );
    await write('cold.json', 1_000, 4000);
    await write('warm.json', 2_000, 4000);
    await write('hot.json', 3_000, 4000);
    // A non-cache file must be ignored entirely.
    await fsp.writeFile(path.join(dir, 'README.txt'), 'not a cache entry');

    const before = await enforceOverpassDiskBudget(dir, { budgetBytes: 1024 * 1024 });
    assert.equal(before.evicted, 0, 'under budget: nothing is touched');

    const result = await enforceOverpassDiskBudget(dir, { budgetBytes: 9000 });
    assert.equal(result.evicted, 1);
    const left = (await fsp.readdir(dir)).sort();
    assert.deepEqual(left, ['README.txt', 'hot.json', 'warm.json'],
      'the coldest cache entry goes; unrelated files stay');

    // Survivors are still valid JSON payloads, not truncated.
    const payload = JSON.parse(await fsp.readFile(path.join(dir, 'hot.json'), 'utf8'));
    assert.equal(payload.status, 200);
  } finally {
    await fsp.rm(dir, { recursive: true, force: true });
  }
});

test('an unparseable entry stays evictable instead of becoming immortal', async () => {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'gev-overpass-budget-'));
  try {
    await fsp.writeFile(path.join(dir, 'corrupt.json'), '{ truncated');
    const entry = await statOverpassDiskEntry(dir, 'corrupt.json');
    assert.ok(entry, 'a corrupt file still reports a size');
    assert.ok(Number.isFinite(entry.cachedAt), 'and falls back to mtime for age');

    const result = await enforceOverpassDiskBudget(dir, { budgetBytes: 0 });
    assert.equal(result.evicted, 1);
    assert.deepEqual(await fsp.readdir(dir), []);
  } finally {
    await fsp.rm(dir, { recursive: true, force: true });
  }
});

test('the sweep is throttled, not run on every write', async () => {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'gev-overpass-budget-'));
  try {
    _resetOverpassSweepCounter();
    // budgetBytes 0 means any sweep that runs must report work; a null return
    // is therefore unambiguous proof the sweep was skipped.
    assert.equal(await noteOverpassDiskWrite(dir, { every: 3, budgetBytes: 0 }), null);
    assert.equal(await noteOverpassDiskWrite(dir, { every: 3, budgetBytes: 0 }), null);
    const swept = await noteOverpassDiskWrite(dir, { every: 3, budgetBytes: 0 });
    assert.ok(swept, 'the third write sweeps');
    // ...and the counter resets, so the next sweep is another full interval away.
    assert.equal(await noteOverpassDiskWrite(dir, { every: 3, budgetBytes: 0 }), null);
  } finally {
    _resetOverpassSweepCounter();
    await fsp.rm(dir, { recursive: true, force: true });
  }
});

// This is the test that fails if the sweep is ever unwired from the write path:
// it drives the real writeOverpassDisk, not the budget module directly.
test('real cache writes enforce the budget and keep the newest payload readable', async () => {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'gev-overpass-budget-'));
  try {
    _resetOverpassSweepCounter();
    const body = 'y'.repeat(5000);
    const keys = ['query-a', 'query-b', 'query-c'];
    for (let i = 0; i < keys.length; i += 1) {
      await writeOverpassDisk(
        keys[i],
        { status: 200, body, contentType: 'application/json', endpoint: 'test', cachedAt: 1000 + i },
        { dir, every: keys.length, budgetBytes: 12_000 },
      );
    }
    const left = await fsp.readdir(dir);
    assert.ok(left.length < keys.length, 'the write path swept: not every payload survived');
    assert.ok(left.length >= 1, 'and it stopped as soon as the cache fit');
    // The payload written last is still intact and still readable through the
    // normal read path, i.e. eviction cost a cache miss, not corruption.
    const newest = await readOverpassDisk('query-c', Infinity, { dir });
    assert.equal(newest?.body, body);
  } finally {
    _resetOverpassSweepCounter();
    await fsp.rm(dir, { recursive: true, force: true });
  }
});

test('a missing cache directory is not an error', async () => {
  const dir = path.join(os.tmpdir(), 'gev-overpass-budget-does-not-exist-12345');
  const result = await enforceOverpassDiskBudget(dir);
  assert.deepEqual(result, { evicted: 0, freedBytes: 0, totalBytes: 0 });
  assert.equal(await statOverpassDiskEntry(dir, 'nope.json'), null);
});
