// Task d1581ef8 (2026-11-11): bikeshare drew nothing anywhere outside the US
// and said nothing about why. These pin the guidance it now reports, the
// registry it reports against, and that the proxy accepts every listed feed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bikeshareGuidance, nearestBikeshareCity } from './bikeshareGuidance.js';
import { GBFS_CITY_REGISTRY } from './bikeshareCities.js';
import { isAllowedGbfsHost } from './gbfsProxy.mjs';
import { layerFeedState } from './managerFeedState.js';
import { layerShellStatus } from '../shell/layerStatus.js';

const JAKARTA = { lat: -6.2088, lon: 106.8456 };

test('too high: ask the user to zoom in', () => {
  assert.deepEqual(bikeshareGuidance({ altitudeOk: false }), {
    status: 'zoom-in',
    message: 'Perbesar peta (di bawah ±48 km) untuk memuat stasiun sepeda',
  });
});

test('no system in reach: say so and name the nearest one', () => {
  const guidance = bikeshareGuidance({ altitudeOk: true, center: JAKARTA, inRangeCount: 0, registry: GBFS_CITY_REGISTRY });
  assert.equal(guidance.status, 'empty');
  assert.match(guidance.message, /^Tidak ada sistem sepeda bersama di area ini — terdekat: Tokyo, ±5\.\d{3} km$/);
});

test('a system in reach needs no guidance', () => {
  assert.equal(bikeshareGuidance({ altitudeOk: true, center: JAKARTA, inRangeCount: 1, registry: GBFS_CITY_REGISTRY }), null);
});

test('nearest city tolerates a missing centre or registry', () => {
  assert.equal(nearestBikeshareCity(null, GBFS_CITY_REGISTRY), null);
  assert.equal(nearestBikeshareCity(JAKARTA, []), null);
  assert.equal(nearestBikeshareCity({ lat: 52.52, lon: 13.4 }, GBFS_CITY_REGISTRY).city, 'Berlin');
});

test('the layer row shows the prompt as guidance, never as a fault', () => {
  const guidance = bikeshareGuidance({ altitudeOk: true, center: JAKARTA, inRangeCount: 0, registry: GBFS_CITY_REGISTRY });
  const stats = { count: 0, lastUpdate: null, loading: false, status: guidance.status, error: guidance.message };
  assert.equal(layerFeedState(stats), 'nominal');
  const row = layerShellStatus({ id: 'bikeshare', enabled: true, lifecycleState: 'enabled', stats });
  assert.equal(row.key, 'live');
  assert.equal(row.detail, guidance.message);
});

test('the registry reaches beyond the US and drops the feeds that died', () => {
  const ids = new Set(GBFS_CITY_REGISTRY.map((entry) => entry.id));
  for (const id of ['montreal-bixi', 'mexico-city-ecobici', 'oslo-bysykkel', 'bergen-bysykkel', 'berlin-nextbike', 'vienna-wienmobil', 'lyon-velov', 'tokyo-docomo']) {
    assert.ok(ids.has(id), id);
  }
  // 404 / unresolvable on 2026-11-11.
  for (const id of ['fort-lauderdale-broward', 'tucson-tugo', 'fort-worth-trinity', 'buffalo-reddy', 'columbus-cogo']) {
    assert.equal(ids.has(id), false, id);
  }
});

test('every registered feed host passes the GBFS proxy allowlist', () => {
  for (const entry of GBFS_CITY_REGISTRY) {
    for (const host of entry.hosts) assert.ok(isAllowedGbfsHost(host), `${entry.id}: ${host}`);
  }
  assert.equal(isAllowedGbfsHost('gbfs.cogobikeshare.com'), false, 'a dead host leaves the allowlist');
  assert.equal(isAllowedGbfsHost('evil.example'), false);
});
