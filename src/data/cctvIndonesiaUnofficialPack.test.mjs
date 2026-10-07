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

const binamarga = pack.filter((row) => row.id.startsWith('binamarga-unofficial-'));

test('Bina Marga tol rows are bounded and always labelled APPROXIMATE LOCATION in name, provider and license', () => {
  assert.ok(binamarga.length >= 10 && binamarga.length <= 20, `count ${binamarga.length}`);
  for (const row of binamarga) {
    assert.match(row.name, /APPROX\. LOCATION/, row.id);
    assert.match(row.provider, /APPROXIMATE LOCATION/, row.id);
    assert.match(row.license, /APPROXIMATE LOCATION/, row.id);
    assert.equal(row.headingConfidence, 'low', row.id);
  }
});

test('Bina Marga rows sit inside Jakarta and none use the Cipali host (incomplete TLS chain, rejected by Node)', () => {
  for (const row of binamarga) {
    assert.equal(row.cityId, 'jakarta', row.id);
    assert.ok(row.lat > -6.35 && row.lat < -6.05 && row.lon > 106.8 && row.lon < 107.05, row.id);
    assert.doesNotMatch(row.url, /lintasmarga\.com/, row.id);
  }
});

const denpasarAtcs = pack.filter((row) => row.id.startsWith('denpasar-atcs-'));

test('ATCS Denpasar rows never present a guessed position as precise', () => {
  assert.ok(denpasarAtcs.length >= 90, `count ${denpasarAtcs.length}`);
  for (const row of denpasarAtcs) {
    assert.match(row.name, /APPROX\. LOCATION|CITY-LEVEL ONLY/, row.id);
    assert.match(row.provider, /APPROX\. LOCATION|CITY-LEVEL ONLY/, row.id);
    assert.match(row.license, /APPROXIMATE LOCATION|CITY-LEVEL LOCATION ONLY/, row.id);
    assert.match(row.url, /^https:\/\/atcs\.denpasarkota\.go\.id\/stream\/[A-Z0-9-]+\/stream\.m3u8$/, row.id);
    assert.equal(row.cityId, 'denpasar', row.id);
    assert.equal(row.headingConfidence, 'low', row.id);
    assert.ok(row.lat > -8.78 && row.lat < -8.60 && row.lon > 115.10 && row.lon < 115.32, `${row.id} outside Denpasar view bounds`);
  }
});

const bmtol = pack.filter((row) => row.id.startsWith('bmtol-unofficial-'));

test('Bina Marga CCTV Tol batch rows are bounded, approximate-labelled, and unique per stream', () => {
  assert.ok(bmtol.length >= 30 && bmtol.length <= 250, `count ${bmtol.length}`);
  assert.equal(new Set(bmtol.map((row) => row.url)).size, bmtol.length, 'duplicate stream url');
  for (const row of bmtol) {
    assert.match(row.name, /APPROX\. LOCATION/, row.id);
    assert.match(row.provider, /APPROXIMATE LOCATION/, row.id);
    assert.match(row.license, /APPROXIMATE LOCATION/, row.id);
    assert.match(row.license, /bmtol-unofficial-\*/, `${row.id} revoke hint must name this prefix`);
    assert.equal(row.headingConfidence, 'low', row.id);
  }
});

test('Jakarta-Cikampek rows lie along the corridor between Cawang and Cikampek', () => {
  const jakcik = bmtol.filter((row) => row.id.startsWith('bmtol-unofficial-jakcik-'));
  assert.ok(jakcik.length >= 30, `count ${jakcik.length}`);
  for (const row of jakcik) {
    assert.equal(row.cityId, 'tol-jakarta-cikampek', row.id);
    assert.ok(row.lat > -6.5 && row.lat < -6.2, `${row.id} lat`);
    assert.ok(row.lon > 106.85 && row.lon < 107.5, `${row.id} lon`);
    assert.match(row.url, /^https:\/\/(jmlive\.jasamarga\.com|pub2?\.hk-opt\.com)\//, row.id);
  }
  const kmOf = (row) => Number(row.id.match(/km-(\d+)-(\d+)/).slice(1).join('.'));
  const ordered = [...jakcik].sort((a, b) => kmOf(a) - kmOf(b));
  assert.ok(ordered[0].lon < ordered.at(-1).lon, 'higher KM must be further east');
});

const BMTOL_CORRIDORS = [
  { prefix: 'sebal', cityId: 'tol-serpong-balaraja', min: 30, lat: [-6.34, -6.29], lon: [106.59, 106.69], host: /^https:\/\/info\.serbaraja-tollroad\.co\.id:20443\// },
  { prefix: 'mbz', cityId: 'tol-jalan-layang-mbz', min: 30, lat: [-6.40, -6.22], lon: [106.93, 107.30], host: /^https:\/\/jmlive\.jasamarga\.com\// },
  { prefix: 'jorrs', cityId: 'tol-jorr-selatan', min: 15, lat: [-6.33, -6.27], lon: [106.76, 106.93], host: /^https:\/\/pub2?\.hk-opt\.com\// },
  { prefix: 'atp', cityId: 'tol-akses-tanjung-priok', min: 15, lat: [-6.15, -6.10], lon: [106.88, 106.95], host: /^https:\/\/pub2?\.hk-opt\.com\// },
];

for (const c of BMTOL_CORRIDORS) {
  test(`Bina Marga toll batch 2: ${c.prefix} rows sit on their own corridor`, () => {
    const rows = bmtol.filter((row) => row.id.startsWith(`bmtol-unofficial-${c.prefix}-`));
    assert.ok(rows.length >= c.min, `count ${rows.length}`);
    for (const row of rows) {
      assert.equal(row.cityId, c.cityId, row.id);
      assert.ok(row.lat > c.lat[0] && row.lat < c.lat[1], `${row.id} lat ${row.lat}`);
      assert.ok(row.lon > c.lon[0] && row.lon < c.lon[1], `${row.id} lon ${row.lon}`);
      assert.match(row.url, c.host, row.id);
      assert.ok(row.headingDeg >= 0 && row.headingDeg < 360, row.id);
    }
  });
}

test('Bina Marga toll batch 2 never duplicates a stream already used by a binamarga-unofficial row', () => {
  const earlier = new Set(pack.filter((row) => row.id.startsWith('binamarga-unofficial-')).map((row) => row.url));
  for (const row of bmtol) assert.equal(earlier.has(row.url), false, row.id);
});
