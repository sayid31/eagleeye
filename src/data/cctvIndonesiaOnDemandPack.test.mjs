// Guard for the Gresik (on-demand HLS) and Jombang (page-token MJPEG) rows of the UNOFFICIAL Indonesia pack.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { normalizeSourceItem } from './cctvSourceNormalize.mjs';
import { toPublicSource } from './cctvProxyPayloads.mjs';
import { DEFAULT_CCTV_MAX_SOURCES } from './cctvSourceCatalog.mjs';

const pack = JSON.parse(readFileSync(new URL('../../config/cctv_sources.indonesia_unofficial.json', import.meta.url), 'utf8'));
const gresik = pack.filter((row) => row.id.startsWith('gresik-atcs-'));
const jombang = pack.filter((row) => row.id.startsWith('jombang-atcs-'));

// Counts are the cameras that streamed (Gresik: advancing playlist + valid segment; Jombang: a decodable,
// changing JPEG that is not ZoneMinder's "Unable to stream" image) through /api/cctv on 2026-10-14.
const SITES = [
  { prefix: 'gresik', rows: gresik, count: 55, feedType: 'hls', lat: [-7.45, -5.60], lon: [112.30, 112.85], host: /^https:\/\/cctvkanjeng\.gresikkab\.go\.id\/hls\/[a-z0-9-]+\/index\.m3u8$/ },
  { prefix: 'jombang', rows: jombang, count: 16, feedType: 'mjpeg', lat: [-7.80, -7.40], lon: [112.10, 112.40], host: /^https:\/\/cctv\.jombangkab\.go\.id\/zm\/cgi-bin\/nph-zms\?monitor=\d+$/ },
];

for (const site of SITES) {
  test(`${site.prefix}: ${site.count} unique ${site.feedType} rows inside the area`, () => {
    assert.equal(site.rows.length, site.count);
    assert.equal(new Set(site.rows.map((row) => row.id)).size, site.count);
    assert.equal(new Set(site.rows.map((row) => row.url)).size, site.count);
    for (const row of site.rows) {
      assert.equal(row.cityId, site.prefix, row.id);
      assert.equal(row.feedType, site.feedType, row.id);
      assert.match(row.url, site.host, row.id);
      assert.ok(row.lat > site.lat[0] && row.lat < site.lat[1] && row.lon > site.lon[0] && row.lon < site.lon[1], `${row.id} outside ${site.prefix} bounds`);
    }
  });

  test(`${site.prefix}: rows are labelled, revocable and keep every camera marker selectable`, () => {
    for (const row of site.rows) {
      assert.match(row.name, /\(SOURCE-PUBLISHED LOCATION — Live — Unofficial\)$/, row.id);
      assert.match(row.provider, /^UNOFFICIAL — .*\(Internal Demo Only, SOURCE-PUBLISHED LOCATION\)$/, row.id);
      assert.match(row.license, /^UNOFFICIAL SOURCE/, row.id);
      assert.match(row.license, new RegExp(`${site.prefix}-atcs-\\*`), row.id);
      assert.match(row.license, /CCTV_INDONESIA_UNOFFICIAL_ENABLED=0/, row.id);
      assert.equal(row.headingConfidence, 'low', row.id);
    }
    for (let i = 0; i < site.rows.length; i += 1) {
      for (let j = i + 1; j < site.rows.length; j += 1) {
        const metres = Math.hypot((site.rows[i].lat - site.rows[j].lat) * 111000, (site.rows[i].lon - site.rows[j].lon) * 110000);
        assert.ok(metres >= 40, `${site.rows[i].id} is only ${Math.round(metres)} m from ${site.rows[j].id}`);
      }
    }
  });

  test(`${site.prefix}: no credential, token, RTSP URL or user info is stored, and the browser payload hides the control fields`, () => {
    for (const row of site.rows) {
      assert.doesNotMatch(row.url, /[@]|token=|[?&]viewer_id/, row.id);
      assert.doesNotMatch(JSON.stringify(row), /rtsp:|password|token=|session=|eyJ|viewer_id/i, row.id);
      const normalized = normalizeSourceItem(row);
      const hostOrigin = new URL(row.url).origin;
      for (const control of [normalized.onDemand?.controlUrl, normalized.pageToken?.pageUrl].filter(Boolean)) {
        assert.equal(new URL(control).origin, hostOrigin, row.id);
      }
      assert.doesNotMatch(JSON.stringify(toPublicSource(normalized)), /onDemand|pageToken|controlUrl|pageUrl|nph-zms\?|https:\/\/[^ ]*\/hls\/[a-z0-9-]+\/index/, row.id);
    }
  });
}

test('gresik: every row declares an on-demand control URL that survives normalization', () => {
  for (const row of gresik) {
    assert.match(row.onDemand?.controlUrl || '', /^https:\/\/cctvkanjeng\.gresikkab\.go\.id\/api\/v1\/public\/cctv\/[0-9a-f-]{36}$/, row.id);
    assert.equal(normalizeSourceItem(row).onDemand?.controlUrl, row.onDemand.controlUrl, row.id);
    assert.equal(row.pageToken, undefined, row.id);
  }
});

test('jombang: every row reads its token from the public page at runtime', () => {
  for (const row of jombang) {
    assert.equal(row.pageToken?.pageUrl, 'https://cctv.jombangkab.go.id/v2/', row.id);
    assert.equal(normalizeSourceItem(row).pageToken?.pageUrl, row.pageToken.pageUrl, row.id);
    assert.equal(row.onDemand, undefined, row.id);
  }
});

test('the merged catalog cap still fits the pack plus the other sources', () => {
  assert.ok(DEFAULT_CCTV_MAX_SOURCES >= pack.length + 800, `cap ${DEFAULT_CCTV_MAX_SOURCES} vs pack ${pack.length}`);
});
