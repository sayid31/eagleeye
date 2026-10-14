// Guard for the Java / Banten ATCS rows (8 city/regency sites) of the UNOFFICIAL Indonesia pack.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { isAllowedRelOrigin } from '../server/hlsManifestProxy.mjs';
import { DEFAULT_CCTV_MAX_SOURCES } from './cctvSourceCatalog.mjs';
import { seedCatalog } from './cctvCatalog.js';

const pack = JSON.parse(readFileSync(new URL('../../config/cctv_sources.indonesia_unofficial.json', import.meta.url), 'utf8'));

// Camera counts are the ones that served a valid segment in the final re-probe and through /api/cctv/media (2026-10-13);
// bounds are generous boxes around each administrative area.
const SITES = [
  { prefix: 'banjar', cityId: 'banjar', count: 20, lat: [-7.40, -7.33], lon: [108.50, 108.66], host: /^https:\/\/atcs\.banjarkota\.go\.id:5443\/[A-Za-z0-9_\-/]+\.m3u8$/ },
  { prefix: 'banten', cityId: 'banten', count: 14, lat: [-6.38, -6.15], lon: [106.15, 106.26], host: /^https:\/\/cctv\.bantenprov\.go\.id\/service\/stream-cctv\/[0-9a-f-]{36}\/index\.m3u8$/ },
  { prefix: 'banyumas', cityId: 'banyumas', count: 15, lat: [-7.47, -7.39], lon: [109.07, 109.30], host: /^https:\/\/cctv\.dev\.banyumaskab\.go\.id\/[a-z0-9_]+\/index\.m3u8$/ },
  { prefix: 'cianjur', cityId: 'cianjur', count: 44, lat: [-6.88, -6.70], lon: [106.99, 107.33], host: /^https:\/\/atcs\.cianjurkab\.go\.id:5443\/[A-Za-z]+App\/streams\/[A-Za-z0-9_\-]+\.m3u8$/ },
  { prefix: 'magelang', cityId: 'magelang', count: 74, lat: [-7.50, -7.43], lon: [110.20, 110.23], host: /^https:\/\/(dev\.cctv|restreamer)\.magelangkota\.go\.id\/memfs\/[0-9a-f-]{36}\.m3u8$/ },
  { prefix: 'semarang', cityId: 'semarang', count: 47, lat: [-7.08, -6.95], lon: [110.30, 110.50], host: /^https:\/\/livepantau\.semarangkota\.go\.id\/[0-9a-f-]{36}\/index\.m3u8$/ },
  { prefix: 'tangerangkab', cityId: 'tangerangkab', count: 28, lat: [-6.35, -6.05], lon: [106.37, 106.72], host: /^https:\/\/cctv-dishub\.tangerangkab\.go\.id\/storage\/video\/[A-Za-z0-9_\-]+\/[A-Za-z0-9_\-]+\.m3u8$/ },
  { prefix: 'tasikmalaya', cityId: 'tasikmalaya', count: 18, lat: [-7.36, -7.29], lon: [108.18, 108.24], host: /^https:\/\/atcs\.tasikmalayakota\.go\.id\/camera\/[A-Za-z0-9_\-]+\.m3u8$/ },
];
const rowsOf = (prefix) => pack.filter((row) => row.id.startsWith(`${prefix}-atcs-`));

for (const site of SITES) {
  const rows = rowsOf(site.prefix);

  test(`${site.prefix}: ${site.count} unique HLS rows inside the area, each passing the rel-origin guard`, () => {
    assert.equal(rows.length, site.count);
    assert.equal(new Set(rows.map((row) => row.id)).size, site.count);
    assert.equal(new Set(rows.map((row) => row.url)).size, site.count);
    for (const row of rows) {
      assert.equal(row.cityId, site.cityId, row.id);
      assert.equal(row.feedType, 'hls', row.id);
      assert.equal(row.sourceKind, 'unofficial-hls-id', row.id);
      assert.match(row.url, site.host, row.id);
      assert.ok(isAllowedRelOrigin(row.url, row.url), `${row.id} must pass the rel-origin guard for its own host`);
      assert.ok(row.lat > site.lat[0] && row.lat < site.lat[1] && row.lon > site.lon[0] && row.lon < site.lon[1], `${row.id} outside ${site.prefix} bounds`);
    }
  });

  test(`${site.prefix}: rows carry no credential, query token or portal session, and are labelled and revocable`, () => {
    for (const row of rows) {
      assert.doesNotMatch(row.url, /[?@]/, row.id);
      assert.equal(row.portalSession, undefined, row.id);
      assert.match(row.name, /\(SOURCE-PUBLISHED LOCATION — Live — Unofficial\)$/, row.id);
      assert.match(row.provider, /^UNOFFICIAL — .*\(Internal Demo Only, SOURCE-PUBLISHED LOCATION\)$/, row.id);
      assert.match(row.license, /^UNOFFICIAL SOURCE/, row.id);
      assert.match(row.license, new RegExp(`${site.prefix}-atcs-\\*`), row.id);
      assert.match(row.license, /CCTV_INDONESIA_UNOFFICIAL_ENABLED=0/, row.id);
      assert.equal(row.headingConfidence, 'low', row.id);
      assert.ok(Number.isFinite(row.groundElevationM), row.id);
    }
  });

  test(`${site.prefix}: cameras at one site are at least 40 m apart so every marker stays selectable`, () => {
    for (let i = 0; i < rows.length; i += 1) {
      for (let j = i + 1; j < rows.length; j += 1) {
        const metres = Math.hypot((rows[i].lat - rows[j].lat) * 111000, (rows[i].lon - rows[j].lon) * 110000);
        assert.ok(metres >= 40, `${rows[i].id} is only ${Math.round(metres)} m from ${rows[j].id}`);
      }
    }
  });
}

test('Cianjur now has one stream per camera and the old city-level Liliarahsuroso row is replaced by its located twin', () => {
  const rows = rowsOf('cianjur');
  assert.equal(rows.some((row) => /CITY-LEVEL/.test(row.name)), false);
  const located = rows.filter((row) => /liliarahsuroso\.m3u8$/.test(row.url));
  assert.equal(located.length, 1);
});

test('Banten keeps only the cameras the portal actually served (Lebak, Bapenda, KP3B); the 150 that answered 404 are left out', () => {
  const rows = rowsOf('banten');
  assert.ok(rows.every((row) => /^banten-atcs-(lebak|bapenda|kp3b)-/.test(row.id)), 'unexpected Banten area prefix');
});

test('sources that cannot be played safely are not in the pack: Kudus (per-viewer token), Medan, Bogor, Grobogan (no usable public list)', () => {
  // Kota Serang was left out for its incomplete TLS chain; it is in the pack since config/ca/ bundles its intermediate (see cctvIndonesiaNusantaraPack.test.mjs).
  for (const prefix of ['kudus', 'medan', 'bogor', 'grobogan']) {
    assert.equal(rowsOf(prefix).length, 0, prefix);
  }
});

test('credentialed sources are not in the pack: no RTSP, no embedded user info, no client id/secret or SDC header values', () => {
  for (const site of SITES) {
    for (const row of rowsOf(site.prefix)) {
      assert.match(row.url, /^https:\/\//, row.id);
      assert.doesNotMatch(JSON.stringify(row), /rtsp:|x-client-secret|x-sdc|password/i, row.id);
    }
  }
});

test('Semarang has live rows, so its two synthetic seed cameras are gone', () => {
  assert.equal(seedCatalog().some((camera) => camera.cityId === 'semarang'), false);
});

test('the merged catalog cap leaves room for the whole pack plus the other sources', () => {
  assert.ok(DEFAULT_CCTV_MAX_SOURCES >= pack.length + 250 + 300 + 250, 'cap must fit the pack plus Austin/Caltrans/TfL allowances');
});
