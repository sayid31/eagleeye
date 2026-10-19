// Moved out of rocketLaunches.js (rocketLaunchesNormalize).

import { MISSION_CLOSE_VIEW_RANGE_M, MISSION_GLOBE_VIEW_RANGE_M } from './rocketReplayCamera.js';
import * as Cesium from 'cesium';
import { samplePath, surfaceSafeSegment } from './rocketOrbitMath.js';
import { STAGE_REENTRY_ALTITUDE_M, WINDOW_DAYS } from './rocketLaunchesConstants.js';

export function shortMissionLabel(name, maxLength = 24) {
  const text = String(name || 'Unnamed mission').replace(/\s+/g, ' ').trim().split(' | ')[0];
  const compact = text.split(' — ')[0].trim();
  return compact.length > maxLength ? `${compact.slice(0, maxLength - 1).trimEnd()}…` : compact;
}

/**
 * Reduce generic launch-complex names to their identifying pad or area suffix.
 * @param {string|null} launchSite Launch Library pad name.
 * @returns {string|null} Compact launch-site identifier.
 */
export function compactLaunchSiteName(launchSite) {
  const text = String(launchSite || '').replace(/\s+/g, ' ').trim();
  if (!text || /^(unknown|unavailable|n\/a)$/i.test(text)) return null;
  const genericPrefix = /^(?:orbital\s+launch\s+pad|space\s+launch\s+complex|launch\s+(?:area|complex|pad|site))\s*[-·:]?\s*/i;
  const compact = text.replace(genericPrefix, '').trim();
  return compact || null;
}

/**
 * Score the amount of useful mission context available for roster triage.
 * @param {object} launch Normalized launch record.
 * @returns {number} Completeness score.
 */
export function missionDataCompleteness(launch = {}) {
  let score = 0;
  const present = (value) => value !== null && value !== undefined && value !== '';
  score += present(launch.provider) ? 1 : 0;
  score += present(launch.mission) ? 2 : 0;
  score += present(launch.missionName) ? 1 : 0;
  score += present(launch.orbit?.name || launch.orbit) ? 2 : 0;
  score += Array.isArray(launch.payloads) ? Math.min(launch.payloads.length, 5) * 2 : 0;
  score += Array.isArray(launch.recoveryStages) ? Math.min(launch.recoveryStages.length, 4) * 2 : 0;
  score += Array.isArray(launch.trajectory) ? Math.min(launch.trajectory.length, 12) : 0;
  score += Array.isArray(launch.timeline) ? Math.min(launch.timeline.length, 6) : 0;
  return score;
}

/**
 * Build a data-rich roster while preserving the source-array index
 * used by mission selection and Previous/Next navigation.
 * @param {Array<object>} launches Normalized launch records.
 * @returns {Array<{launch: object, index: number}>}
 */
export function missionRosterEntries(launches) {
  return (launches || [])
    .map((launch, index) => ({ launch, index }))
    .sort((a, b) => {
      const completeness = missionDataCompleteness(b.launch) - missionDataCompleteness(a.launch);
      if (completeness !== 0) return completeness;
      const aTime = Date.parse(a.launch?.launchTime);
      const bTime = Date.parse(b.launch?.launchTime);
      if (Number.isFinite(aTime) && Number.isFinite(bTime) && aTime !== bTime) return bTime - aTime;
      return b.index - a.index;
    });
}

/**
 * Preserve the user's globe scale for roster previews while avoiding an
 * accidental surface-level fly-to when the list is opened from a close view.
 * @param {number} cameraHeight Current camera height above the ellipsoid.
 * @returns {number} Preview range in metres.
 */
export function missionHoverPreviewRange(cameraHeight) {
  const height = Number(cameraHeight);
  return Math.max(
    MISSION_CLOSE_VIEW_RANGE_M,
    Number.isFinite(height) ? height : MISSION_GLOBE_VIEW_RANGE_M,
  );
}

/**
 * Format a mission epoch for compact on-globe replay labels.
 * @param {string|Date|null} launchTime ISO-8601 mission time or Date.
 * @returns {string} UTC timestamp or a clear unavailable state.
 */
export function formatMissionEventTime(launchTime) {
  const date = new Date(launchTime);
  if (!launchTime || !Number.isFinite(date.getTime())) return 'TIDAK TERSEDIA';
  return `${date.toISOString().slice(0, 10)}\n${date.toISOString().slice(11, 19)} UTC`;
}

/**
 * Parse the ISO-8601 durations supplied by Launch Library timeline events.
 * @param {string|null} value ISO duration such as PT8M40S or -PT35M.
 * @returns {number|null} Signed duration in seconds.
 */
export function parseMissionDurationSeconds(value) {
  const match = String(value || '').trim().match(
    /^(-)?P(?:(\d+(?:\.\d+)?)D)?(?:T(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)S)?)?$/,
  );
  if (!match) return null;
  const seconds = (Number(match[2] || 0) * 86400)
    + (Number(match[3] || 0) * 3600)
    + (Number(match[4] || 0) * 60)
    + Number(match[5] || 0);
  return match[1] ? -seconds : seconds;
}

function finiteCoordinate(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function normalizePayloadFlights(launch) {
  const flights = launch.rocket?.payloads || launch.payloads || launch.mission?.payloads || [];
  if (!Array.isArray(flights)) return [];
  return flights.map((flight, index) => {
    const payload = flight.payload || flight;
    return {
      id: String(flight.id || payload.id || `payload-${index}`),
      name: payload.name || flight.name || 'Undisclosed payload',
      type: payload.type?.name || flight.type?.name || null,
      manufacturer: payload.manufacturer?.name || null,
      operator: payload.operator?.name || null,
      destination: flight.destination || payload.destination || null,
      amount: Number.isFinite(Number(flight.amount)) ? Number(flight.amount) : 1,
      massKg: Number.isFinite(Number(payload.mass)) ? Number(payload.mass) : null,
    };
  });
}

function normalizeLanding(stage, fallbackName, category, index) {
  const landing = stage?.landing;
  const location = landing?.landing_location || {};
  const launcher = stage?.launcher || stage?.spacecraft || {};
  const serial = launcher.serial_number || stage?.serial_number || null;
  const stageType = stage?.type?.name || stage?.type || category;
  const attempted = landing?.attempt === true;
  const success = landing?.success;
  const recoveryType = landing?.type?.name || null;
  const launcherStatus = launcher.status?.name || null;
  const status = success === true ? 'DIPULIHKAN'
    : success === false ? 'HILANG'
      : attempted ? 'UPAYA PEMULIHAN'
        : recoveryType ? recoveryType.toUpperCase()
          : launcherStatus ? launcherStatus.toUpperCase()
            : 'TIDAK ADA DATA PEMULIHAN';
  return {
    id: String(stage?.id || landing?.id || `${category}-${index}`),
    category,
    name: [stageType, serial].filter(Boolean).join(' · ') || fallbackName,
    serial,
    reused: stage?.reused === true,
    flightNumber: finiteCoordinate(stage?.launcher_flight_number),
    status,
    attempted,
    success: success === true ? true : success === false ? false : null,
    recoveryType,
    destination: location.name || landing?.destination || landing?.type?.name || null,
    description: landing?.description || null,
    downrangeKm: finiteCoordinate(landing?.downrange_distance),
    lat: finiteCoordinate(location.latitude ?? landing?.latitude),
    lon: finiteCoordinate(location.longitude ?? landing?.longitude),
  };
}

function normalizeRecoveryStages(launch, payloads) {
  const rocket = launch.rocket || {};
  const launcherStages = Array.isArray(rocket.launcher_stage) ? rocket.launcher_stage : [];
  const spacecraftStages = Array.isArray(rocket.spacecraft_stage) ? rocket.spacecraft_stage : [];
  const stages = [
    ...launcherStages.map((stage, index) => normalizeLanding(stage, `Tahap peluncur ${index + 1}`, 'LAUNCHER', index)),
    ...spacecraftStages.map((stage, index) => normalizeLanding(stage, `Tahap pesawat antariksa ${index + 1}`, 'SPACECRAFT', index)),
  ];
  const payloadFlights = rocket.payloads || launch.payloads || [];
  if (Array.isArray(payloadFlights)) {
    payloadFlights.forEach((flight, index) => {
      if (!flight?.landing) return;
      stages.push(normalizeLanding(
        { ...flight, type: payloads[index]?.type || 'Payload', serial_number: payloads[index]?.name },
        payloads[index]?.name || `Muatan ${index + 1}`,
        'PAYLOAD',
        index,
      ));
    });
  }
  return stages;
}

export function landingEndpoint(stage, launch, insertionPosition) {
  if (Number.isFinite(stage.lat) && Number.isFinite(stage.lon)) {
    return { lat: stage.lat, lon: stage.lon, accuracy: 'TERKONFIRMASI' };
  }
  const recoveryIdentity = `${stage.recoveryType || ''} ${stage.destination || ''}`.toLowerCase();
  if (/return to launch site|rtls|launch site|landing zone/.test(recoveryIdentity)) {
    return { lat: launch.lat, lon: launch.lon, accuracy: 'PAD / RTLS' };
  }
  if (!(stage.downrangeKm > 0) || !insertionPosition) return null;
  const ellipsoid = Cesium.Ellipsoid.WGS84;
  const start = Cesium.Cartographic.fromDegrees(launch.lon, launch.lat);
  const insertion = ellipsoid.cartesianToCartographic(insertionPosition);
  if (!insertion) return null;
  const geodesic = new Cesium.EllipsoidGeodesic(start, insertion, ellipsoid);
  const bearing = geodesic.startHeading;
  const angularDistance = (stage.downrangeKm * 1000) / ellipsoid.maximumRadius;
  const lat1 = start.latitude;
  const lon1 = start.longitude;
  const lat = Math.asin(
    Math.sin(lat1) * Math.cos(angularDistance)
      + Math.cos(lat1) * Math.sin(angularDistance) * Math.cos(bearing),
  );
  const lon = lon1 + Math.atan2(
    Math.sin(bearing) * Math.sin(angularDistance) * Math.cos(lat1),
    Math.cos(angularDistance) - Math.sin(lat1) * Math.sin(lat),
  );
  return {
    lat: Cesium.Math.toDegrees(lat),
    lon: Cesium.Math.toDegrees(Cesium.Math.negativePiToPi(lon)),
    accuracy: 'EST. DOWNRANGE',
  };
}

export function stageReentryRecoveryPath(ascentPath, endpoint, stageIndex, stageCount) {
  if (!ascentPath?.length || !endpoint) return [];
  const progress = Cesium.Math.clamp(0.28 + (stageIndex / Math.max(stageCount, 1)) * 0.34, 0.28, 0.68);
  const separation = samplePath(ascentPath, progress);
  const destination = Cesium.Cartesian3.fromDegrees(endpoint.lon, endpoint.lat, 12);
  return surfaceSafeSegment(separation, destination);
}

export function atmosphericReentryIndex(path) {
  if (!path?.length) return 0;
  const ellipsoid = Cesium.Ellipsoid.WGS84;
  for (let index = 1; index < path.length; index++) {
    const previousHeight = ellipsoid.cartesianToCartographic(path[index - 1])?.height;
    const height = ellipsoid.cartesianToCartographic(path[index])?.height;
    if (
      Number.isFinite(previousHeight)
      && Number.isFinite(height)
      && previousHeight > STAGE_REENTRY_ALTITUDE_M
      && height <= STAGE_REENTRY_ALTITUDE_M
    ) {
      return index;
    }
  }
  return Math.min(Math.max(Math.round(path.length * 0.55), 0), path.length - 1);
}

export function missionTableRows(items, columns, emptyText) {
  if (!items.length) return `<tr><td colspan="${columns}" class="mission-table-empty">${emptyText}</td></tr>`;
  return items.map((item) => item).join('');
}

export function escapeMissionText(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[character]);
}

/**
 * Normalize a Launch Library 2 response into records suitable for the layer.
 * Trajectory points are retained only when the upstream explicitly supplies
 * them; orbital tracks must not be reconstructed from launch metadata.
 * @param {object} payload Launch Library 2-compatible response.
 * @param {Date} [now] Reference time used for the rolling window.
 * @returns {Array<object>}
 */
export function normalizeRocketLaunches(payload, now = new Date()) {
  const launches = Array.isArray(payload) ? payload : payload?.results;
  if (!Array.isArray(launches)) return [];
  const cutoff = now.getTime() - WINDOW_DAYS * 86400000;
  return launches.map((launch) => {
    const launchTime = launch.net || launch.window_start || launch.pad?.location?.name;
    const date = Date.parse(launchTime);
    const pad = launch.pad || {};
    const location = pad.location || {};
    const coordinates = location.coordinates || '';
    const [coordinateLon, coordinateLat] = String(coordinates).split(',').map(Number);
    const lat = Number.isFinite(Number(pad.latitude)) ? Number(pad.latitude) : coordinateLat;
    const lon = Number.isFinite(Number(pad.longitude)) ? Number(pad.longitude) : coordinateLon;
    const payloads = normalizePayloadFlights(launch);
    return {
      id: String(launch.id || launch.slug || launch.name || `launch-${date}`),
      name: launch.name || 'Peluncuran tanpa nama',
      status: launch.status?.name || 'Tidak diketahui',
      launchTime: Number.isFinite(date) ? new Date(date).toISOString() : null,
      launchSite: pad.name || location.name || 'Lokasi peluncuran tidak diketahui',
      lat: Number.isFinite(lat) ? lat : null,
      lon: Number.isFinite(lon) ? lon : null,
      provider: launch.launch_service_provider?.name || null,
      mission: launch.mission?.description || null,
      missionName: launch.mission?.name || null,
      satelliteQuery: launch.mission?.name || launch.name || null,
      payloads,
      recoveryStages: normalizeRecoveryStages(launch, payloads),
      trajectory: Array.isArray(launch.trajectory) ? launch.trajectory : [],
      timeline: Array.isArray(launch.timeline)
        ? launch.timeline.map((event) => ({
          name: event.type?.abbrev || event.type?.name || event.name || 'Mission event',
          relativeTime: event.relative_time || event.relativeTime || null,
          offsetSeconds: parseMissionDurationSeconds(event.relative_time || event.relativeTime),
        }))
        : [],
      orbit: launch.mission?.orbit || launch.orbit || null,
      source: 'Launch Library 2',
      inWindow: Number.isFinite(date) && date >= cutoff && date <= now.getTime(),
    };
  }).filter((launch) => launch.inWindow && launch.lat !== null && launch.lon !== null);
}
