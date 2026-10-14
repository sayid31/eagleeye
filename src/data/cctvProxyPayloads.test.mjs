import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildStreamPayload, toPublicSource } from './cctvProxyPayloads.mjs';

test('toPublicSource never exposes upstream URLs or portal sessions', () => {
  const row = toPublicSource({
    id: 'c1',
    name: 'Cam',
    url: 'https://host.example/secret.m3u8',
    snapshotUrl: 'https://host.example/snap.jpg',
    portalSession: { bootstrapUrl: 'https://host.example/' },
    feedType: 'HLS',
    lat: 1,
    lon: 2,
  });
  assert.equal(row.id, 'c1');
  assert.equal(row.feedType, 'hls');
  assert.equal(row.sourceKind, 'configured');
  assert.equal(row.headingConfidence, '');
  for (const key of ['url', 'snapshotUrl', 'portalSession']) assert.ok(!(key in row), key);
  assert.ok(!JSON.stringify(row).includes('host.example'));
});

test('toPublicSource marks a source without a url as fallback unless it declares a kind', () => {
  assert.equal(toPublicSource({ id: 'x' }).sourceKind, 'fallback');
  assert.equal(toPublicSource({ id: 'x', sourceKind: 'curated' }).sourceKind, 'curated');
});

test('buildStreamPayload gives a media URL only for video feeds and encodes the id', () => {
  const live = buildStreamPayload({ feedType: 'hls', url: 'https://h/x.m3u8', provider: 'P' }, 'a b/1');
  assert.equal(live.mediaUrl, '/api/cctv/media/a%20b%2F1');
  assert.equal(live.frameUrl, '/api/cctv/frame/a%20b%2F1');
  assert.equal(live.provider, 'P');
  const still = buildStreamPayload({ feedType: 'image' }, 'c');
  assert.equal(still.mediaUrl, null);
  const unknown = buildStreamPayload(undefined, 'z');
  assert.equal(unknown.feedType, 'image');
  assert.equal(unknown.sourceKind, 'fallback');
});

test('toPublicSource and buildStreamPayload never expose onDemand or pageToken', () => {
  const source = {
    id: 'g1', name: 'G', feedType: 'hls', url: 'https://h.example/hls/a/index.m3u8',
    onDemand: { controlUrl: 'https://h.example/api/v1/public/cctv/abc' },
    pageToken: { pageUrl: 'https://h.example/v2/' },
  };
  for (const out of [toPublicSource(source), buildStreamPayload(source, 'g1')]) {
    const text = JSON.stringify(out);
    assert.doesNotMatch(text, /onDemand|pageToken|controlUrl|pageUrl|h\.example/);
  }
});
