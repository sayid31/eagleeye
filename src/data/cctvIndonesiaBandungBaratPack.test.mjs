// Guard for the Kabupaten Bandung Barat (ATCS Dishub KBB) rows of the UNOFFICIAL Indonesia pack.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { isAllowedRelOrigin } from '../server/hlsManifestProxy.mjs';
import { seedCatalog } from './cctvCatalog.js';

const pack = JSON.parse(readFileSync(new URL('../../config/cctv_sources.indonesia_unofficial.json', import.meta.url), 'utf8'));
const rows = pack.filter((row) => row.id.startsWith('bandungbarat-atcs-'));
const URL_RE = /^https:\/\/atcs-dishubkbb\.urbanaccess\.net\/memfs\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.m3u8$/;

test('Bandung Barat contributes 45 unique HLS rows inside the regency', () => {
  assert.equal(rows.length, 45);
  assert.equal(new Set(rows.map((row) => row.id)).size, 45);
  assert.equal(new Set(rows.map((row) => row.url)).size, 45);
  for (const row of rows) {
    assert.equal(row.cityId, 'bandungbarat', row.id);
    assert.equal(row.feedType, 'hls', row.id);
    assert.match(row.url, URL_RE, row.id);
    assert.ok(isAllowedRelOrigin(row.url, row.url), `${row.id} must pass the rel-origin guard for its own host`);
    assert.ok(row.lat > -6.96 && row.lat < -6.78 && row.lon > 107.45 && row.lon < 107.66, `${row.id} outside Kabupaten Bandung Barat`);
  }
});

test('Bandung Barat rows never store the per-request ?session= token, credentials or a portal session', () => {
  for (const row of rows) {
    assert.doesNotMatch(row.url, /[?@]/, row.id);
    assert.equal(row.portalSession, undefined, row.id);
  }
});

test('Bandung Barat rows are labelled SOURCE-PUBLISHED LOCATION with an unknown heading and revocable license', () => {
  for (const row of rows) {
    assert.match(row.name, /\(SOURCE-PUBLISHED LOCATION — Live — Unofficial\)$/, row.id);
    assert.match(row.provider, /^UNOFFICIAL — .*\(Internal Demo Only, SOURCE-PUBLISHED LOCATION\)$/, row.id);
    assert.match(row.license, /^UNOFFICIAL SOURCE/, row.id);
    assert.match(row.license, /publishes the coordinates/, row.id);
    assert.match(row.license, /bandungbarat-atcs-\*/, row.id);
    assert.match(row.license, /CCTV_INDONESIA_UNOFFICIAL_ENABLED=0/, row.id);
    assert.equal(row.headingConfidence, 'low', row.id);
  }
});

test('Bandung Barat elevation follows the terrain: lowland Padalarang below Lembang highland', () => {
  const elevation = (re) => rows.filter((row) => re.test(row.name)).map((row) => row.groundElevationM);
  const lembang = elevation(/ATCS LEMBANG (ORCHID|UNAI|BETRIX)/);
  const padalarang = elevation(/ATCS PADALARANG - GEDONG/);
  assert.ok(lembang.length > 0 && padalarang.length > 0);
  assert.ok(Math.min(...lembang) > 1000, 'Lembang cameras sit above 1000 m');
  assert.ok(Math.max(...padalarang) < 800, 'Padalarang cameras sit below 800 m');
});

test('Bandung Barat omits the 13 cameras the source answers 404 for (measured 2026-10-13)', () => {
  const dead = [
    'CITUNJUNG - CIMAREME', 'LEMBANG BATAS - KOTA BDG', 'LEMBANG DARUL HIKAM - SESPIM', 'LEMBANG DARUL HIKAM - KAYU AMBON',
    'LEMBANG - PARATAG - CIMAHI', 'LEMBANG - PARATAG - LEMBANG', 'LEMBANG - TOKO INTIMETAL - CIJERUK', 'LEMBANG - PASAR LEMBANG',
    'PADALARANG - JL. SUNDIAL KBP - KBP TAGOG', 'PADALARANG - JL. SUNDIAL KBP - TOL', 'PADALARANG FLYOVER (PINTU TOL KELUAR)',
    'CIHAMPELAS - SAYURAN', 'CIHAMPELAS - BBS',
  ];
  assert.equal(dead.length, 13);
  const names = new Set(rows.map((row) => row.name.replace(/^ATCS /, '').replace(/ \(SOURCE-PUBLISHED.*$/, '')));
  for (const label of dead) assert.equal(names.has(label), false, label);
});

test('Bandung Barat lists the two Padalarang Flyover cameras that came back, each 45 m or more from its neighbours', () => {
  const flyover = rows.filter((row) => /^bandungbarat-atcs-padalarang-flyover-/.test(row.id));
  assert.deepEqual(flyover.map((row) => row.id).sort(), [
    'bandungbarat-atcs-padalarang-flyover-cimareme',
    'bandungbarat-atcs-padalarang-flyover-kbp',
  ]);
  for (const camera of flyover) {
    assert.match(camera.license, /flip between 404 and live/, camera.id);
    for (const other of rows) {
      if (other.id === camera.id) continue;
      const metres = Math.hypot((camera.lat - other.lat) * 111000, (camera.lon - other.lon) * 110000);
      assert.ok(metres >= 45, `${camera.id} is only ${Math.round(metres)} m from ${other.id}`);
    }
  }
});

test('Bandung Barat has no leftover seed camera and adds no Kota Bandung (Pelindung) overlap', () => {
  assert.equal(seedCatalog().some((camera) => camera.cityId === 'bandungbarat'), false);
  assert.equal(rows.some((row) => row.id.startsWith('bandung-pelindung-')), false);
});
