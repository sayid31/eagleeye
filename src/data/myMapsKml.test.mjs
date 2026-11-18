import { test } from 'node:test';
import assert from 'node:assert/strict';
import { featuresToJsonLines, parseDescriptionFields, parseMyMapsKml } from './myMapsKml.mjs';

const placemark = (name, description, coordinates) => `<Placemark><name>${name}</name>`
  + `<description><![CDATA[${description}]]></description>`
  + `<Point><coordinates>\n  ${coordinates}\n </coordinates></Point></Placemark>`;

test('shelter descriptions map their fields and drop hosted photos', () => {
  const html = '<img src="https://mymaps.usercontent.google.com/hostedimage/m/*/abc" height="200" /><br><br>Dinas PU <br> <br> FID 0 <br> Nama Dinas PU <br> Fungsi Kantor <br> Jumlah_Lantai   3 <br> Kapasitas -<br> Uji_Kelayakan Belum<br> Keterangan Pemerintah <br> Alamat Jl. Taman Siswa No 1';
  assert.deepEqual(parseDescriptionFields(html), {
    function: 'Kantor', floors: '3', feasibilityTest: 'Belum', note: 'Pemerintah', address: 'Jl. Taman Siswa No 1',
  });
});

test('siren descriptions accept My Maps 10-character truncated keys and blank values', () => {
  const html = 'Sirine X    <br>   Alamat   Pasir Putih    <br>   LOKASI   Kota Padang    <br>   Kepemilika   BPBD Provinsi    <br>   Tahun   2013    <br>   KONDISI       <br>   No_1   23';
  assert.deepEqual(parseDescriptionFields(html), {
    address: 'Pasir Putih', region: 'Kota Padang', owner: 'BPBD Provinsi', year: '2013',
  });
});

test('parseMyMapsKml returns lon/lat points tagged with the dataset kind', () => {
  const kml = `<kml><Document>${placemark('Sirine A', 'Sirine A <br> KONDISI   AKTIF', '100.35205,-0.906706,0')}`
    + `${placemark('Shelter B', 'Kapasitas 1500', '100.3,-0.9,0')}</Document></kml>`;
  const siren = parseMyMapsKml(kml, 'siren');
  assert.equal(siren.length, 2);
  assert.deepEqual(siren[0].geometry.coordinates, [100.35205, -0.906706]);
  assert.equal(siren[0].properties.kind, 'siren');
  assert.equal(siren[0].properties.status, 'AKTIF');
  assert.equal(siren[1].properties.capacity, '1500');
});

test('placemarks without a usable point are skipped and nameless ones get a kind-specific name', () => {
  const kml = `<kml>${placemark('No coords', 'x', 'abc,def')}${placemark('Out of range', 'x', '300,-0.9,0')}`
    + '<Placemark><name>Line</name><LineString><coordinates>1,2,0 3,4,0</coordinates></LineString></Placemark>'
    + `${placemark('', 'x', '100.3,-0.9,0')}</kml>`;
  const out = parseMyMapsKml(kml, 'shelter');
  assert.equal(out.length, 1);
  assert.equal(out[0].properties.name, 'Tsunami shelter');
});

test('entities in names are decoded and the output is JSON Lines', () => {
  const kml = `<kml><Placemark><name>Masjid &amp; Sekolah</name><Point><coordinates>100.3,-0.9,0</coordinates></Point></Placemark></kml>`;
  const out = parseMyMapsKml(kml, 'shelter');
  assert.equal(out[0].properties.name, 'Masjid & Sekolah');
  const lines = featuresToJsonLines([...out, ...out]).split('\n');
  assert.equal(lines.length, 2);
  assert.equal(JSON.parse(lines[0]).geometry.type, 'Point');
});

test('garbage input yields no features', () => {
  assert.deepEqual(parseMyMapsKml('', 'siren'), []);
  assert.deepEqual(parseMyMapsKml(null, 'siren'), []);
  assert.deepEqual(parseMyMapsKml('<html>blocked</html>', 'siren'), []);
});
