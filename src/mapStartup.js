const clean = (value) => String(value || '').trim();

/**
 * Screen-space-error ceiling for the Google Photorealistic 3D Tileset.
 * Cesium's own default (16px) targets near-photographic fidelity assuming
 * the tileset has the GPU to itself — this app instead runs with every data
 * layer (fleet 3D models, detection overlay, post-process style) enabled
 * simultaneously by design (see docs/CURRENT-STATE.md, 2026-09 performance
 * audit: the tileset was previously created with zero tuning at all).
 * Raising this trades a small amount of distant-tile crispness for GPU
 * headroom under that combined load. `dynamicScreenSpaceError` is already
 * Cesium's own default (true, as of 1.138) but is set explicitly so an
 * upstream default change can't silently alter this app's behavior.
 */
export const PHOTOREAL_MAXIMUM_SCREEN_SPACE_ERROR = 24;

/** Google's logical root URL; requests to it are mapped onto the server proxy. */
export const GOOGLE_TILES_ROOT_URL = 'https://tile.googleapis.com/v1/3dtiles/root.json';
const GOOGLE_TILES_UPSTREAM_PREFIX = 'https://tile.googleapis.com/v1/3dtiles/';
/** Same-origin route that adds the Google key server-side (src/data/googleTilesProxy.mjs). */
export const GOOGLE_TILES_PROXY_PREFIX = '/api/google/3dtiles/';

/**
 * Tileset options for the proxied Google route. `createGooglePhotorealistic3DTileset`
 * (Cesium 1.138, Scene/createGooglePhotorealistic3DTileset.js) applies the
 * cache/collision defaults below before `Cesium3DTileset.fromUrl`; they are
 * reproduced here because this route calls `fromUrl` itself.
 * `showCreditsOnScreen` keeps Google's per-tile attribution on screen, as the
 * Map Tiles policies require for CesiumJS.
 */
export const PHOTOREAL_PROXY_TILESET_OPTIONS = Object.freeze({
  maximumScreenSpaceError: PHOTOREAL_MAXIMUM_SCREEN_SPACE_ERROR,
  dynamicScreenSpaceError: true,
  cacheBytes: 1536 * 1024 * 1024,
  maximumCacheOverflowBytes: 1024 * 1024 * 1024,
  enableCollision: true,
  showCreditsOnScreen: true,
});

/**
 * Map a Google Map Tiles URL (as Cesium resolves it from the tileset JSON) to
 * the same-origin proxy route, dropping any `key` parameter. URLs outside
 * `https://tile.googleapis.com/v1/3dtiles/` are returned unchanged; they then
 * reach their host without our key, so an unexpected URI fails closed.
 *
 * @param {string} url - Fully resolved request URL (query included).
 * @returns {string} The URL the browser actually requests.
 */
export function googleTilesProxyUrl(url) {
  const text = String(url);
  if (!text.startsWith(GOOGLE_TILES_UPSTREAM_PREFIX)) return text;
  const rest = text.slice(GOOGLE_TILES_UPSTREAM_PREFIX.length);
  const queryStart = rest.indexOf('?');
  const path = queryStart === -1 ? rest : rest.slice(0, queryStart);
  const params = new URLSearchParams(queryStart === -1 ? '' : rest.slice(queryStart + 1));
  for (const name of [...params.keys()]) {
    if (name.toLowerCase() === 'key') params.delete(name);
  }
  const query = params.toString();
  return `${GOOGLE_TILES_PROXY_PREFIX}${path}${query ? `?${query}` : ''}`;
}

/**
 * Cesium `Proxy` implementation (only `getURL` is required). `Resource`
 * copies its proxy into every derived resource, so child tilesets and glb
 * content resolved from Google's absolute-path URIs are all proxied too.
 */
export const GOOGLE_TILES_RESOURCE_PROXY = Object.freeze({ getURL: googleTilesProxyUrl });

/**
 * Decide which map provider can deliver the best startup experience.
 * @param {{googleProxyAvailable?: boolean, cesiumToken?: string}} credentials
 * @returns {'google-direct'|'google-ion'|'osm'}
 */
export function selectMapStartupRoute({ googleProxyAvailable = false, cesiumToken = '' } = {}) {
  if (googleProxyAvailable === true) return 'google-direct';
  if (clean(cesiumToken)) return 'google-ion';
  return 'osm';
}

/** Load Google's tileset through the same-origin proxy (route 'google-direct'). */
function loadProxiedGoogleTileset(Cesium) {
  const credit = Cesium.GoogleMaps?.getDefaultCredit?.();
  const resource = new Cesium.Resource({
    url: GOOGLE_TILES_ROOT_URL,
    proxy: GOOGLE_TILES_RESOURCE_PROXY,
    credits: credit ? [credit] : undefined,
  });
  return Cesium.Cesium3DTileset.fromUrl(resource, { ...PHOTOREAL_PROXY_TILESET_OPTIONS });
}

/**
 * Load Google Photorealistic 3D Tiles through the server-side Google proxy
 * when the server has a Google key, otherwise through Cesium ion's hosted
 * Google asset. If the proxied request fails and an ion token is available,
 * ion is the recovery path. The browser never holds the Google key.
 *
 * @param {object} Cesium
 * @param {{googleProxyAvailable?: boolean, cesiumToken?: string}} credentials
 * @returns {Promise<{tileset: object|null, route: 'google-direct'|'google-ion'|'osm', errors: Error[]}>}
 */
export async function loadPhotorealisticTileset(
  Cesium,
  { googleProxyAvailable = false, cesiumToken = '' } = {},
) {
  const ionToken = clean(cesiumToken);
  const errors = [];

  if (ionToken) Cesium.Ion.defaultAccessToken = ionToken;

  const attempts = [];
  if (googleProxyAvailable === true) attempts.push('google-direct');
  if (ionToken) attempts.push('google-ion');

  for (const route of attempts) {
    try {
      const tileset = route === 'google-direct'
        ? await loadProxiedGoogleTileset(Cesium)
        // No GoogleMaps.defaultApiKey is ever set, so Cesium resolves this to
        // its ion-hosted Google asset.
        : await Cesium.createGooglePhotorealistic3DTileset({
          onlyUsingWithGoogleGeocoder: true,
          maximumScreenSpaceError: PHOTOREAL_MAXIMUM_SCREEN_SPACE_ERROR,
          dynamicScreenSpaceError: true,
        });
      return { tileset, route, errors };
    } catch (error) {
      errors.push(error instanceof Error ? error : new Error(String(error)));
    }
  }

  return { tileset: null, route: 'osm', errors };
}
