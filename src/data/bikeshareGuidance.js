/**
 * @module data/bikeshareGuidance
 * @description Why the bikeshare layer draws nothing, as a guidance status.
 *
 * Stations load only below ~48 km and within reach of a registered GBFS
 * system. Outside that the layer used to report "Live" with zero stations and
 * no reason, which read as broken everywhere outside the US. These are
 * guidance states (`zoom-in` / `empty`, see `isGuidanceStatus`): shown on the
 * layer row, never counted as a failure.
 */

/** Rounded altitude the activation gate opens at, for the prompt text. */
export const BIKESHARE_ZOOM_HINT_KM = 48;

/**
 * Great-circle distance in km.
 * @param {number} lat1 @param {number} lon1 @param {number} lat2 @param {number} lon2
 * @returns {number}
 */
function haversineKm(lat1, lon1, lat2, lon2) {
  const toRad = Math.PI / 180;
  const dLat = (lat2 - lat1) * toRad;
  const dLon = (lon2 - lon1) * toRad;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * toRad) * Math.cos(lat2 * toRad) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(a)));
}

/**
 * The registered system nearest to a point.
 * @param {{lat: number, lon: number}|null} center
 * @param {Array<{city: string, centerLat: number, centerLon: number}>} registry
 * @returns {{city: string, km: number}|null}
 */
export function nearestBikeshareCity(center, registry) {
  if (!center || !Number.isFinite(center.lat) || !Number.isFinite(center.lon)) return null;
  let best = null;
  for (const entry of registry || []) {
    const km = haversineKm(center.lat, center.lon, entry.centerLat, entry.centerLon);
    if (!best || km < best.km) best = { city: entry.city, km };
  }
  return best;
}

function nearestText(nearest) {
  if (!nearest) return '';
  const km = Math.round(nearest.km / 10) * 10;
  return ` — terdekat: ${nearest.city}, ±${km.toLocaleString('id-ID')} km`;
}

/**
 * Guidance for an enabled layer that has nothing to draw, or null when it does.
 * @param {{altitudeOk: boolean, center: {lat: number, lon: number}|null,
 *   inRangeCount: number, registry: Array<object>}} input
 * @returns {{status: 'zoom-in'|'empty', message: string}|null}
 */
export function bikeshareGuidance({ altitudeOk, center, inRangeCount, registry }) {
  if (!altitudeOk) {
    return {
      status: 'zoom-in',
      message: `Perbesar peta (di bawah ±${BIKESHARE_ZOOM_HINT_KM} km) untuk memuat stasiun sepeda`,
    };
  }
  if (inRangeCount > 0) return null;
  return {
    status: 'empty',
    message: `Tidak ada sistem sepeda bersama di area ini${nearestText(nearestBikeshareCity(center, registry))}`,
  };
}

/**
 * Layer stats with the guidance prompt applied, when the layer is idle with
 * nothing drawn and no real error. The prompt rides in `error` like every
 * guidance state, so the layer row shows it.
 * @param {{count: number, loading: boolean, error?: string}} stats
 * @param {{status: string, message: string}|null} guidance
 * @returns {object} `stats`, or a copy carrying the guidance.
 */
export function withBikeshareGuidance(stats, guidance) {
  if (!guidance || stats.error || stats.loading || stats.count !== 0) return stats;
  return { ...stats, status: guidance.status, error: guidance.message };
}
