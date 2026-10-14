// Guard for the Bina Marga toll-road (binamarga-unofficial-*, bmtol-unofficial-*) rows of the UNOFFICIAL Indonesia pack.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const pack = JSON.parse(readFileSync(new URL('../../config/cctv_sources.indonesia_unofficial.json', import.meta.url), 'utf8'));

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

test('Bina Marga (binamarga-unofficial-*) rows sit inside Jakarta; the Cipali host belongs to the bmtol-unofficial-cipali-* rows', () => {
  for (const row of binamarga) {
    assert.equal(row.cityId, 'jakarta', row.id);
    assert.ok(row.lat > -6.35 && row.lat < -6.05 && row.lon > 106.8 && row.lon < 107.05, row.id);
    assert.doesNotMatch(row.url, /lintasmarga\.com/, row.id);
  }
});

const bmtol = pack.filter((row) => row.id.startsWith('bmtol-unofficial-'));

test('Bina Marga CCTV Tol batch rows are bounded, approximate-labelled, and unique per stream', () => {
  assert.ok(bmtol.length >= 30 && bmtol.length <= 800, `count ${bmtol.length}`);
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
  { prefix: 'permai', cityId: 'tol-pekanbaru-dumai', min: 30, lat: [0.62, 1.40], lon: [101.20, 101.46], host: /^https:\/\/pub2?\.hk-opt\.com\// },
  { prefix: 'jmkt', cityId: 'tol-medan-tebing-tinggi', min: 19, lat: [3.40, 3.60], lon: [98.95, 99.20], host: /^https:\/\/jmlive\.jasamarga\.com\// },
  { prefix: 'bengtab', cityId: 'tol-bengkulu-taba-penanjung', min: 15, lat: [-3.90, -3.78], lon: [102.34, 102.45], host: /^https:\/\/pub2?\.hk-opt\.com\// },
  { prefix: 'pacin', cityId: 'tol-padang-sicincin', min: 10, lat: [-0.81, -0.74], lon: [100.28, 100.35], host: /^https:\/\/pub2?\.hk-opt\.com\// },
  { prefix: 'palindra', cityId: 'tol-palembang-indralaya', min: 8, lat: [-3.25, -3.04], lon: [104.65, 104.78], host: /^https:\/\/pub2?\.hk-opt\.com\// },
  { prefix: 'indraprabu', cityId: 'tol-indralaya-prabumulih', min: 8, lat: [-3.30, -3.21], lon: [104.63, 104.70], host: /^https:\/\/pub2?\.hk-opt\.com\// },
  { prefix: 'pekbang', cityId: 'tol-pekanbaru-bangkinang', min: 8, lat: [0.38, 0.45], lon: [101.20, 101.28], host: /^https:\/\/pub2?\.hk-opt\.com\// },
  { prefix: 'sibanceh', cityId: 'tol-sigli-banda-aceh', min: 10, lat: [5.44, 5.56], lon: [95.42, 95.49], host: /^https:\/\/pub2?\.hk-opt\.com\// },
  { prefix: 'inkis', cityId: 'tol-indrapura-kisaran', min: 15, lat: [3.10, 3.19], lon: [99.37, 99.49], host: /^https:\/\/pub2?\.hk-opt\.com\// },
  { prefix: 'binsa', cityId: 'tol-binjai-langsa', min: 8, lat: [3.67, 3.74], lon: [98.48, 98.56], host: /^https:\/\/pub2?\.hk-opt\.com\// },
  { prefix: 'jtc', cityId: 'tol-dalam-kota-jakarta', min: 18, lat: [-6.27, -6.12], lon: [106.76, 106.89], host: /^https:\/\/jmlive\.jasamarga\.com\// },
  { prefix: 'pejalang', cityId: 'tol-pejagan-pemalang', min: 20, lat: [-6.95, -6.88], lon: [108.88, 109.44], host: /^https:\/\/pptrlive\.co\.id\/memfs\/[0-9a-f-]{36}\.m3u8$/ },
  { prefix: 'pembat', cityId: 'tol-pemalang-batang', min: 3, lat: [-6.95, -6.91], lon: [109.42, 109.75], host: /^https:\/\/live\.pbtr\.co\.id:5443\/LiveApp\/streams\/0\d{3}\.m3u8$/ },
  { prefix: 'palkan', cityId: 'tol-palimanan-kanci', min: 4, lat: [-6.81, -6.69], lon: [108.42, 108.62], host: /^https:\/\/jmlive\.jasamarga\.com\// },
  { prefix: 'bocimi', cityId: 'tol-ciawi-sukabumi', min: 6, lat: [-6.77, -6.64], lon: [106.79, 106.86], host: /^https:\/\/www\.tjt-info\.co\.id\// },
  { prefix: 'cipali', cityId: 'tol-cipali', min: 15, lat: [-6.75, -6.40], lon: [107.46, 108.45], host: /^https:\/\/cctvastra\.lintasmarga\.com\/barat\/KM_[0-9A-Za-z+_]+\.m3u8$/ },
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

test('Cipali rows are live-only: the five Cipali streams that are recorded files (#EXT-X-ENDLIST) are left out (checked 2026-10-14)', () => {
  const urls = new Set(pack.map((row) => row.url));
  // KM 164, 179 B, 189 are static recordings; KM 188 C1/C2 served live HLS in the probe but only an ENDLIST playlist through the app proxy.
  for (const km of ['KM_164', 'KM_179_B', 'KM_189', 'KM_188_C1', 'KM_188_C2']) {
    assert.equal(urls.has(`https://cctvastra.lintasmarga.com/barat/${km}.m3u8`), false, km);
  }
  for (const row of bmtol.filter((r) => r.id.startsWith('bmtol-unofficial-cipali-'))) {
    assert.doesNotMatch(row.url, /[?@]/, row.id);
    assert.match(row.id, /^bmtol-unofficial-cipali-km-\d{3}/, row.id);
  }
});

test('toll markers of one corridor are at least 40 m apart unless they are the A/B/C views of one KM', () => {
  const byCorridor = new Map();
  for (const row of bmtol) byCorridor.set(row.cityId, [...(byCorridor.get(row.cityId) ?? []), row]);
  const kmKey = (row) => row.id.replace(/-[a-z]$/, '');
  for (const rows of byCorridor.values()) {
    for (let i = 0; i < rows.length; i += 1) {
      for (let j = i + 1; j < rows.length; j += 1) {
        if (kmKey(rows[i]) === kmKey(rows[j])) continue;
        const metres = Math.hypot((rows[i].lat - rows[j].lat) * 111000, (rows[i].lon - rows[j].lon) * 110000);
        assert.ok(metres >= 40, `${rows[i].id} is only ${Math.round(metres)} m from ${rows[j].id}`);
      }
    }
  }
});

test('the 2026-10-14 portal refresh: jmlive UUIDs are the rotated ones and no toll row has a gate/ramp name without a KM', () => {
  // The portal re-issued every jmlive.jasamarga.com stream id; the old ids answered 502 or a non-HLS body.
  // Those known-dead ids must not come back (sample: three Balikpapan-Samarinda ids).
  const urls = new Set(bmtol.map((row) => row.url));
  for (const stale of ['b2affc95-47fd-4e16-beb0-9378e353e141', 'bc4d2185-2ee1-44d7-a20b-70fe3a74ee5a', '35d77b54-682d-4797-8aa5-bcfc1e2460f3']) {
    assert.equal([...urls].some((u) => u.includes(stale)), false, stale);
  }
  for (const row of bmtol) assert.match(row.name, /KM \d{2,3}(\+\d{3})?/, `${row.id} must name a KM marker`);
});

test('toll rows carry no credential, query token or portal session in the url', () => {
  for (const row of bmtol) {
    assert.match(row.url, /^https:\/\//, row.id);
    assert.doesNotMatch(row.url, /[?@]/, row.id);
    assert.equal(row.portalSession, undefined, row.id);
  }
});
