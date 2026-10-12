import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  loadAustinSourcesFromOpenData,
  loadCaltransSourcesFromOpenData,
  loadTflSourcesFromOpenData,
} from './cctvOpenDataSources.mjs';

const TFL_BUCKET = 'https://s3-eu-west-1.amazonaws.com/jamcams.tfl.gov.uk/';

/** Runs `fn` with fetch and console replaced; restores both afterwards. */
async function withStubbedNetwork(handler, fn) {
  const realFetch = globalThis.fetch;
  const realWarn = console.warn;
  const realLog = console.log;
  const calls = [];
  globalThis.fetch = async (url) => { calls.push(String(url)); return handler(String(url)); };
  console.warn = () => {};
  console.log = () => {};
  try {
    return { result: await fn(), calls };
  } finally {
    globalThis.fetch = realFetch;
    console.warn = realWarn;
    console.log = realLog;
  }
}

const json = (body, status = 200) => ({ ok: status < 400, status, json: async () => body });

test('TfL keeps only available cameras on the official bucket and prefixes the id', async () => {
  const place = (id, available, imageUrl, lat = 51.5, lon = -0.12) => ({
    id, commonName: `Cam ${id}`, lat, lon,
    additionalProperties: [{ key: 'available', value: available }, { key: 'imageUrl', value: imageUrl }],
  });
  const body = [
    place('JamCams_00001.1', 'true', `${TFL_BUCKET}a.jpg`),
    place('JamCams_00002.2', 'false', `${TFL_BUCKET}b.jpg`),
    place('JamCams_00003.3', 'true', 'https://evil.example/c.jpg'),
    place('JamCams_00004.4', 'true', `${TFL_BUCKET}d.jpg`, NaN, 0),
  ];
  const { result } = await withStubbedNetwork(() => json(body), loadTflSourcesFromOpenData);
  assert.deepEqual(result.map((c) => c.id), ['tfl-00001.1']);
  assert.equal(result[0].feedType, 'image');
  assert.equal(result[0].sourceKind, 'tfl-open-data');
  assert.equal(result[0].url, `${TFL_BUCKET}a.jpg`);
});

test('TfL resolves to [] when the upstream fails instead of throwing', async () => {
  const { result } = await withStubbedNetwork(() => json({}, 503), loadTflSourcesFromOpenData);
  assert.deepEqual(result, []);
});

test('Caltrans keeps in-service cameras with an official https still and survives one failed district', async () => {
  const row = (inService, url, lat = '37.78', lon = '-122.41') => ({
    cctv: { inService, location: { latitude: lat, longitude: lon, locationName: 'I-80 at Fremont' }, imageData: { static: { currentImageURL: url } } },
  });
  const ok = { data: [
    row('true', 'https://cwwp2.dot.ca.gov/data/d4/cctv/image/a.jpg'),
    row('false', 'https://cwwp2.dot.ca.gov/data/d4/cctv/image/b.jpg'),
    row('true', 'https://evil.example/c.jpg'),
    row('true', ''),
  ] };
  const prev = process.env.CCTV_CALTRANS_DISTRICTS;
  process.env.CCTV_CALTRANS_DISTRICTS = '4,7';
  try {
    const { result, calls } = await withStubbedNetwork((url) => (url.includes('/d4/') ? json(ok) : json({}, 500)), loadCaltransSourcesFromOpenData);
    assert.equal(calls.length, 2);
    assert.equal(result.length, 1);
    assert.ok(result[0].url.startsWith('https://cwwp2.dot.ca.gov/'));
  } finally {
    if (prev === undefined) delete process.env.CCTV_CALTRANS_DISTRICTS; else process.env.CCTV_CALTRANS_DISTRICTS = prev;
  }
});

test('Caltrans ignores out-of-range district ids and makes no request', async () => {
  const prev = process.env.CCTV_CALTRANS_DISTRICTS;
  process.env.CCTV_CALTRANS_DISTRICTS = '0,13,abc';
  try {
    const { result, calls } = await withStubbedNetwork(() => json({}), loadCaltransSourcesFromOpenData);
    assert.deepEqual(result, []);
    assert.equal(calls.length, 0);
  } finally {
    if (prev === undefined) delete process.env.CCTV_CALTRANS_DISTRICTS; else process.env.CCTV_CALTRANS_DISTRICTS = prev;
  }
});

test('Austin resolves to [] on an upstream error', async () => {
  const { result } = await withStubbedNetwork(() => json({}, 500), loadAustinSourcesFromOpenData);
  assert.deepEqual(result, []);
});
