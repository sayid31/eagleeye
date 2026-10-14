import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MYMAPS_DATASETS, myMapsKmlUrl } from './myMapsSources.mjs';
import { createMyMapsCache, loadMyMapsDataset, MYMAPS_MAX_KML_BYTES } from './myMapsProxy.mjs';

const kml = (n, tag) => `<kml>${Array.from({ length: n }, (_, i) => `<Placemark><name>${tag} ${i}</name>`
  + `<Point><coordinates>100.${i},-0.9,0</coordinates></Point></Placemark>`).join('')}</kml>`;

/** fetch stub answering each allowlisted mid with its own KML. */
function stubFetch({ status = 200, body } = {}) {
  const calls = [];
  const [shelter, siren] = MYMAPS_DATASETS['sumbar-tsunami'];
  const fn = async (url) => {
    calls.push(String(url));
    const text = body ?? (String(url).includes(shelter.mid) ? kml(2, 'S') : kml(3, 'R'));
    return { ok: status === 200, status, text: async () => text };
  };
  fn.calls = calls;
  fn.mids = { shelter: shelter.mid, siren: siren.mid };
  return fn;
}

test('the allowlist names exactly the two Sumbar documents and builds a fixed-host URL', () => {
  const docs = MYMAPS_DATASETS['sumbar-tsunami'];
  assert.deepEqual(docs.map((d) => d.kind), ['shelter', 'siren']);
  for (const { mid } of docs) {
    const url = new URL(myMapsKmlUrl(mid));
    assert.equal(url.origin + url.pathname, 'https://www.google.com/maps/d/kml');
    assert.equal(url.searchParams.get('mid'), mid);
  }
  assert.equal(new URL(myMapsKmlUrl('a&b=c')).searchParams.get('mid'), 'a&b=c');
});

test('loadMyMapsDataset merges both documents and tags features by kind', async () => {
  const fetchFn = stubFetch();
  const features = await loadMyMapsDataset('sumbar-tsunami', { fetchFn });
  assert.equal(features.length, 5);
  assert.equal(features.filter((f) => f.properties.kind === 'shelter').length, 2);
  assert.equal(features.filter((f) => f.properties.kind === 'siren').length, 3);
  assert.equal(fetchFn.calls.length, 2);
});

test('loadMyMapsDataset rejects unknown datasets, HTTP errors, non-KML and oversized bodies', async () => {
  await assert.rejects(loadMyMapsDataset('nope', { fetchFn: stubFetch() }), /unknown/);
  await assert.rejects(loadMyMapsDataset('sumbar-tsunami', { fetchFn: stubFetch({ status: 403 }) }), /HTTP 403/);
  await assert.rejects(loadMyMapsDataset('sumbar-tsunami', { fetchFn: stubFetch({ body: '<html>sign in</html>' }) }), /did not return KML/);
  await assert.rejects(loadMyMapsDataset('sumbar-tsunami', { fetchFn: stubFetch({ body: `<kml>${'x'.repeat(MYMAPS_MAX_KML_BYTES)}</kml>` }) }), /larger than/);
  await assert.rejects(loadMyMapsDataset('sumbar-tsunami', { fetchFn: stubFetch({ body: '<kml></kml>' }) }), /did not return KML|zero features/);
});

test('the cache serves within TTL without refetching and ignores unknown or inherited names', async () => {
  const fetchFn = stubFetch();
  let clock = 0;
  const get = createMyMapsCache({ fetchFn, now: () => clock, ttlMs: 1000 });
  assert.equal(await get('constructor'), null);
  assert.equal(await get('../etc/passwd'), null);
  const first = await get('sumbar-tsunami');
  assert.equal(first.body.split('\n').length, 5);
  clock = 500;
  await get('sumbar-tsunami');
  assert.equal(fetchFn.calls.length, 2, 'second call inside the TTL must not hit upstream');
});

test('concurrent requests share one upstream pass', async () => {
  const fetchFn = stubFetch();
  const get = createMyMapsCache({ fetchFn });
  await Promise.all([get('sumbar-tsunami'), get('sumbar-tsunami'), get('sumbar-tsunami')]);
  assert.equal(fetchFn.calls.length, 2);
});

test('after the TTL a failing upstream serves the stale copy; with no copy it throws', async () => {
  let clock = 0;
  let healthy = true;
  const good = stubFetch();
  const fetchFn = async (url, init) => (healthy ? good(url, init) : { ok: false, status: 503, text: async () => '' });
  const get = createMyMapsCache({ fetchFn, now: () => clock, ttlMs: 1000 });
  await get('sumbar-tsunami');
  healthy = false;
  clock = 5000;
  const stale = await get('sumbar-tsunami');
  assert.equal(stale.stale, true);
  assert.equal(stale.body.split('\n').length, 5);
  const cold = createMyMapsCache({ fetchFn: async () => ({ ok: false, status: 503, text: async () => '' }) });
  await assert.rejects(cold('sumbar-tsunami'), /no cache/);
});

test('the layer URL, proxy registration and layer-state entry stay wired together', async () => {
  const { readFileSync } = await import('node:fs');
  const read = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8');
  assert.match(read('./localLayers.js'), /url: '\/api\/mymaps\/sumbar-tsunami'/);
  assert.match(read('../../vite.config.js'), /myMapsProxy\(\),/);
  assert.match(read('./layerState.js'), /id: 'local-sumbar-tsunami', token: 'k'/);
});
