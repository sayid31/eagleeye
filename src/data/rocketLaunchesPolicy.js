// Moved out of rocketLaunches.js (rocketLaunchesPolicy).

import { MAX_POST_TLE_RETRIES, SATELLITE_STANDALONE_DEFAULTS } from './rocketLaunchesConstants.js';

/**
 * Derive the temporary Satellite display mode required by Space Missions.
 * @param {object|null} currentParams Complete pre-mission Satellite parameters.
 * @returns {object} Temporary mission-specific Satellite parameters.
 */
export function satelliteParamsForSpaceMissions(currentParams) {
  return {
    ...SATELLITE_STANDALONE_DEFAULTS,
    ...(currentParams || {}),
    catalog: 'dense',
    showPoints: false,
    showOrbits: false,
  };
}

/**
 * Resolve the complete Satellite parameter set restored after mission mode.
 * @param {object|null} snapshot Complete pre-mission Satellite parameters.
 * @returns {object} Standalone Satellite parameters.
 */
export function satelliteParamsAfterSpaceMissions(snapshot) {
  return {
    ...SATELLITE_STANDALONE_DEFAULTS,
    ...(snapshot || {}),
  };
}

/**
 * Failed launch records may retain a planned orbit in Launch Library, but
 * must not be represented as a live or estimated payload in orbit.
 * @param {string|null} status Normalized Launch Library status name.
 * @returns {boolean} Whether orbital visualization is allowed.
 */
export function launchStatusAllowsOrbit(status) {
  return !/\b(?:fail(?:ed|ure)?|partial failure)\b/i.test(String(status || ''));
}

/**
 * Describe only the mission paths that the selected record can actually show.
 * Launch Library may retain a target orbit after a failure, but that target is
 * not evidence of orbital insertion and cannot support a reconstructed replay.
 * @param {object|null} launch Normalized launch record.
 * @param {boolean} replayAvailable Whether a rendered ascent/orbit track exists.
 * @returns {{orbit: string|null, ascent: string, replayAvailable: boolean}}
 */
export function missionPathPresentation(launch, replayAvailable = false) {
  const orbitName = launch?.orbit?.name || (typeof launch?.orbit === 'string' ? launch.orbit : null);
  const orbitAllowed = launchStatusAllowsOrbit(launch?.status);
  const suppliedTrajectoryPoints = Array.isArray(launch?.trajectory)
    ? launch.trajectory.filter((point) => (
      Number.isFinite(Number(point?.latitude))
      && Number.isFinite(Number(point?.longitude))
    )).length
    : 0;
  return {
    orbit: orbitName ? `${orbitAllowed ? '' : 'PLANNED · '}${orbitName}` : null,
    ascent: suppliedTrajectoryPoints > 1
      ? 'TITIK LINTASAN DARI SUMBER'
      : replayAvailable ? 'ESTIMASI REKONSTRUKSI' : 'TIDAK TERSEDIA',
    replayAvailable: Boolean(replayAvailable),
  };
}

/**
 * Decide whether one bounded rebuild is needed after the active TLE lookup.
 * @param {object} input Retry state.
 * @param {boolean} input.enabled Whether Space Missions is active.
 * @param {number} input.retryCount Number of post-TLE retries already used.
 * @param {string|null} input.activeTleText Resolved active TLE catalog.
 * @param {string|null} input.renderedTleText TLE catalog used for the last build.
 * @returns {boolean} Whether to schedule a refresh.
 */
export function shouldRetryAfterActiveTle({
  enabled,
  retryCount,
  activeTleText,
  renderedTleText,
}) {
  return Boolean(
    enabled
    && activeTleText
    && activeTleText !== renderedTleText
    && retryCount < MAX_POST_TLE_RETRIES,
  );
}

/**
 * Release aircraft follow state through each owning flight layer before a
 * mission replay takes over the camera.
 * @param {object|null} dataManager DataLayerManager instance.
 * @returns {number} Number of owner APIs invoked.
 */
export function releaseAircraftTracking(dataManager) {
  let released = 0;
  for (const layerId of ['flights', 'military']) {
    const module = dataManager?.layers?.get(layerId)?.module;
    if (typeof module?.stopTracking !== 'function') continue;
    module.stopTracking();
    released++;
  }
  return released;
}
