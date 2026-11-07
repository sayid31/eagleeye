import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildOverpassQuery } from './trafficOverpassQuery.js';
import {
  bboxContains, createOverpassCoverIndex, cropOverpassBody, parseCoverKey, serveFromCover, wayTouchesBox,
} from './overpassCoverIndex.mjs';

const norm = (q) => q.replace(/\s+/g, ' ').trim();
const roadKey = (s, w, n, e, opts) => norm(buildOverpassQuery(s, w, n, e, opts));
const BIG = [-7.85, 110.35, -7.80, 110.40];
const SMALL = [-7.8375, 110.3625, -7.8125, 110.3875];

const way = (id, coords) => ({ type: 'way', id, geometry: coords.map(([lat, lon]) => ({ lat, lon })) });
const BODY = JSON.stringify({
  version: 0.6,
  elements: [
    way(1, [[-7.83, 110.37], [-7.82, 110.38]]), // fully inside SMALL
    way(2, [[-7.845, 110.355], [-7.844, 110.356]]), // in BIG only
    way(3, [[-7.825, 110.355], [-7.825, 110.395]]), // crosses SMALL, no vertex inside
  ],
});

test('parseCoverKey splits a road query into template + bbox, and rejects others', () => {
  const parsed = parseCoverKey(roadKey(...SMALL));
  assert.deepEqual(parsed.bbox, { south: -7.8375, west: 110.3625, north: -7.8125, east: 110.3875 });
  assert.equal(parsed.template, parseCoverKey(roadKey(...BIG)).template, 'same class + timeout = same template');
  assert.notEqual(parseCoverKey(roadKey(...SMALL, { majorOnly: true })).template, parsed.template, 'major-only is a different template');
  assert.equal(parseCoverKey('[out:json];node["amenity"="cafe"](-7.9,110.3,-7.8,110.4);out;'), null, 'not a road query');
  assert.equal(parseCoverKey('[out:json];way["highway"](-7.8,110.4,-7.9,110.3);out geom;'), null, 'inverted bbox');
});

test('bbox containment uses the request edges with float tolerance', () => {
  const big = { south: -7.85, west: 110.35, north: -7.8, east: 110.4 };
  assert.equal(bboxContains(big, { south: -7.8375, west: 110.3625, north: -7.8125, east: 110.3875 }), true);
  assert.equal(bboxContains(big, { south: -7.86, west: 110.36, north: -7.81, east: 110.38 }), false);
  assert.equal(bboxContains(big, { ...big, south: -7.850000000001 }), true);
});

test('crop keeps ways that touch the bbox — inside or crossing — and drops the rest', () => {
  const box = { south: -7.8375, west: 110.3625, north: -7.8125, east: 110.3875 };
  assert.equal(wayTouchesBox(way(9, [[-7.825, 110.355], [-7.825, 110.395]]).geometry, box), true, 'crossing segment');
  const cropped = JSON.parse(cropOverpassBody(BODY, box));
  assert.deepEqual(cropped.elements.map((e) => e.id), [1, 3]);
  assert.equal(cropped.version, 0.6, 'other response fields survive');
  assert.equal(cropOverpassBody('not json', box), null);
});

test('index: smallest containing tile first, same template only, TTL respected, persisted', async () => {
  let saved = null;
  let clock = 1_000_000;
  const index = createOverpassCoverIndex({ save: (rows) => { saved = rows; }, ttlFor: () => 10_000, now: () => clock, saveDelayMs: 0 });
  const huge = roadKey(-7.9, 110.3, -7.7, 110.5);
  const big = roadKey(...BIG);
  assert.equal(index.record(huge, clock - 100), true);
  assert.equal(index.record(big, clock - 100), true);
  assert.equal(index.record('[out:json];node(1,2,3,4);out;', clock), false, 'non-road keys are not indexed');
  index.record(roadKey(...BIG, { majorOnly: true }), clock);
  assert.deepEqual(index.candidates(roadKey(...SMALL)), [big, huge]);
  clock += 20_000;
  assert.deepEqual(index.candidates(roadKey(...SMALL)), [], 'expired tiles are never offered');
  await new Promise((r) => setTimeout(r, 5));
  assert.ok(saved.some((row) => row.key === big));
  const reloaded = createOverpassCoverIndex({ load: () => saved, now: () => 1_000_000, ttlFor: () => 10_000 });
  assert.equal(reloaded.size, 3);
});

test('serveFromCover crops the containing tile and forgets tiles whose file is gone', async () => {
  const index = createOverpassCoverIndex({ saveDelayMs: 0 });
  const gone = roadKey(-7.84, 110.36, -7.81, 110.39); // smaller than BIG: tried first
  const big = roadKey(...BIG);
  index.record(gone, Date.now());
  index.record(big, Date.now());
  const payloads = { [big]: { status: 200, body: BODY, contentType: 'application/json', cachedAt: 1 } };
  const served = await serveFromCover(index, roadKey(...SMALL), async (key) => payloads[key] || null);
  assert.deepEqual(JSON.parse(served.body).elements.map((e) => e.id), [1, 3]);
  assert.equal(served.status, 200);
  assert.deepEqual(index.candidates(roadKey(...SMALL)), [big], 'missing file dropped from the index');
  assert.equal(await serveFromCover(index, roadKey(-7.95, 110.2, -7.6, 110.6), async () => null), null, 'nothing contains it');
});

test('works on the real proxy key (percent-encoded form body), not just plain QL', async () => {
  const { sanitizeOverpassBody } = await import('./overpassCore.mjs');
  const proxyKey = (ql) => sanitizeOverpassBody(`data=${encodeURIComponent(ql)}`).body.replace(/\s+/g, ' ').trim();
  const small = proxyKey(roadKey(...SMALL));
  const big = proxyKey(roadKey(...BIG));
  assert.deepEqual(parseCoverKey(small).bbox, { south: -7.8375, west: 110.3625, north: -7.8125, east: 110.3875 });
  const index = createOverpassCoverIndex({ saveDelayMs: 0 });
  index.record(big, Date.now());
  assert.deepEqual(index.candidates(small), [big]);
});
