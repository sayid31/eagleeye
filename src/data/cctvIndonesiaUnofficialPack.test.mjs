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
  assert.ok(bmtol.length >= 30 && bmtol.length <= 700, `count ${bmtol.length}`);
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
  { prefix: 'jagorawi', cityId: 'tol-jagorawi', min: 15, lat: [-6.70, -6.25], lon: [106.80, 106.93], host: /^https:\/\/jmlive\.jasamarga\.com\// },
  { prefix: 'jorre', cityId: 'tol-jorr-timur', min: 15, lat: [-6.35, -6.12], lon: [106.88, 106.98], host: /^https:\/\/jmlive\.jasamarga\.com\// },
  { prefix: 'cipul', cityId: 'tol-cipularang', min: 10, lat: [-6.87, -6.40], lon: [107.38, 107.52], host: /^https:\/\/jmlive\.jasamarga\.com\// },
  { prefix: 'sedyatmo', cityId: 'tol-sedyatmo', min: 10, lat: [-6.14, -6.08], lon: [106.67, 106.79], host: /^https:\/\/jmlive\.jasamarga\.com\// },
  { prefix: 'janger', cityId: 'tol-jakarta-tangerang', min: 8, lat: [-6.24, -6.17], lon: [106.55, 106.80], host: /^https:\/\/jmlive\.jasamarga\.com\// },
  { prefix: 'padcil', cityId: 'tol-padaleunyi', min: 7, lat: [-7.00, -6.84], lon: [107.49, 107.75], host: /^https:\/\/jmlive\.jasamarga\.com\// },
  { prefix: 'jsb', cityId: 'tol-semarang-batang', min: 12, lat: [-7.01, -6.91], lon: [109.74, 110.38], host: /^https:\/\/jmlive\.jasamarga\.com\// },
  { prefix: 'balsam', cityId: 'tol-balikpapan-samarinda', min: 10, lat: [-1.24, -0.52], lon: [116.88, 117.21], host: /^https:\/\/jmlive\.jasamarga\.com\// },
  { prefix: 'permai', cityId: 'tol-pekanbaru-dumai', min: 15, lat: [0.62, 1.40], lon: [101.20, 101.46], host: /^https:\/\/pub2?\.hk-opt\.com\// },
  { prefix: 'jmkt', cityId: 'tol-medan-tebing-tinggi', min: 10, lat: [3.40, 3.60], lon: [98.95, 99.20], host: /^https:\/\/jmlive\.jasamarga\.com\// },
  { prefix: 'bengtab', cityId: 'tol-bengkulu-taba-penanjung', min: 15, lat: [-3.90, -3.78], lon: [102.34, 102.45], host: /^https:\/\/pub2?\.hk-opt\.com\// },
  { prefix: 'pacin', cityId: 'tol-padang-sicincin', min: 10, lat: [-0.81, -0.74], lon: [100.28, 100.35], host: /^https:\/\/pub2?\.hk-opt\.com\// },
  { prefix: 'palindra', cityId: 'tol-palembang-indralaya', min: 8, lat: [-3.25, -3.04], lon: [104.65, 104.78], host: /^https:\/\/pub2?\.hk-opt\.com\// },
  { prefix: 'indraprabu', cityId: 'tol-indralaya-prabumulih', min: 8, lat: [-3.30, -3.21], lon: [104.63, 104.70], host: /^https:\/\/pub2?\.hk-opt\.com\// },
  { prefix: 'pekbang', cityId: 'tol-pekanbaru-bangkinang', min: 8, lat: [0.38, 0.45], lon: [101.20, 101.28], host: /^https:\/\/pub2?\.hk-opt\.com\// },
  { prefix: 'sibanceh', cityId: 'tol-sigli-banda-aceh', min: 10, lat: [5.44, 5.56], lon: [95.42, 95.49], host: /^https:\/\/pub2?\.hk-opt\.com\// },
  { prefix: 'inkis', cityId: 'tol-indrapura-kisaran', min: 15, lat: [3.10, 3.19], lon: [99.37, 99.49], host: /^https:\/\/pub2?\.hk-opt\.com\// },
  { prefix: 'binsa', cityId: 'tol-binjai-langsa', min: 8, lat: [3.67, 3.74], lon: [98.48, 98.56], host: /^https:\/\/pub2?\.hk-opt\.com\// },
  { prefix: 'jtc', cityId: 'tol-dalam-kota-jakarta', min: 18, lat: [-6.27, -6.12], lon: [106.76, 106.89], host: /^https:\/\/jmlive\.jasamarga\.com\// },
];

for (const c of BMTOL_CORRIDORS) {
  test(`Bina Marga toll batches 2-7: ${c.prefix} rows sit on their own corridor`, () => {
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
