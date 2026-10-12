import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  fallbackHeadingFromId,
  hashSeed,
  isVideoFeedType,
  normalizeFeedType,
  normalizeKey,
  normalizeSourceItem,
  prioritizeSources,
  toFiniteNumber,
} from './cctvSourceNormalize.mjs';

test('toFiniteNumber falls back for NaN and Infinity, keeps real numbers', () => {
  assert.equal(toFiniteNumber('12.5'), 12.5);
  assert.equal(toFiniteNumber('abc', 7), 7);
  assert.equal(toFiniteNumber(Infinity, 0), 0);
  assert.ok(Number.isNaN(toFiniteNumber(undefined)));
});

test('normalizeKey produces lowercase snake_case without edge underscores', () => {
  assert.equal(normalizeKey('  Camera ID! '), 'camera_id');
  assert.equal(normalizeKey(null), '');
});

test('hashSeed is deterministic and fallbackHeadingFromId lands on a 22.5 degree step', () => {
  assert.equal(hashSeed('abc'), hashSeed('abc'));
  assert.notEqual(hashSeed('abc'), hashSeed('abd'));
  const heading = fallbackHeadingFromId('camera-42');
  assert.equal(heading % 22.5, 0);
  assert.ok(heading >= 0 && heading < 360);
});

test('feed type helpers only treat hls/video as video feeds', () => {
  assert.equal(isVideoFeedType(normalizeFeedType('HLS')), true);
  assert.equal(isVideoFeedType(normalizeFeedType('snapshot')), false);
  assert.equal(isVideoFeedType(normalizeFeedType('')), false);
});

test('prioritizeSources keeps the cameras nearest any anchor and leaves short lists alone', () => {
  const cams = [
    { id: 'far', lat: 0, lon: 0 },
    { id: 'near-a', lat: 10.001, lon: 10 },
    { id: 'near-b', lat: 50.001, lon: 50 },
    { id: 'nowhere', lat: NaN, lon: NaN },
  ];
  const anchors = [{ lat: 10, lon: 10 }, { lat: 50, lon: 50 }];
  assert.deepEqual(prioritizeSources(cams, 2, anchors).map((c) => c.id).sort(), ['near-a', 'near-b']);
  assert.equal(prioritizeSources(cams, 10, anchors).length, 4);
  assert.equal(prioritizeSources(cams, 2, []).length, 4);
});

test('normalizeSourceItem fills safe defaults and keeps the portal session server-side shape', () => {
  const row = normalizeSourceItem({
    id: ' c1 ',
    lat: '1.5',
    lon: 'x',
    url: 'https://host.example/s.m3u8',
    portalSession: { bootstrapUrl: 'https://host.example/', referer: 'https://host.example/page' },
    poseSource: 'curated',
  });
  assert.equal(row.id, 'c1');
  assert.equal(row.name, 'c1');
  assert.equal(row.lat, 1.5);
  assert.ok(Number.isNaN(row.lon));
  assert.equal(row.provider, 'Configured CCTV Source');
  assert.equal(row.sourceKind, 'configured');
  assert.equal(row.poseSource, 'curated');
  assert.equal(row.portalSession.bootstrapUrl, 'https://host.example/');
  assert.equal(normalizeSourceItem({ id: 'c2' }).portalSession, undefined);
  assert.equal(normalizeSourceItem({ id: 'c3', poseSource: 'auto' }).poseSource, undefined);
});
