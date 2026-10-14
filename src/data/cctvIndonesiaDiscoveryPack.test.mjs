// Guard for the ATCS sites found by the 514-regency discovery sweep (2026-10-14): Banjarbaru, Jambi, Karo,
// Nganjuk, Garut, Lebak (published coordinates) and Ciamis, Pemalang (guessed positions) in the UNOFFICIAL Indonesia pack.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { isAllowedRelOrigin } from '../server/hlsManifestProxy.mjs';
import { DEFAULT_CCTV_MAX_SOURCES } from './cctvSourceCatalog.mjs';

const pack = JSON.parse(readFileSync(new URL('../../config/cctv_sources.indonesia_unofficial.json', import.meta.url), 'utf8'));
const rowsOf = (prefix) => pack.filter((row) => row.id.startsWith(`${prefix}-atcs-`));

// Counts are the cameras that served a valid segment with an advancing media sequence in three probes and then through
// /api/cctv/media (2026-10-14); bounds are generous boxes around each administrative area.
const PUBLISHED = [
  { prefix: 'banjarbaru', count: 47, lat: [-3.60, -3.35], lon: [114.70, 114.95], host: /^https:\/\/stream-backup\.banjarbarukota\.go\.id\/[A-Za-z0-9_]+\/index\.m3u8$/ },
  { prefix: 'jambi', count: 19, lat: [-1.75, -1.50], lon: [103.50, 103.75], host: /^https:\/\/cctv\.jambikota\.go\.id\/stream\/\d+\/stream\.m3u8$/ },
  // Karo's official page embeds its MediaMTX origin by IP over plain http; the app proxies it, so the browser never sees http.
  { prefix: 'karo', count: 12, lat: [3.00, 3.20], lon: [98.40, 98.60], host: /^http:\/\/72\.62\.122\.47:8888\/cam\d+\/index\.m3u8$/, http: true },
  { prefix: 'nganjuk', count: 289, lat: [-7.90, -7.30], lon: [111.65, 112.30], host: /^https:\/\/wxyz\.nganjukkab\.go\.id\/[A-Za-z0-9_.\-]+\/streams\/[A-Za-z0-9]+\.m3u8$/ },
  { prefix: 'garut', count: 15, lat: [-7.60, -6.90], lon: [107.60, 108.20], host: /^https:\/\/cctv\.garutkab\.go\.id\/streams\/cam_\d+\/live\.m3u8$/ },
  { prefix: 'lebak', count: 10, lat: [-6.60, -6.20], lon: [106.10, 106.40], host: /^https:\/\/cctv\.lebakkab\.go\.id\/hls\/CAM-\d+\/main\/index\.m3u8$/ },
];
const GUESSED = [
  { prefix: 'ciamis', count: 14, lat: [-7.40, -7.25], lon: [108.25, 108.45], host: /^https:\/\/ams\.ciamiskab\.go\.id:5443\/LiveApp\/streams\/[A-Za-z0-9]+\.m3u8$/ },
  { prefix: 'pemalang', count: 12, lat: [-7.20, -6.80], lon: [109.20, 109.50], host: /^https:\/\/stream\.pemalangkab\.go\.id\/([0-9]+\/)?[a-z0-9]+(\/[a-z0-9]+)?\/?[a-z0-9]*\.m3u8$/ },
];
const metres = (a, b) => Math.hypot((a.lat - b.lat) * 111000, (a.lon - b.lon) * 110000);

function assertCommon(site, rows) {
  assert.equal(rows.length, site.count);
  assert.equal(new Set(rows.map((row) => row.id)).size, site.count);
  assert.equal(new Set(rows.map((row) => row.url)).size, site.count);
  for (const row of rows) {
    assert.equal(row.cityId, site.prefix, row.id);
    assert.equal(row.feedType, 'hls', row.id);
    assert.equal(row.sourceKind, 'unofficial-hls-id', row.id);
    assert.match(row.url, site.host, row.id);
    assert.doesNotMatch(row.url, /[?@]/, row.id);
    assert.equal(row.portalSession, undefined, row.id);
    assert.ok(isAllowedRelOrigin(row.url, row.url), `${row.id} must pass the rel-origin guard for its own host`);
    assert.ok(row.lat > site.lat[0] && row.lat < site.lat[1] && row.lon > site.lon[0] && row.lon < site.lon[1], `${row.id} outside ${site.prefix} bounds`);
    assert.match(row.license, /^UNOFFICIAL SOURCE/, row.id);
    assert.match(row.license, new RegExp(`${site.prefix}-atcs-\\*`), row.id);
    assert.match(row.license, /CCTV_INDONESIA_UNOFFICIAL_ENABLED=0/, row.id);
    assert.equal(row.headingConfidence, 'low', row.id);
    assert.ok(Number.isFinite(row.groundElevationM), row.id);
    assert.doesNotMatch(JSON.stringify(row), /rtsp:|password|token=|session=|eyJ/i, row.id);
  }
  for (let i = 0; i < rows.length; i += 1) {
    for (let j = i + 1; j < rows.length; j += 1) {
      assert.ok(metres(rows[i], rows[j]) >= 40, `${rows[i].id} is only ${Math.round(metres(rows[i], rows[j]))} m from ${rows[j].id}`);
    }
  }
}

for (const site of PUBLISHED) {
  test(`${site.prefix}: ${site.count} HLS rows from the site's own coordinates, labelled SOURCE-PUBLISHED and revocable`, () => {
    const rows = rowsOf(site.prefix);
    assertCommon(site, rows);
    for (const row of rows) {
      assert.equal(row.url.startsWith('https://'), !site.http, row.id);
      assert.match(row.name, /\(SOURCE-PUBLISHED LOCATION — Live — Unofficial\)$/, row.id);
      assert.match(row.provider, /^UNOFFICIAL — .*\(Internal Demo Only, SOURCE-PUBLISHED LOCATION\)$/, row.id);
      assert.match(row.license, /publishes the coordinates/, row.id);
    }
  });
}

for (const site of GUESSED) {
  test(`${site.prefix}: ${site.count} HLS rows with a guessed position, never labelled SOURCE-PUBLISHED`, () => {
    const rows = rowsOf(site.prefix);
    assertCommon(site, rows);
    for (const row of rows) {
      assert.match(row.name, /\((APPROX\. LOCATION|CITY-LEVEL ONLY) — Live — Unofficial\)$/, row.id);
      assert.doesNotMatch(row.name + row.provider + row.license, /SOURCE-PUBLISHED LOCATION —|publishes the coordinates/, row.id);
    }
  });
}

test('Pemalang cameras whose title could not be placed are CITY-LEVEL ONLY, on a ring around the town square', () => {
  const city = rowsOf('pemalang').filter((row) => row.name.includes('CITY-LEVEL ONLY'));
  assert.deepEqual(city.map((row) => row.name.replace(/ \(.*/, '')).sort(), ['Depan Pendopo 1', 'Depan Pendopo 2', 'Tiptop Selatan']);
  for (const row of city) assert.ok(metres(row, { lat: -6.8903, lon: 109.3806 }) < 100, row.id);
});

test('cameras the sites list but that failed the probes are not in the pack', () => {
  // Karo cam12 is served under five titles with the same placeholder coordinates; only the one titled for it stays,
  // and Gedung DPRD Karo (cam27) shares those placeholder coordinates, so it is out too.
  assert.equal(rowsOf('karo').filter((row) => row.url.endsWith('/cam12/index.m3u8')).length, 1);
  assert.equal(rowsOf('karo').some((row) => /Gedung DPRD/.test(row.name)), false);
  // Banjarbaru "Sultan Agung" pair answered 404 on every probe; Ciamis lists six Offline streams.
  assert.equal(rowsOf('banjarbaru').some((row) => /sultan-agung/.test(row.id)), false);
});

test('portals that cannot be used safely are not in the pack', () => {
  // Wonosobo and Kudus hand out per-viewer tokens, Samarinda/Sukoharjo sit behind a challenge page, Brebes needs an API login.
  for (const prefix of ['wonosobo', 'kudus', 'samarinda', 'sukoharjo', 'brebes']) {
    assert.equal(rowsOf(prefix).length, 0, prefix);
  }
});

test('the merged catalog cap fits the grown pack plus the other sources', () => {
  assert.ok(DEFAULT_CCTV_MAX_SOURCES >= pack.length + 250 + 300 + 250, `cap ${DEFAULT_CCTV_MAX_SOURCES} vs pack ${pack.length}`);
});
