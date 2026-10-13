// Shape/safety guard for the hand-curated Indonesia UNOFFICIAL live-HLS pack.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { isAllowedRelOrigin } from '../server/hlsManifestProxy.mjs';
import { seedCatalog } from './cctvCatalog.js';

const pack = JSON.parse(readFileSync(new URL('../../config/cctv_sources.indonesia_unofficial.json', import.meta.url), 'utf8'));
const pelindung = pack.filter((row) => row.id.startsWith('bandung-pelindung-'));

// Surakarta is the one pack served as HTTP-FLV (played by mpegts.js); everything else is HLS.
const isFlvRow = (row) => row.id.startsWith('surakarta-atcs-');

test('every pack row is flagged unofficial HLS (Surakarta: FLV) with a revocable UNOFFICIAL SOURCE license', () => {
  assert.ok(pack.length > 0);
  for (const row of pack) {
    assert.equal(row.sourceKind, isFlvRow(row) ? 'unofficial-flv-id' : 'unofficial-hls-id', row.id);
    assert.equal(row.feedType, isFlvRow(row) ? 'flv' : 'hls', row.id);
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

// The Surabaya ATCS origin only serves plain http on a bare IP:5000 (fetched server-side by
// the proxy, so no mixed-content issue); every other row must be https.
const PLAIN_HTTP_HOST = /^http:\/\/36\.66\.208\.101:5000\//;

test('pack stream URLs are well-formed https (one pinned plain-http host) and pass the HLS rel-origin guard for their own host', () => {
  for (const row of pack) {
    const plainHttpOk = row.id.startsWith('sby-atcs-') && PLAIN_HTTP_HOST.test(row.url);
    assert.ok(plainHttpOk || /^https:\/\/[^/]/.test(row.url), `${row.id} malformed url`);
    const sibling = new URL('seg0.ts', row.url).href;
    assert.equal(isAllowedRelOrigin(sibling, row.url), true, row.id);
    assert.equal(isAllowedRelOrigin('https://evil.example/seg0.ts', row.url), false, row.id);
    assert.equal(isAllowedRelOrigin('http://evil.example/seg0.ts', row.url), false, row.id);
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

const surabayaAtcs = pack.filter((row) => row.id.startsWith('sby-atcs-'));

test('ATCS Surabaya rows never present a guessed position as precise', () => {
  assert.ok(surabayaAtcs.length >= 100, `count ${surabayaAtcs.length}`);
  assert.equal(new Set(surabayaAtcs.map((row) => row.url)).size, surabayaAtcs.length, 'duplicate stream url');
  for (const row of surabayaAtcs) {
    assert.match(row.name, /APPROX\. LOCATION|CITY-LEVEL ONLY/, row.id);
    assert.match(row.provider, /APPROX\. LOCATION|CITY-LEVEL ONLY/, row.id);
    assert.match(row.license, /APPROXIMATE LOCATION|CITY-LEVEL LOCATION ONLY/, row.id);
    assert.match(row.license, /sby-atcs-\*/, `${row.id} revoke hint must name this prefix`);
    assert.match(row.url, /^http:\/\/36\.66\.208\.101:5000\/hls\/cctv_\d+\/stream\.m3u8$/, row.id);
    assert.equal(row.cityId, 'surabaya', row.id);
    assert.equal(row.headingConfidence, 'low', row.id);
    assert.ok(row.lat > -7.40 && row.lat < -7.15 && row.lon > 112.60 && row.lon < 112.85, `${row.id} outside Surabaya view bounds`);
  }
});

const cianjurAtcs = pack.filter((row) => row.id.startsWith('cianjur-atcs-'));

test('ATCS Cianjur row is labelled city-level only and stays inside Cianjur town', () => {
  assert.equal(cianjurAtcs.length, 1);
  for (const row of cianjurAtcs) {
    assert.match(row.name, /CITY-LEVEL ONLY/, row.id);
    assert.match(row.provider, /CITY-LEVEL ONLY/, row.id);
    assert.match(row.license, /CITY-LEVEL LOCATION ONLY/, row.id);
    assert.match(row.license, /cianjur-atcs-\*/, `${row.id} revoke hint must name this prefix`);
    assert.match(row.url, /^https:\/\/atcs\.cianjurkab\.go\.id:5443\/LieApp\/streams\/[a-z0-9]+\.m3u8$/, row.id);
    assert.equal(row.cityId, 'cianjur', row.id);
    assert.equal(row.headingConfidence, 'low', row.id);
    assert.ok(row.lat > -6.87 && row.lat < -6.78 && row.lon > 107.10 && row.lon < 107.19, `${row.id} outside Cianjur town bounds`);
  }
});

const mataramAtcs = pack.filter((row) => row.id.startsWith('mataram-atcs-'));

test('ATCS Mataram rows are labelled with their position tier, unique, and stay inside Mataram', () => {
  assert.equal(mataramAtcs.length, 12);
  assert.equal(new Set(mataramAtcs.map((row) => row.url)).size, mataramAtcs.length, 'duplicate Mataram stream URL');
  for (const row of mataramAtcs) {
    const tier = row.name.includes('CITY-LEVEL ONLY') ? 'CITY-LEVEL ONLY' : 'APPROX. LOCATION';
    assert.ok(row.name.includes(tier), row.id);
    assert.ok(row.provider.includes(tier), row.id);
    assert.match(row.license, tier === 'CITY-LEVEL ONLY' ? /CITY-LEVEL LOCATION ONLY/ : /APPROXIMATE LOCATION/, row.id);
    assert.match(row.license, /mataram-atcs-\*/, `${row.id} revoke hint must name this prefix`);
    assert.match(row.url, /^https:\/\/relay-cctv\.mataramkota\.go\.id\/[a-z0-9-]+\/video1_stream\.m3u8$/, row.id);
    assert.equal(row.cityId, 'mataram', row.id);
    assert.equal(row.headingConfidence, 'low', row.id);
    assert.ok(row.lat > -8.65 && row.lat < -8.55 && row.lon > 116.05 && row.lon < 116.20, `${row.id} outside Mataram view bounds`);
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

const TIER_RE = /\((APPROX\. LOCATION|CITY-LEVEL ONLY|SOURCE-PUBLISHED LOCATION) — Live — Unofficial\)$/;
// Each position tier must be spelled out, in capitals, in the row's licence text.
const TIER_LICENSE_RE = {
  'APPROX. LOCATION': /APPROXIMATE LOCATION/,
  'CITY-LEVEL ONLY': /CITY-LEVEL LOCATION ONLY/,
  'SOURCE-PUBLISHED LOCATION': /SOURCE-PUBLISHED LOCATION/,
};

const REGENCY_PACKS = [
  { prefix: 'pasuruan-atcs-', cityId: 'pasuruan', count: 31, lat: [-7.85, -7.5], lon: [112.6, 113.1],
    url: /^https:\/\/dishub\.pasuruankab\.go\.id:5444\/LiveApp\/streams\/[A-Z0-9_-]+\.m3u8$/ },
  { prefix: 'sumedang-atcs-', cityId: 'sumedang', count: 35, lat: [-6.95, -6.75], lon: [107.8, 108.0],
    url: /^https:\/\/shinobi\.sumedangkab\.go\.id\/[A-Za-z0-9]+\/hls\/[A-Za-z0-9]+\/[A-Za-z0-9]+\/s\.m3u8$/ },
  { prefix: 'malang-atcs-', cityId: 'malang', count: 199, lat: [-8.06, -7.9], lon: [112.58, 112.7],
    url: /^https:\/\/cctv\.malangkota\.go\.id\/cctv-stream\/streams\/\d{24}\.m3u8$/ },
  { prefix: 'jogja-atcs-', cityId: 'yogyakarta', count: 131, lat: [-7.86, -7.72], lon: [110.32, 110.43],
    url: /^https:\/\/cctvjss\.jogjakota\.go\.id\/[a-z-]+\/[A-Za-z0-9_%.-]+\.stream\/playlist\.m3u8$/ },
  { prefix: 'surakarta-atcs-', cityId: 'surakarta', count: 76, lat: [-7.62, -7.52], lon: [110.76, 110.87],
    url: /^https:\/\/surakarta\.atcsindonesia\.info:8086\/camera\/[A-Za-z0-9]+\.flv$/ },
  { prefix: 'pekanbaru-atcs-', cityId: 'pekanbaru', count: 29, lat: [0.38, 0.66], lon: [101.33, 101.6],
    url: /^https:\/\/cctv\.pekanbaru\.go\.id\/hls\/cam-10\.200\.\d{1,3}\.\d{1,3}\/index\.m3u8$/ },
  { prefix: 'bukittinggi-atcs-', cityId: 'bukittinggi', count: 39, lat: [-0.34, -0.26], lon: [100.35, 100.41],
    url: /^https:\/\/hls\.bukittinggikota\.go\.id\/hls\d\/[A-Za-z0-9]+\/hls\/[A-Za-z0-9]+\/cam\d+d\d+\/s\.m3u8$/ },
  { prefix: 'solok-atcs-', cityId: 'solok', count: 18, lat: [-0.86, -0.74], lon: [100.6, 100.72],
    url: /^https:\/\/cctv\.solokkota\.go\.id\/[A-Za-z0-9]+\/hls\/[A-Za-z0-9]+\/[A-Za-z0-9]+\/s\.m3u8$/ },
  { prefix: 'padang-atcs-', cityId: 'padang', count: 28, lat: [-1.0, -0.8], lon: [100.3, 100.47],
    url: /^https:\/\/streamcctv\.padang\.go\.id:3000\/stream\/[A-Za-z0-9-]+\/channel\/0\/hlsll\/live\/index\.m3u8$/ },
  { prefix: 'padangpanjang-atcs-', cityId: 'padangpanjang', count: 14, lat: [-0.5, -0.43], lon: [100.38, 100.45],
    url: /^https:\/\/mtx\.padangpanjang\.go\.id:3443\/cam\d+\/index\.m3u8$/ },
  { prefix: 'pesisirselatan-atcs-', cityId: 'pesisirselatan', count: 7, lat: [-1.4, -1.0], lon: [100.4, 100.6],
    url: /^https:\/\/live\.pesisirselatankab\.go\.id\/[a-f0-9]{32}\/hls\/kominfo\/[A-Za-z0-9]+\/s\.m3u8$/ },
];

for (const c of REGENCY_PACKS) {
  test(`${c.cityId} ATCS rows are labelled with their position tier, unique, and stay inside the regency`, () => {
    const rows = pack.filter((row) => row.id.startsWith(c.prefix));
    assert.equal(rows.length, c.count);
    assert.equal(new Set(rows.map((row) => row.url)).size, rows.length, 'duplicate stream URL');
    assert.equal(new Set(rows.map((row) => `${row.lat},${row.lon}`)).size, rows.length, 'two markers share one position');
    for (const row of rows) {
      const tier = row.name.match(TIER_RE)?.[1];
      assert.ok(tier, `${row.id} name lacks a position tier`);
      assert.ok(row.provider.includes(tier), row.id);
      assert.match(row.license, TIER_LICENSE_RE[tier], row.id);
      assert.ok(row.license.includes(`${c.prefix}*`), `${row.id} revoke hint must name this prefix`);
      assert.match(row.url, c.url, row.id);
      assert.equal(row.cityId, c.cityId, row.id);
      assert.equal(row.headingConfidence, 'low', row.id);
      assert.ok(row.lat > c.lat[0] && row.lat < c.lat[1], `${row.id} lat ${row.lat}`);
      assert.ok(row.lon > c.lon[0] && row.lon < c.lon[1], `${row.id} lon ${row.lon}`);
    }
  });
}

test('Pasuruan pack omits the two streams the origin answers 404 for (measured 2026-10-12)', () => {
  const urls = new Set(pack.map((row) => row.url));
  assert.equal(urls.has('https://dishub.pasuruankab.go.id:5444/LiveApp/streams/EXIT_TOL_PURWODADI.m3u8'), false);
  assert.equal(urls.has('https://dishub.pasuruankab.go.id:5444/LiveApp/streams/EXIT_TOL_GEMPOL.m3u8'), false);
});

test('Malang rows opt into the anonymous portal session; no other pack row does', () => {
  for (const row of pack) {
    if (row.id.startsWith('malang-atcs-')) {
      assert.deepEqual(row.portalSession, {
        bootstrapUrl: 'https://cctv.malangkota.go.id/',
        referer: 'https://cctv.malangkota.go.id/sebaran-cctv',
      }, row.id);
      assert.ok(row.license.includes('no login'), `${row.id} license must say the session is anonymous`);
    } else {
      assert.equal(row.portalSession, undefined, row.id);
    }
  }
});

test('Yogyakarta rows use the stable master playlist, never the per-session chunklist_wNNN URL', () => {
  const rows = pack.filter((row) => row.id.startsWith('jogja-atcs-'));
  assert.equal(rows.length, 131);
  for (const row of rows) assert.doesNotMatch(row.url, /chunklist_w\d+/, row.id);
});

test('Yogyakarta pack omits the two streams that failed the liveness probe (measured 2026-10-12)', () => {
  const urls = new Set(pack.map((row) => row.url));
  assert.equal(urls.has('https://cctvjss.jogjakota.go.id/atcs/ATCS_Lampu_Merah_JoktengWetan.stream/playlist.m3u8'), false);
  assert.equal(urls.has('https://cctvjss.jogjakota.go.id/rthp/rthp_pakudaya_pakuncen_2.stream/playlist.m3u8'), false);
});

test('Surakarta pack omits the 19 streams that never answered, even with a 25 s wait (measured 2026-10-12)', () => {
  const urls = new Set(pack.map((row) => row.url));
  const dead = ['PalangJoglo', 'DawungSelatan', 'DPRD', 'Genengan', 'GiriMulyo01', 'JembatanMojo', 'MasjidAgung',
    'Mlipahan', 'PasarBeling', 'PasarKlewer', 'PasarkKliwon', 'PasarLegi', 'PasarNongko', 'PengadilanSriwedari',
    'GedungSerbagunaPucangsawit', 'Sekip', 'Singosaren', 'Sudirman', 'Timuran'];
  assert.equal(dead.length, 19);
  for (const name of dead) {
    assert.equal(urls.has(`https://surakarta.atcsindonesia.info:8086/camera/${name}.flv`), false, name);
  }
});

test('Surakarta rows never carry credentials or a portal session: the source is anonymous', () => {
  for (const row of pack.filter(isFlvRow)) {
    assert.equal(row.portalSession, undefined, row.id);
    assert.doesNotMatch(row.url, /[?@]/, row.id);
  }
});

test('Pekanbaru pack lists only cameras that served a valid segment in a probe (2026-10-13), once each', () => {
  const rows = pack.filter((row) => row.id.startsWith('pekanbaru-atcs-'));
  const urls = new Set(rows.map((row) => row.url));
  // Answered 404 on every probe, or the page card carries no id (cam-/index.m3u8).
  for (const dead of ['cam-10.200.50.3', 'cam-10.200.49.4', 'cam-10.200.50.2', 'cam-']) {
    assert.equal(urls.has(`https://cctv.pekanbaru.go.id/hls/${dead}/index.m3u8`), false, dead);
  }
  // The two Sudirman-Nangka flyover cameras share one label; the IP keeps their ids apart.
  assert.equal(rows.filter((row) => row.name.includes('Flyover Sudirman - Nangka')).length, 2);
  for (const row of rows) {
    assert.equal(row.portalSession, undefined, row.id);
    assert.doesNotMatch(row.url, /[?@]/, row.id);
  }
});

test('West Sumatra packs list only cameras that served a valid segment in a probe (2026-10-13), once each', () => {
  const urls = new Set(pack.map((row) => row.url));
  // Pesisir Selatan "Kamera Carocok 4" repeats Carocok 3's stream id; Carocok 1 answered "File Not Found".
  assert.equal(urls.has('https://live.pesisirselatankab.go.id/6d6755b8ccc552cb6ee01a1123f97b94/hls/kominfo/2qy20XfgZX/s.m3u8'), false);
  assert.equal(pack.filter((row) => row.url.endsWith('/kominfo/1wbuTqepYN/s.m3u8')).length, 1);
  // Padang Panjang cam12 (Simpang SMPN 5) answered 404 on every probe.
  assert.equal(urls.has('https://mtx.padangpanjang.go.id:3443/cam12/index.m3u8'), false);
  assert.equal(pack.some((row) => row.id.startsWith('padangpanjang-atcs-') && /SMPN 5/.test(row.name)), false);
  assert.equal(pack.some((row) => row.id.startsWith('solok-atcs-') && /Sigege/.test(row.name)), false);
  for (const row of pack.filter((r) => /^(bukittinggi|solok|padang|padangpanjang|pesisirselatan)-atcs-/.test(r.id))) {
    assert.equal(row.portalSession, undefined, row.id);
    assert.doesNotMatch(row.url, /[?@]/, row.id);
  }
});

test('source-published coordinates are used as given and only by packs whose source publishes them', () => {
  const published = pack.filter((row) => row.name.includes('(SOURCE-PUBLISHED LOCATION'));
  const owners = new Set(published.map((row) => row.cityId));
  assert.deepEqual([...owners].sort(), ['bukittinggi', 'padangpanjang', 'pesisirselatan']);
  for (const row of published) assert.match(row.license, /publishes the coordinates/, row.id);
  // Padang and Solok publish no coordinates, so none of their rows may claim a published position.
  assert.equal(pack.some((row) => /^(padang|solok)-atcs-/.test(row.id) && row.name.includes('SOURCE-PUBLISHED')), false);
});

test('no synthetic seed camera remains in a city that has live pack rows', () => {
  // A seed has no stream; beside live cameras it renders as an empty green
  // placeholder card (Malioboro North, Yogyakarta).
  const liveCityIds = new Set(pack.map((row) => row.cityId));
  const stale = seedCatalog().filter((camera) => liveCityIds.has(camera.cityId)).map((camera) => camera.id);
  assert.deepEqual(stale, []);
});

test('Indonesian cities without any live row keep their seed cameras', () => {
  const seededIds = new Set(seedCatalog().map((camera) => camera.cityId));
  for (const cityId of ['medan', 'semarang', 'makassar']) {
    assert.ok(seededIds.has(cityId), `${cityId} has no live source yet and must keep its seeds`);
  }
});
