/**
 * cctvProxyPayloads.mjs — JSON shapes the CCTV proxy returns for /sources and /stream.
 * Node-only; pure functions, no I/O.
 */
import { normalizeFeedType, isVideoFeedType } from './cctvSourceNormalize.mjs';

/** Default `sourceKind` when a source doesn't declare one. */
const defaultSourceKind = (source) => source?.sourceKind || (source?.url ? 'configured' : 'fallback');

/**
 * Public (secret-free) view of one catalog source for GET /sources. Deliberately
 * omits `url`, `snapshotUrl` and `portalSession` — upstream URLs stay server-side.
 *
 * @param {object} source
 */
export function toPublicSource(source) {
  return {
    id: source.id,
    name: source.name,
    city: source.city,
    cityId: source.cityId,
    provider: source.provider,
    lat: source.lat,
    lon: source.lon,
    headingDeg: source.headingDeg,
    headingConfidence: source.headingConfidence || '',
    pitchDeg: source.pitchDeg,
    fovDeg: source.fovDeg,
    rangeM: source.rangeM,
    mountHeightM: source.mountHeightM,
    groundElevationM: source.groundElevationM,
    feedType: normalizeFeedType(source.feedType),
    sourceKind: defaultSourceKind(source),
    poseSource: source.poseSource,
    license: source.license,
  };
}

/**
 * Stream info (feedType + same-origin media/frame URLs) for GET /stream/:id.
 *
 * @param {object|undefined} source
 * @param {string} cameraId
 */
export function buildStreamPayload(source, cameraId) {
  const feedType = normalizeFeedType(source?.feedType || 'image');
  return {
    id: cameraId,
    feedType,
    mediaUrl: isVideoFeedType(feedType)
      ? `/api/cctv/media/${encodeURIComponent(cameraId)}`
      : null,
    frameUrl: `/api/cctv/frame/${encodeURIComponent(cameraId)}`,
    provider: source?.provider || '',
    sourceKind: defaultSourceKind(source),
  };
}
