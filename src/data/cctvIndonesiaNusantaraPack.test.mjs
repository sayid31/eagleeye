// Guard for the Aceh / Kalimantan / East Java ATCS rows (6 sites) of the UNOFFICIAL Indonesia pack.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { isAllowedRelOrigin } from '../server/hlsManifestProxy.mjs';
import { DEFAULT_CCTV_MAX_SOURCES } from './cctvSourceCatalog.mjs';

const pack = JSON.parse(readFileSync(new URL('../../config/cctv_sources.indonesia_unofficial.json', import.meta.url), 'utf8'));

// Counts are the cameras that served a valid segment with an advancing media sequence in three probes and then through
// /api/cctv/media (2026-10-14); bounds are generous boxes around each administrative area.
const SITES = [
  { prefix: 'bandaaceh', count: 47, lat: [5.50, 5.60], lon: [95.27, 95.34], host: /^https:\/\/(api\.bandaacehkota\.go\.id\/cctv|cctv-stream\.bandaacehkota\.info)\/memfs\/[0-9a-f-]{36}\.m3u8$/ },
  { prefix: 'balangan', count: 36, lat: [-2.45, -2.25], lon: [115.40, 115.60], host: /^https:\/\/cctv\.balangankab\.go\.id\/hls\/[a-z0-9-]+\/index\.m3u8$/ },
  { prefix: 'banjarmasin', count: 33, lat: [-3.40, -3.26], lon: [114.55, 114.64], host: /^https:\/\/atcs\.banjarmasinkota\.go\.id\/stream\/[A-Za-z0-9_\-]+\/index\.m3u8$/ },
  { prefix: 'kobar', count: 22, lat: [-2.78, -2.64], lon: [111.60, 111.72], host: /^https:\/\/cctv\.kotawaringinbaratkab\.go\.id\/storage\/stream\/cctv\d+\/a\d+\.m3u8$/ },
  { prefix: 'tanahbumbu', count: 11, lat: [-3.80, -3.38], lon: [115.37, 116.03], host: /^https:\/\/atcs\.tanahbumbukab\.go\.id\/hls\/cctv_ch\d+\/index\.m3u8$/ },
  { prefix: 'situbondo', count: 19, lat: [-7.80, -7.65], lon: [113.65, 114.30], host: /^https:\/\/cctvstream\.situbondokab\.go\.id\/cctv\d+\/index\.m3u8$/ },
];
const rowsOf = (prefix) => pack.filter((row) => row.id.startsWith(`${prefix}-atcs-`));

for (const site of SITES) {
  const rows = rowsOf(site.prefix);

  test(`${site.prefix}: ${site.count} unique HLS rows inside the area, each passing the rel-origin guard`, () => {
    assert.equal(rows.length, site.count);
    assert.equal(new Set(rows.map((row) => row.id)).size, site.count);
    assert.equal(new Set(rows.map((row) => row.url)).size, site.count);
    for (const row of rows) {
      assert.equal(row.cityId, site.prefix, row.id);
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

test('sources that cannot be played safely or lawfully as static HLS are not in the pack', () => {
  // Kutai Timur: WAF proof-of-work challenge. Jatim Pelayaran: MJPEG with embedded camera credentials.
  // Pontianak: YouTube embeds. Kaltim: inactive, WebRTC or session-token URLs.
  // (Gresik and Jombang are in the pack; their guards are in cctvIndonesiaOnDemandPack.test.mjs.)
  for (const prefix of ['kutaitimur', 'jatimpelayaran', 'pontianak', 'kaltim']) {
    assert.equal(rowsOf(prefix).length, 0, prefix);
  }
});

// Kediri and Pati publish no coordinates, so their rows must never claim the SOURCE-PUBLISHED tier.
const UNPOSITIONED = [
  { prefix: 'kediri', count: 17, lat: [-7.90, -7.73], lon: [111.93, 112.08], host: /^https:\/\/pplterpadu\.kedirikota\.go\.id:8888\/[a-z_]+\/index\.m3u8$/ },
  { prefix: 'pati', count: 4, lat: [-6.80, -6.70], lon: [111.00, 111.10], host: /^https:\/\/streaming\.patikab\.go\.id\/memfs\/[0-9a-f-]{36}\.m3u8$/ },
];
for (const site of UNPOSITIONED) {
  test(`${site.prefix}: ${site.count} HLS rows with a guessed position, never labelled SOURCE-PUBLISHED`, () => {
    const rows = rowsOf(site.prefix);
    assert.equal(rows.length, site.count);
    assert.equal(new Set(rows.map((row) => row.url)).size, site.count);
    for (const row of rows) {
      assert.match(row.url, site.host, row.id);
      assert.doesNotMatch(row.url, /[?@]/, row.id);
      assert.ok(isAllowedRelOrigin(row.url, row.url), row.id);
      assert.match(row.name, /\((APPROX\. LOCATION|CITY-LEVEL ONLY) — Live — Unofficial\)$/, row.id);
      assert.doesNotMatch(row.name + row.provider + row.license, /SOURCE-PUBLISHED LOCATION —/, row.id);
      assert.match(row.license, /CCTV_INDONESIA_UNOFFICIAL_ENABLED=0/, row.id);
      assert.equal(row.headingConfidence, 'low', row.id);
      assert.ok(row.lat > site.lat[0] && row.lat < site.lat[1] && row.lon > site.lon[0] && row.lon < site.lon[1], row.id);
    }
    for (let i = 0; i < rows.length; i += 1) {
      for (let j = i + 1; j < rows.length; j += 1) {
        const metres = Math.hypot((rows[i].lat - rows[j].lat) * 111000, (rows[i].lon - rows[j].lon) * 110000);
        assert.ok(metres >= 40, `${rows[i].id} is only ${Math.round(metres)} m from ${rows[j].id}`);
      }
    }
  });
}

test('credentialed sources are not in the pack: no RTSP, no embedded user info, no tokens or session ids', () => {
  for (const site of [...SITES, ...UNPOSITIONED]) {
    for (const row of rowsOf(site.prefix)) {
      assert.match(row.url, /^https:\/\//, row.id);
      assert.doesNotMatch(JSON.stringify(row), /rtsp:|password|token=|session=|eyJ/i, row.id);
    }
  }
});

test('the merged catalog cap leaves room for the whole pack plus the other sources', () => {
  assert.ok(DEFAULT_CCTV_MAX_SOURCES >= pack.length + 250 + 300 + 250, 'cap must fit the pack plus Austin/Caltrans/TfL allowances');
});
