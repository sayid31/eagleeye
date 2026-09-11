// src/geocodeProvider.test.mjs — forward-geocode provider switch (2026-09).
//
// Google Maps Geocoding requires a billing-enabled Cloud project; Nominatim
// needs no key. Covers: the Nominatim default path, the explicit
// GEOCODE_PROVIDER=google reversion path (proves the switch-back still
// works), and the pure taxonomy/bounding-box adapters in isolation.
//
// Run with: npm test   (node --test)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  forwardGeocode,
  nominatimTypesToGoogle,
  nominatimBoundingBoxToViewport,
} from './geocodeProvider.js';

/** Stub window/fetch for one call, restoring both afterward. */
async function withStub(windowOverrides, fetchImpl, fn) {
  const hadWindow = Object.hasOwn(globalThis, 'window');
  const priorWindow = globalThis.window;
  const priorFetch = globalThis.fetch;
  globalThis.window = windowOverrides;
  globalThis.fetch = fetchImpl;
  try {
    return await fn();
  } finally {
    globalThis.fetch = priorFetch;
    if (hadWindow) globalThis.window = priorWindow;
    else delete globalThis.window;
  }
}

test('nominatimTypesToGoogle: rank/addresstype map to the Google vocabulary geocodeNavigationMode expects', () => {
  assert.deepEqual(nominatimTypesToGoogle({ place_rank: 4, addresstype: 'country' }), ['country']);
  assert.deepEqual(nominatimTypesToGoogle({ addresstype: 'country' }), ['country']);
  assert.deepEqual(nominatimTypesToGoogle({ place_rank: 8 }), ['administrative_area_level_1']);
  assert.deepEqual(nominatimTypesToGoogle({ place_rank: 11 }), ['administrative_area_level_2']);
  assert.deepEqual(nominatimTypesToGoogle({ place_rank: 16 }), ['locality']);
  assert.deepEqual(nominatimTypesToGoogle({ addresstype: 'city' }), ['locality']);
  assert.deepEqual(nominatimTypesToGoogle({ place_rank: 20 }), ['neighborhood']);
  assert.deepEqual(nominatimTypesToGoogle({ addresstype: 'suburb' }), ['neighborhood']);
  assert.deepEqual(nominatimTypesToGoogle({ class: 'highway' }), ['route']);
  assert.deepEqual(nominatimTypesToGoogle({ class: 'leisure' }), ['park']);
  assert.deepEqual(nominatimTypesToGoogle({ class: 'natural' }), ['park']);
  assert.deepEqual(nominatimTypesToGoogle({ addresstype: 'airport' }), ['park']);
  assert.deepEqual(nominatimTypesToGoogle({ place_rank: 30, class: 'shop' }), []);
  assert.deepEqual(nominatimTypesToGoogle({}), []);
});

test('nominatimBoundingBoxToViewport: [min_lat,max_lat,min_lon,max_lon] strings become {southwest,northeast}', () => {
  const viewport = nominatimBoundingBoxToViewport(['30.10', '30.50', '-97.95', '-97.55']);
  assert.deepEqual(viewport, {
    southwest: { lat: 30.10, lng: -97.95 },
    northeast: { lat: 30.50, lng: -97.55 },
  });
  assert.equal(nominatimBoundingBoxToViewport(null), null);
  assert.equal(nominatimBoundingBoxToViewport(['a', 'b', 'c']), null);
  assert.equal(nominatimBoundingBoxToViewport(['not', 'a', 'number', 'here']), null);
});

test('forwardGeocode defaults to Nominatim (no GEOCODE_PROVIDER set, no API key needed)', async () => {
  const requestedUrls = [];
  const result = await withStub(
    {},
    async (url) => {
      requestedUrls.push(String(url));
      return {
        ok: true,
        json: async () => [{
          lat: '30.2672',
          lon: '-97.7431',
          display_name: 'Austin, Travis County, Texas, USA',
          place_rank: 16,
          addresstype: 'city',
          boundingbox: ['30.10', '30.50', '-97.95', '-97.55'],
        }],
      };
    },
    () => forwardGeocode('austin'),
  );
  assert.ok(requestedUrls[0].startsWith('/api/nominatim/search'), 'must hit the server-side proxy, not Nominatim directly');
  assert.deepEqual(result, {
    lat: 30.2672,
    lng: -97.7431,
    label: 'Austin, Travis County, Texas, USA',
    types: ['locality'],
    viewport: { southwest: { lat: 30.10, lng: -97.95 }, northeast: { lat: 30.50, lng: -97.55 } },
  });
});

test('forwardGeocode: an empty Nominatim result array resolves to null', async () => {
  const result = await withStub(
    {},
    async () => ({ ok: true, json: async () => [] }),
    () => forwardGeocode('nowhere at all'),
  );
  assert.equal(result, null);
});

test('forwardGeocode: a non-OK proxy response resolves to null rather than throwing', async () => {
  const result = await withStub(
    {},
    async () => ({ ok: false, json: async () => ({}) }),
    () => forwardGeocode('austin'),
  );
  assert.equal(result, null);
});

test('forwardGeocode: viewportBias becomes a Nominatim viewbox=lon,lat,lon,lat param', async () => {
  const requestedUrls = [];
  await withStub(
    {},
    async (url) => {
      requestedUrls.push(String(url));
      return { ok: true, json: async () => [] };
    },
    () => forwardGeocode('sixth street', {
      viewportBias: { south: 30.1, west: -97.95, north: 30.5, east: -97.55 },
    }),
  );
  const params = new URL(requestedUrls[0], 'http://localhost').searchParams;
  assert.equal(params.get('viewbox'), '-97.95,30.5,-97.55,30.1');
});

test('forwardGeocode: window.__GEOCODE_PROVIDER__="google" reverts to Google Geocoding', async () => {
  const requestedUrls = [];
  const result = await withStub(
    { __GEOCODE_PROVIDER__: 'google', __GOOGLE_MAPS_API_KEY__: 'test-key' },
    async (url) => {
      requestedUrls.push(String(url));
      return {
        json: async () => ({
          status: 'OK',
          results: [{
            formatted_address: 'Austin, TX, USA',
            types: ['locality', 'political'],
            geometry: { location: { lat: 30.2672, lng: -97.7431 }, viewport: null },
          }],
        }),
      };
    },
    () => forwardGeocode('austin'),
  );
  assert.ok(requestedUrls[0].startsWith('https://maps.googleapis.com/'), 'google mode must call Google directly');
  assert.equal(result.label, 'Austin, TX, USA');
  assert.deepEqual(result.types, ['locality', 'political']);
});

test('forwardGeocode: google mode without a configured key throws (unchanged reversion-path contract)', async () => {
  await withStub(
    { __GEOCODE_PROVIDER__: 'google' },
    async () => { throw new Error('fetch must not be called without a key'); },
    async () => {
      await assert.rejects(
        () => forwardGeocode('austin'),
        /No Google Maps API key available for geocoding/,
      );
    },
  );
});
