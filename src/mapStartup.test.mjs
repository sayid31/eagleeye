import test from 'node:test';
import assert from 'node:assert/strict';
import {
  GOOGLE_TILES_PROXY_PREFIX,
  GOOGLE_TILES_RESOURCE_PROXY,
  GOOGLE_TILES_ROOT_URL,
  PHOTOREAL_MAXIMUM_SCREEN_SPACE_ERROR,
  googleTilesProxyUrl,
  loadPhotorealisticTileset,
  selectMapStartupRoute,
} from './mapStartup.js';

/**
 * Minimal Cesium double: records the proxied `Cesium3DTileset.fromUrl` loads
 * and the ion-hosted `createGooglePhotorealistic3DTileset` loads separately.
 */
function fakeCesium({ direct = [], ion = [] } = {}) {
  const calls = { direct: [], ion: [] };
  const credit = { id: 'google-logo-credit' };
  const Cesium = {
    calls,
    credit,
    Ion: { defaultAccessToken: undefined },
    GoogleMaps: { defaultApiKey: undefined, getDefaultCredit: () => credit },
    Resource: class {
      constructor(options) {
        Object.assign(this, options);
      }
    },
    Cesium3DTileset: {
      async fromUrl(resource, options) {
        calls.direct.push({ resource, options });
        const outcome = direct.shift();
        if (outcome instanceof Error) throw outcome;
        return outcome;
      },
    },
    async createGooglePhotorealistic3DTileset(options) {
      calls.ion.push({
        options,
        googleKey: Cesium.GoogleMaps.defaultApiKey,
        ionToken: Cesium.Ion.defaultAccessToken,
      });
      const outcome = ion.shift();
      if (outcome instanceof Error) throw outcome;
      return outcome;
    },
  };
  return Cesium;
}

test('map startup route reflects the best configured provider', () => {
  assert.equal(selectMapStartupRoute({ googleProxyAvailable: true, cesiumToken: 'ion' }), 'google-direct');
  assert.equal(selectMapStartupRoute({ cesiumToken: 'ion' }), 'google-ion');
  assert.equal(selectMapStartupRoute({ googleProxyAvailable: false }), 'osm');
  // Only a real boolean counts: a stray key string must not imply the proxy.
  assert.equal(selectMapStartupRoute({ googleProxyAvailable: 'AIza-something' }), 'osm');
  assert.equal(selectMapStartupRoute(), 'osm');
});

test('no credentials skip photoreal loading and preserve keyless startup', async () => {
  const Cesium = fakeCesium();
  const result = await loadPhotorealisticTileset(Cesium);
  assert.equal(result.tileset, null);
  assert.equal(result.route, 'osm');
  assert.equal(Cesium.calls.direct.length + Cesium.calls.ion.length, 0);
});

test('the Google route loads through the same-origin proxy without any key in the browser', async () => {
  const tileset = { id: 'direct' };
  const Cesium = fakeCesium({ direct: [tileset] });
  const result = await loadPhotorealisticTileset(Cesium, { googleProxyAvailable: true, cesiumToken: 'ion-secret' });
  assert.equal(result.tileset, tileset);
  assert.equal(result.route, 'google-direct');
  assert.equal(Cesium.calls.ion.length, 0);
  const { resource, options } = Cesium.calls.direct[0];
  assert.equal(resource.url, GOOGLE_TILES_ROOT_URL);
  assert.equal(resource.proxy, GOOGLE_TILES_RESOURCE_PROXY);
  assert.equal(resource.queryParameters, undefined, 'no key query parameter is attached');
  assert.deepEqual(resource.credits, [Cesium.credit], 'the Google logo credit is kept');
  assert.equal(resource.proxy.getURL(resource.url), '/api/google/3dtiles/root.json');
  assert.equal(options.maximumScreenSpaceError, PHOTOREAL_MAXIMUM_SCREEN_SPACE_ERROR);
  assert.equal(options.dynamicScreenSpaceError, true);
  assert.equal(options.showCreditsOnScreen, true, 'Google attribution must stay on screen');
  assert.equal(options.enableCollision, true);
  assert.equal(Cesium.GoogleMaps.defaultApiKey, undefined, 'no Google key is ever set client-side');
});

test('child tile URLs resolved from Google tileset JSON map onto the proxy and lose any key', () => {
  assert.equal(
    googleTilesProxyUrl('https://tile.googleapis.com/v1/3dtiles/datasets/CgA/files/UlRP==.json?session=CIq1&key=leak'),
    `${GOOGLE_TILES_PROXY_PREFIX}datasets/CgA/files/UlRP==.json?session=CIq1`,
  );
  assert.equal(
    googleTilesProxyUrl('https://tile.googleapis.com/v1/3dtiles/datasets/CgA/files/t.glb?session=s&v=2'),
    '/api/google/3dtiles/datasets/CgA/files/t.glb?session=s&v=2',
  );
  assert.equal(googleTilesProxyUrl('https://tile.googleapis.com/v1/3dtiles/root.json?KEY=x'), '/api/google/3dtiles/root.json');
  // Anything else is left alone (it then reaches its host without our key).
  assert.equal(googleTilesProxyUrl('https://assets.ion.cesium.com/x.json'), 'https://assets.ion.cesium.com/x.json');
  assert.equal(googleTilesProxyUrl('https://tile.googleapis.com/v1/2dtiles/x'), 'https://tile.googleapis.com/v1/2dtiles/x');
});

test('an ion-only setup loads the hosted Google 3D asset', async () => {
  const tileset = { id: 'ion' };
  const Cesium = fakeCesium({ ion: [tileset] });
  const result = await loadPhotorealisticTileset(Cesium, { cesiumToken: 'ion-secret' });
  assert.equal(result.tileset, tileset);
  assert.equal(result.route, 'google-ion');
  assert.equal(Cesium.calls.direct.length, 0);
  assert.equal(Cesium.calls.ion.length, 1);
  assert.equal(Cesium.calls.ion[0].googleKey, undefined);
  assert.equal(Cesium.calls.ion[0].ionToken, 'ion-secret');
  assert.equal(Cesium.Ion.defaultAccessToken, 'ion-secret');
});

test('a failed proxied request retries through ion before falling back', async () => {
  const tileset = { id: 'ion-fallback' };
  const Cesium = fakeCesium({ direct: [new Error('proxy 403')], ion: [tileset] });
  const result = await loadPhotorealisticTileset(Cesium, { googleProxyAvailable: true, cesiumToken: 'ion-secret' });
  assert.equal(result.tileset, tileset);
  assert.equal(result.route, 'google-ion');
  assert.equal(result.errors.length, 1);
  assert.equal(Cesium.calls.direct.length, 1);
  assert.equal(Cesium.calls.ion.length, 1);
  assert.equal(Cesium.calls.ion[0].googleKey, undefined);
});

test('a failed proxy-only request does not consume an implicit Cesium token', async () => {
  const Cesium = fakeCesium({ direct: [new Error('proxy 503')] });
  const result = await loadPhotorealisticTileset(Cesium, { googleProxyAvailable: true });
  assert.equal(result.tileset, null);
  assert.equal(result.route, 'osm');
  assert.equal(result.errors.length, 1);
  assert.equal(Cesium.calls.ion.length, 0);
  assert.equal(Cesium.Ion.defaultAccessToken, undefined);
});

test('failed proxied and ion requests preserve the keyless OSM fallback', async () => {
  const Cesium = fakeCesium({ direct: [new Error('proxy denied')], ion: [new Error('ion denied')] });
  const result = await loadPhotorealisticTileset(Cesium, { googleProxyAvailable: true, cesiumToken: 'ion-secret' });
  assert.equal(result.tileset, null);
  assert.equal(result.route, 'osm');
  assert.equal(result.errors.length, 2);
  assert.equal(Cesium.GoogleMaps.defaultApiKey, undefined);
});

test('real Cesium Resource: every derived child URL (absolute-path or relative) is requested via the proxy', async () => {
  const Cesium = await import('cesium');
  const root = new Cesium.Resource({ url: GOOGLE_TILES_ROOT_URL, proxy: GOOGLE_TILES_RESOURCE_PROXY });
  // `Resource.url` is what Resource.fetch() hands to the request (proxy applied).
  assert.equal(root.url, '/api/google/3dtiles/root.json');

  // Google's root.json references children by absolute path + session.
  const childTileset = root.getDerivedResource({ url: '/v1/3dtiles/datasets/CgA/files/UlRP==.json?session=CIq1' });
  assert.equal(childTileset.url, '/api/google/3dtiles/datasets/CgA/files/UlRP==.json?session=CIq1');

  const glb = childTileset.getDerivedResource({ url: '/v1/3dtiles/datasets/CgA/files/tile.glb?session=CIq1' });
  assert.equal(glb.url, '/api/google/3dtiles/datasets/CgA/files/tile.glb?session=CIq1');

  const relative = childTileset.getDerivedResource({ url: 'sibling.glb' });
  assert.equal(relative.url, '/api/google/3dtiles/datasets/CgA/files/sibling.glb?session=CIq1');
  assert.equal(relative.url.includes('key='), false);
});
