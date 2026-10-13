// Camera catalog: seeds, feed-type normalization, source merge and catalog build.

import * as Cesium from 'cesium';
import { CITY_POIS } from '../locations.js';
import { SOURCE_ENDPOINT } from './cctvConstants.js';
import { ensureCameraPose } from './cctvGeometry.js';
import { clamp, headingFromId, normalizeHeading, offsetDegrees, safeNumber } from './cctvMath.js';
import { S } from './cctvState.js';

/**
 * Seed camera definitions used when no live sources are available.
 * Each seed references a city from CITY_POIS and a POI index within that city,
 * plus offsets to place the camera near the POI.
 */
const CAMERA_SEEDS = [
  { id: 'nyc-midtown-w', cityId: 'nyc', poiIndex: 1, label: 'Midtown West @ 34th', offsetNorthM: 120, offsetEastM: -70, headingDeg: 206, fovDeg: 74, rangeM: 880, elevationM: 26 },
  { id: 'nyc-wtc-n', cityId: 'nyc', poiIndex: 2, label: 'WTC North Plaza', offsetNorthM: 95, offsetEastM: 34, headingDeg: 164, fovDeg: 68, rangeM: 760, elevationM: 32 },
  { id: 'nyc-times-square-ne', cityId: 'nyc', poiIndex: 1, label: 'Times Sq Northeast', offsetNorthM: 230, offsetEastM: 120, headingDeg: 218, fovDeg: 66, rangeM: 640, elevationM: 24 },

  { id: 'sf-market-5th', cityId: 'sf', poiIndex: 2, label: 'Market & 5th', offsetNorthM: -160, offsetEastM: 80, headingDeg: 320, fovDeg: 70, rangeM: 780, elevationM: 20 },
  { id: 'sf-financial-district', cityId: 'sf', poiIndex: 1, label: 'SF Financial Core', offsetNorthM: 110, offsetEastM: 52, headingDeg: 205, fovDeg: 72, rangeM: 760, elevationM: 24 },

  { id: 'tokyo-shibuya-scramble', cityId: 'tokyo', poiIndex: 4, label: 'Shibuya Crossing', offsetNorthM: 180, offsetEastM: 46, headingDeg: 18, fovDeg: 82, rangeM: 640, elevationM: 30 },
  { id: 'tokyo-ginza-core', cityId: 'tokyo', poiIndex: 0, label: 'Ginza Core', offsetNorthM: -180, offsetEastM: 150, headingDeg: 245, fovDeg: 70, rangeM: 690, elevationM: 28 },
  { id: 'tokyo-asakusa-n', cityId: 'tokyo', poiIndex: 3, label: 'Asakusa North Gate', offsetNorthM: 110, offsetEastM: -65, headingDeg: 192, fovDeg: 68, rangeM: 620, elevationM: 24 },

  { id: 'london-city-a1', cityId: 'london', poiIndex: 4, label: 'City Cluster A1', offsetNorthM: 80, offsetEastM: 65, headingDeg: 220, fovDeg: 71, rangeM: 720, elevationM: 27 },
  { id: 'london-soho-core', cityId: 'london', poiIndex: 2, label: 'Soho Core', offsetNorthM: 210, offsetEastM: 120, headingDeg: 206, fovDeg: 70, rangeM: 700, elevationM: 22 },

  { id: 'paris-rivoli', cityId: 'paris', poiIndex: 4, label: 'Rue de Rivoli', offsetNorthM: 55, offsetEastM: 85, headingDeg: 248, fovDeg: 66, rangeM: 640, elevationM: 22 },
  { id: 'paris-champs-n', cityId: 'paris', poiIndex: 1, label: 'Champs-Élysées North', offsetNorthM: 130, offsetEastM: -38, headingDeg: 175, fovDeg: 68, rangeM: 700, elevationM: 26 },

  { id: 'dc-mall-center', cityId: 'dc', poiIndex: 1, label: 'National Mall Center', offsetNorthM: 120, offsetEastM: 20, headingDeg: 258, fovDeg: 78, rangeM: 940, elevationM: 24 },
  { id: 'dc-pentagon-s', cityId: 'dc', poiIndex: 3, label: 'Pentagon South', offsetNorthM: -100, offsetEastM: 92, headingDeg: 14, fovDeg: 66, rangeM: 620, elevationM: 21 },

  { id: 'dubai-difc-loop', cityId: 'dubai', poiIndex: 4, label: 'DIFC Loop', offsetNorthM: 92, offsetEastM: -45, headingDeg: 196, fovDeg: 70, rangeM: 720, elevationM: 26 },
  { id: 'dubai-downtown-east', cityId: 'dubai', poiIndex: 0, label: 'Downtown East', offsetNorthM: -130, offsetEastM: 190, headingDeg: 322, fovDeg: 72, rangeM: 760, elevationM: 28 },

  { id: 'austin-congress-s', cityId: 'austin', poiIndex: 0, label: 'Congress Southbound', offsetNorthM: -165, offsetEastM: 40, headingDeg: 12, fovDeg: 74, rangeM: 760, elevationM: 24 },
  { id: 'austin-downtown-west', cityId: 'austin', poiIndex: 1, label: 'Downtown West', offsetNorthM: -120, offsetEastM: -160, headingDeg: 120, fovDeg: 69, rangeM: 700, elevationM: 20 },

  // Fictional/synthetic seeds for the Indonesian cities that have no live
  // source yet (see config/cctv_sources.indonesia_unofficial.json), so
  // `feedConfigured: false` renders coverage instead of an empty catalog.
  // A city that gains live rows must lose its seeds: a seed has no stream, and
  // next to live cameras it shows up as an empty green placeholder card
  // (Yogyakarta/Malioboro). Jakarta, Bandung, Denpasar, Surabaya and
  // Yogyakarta were removed for that reason; cctvIndonesiaUnofficialPack.test.mjs
  // enforces it. Same structure and `sourceKind: 'seed'` marking as above.
  { id: 'medan-maimun-e', cityId: 'medan', poiIndex: 0, label: 'Istana Maimun East', offsetNorthM: 90, offsetEastM: 100, headingDeg: 250, fovDeg: 70, rangeM: 700, elevationM: 22 },
  { id: 'medan-merdeka-walk', cityId: 'medan', poiIndex: 4, label: 'Merdeka Walk Core', offsetNorthM: -70, offsetEastM: -60, headingDeg: 120, fovDeg: 68, rangeM: 660, elevationM: 20 },

  { id: 'semarang-kota-lama-n', cityId: 'semarang', poiIndex: 2, label: 'Kota Lama North', offsetNorthM: 100, offsetEastM: 45, headingDeg: 210, fovDeg: 71, rangeM: 700, elevationM: 23 },
  { id: 'semarang-simpang-lima', cityId: 'semarang', poiIndex: 4, label: 'Simpang Lima Core', offsetNorthM: -80, offsetEastM: -50, headingDeg: 110, fovDeg: 74, rangeM: 720, elevationM: 24 },

  { id: 'makassar-losari-w', cityId: 'makassar', poiIndex: 1, label: 'Pantai Losari West', offsetNorthM: 60, offsetEastM: -110, headingDeg: 270, fovDeg: 74, rangeM: 760, elevationM: 24 },
  { id: 'makassar-karebosi-core', cityId: 'makassar', poiIndex: 4, label: 'Karebosi Park Core', offsetNorthM: -85, offsetEastM: 65, headingDeg: 150, fovDeg: 68, rangeM: 660, elevationM: 20 },

];

/**
 * Normalizes a raw feed-type string to a canonical type (image, mjpeg, mp4, hls, webm, flv).
 * @param {string|*} value - Raw feed type from source config.
 * @returns {string} Canonical feed type.
 */
export function normalizeFeedType(value) {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return 'image';
  if (raw === 'mjpg') return 'mjpeg';
  if (raw === 'jpeg') return 'image';
  if (raw === 'jpg') return 'image';
  if (raw === 'video') return 'mp4';
  if (raw === 'stream') return 'hls';
  if (raw === 'png') return 'image';
  if (raw === 'gif') return 'image';
  return raw;
}

/**
 * Returns true if the feed type requires a <video> element rather than an <img>.
 * @param {string} feedType
 * @returns {boolean}
 */
export function isVideoFeedType(feedType) {
  return feedType === 'mp4' || feedType === 'hls' || feedType === 'webm' || feedType === 'flv';
}

/**
 * Returns a coarse grid key describing the viewer's current position and zoom
 * level. Used to detect meaningful view changes for auto-hop camera switching.
 * @returns {string} Grid key in the form "zoomBucket:latGrid:lonGrid".
 */
export function currentViewContext() {
  const carto = S._viewer?.camera?.positionCartographic;
  if (!carto) return 'none';
  const lat = Cesium.Math.toDegrees(carto.latitude);
  const lon = Cesium.Math.toDegrees(carto.longitude);
  const alt = carto.height || 0;
  const zoomBucket = alt < 1500 ? 'street'
    : alt < 12000 ? 'city'
      : alt < 75000 ? 'regional'
        : 'global';
  const grid = zoomBucket === 'street' ? 0.045
    : zoomBucket === 'city' ? 0.24
      : zoomBucket === 'regional' ? 1.0
        : 4.5;
  return `${zoomBucket}:${Math.floor(lat / grid)}:${Math.floor(lon / grid)}`;
}

/**
 * Builds the initial camera catalog from CAMERA_SEEDS definitions.
 * Each seed is resolved against its city's POI coordinates, offset, and
 * passed through ensureCameraPose to populate derived fields.
 * @returns {Object[]} Array of fully-initialized camera objects.
 */
export function seedCatalog() {
  const catalog = [];
  for (const seed of CAMERA_SEEDS) {
    const city = CITY_POIS[seed.cityId];
    const poi = city?.pois?.[seed.poiIndex];
    if (!city || !poi) continue;
    const { latOffset, lonOffset } = offsetDegrees(
      poi.lat,
      seed.offsetNorthM || 0,
      seed.offsetEastM || 0
    );
    const camera = {
      id: seed.id,
      name: seed.label,
      cityId: seed.cityId,
      city: city.name,
      provider: 'OSM Camera Grid',
      sourceKind: 'seed',
      feedType: 'image',
      feedConfigured: false,
      headingConfidence: 'medium',
      lat: poi.lat + latOffset,
      lon: poi.lon + lonOffset,
      headingDeg: normalizeHeading(seed.headingDeg ?? poi.heading ?? 0),
      fovDeg: clamp(seed.fovDeg ?? 70, 20, 120),
      rangeM: clamp(seed.rangeM ?? 700, 260, 1800),
      mountHeightM: clamp(seed.elevationM ?? 22, 8, 80),
      groundElevationM: Number(city.groundElevation) || 0,
      absoluteHeightM: (Number(city.groundElevation) || 0) + clamp(seed.elevationM ?? 22, 8, 80),
      pitchDeg: clamp(seed.pitchDeg ?? -17, -40, -4),
    };
    ensureCameraPose(camera);
    catalog.push(camera);
  }
  return catalog;
}

/**
 * Looks up a city ID from CITY_POIS by exact or partial name match.
 * @param {string} cityName
 * @returns {string|null} Matching city ID or null.
 */
function cityIdByName(cityName) {
  const probe = String(cityName || '').trim().toLowerCase();
  if (!probe) return null;
  for (const [cityId, city] of Object.entries(CITY_POIS)) {
    if (city.name.toLowerCase() === probe) return cityId;
  }
  for (const [cityId, city] of Object.entries(CITY_POIS)) {
    if (city.name.toLowerCase().includes(probe) || probe.includes(city.name.toLowerCase())) return cityId;
  }
  return null;
}

/**
 * Fetches configured camera sources from the backend.
 * @returns {Promise<Object[]>} Array of raw source objects, or empty on failure.
 */
export async function loadCameraSources() {
  try {
    const resp = await fetch(SOURCE_ENDPOINT, { cache: 'no-store' });
    if (!resp.ok) return [];
    const data = await resp.json();
    if (!Array.isArray(data?.sources)) return [];
    return data.sources;
  } catch {
    return [];
  }
}

/**
 * Merges raw backend sources with seed data to produce the final camera catalog.
 * Seeds provide fallback values for heading, FOV, range, etc. when not specified
 * by the source. Each camera is passed through ensureCameraPose.
 * @param {Object[]} rawSources - Raw source objects from the backend.
 * @returns {Object[]} Array of fully-initialized camera objects.
 */
export function buildCatalogFromSources(rawSources) {
  const sources = Array.isArray(rawSources) ? rawSources : [];
  if (!sources.length) return [];

  const seeded = seedCatalog();
  const seedById = new Map(seeded.map((camera) => [camera.id, camera]));

  const catalog = [];
  for (const source of sources) {
    if (!source || typeof source !== 'object') continue;
    const id = String(source.id || '').trim();
    if (!id) continue;
    const seed = seedById.get(id);
    const cityId = String(source.cityId || '').trim() || cityIdByName(source.city) || seed?.cityId || '';
    const city = cityId && CITY_POIS[cityId] ? CITY_POIS[cityId] : null;

    const lat = safeNumber(source.lat, seed?.lat ?? NaN);
    const lon = safeNumber(source.lon, seed?.lon ?? NaN);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;

    const sourceHeading = safeNumber(source.headingDeg, NaN);
    const headingDeg = normalizeHeading(
      Number.isFinite(sourceHeading)
        ? sourceHeading
        : (seed?.headingDeg ?? headingFromId(id))
    );
    const fovDeg = clamp(safeNumber(source.fovDeg, seed?.fovDeg ?? 74), 20, 125);
    const rangeM = clamp(safeNumber(source.rangeM, seed?.rangeM ?? 700), 220, 2200);
    const mountHeightM = clamp(safeNumber(source.mountHeightM, seed?.mountHeightM ?? 24), 6, 120);
    const pitchDeg = clamp(safeNumber(source.pitchDeg, seed?.pitchDeg ?? -17), -55, -2);
    const groundElevationM = safeNumber(source.groundElevationM, city?.groundElevation ?? seed?.groundElevationM ?? 0);
    const feedType = normalizeFeedType(source.feedType || source.type || 'image');
    const headingConfidence = String(source.headingConfidence || (seed ? 'high' : 'low')).toLowerCase();
    // CAL badge input (design §3b passthrough): hand-authored file/env source
    // entries may carry poseSource:'curated'. Austin Open Data rows never set
    // this — they stay RAW PRIOR until a human manually calibrates them.
    const poseSource = source.poseSource === 'curated' ? 'curated' : (seed?.poseSource || null);

    const camera = {
      id,
      name: String(source.name || seed?.name || id),
      cityId,
      city: String(source.city || city?.name || seed?.city || 'Global'),
      provider: String(source.provider || seed?.provider || 'Configured CCTV Source'),
      sourceKind: String(source.sourceKind || source.kind || (source.url ? 'configured' : 'seed')).toLowerCase(),
      feedType,
      feedConfigured: typeof source.url === 'string' && !!source.url.trim(),
      lat,
      lon,
      headingDeg,
      headingConfidence,
      fovDeg,
      rangeM,
      mountHeightM,
      groundElevationM,
      absoluteHeightM: groundElevationM + mountHeightM,
      pitchDeg,
      license: String(source.license || source.licenseNote || ''),
      poseSource,
    };
    ensureCameraPose(camera);
    catalog.push(camera);
  }

  return catalog;
}

/**
 * Merges the live-source catalog with the seed catalog so seed-only cameras
 * (no live open-data source is wired for their city — e.g. every Indonesian
 * city, plus the original 8 cities before Austin/Caltrans/TfL cover them)
 * keep showing coverage alongside successfully-loaded live sources, instead
 * of being replaced outright.
 *
 * Root cause this fixes: `buildCatalogFromSources()` only enriches source
 * rows that already exist in the backend response — it never appends a seed
 * that has no matching row. The old call site then picked EITHER the live
 * catalog OR the seed catalog (`catalogFromSources.length ? ... : seedCatalog()`),
 * so the instant Austin/Caltrans/TfL returned any rows at all, every seed
 * camera in every city (Indonesian and original) silently dropped out of the
 * catalog. A seed's `id` never collides with a live source's `id` (seed ids
 * are hand-authored slugs like `jakarta-monas-n`; live ids are provider-
 * generated — Austin numeric device ids, `ca-d<district>-<code>`, `tfl-<raw>`),
 * so a plain id-dedup union is sufficient here.
 * @param {Object[]} sourceCameras - Cameras built from live backend sources.
 * @param {Object[]} seedCameras - Cameras built from CAMERA_SEEDS.
 * @returns {Object[]} Union catalog, live sources taking priority by id.
 */
export function mergeSeedAndSourceCatalogs(sourceCameras, seedCameras) {
  const sourceIds = new Set(sourceCameras.map((camera) => camera.id));
  const seedOnly = seedCameras.filter((camera) => !sourceIds.has(camera.id));
  return [...sourceCameras, ...seedOnly];
}

/** @see normalizeFeedType */
export function _normalizeFeedTypeForTest(value) {
  return normalizeFeedType(value);
}

/** @see isVideoFeedType */
export function _isVideoFeedTypeForTest(feedType) {
  return isVideoFeedType(feedType);
}

/** @see buildCatalogFromSources */
export function _buildCatalogFromSourcesForTest(rawSources) {
  return buildCatalogFromSources(rawSources);
}
