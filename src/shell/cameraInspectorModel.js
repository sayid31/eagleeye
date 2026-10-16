// Pure view-model for the camera inspector: badges, metadata rows and the
// nearest-camera list, derived only from the public CCTV state. Nothing here
// touches the DOM or Cesium, so it runs under node:test.
const EARTH_RADIUS_KM = 6371.0088;
const NEARBY_LIMIT = 5;
const UNKNOWN = 'tidak diketahui';

const FORMAT_LABELS = Object.freeze({
  hls: 'HLS', mp4: 'MP4', webm: 'WebM', flv: 'FLV', mjpeg: 'MJPEG', image: 'Gambar (JPEG)',
});
const COMPASS = ['utara', 'timur laut', 'timur', 'tenggara', 'selatan', 'barat daya', 'barat', 'barat laut'];

/** Great-circle distance in km (spherical; ample for a nearest-camera list). */
export function distanceKm(lat1, lon1, lat2, lon2) {
  const rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad;
  const dLon = (lon2 - lon1) * rad;
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(a)));
}

/** "1,2 km" / "340 m"; em dash when the distance is unknown. */
export function formatDistance(km) {
  if (!Number.isFinite(km)) return '—';
  if (km < 1) return `${Math.round(km * 1000)} m`;
  return `${km.toFixed(1).replace('.', ',')} km`;
}

/** "Timur laut · 45°" for a compass heading; "tidak diketahui" otherwise. */
export function formatDirection(headingDeg) {
  if (!Number.isFinite(headingDeg)) return UNKNOWN;
  const normalized = ((headingDeg % 360) + 360) % 360;
  const name = COMPASS[Math.round(normalized / 45) % 8];
  return `${name[0].toUpperCase()}${name.slice(1)} · ${Math.round(normalized)}°`;
}

/** Display format of the feed ("HLS", "Gambar (JPEG)"); unknown types echo upper-cased. */
export function formatFeed(feedType) {
  const key = String(feedType || 'image').toLowerCase();
  return FORMAT_LABELS[key] || key.toUpperCase();
}

/** Status-dot tone for a camera's health status. */
export function statusTone(sourceStatus) {
  if (sourceStatus === 'ok') return 'ok';
  if (sourceStatus === 'offline' || sourceStatus === 'error') return 'off';
  if (sourceStatus === 'unknown' || !sourceStatus) return 'idle';
  return 'warn';
}

/**
 * Badges for the selected camera. "Lokasi perkiraan" is shown only when the
 * pose is the uncurated catalog prior (calBadge raw-prior); the ±3 km figure
 * is the documented accuracy of that prior, not a measured value.
 */
export function inspectorBadges(camera) {
  if (!camera) return [];
  const badges = [];
  if (camera.sourceStatus === 'offline') badges.push({ key: 'offline', label: 'Offline', tone: 'off' });
  else if (camera.playbackState === 'live' || (camera.sourceStatus === 'ok' && !camera.playbackState)) {
    badges.push({ key: 'live', label: 'Live', tone: 'ok' });
  } else if (camera.sourceStatus && camera.sourceStatus !== 'unknown') {
    badges.push({ key: 'degraded', label: 'Terganggu', tone: 'warn' });
  }
  if (String(camera.sourceKind || '').startsWith('unofficial')) {
    badges.push({ key: 'unofficial', label: 'Sumber tidak resmi', tone: 'warn' });
  }
  if (camera.calBadge === 'raw-prior') {
    badges.push({ key: 'approx', label: 'Lokasi perkiraan ±3 km', tone: 'neutral' });
  }
  return badges;
}

/** Metadata rows. Fields the public state does not carry read "tidak diketahui". */
export function inspectorRows(camera, now = Date.now(), checkedAt = null) {
  if (!camera) return [];
  return [
    { label: 'Operator', value: camera.provider || camera.sourceLabel || UNKNOWN },
    { label: 'Arah kamera', value: formatDirection(camera.headingDeg) },
    { label: 'Format', value: formatFeed(camera.feedType) },
    { label: 'Diperiksa', value: Number.isFinite(checkedAt) ? checkedLabel(checkedAt, now) : UNKNOWN },
  ];
}

function checkedLabel(timestamp, now) {
  const minutes = Math.max(0, Math.floor((now - timestamp) / 60000));
  if (minutes < 1) return 'baru saja';
  if (minutes < 60) return `${minutes} menit lalu`;
  return `${Math.floor(minutes / 60)} jam lalu`;
}

/**
 * Nearest other cameras to the selected one, ascending by distance.
 * @param {object|null} active
 * @param {object[]} cameras
 * @param {number} [limit]
 * @returns {{id: string, name: string, distanceKm: number, distance: string, tone: string}[]}
 */
export function nearbyCameras(active, cameras, limit = NEARBY_LIMIT) {
  if (!active || !Number.isFinite(active.lat) || !Number.isFinite(active.lon)) return [];
  return (cameras || [])
    .filter((cam) => cam.id !== active.id && Number.isFinite(cam.lat) && Number.isFinite(cam.lon))
    .map((cam) => ({
      id: cam.id,
      name: cam.name,
      distanceKm: distanceKm(active.lat, active.lon, cam.lat, cam.lon),
      tone: statusTone(cam.sourceStatus),
    }))
    .sort((a, b) => a.distanceKm - b.distanceKm)
    .slice(0, limit)
    .map((entry) => ({ ...entry, distance: formatDistance(entry.distanceKm) }));
}
