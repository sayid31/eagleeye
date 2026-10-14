// Guard for the West Sumatra (Sumbar) rows of the UNOFFICIAL Indonesia pack, plus the
// source-published-coordinates rule that spans every pack publishing its own positions.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const pack = JSON.parse(readFileSync(new URL('../../config/cctv_sources.indonesia_unofficial.json', import.meta.url), 'utf8'));

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
  assert.deepEqual([...owners].sort(), [
    'balangan', 'bandaaceh', 'bandungbarat', 'banjar', 'banjarmasin', 'banten', 'banyumas', 'bukittinggi', 'cianjur',
    'gresik', 'jombang', 'kobar', 'magelang', 'padangpanjang', 'pesisirselatan', 'semarang', 'serang', 'situbondo', 'tanahbumbu', 'tangerangkab',
    'tasikmalaya',
  ]);
  for (const row of published) assert.match(row.license, /publishes the coordinates/, row.id);
  // Padang and Solok publish no coordinates, so none of their rows may claim a published position.
  assert.equal(pack.some((row) => /^(padang|solok)-atcs-/.test(row.id) && row.name.includes('SOURCE-PUBLISHED')), false);
});
