/**
 * cctvSourceNormalize.mjs — pure helpers that turn raw CCTV source rows (file, env, open data)
 * into the canonical catalog shape, plus the geographic prioritisation shared by the live packs.
 * Node-only; no module state.
 */

import { normalizePortalSession } from '../server/portalSession.mjs';

/**
 * FNV-1a 32-bit hash of a string, used to derive deterministic pseudo-random
 * values (e.g. hue for synthetic SVG billboards, fallback heading angles).
 *
 * @param {string} text
 * @returns {number} Unsigned 32-bit hash.
 */
export function hashSeed(text) {
  let h = 2166136261 >>> 0; // FNV offset basis
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619); // FNV prime
  }
  return h >>> 0;
}

/**
 * Canonicalize a CCTV feed type string to one of:
 * 'image', 'mjpeg', 'mp4', 'webm', 'hls', or pass-through.
 *
 * @param {string} value - Raw feed type (e.g. 'jpeg', 'mjpg', 'video', 'stream').
 * @returns {string} Normalized feed type.
 */
export function normalizeFeedType(value) {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return 'image';
  if (raw === 'jpeg' || raw === 'jpg' || raw === 'png') return 'image';
  if (raw === 'mjpg') return 'mjpeg';
  if (raw === 'video') return 'mp4';
  if (raw === 'stream') return 'hls';
  return raw;
}

/**
 * Check whether a normalized feed type represents streaming video.
 *
 * @param {string} feedType
 * @returns {boolean}
 */
export function isVideoFeedType(feedType) {
  return feedType === 'mp4' || feedType === 'webm' || feedType === 'hls';
}

/**
 * Coerce a value to a finite number, returning fallback if NaN/Infinity.
 *
 * @param {*} value
 * @param {number} [fallback=NaN]
 * @returns {number}
 */
export function toFiniteNumber(value, fallback = NaN) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

/**
 * Normalize a column/field name to a lowercase snake_case key.
 *
 * @param {string} text
 * @returns {string}
 */
export function normalizeKey(text) {
  return String(text || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

/**
 * Derive a deterministic fallback heading from a camera ID hash.
 *
 * Produces one of 16 evenly-spaced compass directions (0, 22.5, 45, ...).
 *
 * @param {string} cameraId
 * @returns {number} Heading in degrees [0..360).
 */
export function fallbackHeadingFromId(cameraId) {
  return (hashSeed(String(cameraId)) % 16) * 22.5;
}

/**
 * Haversine great-circle distance between two WGS-84 points.
 *
 * @param {number} lat1 - Latitude of point A (degrees).
 * @param {number} lon1 - Longitude of point A (degrees).
 * @param {number} lat2 - Latitude of point B (degrees).
 * @param {number} lon2 - Longitude of point B (degrees).
 * @returns {number} Distance in kilometers.
 */
function haversineKm(lat1, lon1, lat2, lon2) {
  const toRad = (value) => value * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Distance-prioritizes cameras to a cap: keeps the maxCount cameras closest
 * to ANY of the given anchor points (min distance over anchors), tie-broken
 * by original array order. Used by every live source pack (Austin: one
 * downtown anchor; Caltrans: one anchor per major CA metro; TfL: central
 * London) so a cap always keeps the densest, most interesting cores.
 *
 * @param {Array<object>} cameras - Normalized camera source objects.
 * @param {number} maxCount - Cap (<=0 or >= length disables).
 * @param {Array<{lat:number,lon:number}>} anchors - At least one anchor.
 * @returns {Array<object>} Capped, priority-ordered camera list.
 */
export function prioritizeSources(cameras, maxCount, anchors) {
  const list = Array.isArray(cameras) ? cameras : [];
  const anchorList = (Array.isArray(anchors) ? anchors : []).filter(
    (a) => Number.isFinite(a?.lat) && Number.isFinite(a?.lon)
  );
  if (!Number.isFinite(maxCount) || maxCount <= 0 || list.length <= maxCount || !anchorList.length) {
    return list;
  }

  const scored = list.map((camera, idx) => {
    const lat = Number(camera?.lat);
    const lon = Number(camera?.lon);
    const distKm = Number.isFinite(lat) && Number.isFinite(lon)
      ? Math.min(...anchorList.map((a) => haversineKm(lat, lon, a.lat, a.lon)))
      : Number.POSITIVE_INFINITY;
    return { camera, idx, distKm };
  });

  scored.sort((a, b) => {
    if (a.distKm !== b.distKm) return a.distKm - b.distKm;
    return a.idx - b.idx;
  });

  return scored.slice(0, maxCount).map((entry) => entry.camera);
}

/**
 * Normalize a raw CCTV source item into a canonical shape with safe defaults.
 *
 * @param {object} item - Raw source from file, env, or Austin Open Data.
 * @returns {object} Normalized source with all expected fields populated.
 */
export function normalizeSourceItem(item) {
  return {
    id: String(item.id || '').trim(),
    name: String(item.name || item.id || '').trim(),
    city: String(item.city || ''),
    cityId: String(item.cityId || ''),
    provider: String(item.provider || 'Configured CCTV Source'),
    lat: toFiniteNumber(item.lat),
    lon: toFiniteNumber(item.lon),
    headingDeg: toFiniteNumber(item.headingDeg),
    headingConfidence: String(item.headingConfidence || item.headingSource || '').toLowerCase(),
    pitchDeg: toFiniteNumber(item.pitchDeg),
    fovDeg: toFiniteNumber(item.fovDeg),
    rangeM: toFiniteNumber(item.rangeM),
    mountHeightM: toFiniteNumber(item.mountHeightM),
    groundElevationM: toFiniteNumber(item.groundElevationM),
    feedType: normalizeFeedType(item.feedType || item.type || ''),
    url: typeof item.url === 'string' ? item.url : '',
    // Optional: hosts that 403 streams until the city portal was visited (see portalSession.mjs).
    portalSession: normalizePortalSession(item.portalSession, typeof item.url === 'string' ? item.url : ''),
    snapshotUrl: typeof item.snapshotUrl === 'string' ? item.snapshotUrl : '',
    license: String(item.license || item.licenseNote || ''),
    sourceKind: String(item.sourceKind || item.kind || 'configured'),
    // Optional CAL badge input (cctv-v2 design §3b/§9.2, additive-only per the
    // global constraints — nothing else in this file changes): hand-authored
    // file/env catalog entries may declare poseSource:'curated' so the panel
    // badge can distinguish them from raw automated priors (e.g. Austin Open
    // Data, which never sets this field). Passed through as-is to the client.
    poseSource: item.poseSource === 'curated' ? 'curated' : undefined,
  };
}
