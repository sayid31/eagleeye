/**
 * Pure Radio category/tag classification, tuner-geometry math, and
 * camera/nav-plan math.
 *
 * Extracted from `radio.js` (Wave 1 split program, item #14) — mechanical
 * relocation of already-pure/already-exported functions, zero behavior
 * change. Companion split to `radioOverlayEntries.js` (which holds the
 * overlay-entry builders and globe-label formatting); the two share one
 * real cross-dependency — `createRadioSelectedOverlayEntry`/
 * `createRadioSingletonOverlayEntry` in `radioOverlayEntries.js` call
 * `radioCategoryColor`/`radioStationCategoryId` defined here — resolved by
 * having `radio.js` re-export both symbols from this file.
 *
 * @module radioTunerMath
 */
import * as Cesium from 'cesium';
import { cachedGroundFloor } from './groundFloor.js';
import { normalizeRadioCountryInput } from './radioCountry.js';
import {
  GLOBE_ENTER_CLEARANCE_PX,
  isFullGlobeInsideKeyhole,
} from '../celestialRing.js';
import {
  GLOBAL_RADIO_ALTITUDE_M,
  RADIO_CATEGORY_COLORS,
  RADIO_GLOBE_RECENTER_MAX_HEIGHT_M,
  RADIO_PREFIX,
  RADIO_TUNER_DIRECTORY_LIMIT,
  RADIO_TUNER_STATION_LIMIT,
} from './radio.js';

const MARKER_LIFT_M = 2.5;

const MUSIC_GENRES = Object.freeze([
  ['alternative', 'Alternative'],
  ['ambient', 'Ambient'],
  ['blues', 'Blues'],
  ['classical', 'Classical'],
  ['country', 'Country'],
  ['dance', 'Dance'],
  ['electronic', 'Electronic'],
  ['folk', 'Folk'],
  ['funk', 'Funk'],
  ['hip hop', 'Hip-Hop'],
  ['house', 'House'],
  ['indie', 'Indie'],
  ['jazz', 'Jazz'],
  ['latin', 'Latin'],
  ['metal', 'Metal'],
  ['oldies', 'Oldies'],
  ['pop', 'Pop'],
  ['punk', 'Punk'],
  ['r&b', 'R&B'],
  ['reggae', 'Reggae'],
  ['rock', 'Rock'],
  ['soul', 'Soul'],
  ['techno', 'Techno'],
  ['trance', 'Trance'],
  ['world', 'World'],
]);

const CATEGORY_MATCHERS = Object.freeze({
  news: ['news', 'current affairs', 'journalism'],
  talk: ['talk', 'spoken word', 'interview', 'podcast'],
  weather: ['weather', 'emergency', 'noaa'],
  'public-safety': ['public safety', 'scanner', 'police', 'fire', 'ems', 'dispatch', 'emergency'],
  'aviation-marine': ['aviation', 'air traffic', 'atc', 'airport', 'marine', 'maritime', 'coast guard'],
  'traffic-transit': ['traffic', 'transit', 'transport', 'rail', 'metro'],
});

const RADIO_CLUSTER_LABELS = Object.freeze({
  news: 'BERITA',
  talk: 'TALK',
  weather: 'CUACA',
  'public-safety': 'KEAMANAN',
  'aviation-marine': 'UDARA / LAUT',
  'traffic-transit': 'TRANSIT',
  music: 'MUSIK',
  other: 'LAINNYA',
});

const RADIO_MARKER_CATEGORY_ORDER = Object.freeze([
  'news',
  'public-safety',
  'weather',
  'aviation-marine',
  'traffic-transit',
  'talk',
  'music',
]);

export function normalizeRadioTag(value) {
  return String(value ?? '')
    .trim()
    .toLocaleLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .slice(0, 80);
}

function stationTags(station) {
  if (Array.isArray(station?.tags)) return station.tags.map(normalizeRadioTag).filter(Boolean);
  return String(station?.tags ?? '')
    .split(',')
    .map(normalizeRadioTag)
    .filter(Boolean);
}

function hasTag(station, needles) {
  const tags = stationTags(station);
  return needles.some((needle) => tags.some((tag) => tag === needle || tag.includes(needle)));
}

function detectedGenres(station) {
  return MUSIC_GENRES.filter(([genre]) => hasTag(station, [genre])).map(([genre]) => genre);
}

/** Return whether a station belongs in a station-tag category. */
export function stationMatchesRadioCategory(station, categoryId) {
  if (categoryId === 'all') return true;
  if (categoryId.startsWith('genre:')) {
    return detectedGenres(station).includes(categoryId.slice('genre:'.length));
  }
  if (categoryId === 'music') {
    return detectedGenres(station).length > 0
      || hasTag(station, ['music', 'hits', 'songs']);
  }
  if (categoryId === 'other') {
    return !Object.entries(CATEGORY_MATCHERS).some(([id]) => stationMatchesRadioCategory(station, id))
      && !stationMatchesRadioCategory(station, 'music');
  }
  return hasTag(station, CATEGORY_MATCHERS[categoryId] || []);
}

/** Return the shared CSS color for a canonical or detected-genre category. */
export function radioCategoryColor(categoryId = 'other') {
  const normalized = String(categoryId || 'other');
  const canonical = normalized.startsWith('genre:') ? 'music' : normalized;
  return RADIO_CATEGORY_COLORS[canonical] || RADIO_CATEGORY_COLORS.other;
}

/** Format the concise count/category badge shown above a Radio cluster. */
export function radioClusterBadgeText(categoryId = 'other', count = 0) {
  const normalized = String(categoryId || 'other');
  const canonical = normalized.startsWith('genre:') ? 'music' : normalized;
  const label = RADIO_CLUSTER_LABELS[canonical] || RADIO_CLUSTER_LABELS.other;
  const stationCount = Math.max(0, Math.floor(Number(count) || 0));
  return `${stationCount} ${label}`;
}

/** Choose the category advertised by a cluster in the active station-tag view. */
export function radioClusterCategoryId(stations, activeFilter = 'all') {
  const filter = String(activeFilter || 'all');
  if (filter !== 'all') {
    if (filter.startsWith('genre:') || RADIO_MARKER_CATEGORY_ORDER.includes(filter) || filter === 'other') {
      return filter;
    }
    return 'other';
  }
  const categoryCounts = new Map();
  for (const station of Array.isArray(stations) ? stations : []) {
    const categoryId = radioStationCategoryId(station);
    categoryCounts.set(categoryId, (categoryCounts.get(categoryId) || 0) + 1);
  }
  let clusterCategory = 'other';
  let clusterCategoryCount = 0;
  for (const categoryId of RADIO_MARKER_CATEGORY_ORDER) {
    const count = categoryCounts.get(categoryId) || 0;
    if (count > clusterCategoryCount) {
      clusterCategory = categoryId;
      clusterCategoryCount = count;
    }
  }
  if ((categoryCounts.get('other') || 0) > clusterCategoryCount) return 'other';
  return clusterCategory;
}

/** Build the code-native four-corner bracket used by the selected station. */
export function radioSelectionBracketSvg(color = RADIO_CATEGORY_COLORS.other) {
  const stroke = /^#[0-9a-f]{6}$/i.test(String(color)) ? String(color) : RADIO_CATEGORY_COLORS.other;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 40 40"><path d="M2 13V2H13 M27 2H38V13 M38 27V38H27 M13 38H2V27" fill="none" stroke="${stroke}" stroke-width="2" stroke-linecap="square"/></svg>`;
}

/** Choose one stable display category for a station that may match several filters. */
export function radioStationCategoryId(station) {
  return RADIO_MARKER_CATEGORY_ORDER.find((categoryId) => (
    stationMatchesRadioCategory(station, categoryId)
  )) || 'other';
}

/** Build canonical and detected-genre categories from station-level tags. */
export function buildRadioCategories(stations) {
  const rows = Array.isArray(stations) ? stations : [];
  const categories = [
    { id: 'all', label: 'Semua' },
    { id: 'news', label: 'Berita' },
    { id: 'talk', label: 'Talk' },
    { id: 'weather', label: 'Cuaca / Darurat' },
    { id: 'public-safety', label: 'Keselamatan publik' },
    { id: 'aviation-marine', label: 'Penerbangan / Maritim' },
    { id: 'traffic-transit', label: 'Lalu lintas / Transit' },
    { id: 'music', label: 'Musik' },
  ];

  for (const [genre, label] of MUSIC_GENRES) {
    const id = `genre:${genre}`;
    if (rows.some((station) => stationMatchesRadioCategory(station, id))) {
      categories.push({ id, label });
    }
  }
  categories.push({ id: 'other', label: 'Lainnya' });
  return categories.map((category) => ({
    ...category,
    color: radioCategoryColor(category.id),
    count: rows.filter((station) => stationMatchesRadioCategory(station, category.id)).length,
  }));
}

/** Filter stations without changing the active stream or selection. */
export function filterRadioStations(stations, categoryId = 'all') {
  return (Array.isArray(stations) ? stations : [])
    .filter((station) => stationMatchesRadioCategory(station, categoryId));
}

/** Return whether Radio Browser metadata identifies a station as English-language. */
export function isEnglishRadioStation(station) {
  const languages = Array.isArray(station?.languages) ? station.languages : [];
  return languages.some((language) => {
    const normalized = normalizeRadioTag(language);
    return normalized === 'en' || normalized === 'eng' || normalized.startsWith('english');
  });
}

function radioAngularDistance(station, anchor) {
  const lat1 = Cesium.Math.toRadians(Number(anchor?.lat));
  const lon1 = Cesium.Math.toRadians(Number(anchor?.lon));
  const lat2 = Cesium.Math.toRadians(Number(station?.lat));
  const lon2 = Cesium.Math.toRadians(Number(station?.lon));
  if (![lat1, lon1, lat2, lon2].every(Number.isFinite)) return Number.POSITIVE_INFINITY;
  const deltaLat = lat2 - lat1;
  const deltaLon = lon2 - lon1;
  const haversine = Math.sin(deltaLat / 2) ** 2
    + Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLon / 2) ** 2;
  return 2 * Math.asin(Math.min(1, Math.sqrt(Math.max(0, haversine))));
}

/** Rank a copied station list by viewport distance, with an optional English-first tier. */
export function rankRadioStationsForViewport(stations, anchor, { preferEnglish = false } = {}) {
  return (Array.isArray(stations) ? stations : [])
    .map((station, index) => ({
      station,
      index,
      distance: radioAngularDistance(station, anchor),
      languageTier: preferEnglish && !isEnglishRadioStation(station) ? 1 : 0,
    }))
    .sort((a, b) => a.languageTier - b.languageTier || a.distance - b.distance || a.index - b.index)
    .map(({ station }) => station);
}

/** Rank stations for an explicit voice/player request without moving the camera. */
export function rankRadioStationsForRequest(stations, {
  categoryId = 'all',
  anchor = null,
  country = '',
  stationQuery = '',
} = {}) {
  const countryFilter = normalizeRadioCountryInput(country);
  if (!countryFilter.valid) return [];
  const query = normalizeRadioTag(stationQuery);
  let matches = filterRadioStations(stations, categoryId);
  if (countryFilter.code || countryFilter.name) {
    matches = matches.filter((station) => {
      const stationCode = String(station?.countryCode || '').trim().toUpperCase();
      const stationCountry = normalizeRadioCountryInput(station?.country);
      return (countryFilter.code && stationCode === countryFilter.code)
        || (countryFilter.code && stationCountry.valid && stationCountry.code === countryFilter.code);
    });
  }
  if (query) {
    matches = matches.filter((station) => [
      station?.id,
      station?.name,
      station?.state,
      station?.country,
      station?.countryCode,
      ...(Array.isArray(station?.tags) ? station.tags : []),
    ].some((value) => normalizeRadioTag(value).includes(query)));
  }
  return anchor
    ? rankRadioStationsForViewport(matches, anchor)
    : matches.slice();
}

/** Classify a globe-scale Radio view without flapping on Cesium height round-off. */
export function radioViewIsGlobal(altitudeM) {
  return Number.isFinite(altitudeM) && Math.round(altitudeM) >= GLOBAL_RADIO_ALTITUDE_M;
}

/** Pure stale-response guard shared by the async directory update path. */
export function radioRequestIsCurrent(
  generation,
  currentGeneration,
  enabled,
  sessionGeneration = null,
  currentSessionGeneration = sessionGeneration,
) {
  return generation === currentGeneration
    && Boolean(enabled)
    && sessionGeneration === currentSessionGeneration;
}

/** Resolve a station id from ordinary, selected, or Cesium cluster pick shapes. */
export function radioStationIdFromPick(picked) {
  const pending = [picked?.id, picked?.primitive?.id];
  const seen = new Set();
  while (pending.length) {
    const value = pending.shift();
    if (typeof value === 'string' || typeof value === 'number') {
      const id = String(value);
      if (id.startsWith(`${RADIO_PREFIX}selected:`)) return id.slice(`${RADIO_PREFIX}selected:`.length);
      if (id.startsWith(RADIO_PREFIX)) return id.slice(RADIO_PREFIX.length);
      continue;
    }
    if (!value || typeof value !== 'object' || seen.has(value)) continue;
    seen.add(value);
    if (Array.isArray(value)) pending.push(...value);
    else {
      pending.push(value.id);
      if (value.primitive) pending.push(value.primitive.id);
    }
  }
  return null;
}

/** Map an integer tuner slot directly to one available directory station. */
export function radioTunerSlot(value, stationCount) {
  const count = Math.max(0, Math.floor(Number(stationCount) || 0));
  if (!count) return { slot: 0, max: 0, locked: false, stationIndex: -1, leftIndex: -1, rightIndex: -1 };
  const max = Math.max(0, count - 1);
  const slot = Math.min(max, Math.max(0, Math.round(Number(value) || 0)));
  return {
    slot,
    max,
    locked: true,
    stationIndex: slot,
    leftIndex: slot,
    rightIndex: slot,
  };
}

/** Snap a tuner release to the nearest available directory station. */
export function radioTunerCommitSlot(value, stationCount) {
  return radioTunerSlot(value, stationCount);
}

/** Map one pointer coordinate to continuous absolute directory progress. */
export function radioTunerPointerPosition(clientX, left, width, stationCount, insetPx = 7) {
  const count = Math.max(0, Math.floor(Number(stationCount) || 0));
  if (!count) return { ratio: 0, coordinate: 0, stationIndex: -1 };
  if (count === 1) return { ratio: 0.5, coordinate: 0, stationIndex: 0 };
  const inset = Math.max(0, Number(insetPx) || 0);
  const usableWidth = Math.max(1, (Number(width) || 0) - inset * 2);
  const ratio = Math.min(1, Math.max(0, ((Number(clientX) || 0) - (Number(left) || 0) - inset) / usableWidth));
  const coordinate = ratio * (count - 1);
  return {
    ratio,
    coordinate,
    stationIndex: Math.min(count - 1, Math.max(0, Math.floor(coordinate + 0.5))),
  };
}

/** Build a bounded virtual tuner tape around one continuous directory coordinate. */
export function buildRadioTunerTicks(coordinate, stationCount, width, {
  insetPx = 7,
  minPitchPx = 14,
  speedFactor = 5,
  overscan = 2,
  labelStep = 6,
} = {}) {
  const count = Math.max(0, Math.floor(Number(stationCount) || 0));
  const dialWidth = Math.max(0, Number(width) || 0);
  const inset = Math.max(0, Number(insetPx) || 0);
  const usableWidth = Math.max(0, dialWidth - inset * 2);
  if (!count) return { ticks: [], needleX: inset, pitchPx: 0, ratio: 0 };
  const value = Math.min(count - 1, Math.max(0, Number(coordinate) || 0));
  if (count === 1) {
    return {
      ticks: [{ stationIndex: 0, channel: 1, xPx: inset + usableWidth / 2, current: true, label: '01' }],
      needleX: inset + usableWidth / 2,
      pitchPx: Math.max(1, Number(minPitchPx) || 14),
      ratio: 0.5,
    };
  }
  const directoryStep = usableWidth / (count - 1);
  const pitchPx = Math.max(
    Math.max(1, Number(minPitchPx) || 14),
    directoryStep * Math.max(1, Number(speedFactor) || 5),
  );
  const needleX = inset + directoryStep * value;
  const overscanPx = pitchPx * Math.max(0, Number(overscan) || 0);
  const first = Math.max(0, Math.ceil(value + (-overscanPx - needleX) / pitchPx));
  const last = Math.min(count - 1, Math.floor(value + (dialWidth + overscanPx - needleX) / pitchPx));
  const currentIndex = Math.min(count - 1, Math.max(0, Math.floor(value + 0.5)));
  const majorEvery = Math.max(1, Math.floor(Number(labelStep) || 6));
  const labelWidth = Math.max(2, String(count).length);
  const ticks = [];
  for (let stationIndex = first; stationIndex <= last; stationIndex += 1) {
    const channel = stationIndex + 1;
    const current = stationIndex === currentIndex;
    const labelled = current || stationIndex === 0 || stationIndex === count - 1 || channel % majorEvery === 0;
    ticks.push({
      stationIndex,
      channel,
      xPx: needleX + pitchPx * (stationIndex - value),
      current,
      label: labelled ? String(channel).padStart(labelWidth, '0') : '',
    });
  }
  return { ticks, needleX, pitchPx, ratio: value / (count - 1) };
}

/** Plan a station-centered camera move that preserves altitude and view angle. */
export function radioStationCameraPlan(station, cameraState = {}) {
  const targetLat = Number(station?.lat);
  const targetLon = Number(station?.lon);
  const height = Math.max(1, Number(cameraState.height) || 1);
  const heading = Number.isFinite(cameraState.heading) ? cameraState.heading : 0;
  const pitch = Number.isFinite(cameraState.pitch) ? cameraState.pitch : -Math.PI / 2;
  const roll = Number.isFinite(cameraState.roll) ? cameraState.roll : 0;
  if (!Number.isFinite(targetLat) || !Number.isFinite(targetLon)) return null;

  const downAngle = Math.min(Math.PI / 2, Math.max(0.08, Math.abs(Math.min(-0.001, pitch))));
  const groundOffsetM = downAngle > Math.PI / 2 - 1e-6
    ? 0
    : Math.min(2_000_000, height / Math.max(0.08, Math.tan(downAngle)));
  const angularDistance = groundOffsetM / 6_378_137;
  const targetLatRad = targetLat * Math.PI / 180;
  const cameraBearing = heading + Math.PI;
  const cameraLatRad = Math.asin(
    Math.sin(targetLatRad) * Math.cos(angularDistance)
      + Math.cos(targetLatRad) * Math.sin(angularDistance) * Math.cos(cameraBearing),
  );
  const cameraLonRad = targetLon * Math.PI / 180 + Math.atan2(
    Math.sin(cameraBearing) * Math.sin(angularDistance) * Math.cos(targetLatRad),
    Math.cos(angularDistance) - Math.sin(targetLatRad) * Math.sin(cameraLatRad),
  );
  const cameraLon = ((cameraLonRad * 180 / Math.PI + 540) % 360) - 180;
  return {
    lat: cameraLatRad * 180 / Math.PI,
    lon: cameraLon,
    height,
    heading,
    pitch,
    roll,
  };
}

/**
 * Decide whether Radio navigation should first restore a centered Earth view.
 * Fit-capable clipped discs and closer views whose optical center has reached
 * the Earth limb use the staged path; ordinary centered local views stay direct.
 */
export function radioGlobeNeedsRecentering(geometry) {
  if (!geometry || isFullGlobeInsideKeyhole(geometry, false)) return false;
  const centeredGeometry = {
    ...geometry,
    earthCenterX: geometry.keyholeCenterX,
    earthCenterY: geometry.keyholeCenterY,
  };
  if (isFullGlobeInsideKeyhole(centeredGeometry, false)) return true;
  const values = [
    geometry.earthCenterX,
    geometry.earthCenterY,
    geometry.earthRadius,
    geometry.keyholeCenterX,
    geometry.keyholeCenterY,
  ];
  if (!values.every(Number.isFinite) || geometry.earthRadius <= 0) return false;
  const centerOffset = Math.hypot(
    geometry.earthCenterX - geometry.keyholeCenterX,
    geometry.earthCenterY - geometry.keyholeCenterY,
  );
  return geometry.earthRadius - centerOffset < GLOBE_ENTER_CLEARANCE_PX;
}

/** Preserve closer zoom while capping an extreme full-globe recovery. */
export function radioGlobeRecenterHeight(currentHeight, fullGlobeCapable) {
  if (!Number.isFinite(currentHeight) || currentHeight < 0) return null;
  return fullGlobeCapable
    ? Math.min(currentHeight, RADIO_GLOBE_RECENTER_MAX_HEIGHT_M)
    : currentHeight;
}

/** Bound one already ordered filtered directory without injecting outside selections. */
export function buildRadioTunerBand(rankedStations, selected, limit = RADIO_TUNER_STATION_LIMIT) {
  const boundedLimit = Math.min(
    RADIO_TUNER_DIRECTORY_LIMIT,
    Math.max(1, Math.floor(Number(limit) || RADIO_TUNER_STATION_LIMIT)),
  );
  return (Array.isArray(rankedStations) ? rankedStations : []).slice(0, boundedLimit);
}

/** Decide whether tuner static should be audible for the current handoff state. */
export function radioTuningStaticShouldPlay({
  tuningActive = false,
  tuningStatic = false,
  awaitingStationId = null,
  voiceDucked = false,
} = {}) {
  return Boolean(tuningStatic && !voiceDucked && (tuningActive || awaitingStationId));
}

export function markerPosition(station, liftM = MARKER_LIFT_M) {
  const floor = cachedGroundFloor(station.lat, station.lon);
  return Cesium.Cartesian3.fromDegrees(
    station.lon,
    station.lat,
    (Number.isFinite(floor) ? floor : 0) + liftM,
  );
}

/** Compare every station field that determines tuner presentation and playback. */
export function radioStationResolutionMatches(frozenStation, currentStation) {
  if (!frozenStation || !currentStation) return false;
  for (const key of [
    'id', 'name', 'lat', 'lon', 'streamUrl', 'homepage', 'state', 'country',
    'countryCode', 'metadataTrust', 'codec', 'bitrate',
  ]) {
    if (frozenStation[key] !== currentStation[key]) return false;
  }
  return ['tags', 'languages'].every((key) => {
    const frozenValues = Array.isArray(frozenStation[key]) ? frozenStation[key] : [];
    const currentValues = Array.isArray(currentStation[key]) ? currentStation[key] : [];
    return frozenValues.length === currentValues.length
      && frozenValues.every((value, index) => value === currentValues[index]);
  });
}
