// src/googleGeocodeClient.test.mjs — browser-side Google geocode callers use
// the same-origin /api/google/geocode proxy (no key in the browser) and stay
// silent when the server has no Google key.
import assert from 'node:assert/strict';
import test from 'node:test';
import * as Cesium from 'cesium';
import {
  GOOGLE_GEOCODE_PROXY_PATH,
  googleForwardGeocodeUrl,
  googleMapsProxyAvailable,
  googleReverseGeocodeUrl,
} from './googleGeocodeClient.js';
import { geocodePlace } from './annotations/annotationResolverGeocode.js';
import { getBasemapLabelContext } from './voice/gevGeocodeContext.js';

/** Install a window + fetch double for one test, restored afterwards. */
function installBrowser(t, windowFlags, respond) {
  const hadWindow = Object.hasOwn(globalThis, 'window');
  const priorWindow = globalThis.window;
  const priorFetch = globalThis.fetch;
  const requested = [];
  globalThis.window = {
    ...windowFlags,
    setTimeout: globalThis.setTimeout,
    clearTimeout: globalThis.clearTimeout,
  };
  globalThis.fetch = async (url) => {
    requested.push(String(url));
    return respond(String(url));
  };
  t.after(() => {
    globalThis.fetch = priorFetch;
    if (hadWindow) globalThis.window = priorWindow;
    else delete globalThis.window;
  });
  return requested;
}

/** Viewer double whose view target is (lat, lon) seen from `heightM`. */
function viewerLookingAt(lat, lon, heightM) {
  return {
    scene: { canvas: { width: 0, height: 0 }, pickPositionSupported: false },
    camera: {
      positionCartographic: Cesium.Cartographic.fromDegrees(lon, lat, heightM),
      heading: 0,
      pitch: -Math.PI / 2,
      pickEllipsoid: () => Cesium.Cartesian3.fromDegrees(lon, lat, 0),
    },
  };
}

test('proxy availability is a strict boolean flag', (t) => {
  installBrowser(t, { __GOOGLE_MAPS_PROXY_AVAILABLE__: true }, () => null);
  assert.equal(googleMapsProxyAvailable(), true);
  globalThis.window.__GOOGLE_MAPS_PROXY_AVAILABLE__ = 'AIza-a-key-string';
  assert.equal(googleMapsProxyAvailable(), false, 'a key string is not the flag');
  globalThis.window.__GOOGLE_MAPS_PROXY_AVAILABLE__ = false;
  assert.equal(googleMapsProxyAvailable(), false);
});

test('proxy URLs are same-origin and carry only the geocode parameters', () => {
  const forward = new URL(googleForwardGeocodeUrl('the marina', '30.1,-97.9|30.4,-97.6'), 'http://localhost');
  assert.equal(forward.origin + forward.pathname, `http://localhost${GOOGLE_GEOCODE_PROXY_PATH}`);
  assert.deepEqual([...forward.searchParams.entries()], [['address', 'the marina'], ['bounds', '30.1,-97.9|30.4,-97.6']]);
  const reverse = new URL(googleReverseGeocodeUrl(-6.2, 106.8166), 'http://localhost');
  assert.deepEqual([...reverse.searchParams.entries()], [['latlng', '-6.2,106.8166']]);
});

test('annotation geocodePlace calls the proxy with address + bounds and parses Google JSON', async (t) => {
  const requested = installBrowser(t, { __GOOGLE_MAPS_PROXY_AVAILABLE__: true }, () => ({
    json: async () => ({
      status: 'OK',
      results: [{
        formatted_address: 'Proxy Marina Fixture, Austin, TX, USA',
        types: ['marina', 'point_of_interest'],
        address_components: [{ long_name: 'Proxy Marina Fixture', types: ['point_of_interest'] }],
        geometry: { location: { lat: 30.26, lng: -97.75 } },
      }],
    }),
  }));
  const place = await geocodePlace('proxy marina fixture', '30.1,-97.9|30.4,-97.6');
  assert.equal(requested.length, 1);
  const url = new URL(requested[0], 'http://localhost');
  assert.equal(url.pathname, GOOGLE_GEOCODE_PROXY_PATH);
  assert.equal(url.searchParams.get('address'), 'proxy marina fixture');
  assert.equal(url.searchParams.get('bounds'), '30.1,-97.9|30.4,-97.6');
  assert.equal(url.searchParams.has('key'), false);
  assert.equal(place.lat, 30.26);
  assert.equal(place.lon, -97.75);
});

test('annotation geocodePlace skips the network when the server has no Google key', async (t) => {
  const requested = installBrowser(t, { __GOOGLE_MAPS_PROXY_AVAILABLE__: false }, () => {
    throw new Error('fetch must not be called');
  });
  assert.equal(await geocodePlace('keyless fixture place', null), null);
  assert.equal(requested.length, 0);
});

test('voice scene context reverse-geocodes the view target through the proxy', async (t) => {
  const requested = installBrowser(t, { __GOOGLE_MAPS_PROXY_AVAILABLE__: true }, () => ({
    ok: true,
    json: async () => ({
      status: 'OK',
      results: [{
        formatted_address: 'Jalan Proxy Fixture, Jakarta, Indonesia',
        types: ['route'],
        address_components: [{ long_name: 'Jalan Proxy Fixture', types: ['route'] }],
      }],
    }),
  }));
  const context = await getBasemapLabelContext(viewerLookingAt(-6.2001, 106.8166, 50000));
  const reverse = requested.map((url) => new URL(url, 'http://localhost'))
    .filter((url) => url.pathname === GOOGLE_GEOCODE_PROXY_PATH);
  assert.equal(reverse.length, 1);
  assert.equal(reverse[0].searchParams.get('latlng'), '-6.2001,106.8166');
  assert.equal(reverse[0].searchParams.has('key'), false);
  assert.ok(context.placeLabels.includes('Jalan Proxy Fixture, Jakarta, Indonesia'));
  assert.ok(context.streetLabels.includes('Jalan Proxy Fixture'));
});

test('voice scene context skips reverse geocoding when the server has no Google key', async (t) => {
  const requested = installBrowser(t, { __GOOGLE_MAPS_PROXY_AVAILABLE__: false }, () => ({
    ok: true,
    json: async () => ({ places: [] }),
  }));
  await getBasemapLabelContext(viewerLookingAt(-7.7, 110.4, 50000));
  assert.equal(requested.some((url) => url.startsWith(GOOGLE_GEOCODE_PROXY_PATH)), false);
});
