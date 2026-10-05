// Shape/safety guard for the hand-curated Indonesia UNOFFICIAL live-HLS pack.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { isAllowedRelOrigin } from '../server/hlsManifestProxy.mjs';

const pack = JSON.parse(readFileSync(new URL('../../config/cctv_sources.indonesia_unofficial.json', import.meta.url), 'utf8'));
const pelindung = pack.filter((row) => row.id.startsWith('bandung-pelindung-'));

test('every pack row is flagged unofficial HLS with a revocable UNOFFICIAL SOURCE license', () => {
  assert.ok(pack.length > 0);
  for (const row of pack) {
    assert.equal(row.sourceKind, 'unofficial-hls-id', row.id);
    assert.equal(row.feedType, 'hls', row.id);
    assert.match(row.license, /UNOFFICIAL SOURCE/, row.id);
    assert.match(row.license, /CCTV_INDONESIA_UNOFFICIAL_ENABLED=0/, row.id);
    assert.match(row.provider, /^UNOFFICIAL/, row.id);
  }
});

test('pack ids are unique and coordinates are finite and inside Indonesia', () => {
  assert.equal(new Set(pack.map((row) => row.id)).size, pack.length);
  for (const row of pack) {
    assert.ok(Number.isFinite(row.lat) && row.lat > -11.5 && row.lat < 6, `${row.id} lat`);
    assert.ok(Number.isFinite(row.lon) && row.lon > 95 && row.lon < 141.5, `${row.id} lon`);
  }
});

test('pack stream URLs are well-formed https and pass the HLS rel-origin guard for their own host', () => {
  for (const row of pack) {
    assert.match(row.url, /^https:\/\/[^/]/, `${row.id} malformed url`);
    const sibling = new URL('seg0.ts', row.url).href;
    assert.equal(isAllowedRelOrigin(sibling, row.url), true, row.id);
    assert.equal(isAllowedRelOrigin('https://evil.example/seg0.ts', row.url), false, row.id);
  }
});

test('Pelindung Bandung rows are a bounded, coordinate-deduped, low-confidence-heading subset', () => {
  assert.ok(pelindung.length >= 20 && pelindung.length <= 100, `count ${pelindung.length}`);
  const keys = pelindung.map((row) => `${row.lat.toFixed(4)},${row.lon.toFixed(4)}`);
  assert.equal(new Set(keys).size, keys.length);
  for (const row of pelindung) {
    assert.equal(row.headingConfidence, 'low', row.id);
    assert.match(row.url, /^https:\/\/pelindung\.bandung\.go\.id:3443\/video\//, row.id);
    assert.equal(row.cityId, 'bandung', row.id);
  }
});
