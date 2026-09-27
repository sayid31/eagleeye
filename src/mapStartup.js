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

/**
 * Decide which map provider can deliver the best startup experience.
 * @param {{googleApiKey?: string, cesiumToken?: string}} credentials
 * @returns {'google-direct'|'google-ion'|'osm'}
 */
export function selectMapStartupRoute({ googleApiKey = '', cesiumToken = '' } = {}) {
  if (clean(googleApiKey)) return 'google-direct';
  if (clean(cesiumToken)) return 'google-ion';
  return 'osm';
}

/**
 * Load Google Photorealistic 3D Tiles through direct Google access when
 * configured, otherwise through Cesium ion's hosted Google asset. If the
 * direct request fails and an ion token is available, ion is the recovery path.
 *
 * @param {object} Cesium
 * @param {{googleApiKey?: string, cesiumToken?: string}} credentials
 * @returns {Promise<{tileset: object|null, route: 'google-direct'|'google-ion'|'osm', errors: Error[]}>}
 */
export async function loadPhotorealisticTileset(
  Cesium,
  { googleApiKey = '', cesiumToken = '' } = {},
) {
  const googleKey = clean(googleApiKey);
  const ionToken = clean(cesiumToken);
  const errors = [];

  if (ionToken) Cesium.Ion.defaultAccessToken = ionToken;

  const attempts = [];
  if (googleKey) attempts.push({ route: 'google-direct', googleKey });
  if (ionToken) attempts.push({ route: 'google-ion', googleKey: undefined });

  for (const attempt of attempts) {
    Cesium.GoogleMaps.defaultApiKey = attempt.googleKey;
    try {
      const tileset = await Cesium.createGooglePhotorealistic3DTileset({
        onlyUsingWithGoogleGeocoder: true,
        maximumScreenSpaceError: PHOTOREAL_MAXIMUM_SCREEN_SPACE_ERROR,
        dynamicScreenSpaceError: true,
      });
      return { tileset, route: attempt.route, errors };
    } catch (error) {
      errors.push(error instanceof Error ? error : new Error(String(error)));
    }
  }

  Cesium.GoogleMaps.defaultApiKey = undefined;
  return { tileset: null, route: 'osm', errors };
}
