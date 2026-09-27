import * as Cesium from 'cesium';
import {
  findSatelliteOrbitTrackInTle,
  getSatelliteOrbitTrack,
  orbitFrameModelMatrix,
} from './satellites.js';
import { getKeyholeGeometry } from '../celestialRing.js';
import {
  clearOverlaySource,
  setOverlayEntries,
  setOverlaySourceVisible,
} from '../overlays/worldOverlay.js';
import { holdContinuousRender, releaseContinuousRender } from '../renderGovernor.js';
import {
  approximateOrbitPath,
  buildMissionPaths,
  estimatedOrbitPeriodSeconds,
  normalizeReplaySpeed,
  orbitInsertionOffsetSeconds,
  orbitProgressAtTime,
  reconstructedAscentPath,
  replayAscentDurationSeconds,
  replayStartAfterPause,
  replayState,
  samplePath,
  surfaceSafePath,
  surfaceSafeSegment,
} from './rocketOrbitMath.js';
import {
  cameraHeadingForPath,
  missionZoomPitch,
  MISSION_CLOSE_VIEW_RANGE_M,
  MISSION_GLOBE_VIEW_RANGE_M,
  replayCameraView,
  replayChaseCameraHeading,
  replayInitialCameraHeading,
  replayOrbitCameraPose,
  replayOrbitCameraTarget,
  replayOrbitFrameSphere,
  replayOrbitGlobeAnchor,
  replayOrbitGlobeRange,
  REPLAY_ORBIT_PULLBACK_FRACTION,
  smoothReplayCameraHeading,
} from './rocketReplayCamera.js';
import { LAYER_METADATA } from './layerMetadata.js';

export {
  approximateOrbitPath,
  buildMissionPaths,
  normalizeReplaySpeed,
  orbitProgressAtTime,
  reconstructedAscentPath,
  replayAscentDurationSeconds,
  replayStartAfterPause,
  replayState,
  samplePath,
} from './rocketOrbitMath.js';
export {
  cameraHeadingForPath,
  missionZoomPitch,
  replayCameraView,
  replayChaseCameraHeading,
  replayInitialCameraHeading,
  replayOrbitCameraPose,
  replayOrbitCameraTarget,
  replayOrbitFrameSphere,
  replayOrbitGlobeAnchor,
  replayOrbitGlobeRange,
  smoothReplayCameraHeading,
} from './rocketReplayCamera.js';

const WINDOW_DAYS = 30;
const API_URL = '/api/launches';

export const ROCKET_MISSION_AMBIENT_OVERLAY_SOURCE_ID = 'rocket-missions';
export const ROCKET_MISSION_SELECTED_OVERLAY_SOURCE_ID = 'rocket-mission-selected';
export const ROCKET_MISSION_AMBIENT_OVERLAY_COHORT_LIMIT = 48;
export const ROCKET_MISSION_AMBIENT_OVERLAY_COLLISION_CAPACITY = 24;
export const ROCKET_MISSION_SELECTED_OVERLAY_SOURCE_OPTIONS = Object.freeze({
  cohortLimit: 12,
  collisionCapacity: 0,
  moving: true,
  solveIntervalMs: 0,
});

const ROCKET_MISSION_AMBIENT_OVERLAY_SOURCE_OPTIONS = Object.freeze({
  cohortLimit: ROCKET_MISSION_AMBIENT_OVERLAY_COHORT_LIMIT,
  collisionCapacity: ROCKET_MISSION_AMBIENT_OVERLAY_COLLISION_CAPACITY,
  moving: false,
});
const DEFAULT_OVERLAY_HOST = Object.freeze({
  setEntries: setOverlayEntries,
  setVisible: setOverlaySourceVisible,
  clearSource: clearOverlaySource,
});

let _dataSource = null;
let _count = 0;
let _lastUpdate = null;
let _lastError = null;
let _orbitMatches = 0;
let _clickHandler = null;
let _moveHandler = null;
let _viewer = null;
let _declutterHandler = null;
let _dataManager = null;
let _retryTimer = null;
let _postTleRetryCount = 0;
let _updatePromise = null;
let _updatePromiseToken = 0;
let _updateDirty = false;
let _lifecycleToken = 0;
let _enabled = false;
let _selectedLaunchId = null;
let _explicitSelection = false;
let _launches = [];
let _missionPanel = null;
let _missionRoster = null;
let _missionRosterHoverTimer = null;
let _hoveredRosterLaunchId = null;
let _missionHoverReticleImage = null;
let _replayVehicleOverlay = null;
let _replayVehicleOverlayText = '';
const _animationStarts = new Map();
const _satelliteTelemetry = new Map();
let _lastPanelTelemetryMs = 0;
let _lastMissionRingRotationMs = 0;
let _activeTleText = null;
let _activeTlePromise = null;
let _activeTlePromiseToken = 0;
let _renderedTleText = null;
let _focusAfterActiveLookup = false;
let _satelliteStateBeforeMission = null;
let _satelliteActivationPromise = null;
let _replayCameraRemover = null;
let _replayCameraLaunchId = null;
let _replayCameraToken = 0;
let _replayPaused = false;
let _replayPausedAtMs = null;
let _replaySpeed = 1;
const _replayTracks = new Map();
const _missionOverlayRecords = new Map();
let _missionOverlayHost = DEFAULT_OVERLAY_HOST;
let _selectedMissionOverlayTimeText = null;
let _missionZoomAnchorRemover = null;
let _missionZoomAnchorId = null;
let _launchPadZonePrimitive = null;
let _launchPadZoneRemover = null;
let _launchPadZoneLaunchId = null;
const _missionOrbitPrimitives = new Map();

const REPLAY_ORBIT_DURATION_SEC = 28;
const REPLAY_COUNTDOWN_DURATION_SEC = 10;
const REPLAY_TILE_SETTLE_DELAY_SEC = 5;
const REPLAY_INITIAL_RANGE_M = 3500;
const MAX_POST_TLE_RETRIES = 1;
const POST_TLE_RETRY_DELAY_MS = 1500;
const _declutterTime = new Cesium.JulianDate();
const _declutterOccluder = new Cesium.EllipsoidalOccluder(
  Cesium.Ellipsoid.WGS84,
  new Cesium.Cartesian3(),
);
const _missionRingDate = new Date(0);
const STAGE_REENTRY_ALTITUDE_M = 100000;
const MISSION_FOCUS_RANGE_M = 12000;
const SATELLITE_STANDALONE_DEFAULTS = {
  catalog: 'core',
  showPoints: true,
  showOrbits: true,
};

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
      ? 'SUPPLIED TRAJECTORY POINTS'
      : replayAvailable ? 'RECONSTRUCTED ESTIMATE' : 'UNAVAILABLE',
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
const MISSION_ORBIT_PATTERN_GROUPS = 4;
const MISSION_ORBIT_DASHES_PER_GROUP = 100;
export const LAUNCH_PAD_ZONE_RADIUS_M = 500;
const LAUNCH_PAD_ZONE_MAX_CAMERA_HEIGHT_M = 120000;
const LAUNCH_PAD_ZONE_MAX_CAMERA_DISTANCE_M = 180000;

const TRAJECTORY_STAGE_COLORS = [
  '#ff9f43', '#ff66c4', '#a78bfa', '#7bed9f', '#ffd166', '#60a5fa',
];

let _missionOrbitPatternRegistered = false;
const _pathDistanceCache = new WeakMap();

/**
 * Register the selected-orbit tactical material once. Each group begins with
 * one compact round dot followed by one hundred short dashes.
 */
function ensureMissionOrbitPatternRegistered() {
  if (_missionOrbitPatternRegistered) return;
  new Cesium.Material({
    fabric: {
      type: 'GevMissionOrbitTactical',
      uniforms: {
        color: Cesium.Color.CYAN,
        groupCount: MISSION_ORBIT_PATTERN_GROUPS,
        dashCount: MISSION_ORBIT_DASHES_PER_GROUP,
      },
      source: `
        czm_material czm_getMaterial(czm_materialInput materialInput) {
          czm_material material = czm_getDefaultMaterial(materialInput);
          float groupPosition = fract(materialInput.st.s * groupCount);
          float markPosition = groupPosition * (dashCount + 1.0);
          float markIndex = floor(markPosition);
          float localPosition = fract(markPosition);
          float centerDistance = abs(localPosition - 0.5);
          float edge = max(fwidth(localPosition) * 1.35, 0.012);
          float dashAlong = 1.0 - smoothstep(0.27 - edge, 0.27 + edge, centerDistance);
          float dashAcross = 1.0 - smoothstep(0.12, 0.24, abs(materialInput.st.t - 0.5));
          float dash = dashAlong * dashAcross;
          float dotAlong = (localPosition - 0.5) / 0.32;
          float dotAcross = (materialInput.st.t - 0.5) / 0.5;
          float dot = 1.0 - smoothstep(0.78, 1.0, length(vec2(dotAlong, dotAcross)));
          float isDot = 1.0 - step(0.5, markIndex);
          float visible = mix(dash, dot, isDot);
          material.diffuse = color.rgb;
          material.emission = color.rgb * mix(0.07, 0.65, isDot);
          material.alpha = color.a * visible * mix(0.58, 1.0, isDot);
          return material;
        }`,
    },
  });
  _missionOrbitPatternRegistered = true;
}

function createMissionOrbitPatternMaterial(color) {
  ensureMissionOrbitPatternRegistered();
  return Cesium.Material.fromType('GevMissionOrbitTactical', {
    color,
    groupCount: MISSION_ORBIT_PATTERN_GROUPS,
    dashCount: MISSION_ORBIT_DASHES_PER_GROUP,
  });
}

function missionOrbitPrimitiveVisible(launchId) {
  return Boolean(
    _enabled
    && _dataSource?.show
    && (!_selectedLaunchId || _selectedLaunchId === launchId),
  );
}

function syncMissionOrbitPrimitiveVisibility() {
  for (const [launchId, path] of _missionOrbitPrimitives) {
    if (path.primitive) path.primitive.show = missionOrbitPrimitiveVisible(launchId);
  }
}

function removeMissionOrbitPrimitives() {
  for (const path of _missionOrbitPrimitives.values()) {
    if (path.primitive && _viewer?.scene?.primitives) {
      _viewer.scene.primitives.remove(path.primitive);
    }
  }
  _missionOrbitPrimitives.clear();
}

function updateMissionOrbitPrimitiveFrames(nowDate) {
  for (const [launchId, path] of _missionOrbitPrimitives) {
    if (!path.primitive || !missionOrbitPrimitiveVisible(launchId)) continue;
    orbitFrameModelMatrix(path.gmstAtBake, nowDate, path.primitive.modelMatrix);
    if (path.labelBakePosition && path.labelPosition) {
      Cesium.Matrix4.multiplyByPoint(
        path.primitive.modelMatrix,
        path.labelBakePosition,
        path.labelPosition,
      );
    }
  }
}

function addMissionOrbitPrimitive(launch, orbitPath, satelliteTrack) {
  if (!_viewer || !satelliteTrack || !Number.isFinite(satelliteTrack.gmstAtBake)) return false;
  const collection = new Cesium.PolylineCollection();
  collection.add({
    positions: orbitPath,
    width: 3,
    material: createMissionOrbitPatternMaterial(
      Cesium.Color.fromCssColorString('#22e6e6').withAlpha(0.95),
    ),
  });
  collection.show = missionOrbitPrimitiveVisible(launch.id);
  orbitFrameModelMatrix(satelliteTrack.gmstAtBake, new Date(), collection.modelMatrix);
  _viewer.scene.primitives.add(collection);
  _missionOrbitPrimitives.set(launch.id, {
    primitive: collection,
    gmstAtBake: satelliteTrack.gmstAtBake,
  });
  return true;
}

function MissionOrbitPatternMaterialProperty(color) {
  ensureMissionOrbitPatternRegistered();
  this._color = color;
  this._definitionChanged = new Cesium.Event();
}

Object.defineProperties(MissionOrbitPatternMaterialProperty.prototype, {
  isConstant: { get() { return true; } },
  definitionChanged: { get() { return this._definitionChanged; } },
});

MissionOrbitPatternMaterialProperty.prototype.getType = function getType() {
  return 'GevMissionOrbitTactical';
};

MissionOrbitPatternMaterialProperty.prototype.getValue = function getValue(time, result) {
  if (!Cesium.defined(result)) result = {};
  result.color = this._color;
  result.groupCount = MISSION_ORBIT_PATTERN_GROUPS;
  result.dashCount = MISSION_ORBIT_DASHES_PER_GROUP;
  return result;
};

MissionOrbitPatternMaterialProperty.prototype.equals = function equals(other) {
  return this === other;
};

/**
 * Decide whether the selected launch-pad zone belongs in the current view.
 * Both altitude and direct camera range are bounded so an oblique close-up can
 * show the effect without leaking it into regional or globe views.
 * @param {object} input Visibility inputs.
 * @param {boolean} input.layerActive Whether Space Missions is active.
 * @param {string|null} input.selectedLaunchId Selected mission identifier.
 * @param {string} input.launchId Candidate mission identifier.
 * @param {number} input.cameraHeightM Camera height above the ellipsoid.
 * @param {number} input.cameraDistanceM Direct camera range to the launch pad.
 * @returns {boolean}
 */
export function launchPadZoneVisible({
  layerActive,
  selectedLaunchId,
  launchId,
  cameraHeightM,
  cameraDistanceM,
}) {
  return Boolean(
    layerActive
    && selectedLaunchId
    && selectedLaunchId === launchId
    && Number.isFinite(cameraHeightM)
    && cameraHeightM <= LAUNCH_PAD_ZONE_MAX_CAMERA_HEIGHT_M
    && Number.isFinite(cameraDistanceM)
    && cameraDistanceM <= LAUNCH_PAD_ZONE_MAX_CAMERA_DISTANCE_M,
  );
}

/**
 * Resolve whether a surface mission anchor is safely on the camera-facing
 * side of Earth. The small positive limb margin prevents labels anchored just
 * beyond the horizon from leaking through the hidden Cesium globe.
 * @param {Cesium.Cartesian3} cameraPosition Camera world position.
 * @param {Cesium.Cartesian3} markerPosition Mission anchor world position.
 * @param {number} [limbMargin] Additional normalized horizon clearance.
 * @returns {boolean} Whether the marker belongs on the visible hemisphere.
 */
export function missionAnchorHorizonVisible(cameraPosition, markerPosition, limbMargin = 0.012) {
  if (!cameraPosition || !markerPosition) return false;
  const cameraMagnitude = Cesium.Cartesian3.magnitude(cameraPosition);
  if (!Number.isFinite(cameraMagnitude) || cameraMagnitude <= Cesium.Ellipsoid.WGS84.maximumRadius) {
    return false;
  }
  const cameraDirection = Cesium.Cartesian3.normalize(
    cameraPosition,
    new Cesium.Cartesian3(),
  );
  const markerDirection = Cesium.Cartesian3.normalize(
    markerPosition,
    new Cesium.Cartesian3(),
  );
  const limbThreshold = Cesium.Ellipsoid.WGS84.maximumRadius / cameraMagnitude;
  return Cesium.Cartesian3.dot(cameraDirection, markerDirection)
    > limbThreshold + limbMargin;
}

/**
 * Resolve launch-anchor visibility for overview and selected-mission views.
 * @param {Cesium.Cartesian3} cameraPosition Camera world position.
 * @param {Cesium.Cartesian3} markerPosition Mission anchor world position.
 * @param {string} markerId Mission represented by this anchor.
 * @param {string|null} selectedLaunchId Explicitly selected mission.
 * @returns {boolean} Whether the launch anchor should render.
 */
export function missionAnchorVisible(
  cameraPosition,
  markerPosition,
  markerId,
  selectedLaunchId = null,
) {
  if (selectedLaunchId && markerId !== selectedLaunchId) return false;
  return missionAnchorHorizonVisible(cameraPosition, markerPosition);
}

function focusFullGlobe(viewer, duration = 2.4) {
  const canvas = viewer?.scene?.canvas;
  const height = canvas?.clientHeight || canvas?.height;
  const width = canvas?.clientWidth || canvas?.width;
  const cartographic = viewer?.camera?.positionCartographic;
  const fovy = viewer?.camera?.frustum?.fovy;
  if (!(width > 0) || !(height > 0) || !cartographic || !Number.isFinite(fovy) || fovy <= 0 || fovy >= Math.PI) return;
  const earthRadius = Cesium.Ellipsoid.WGS84.maximumRadius;
  const keyholeRadius = getKeyholeGeometry(width, height).radius;
  const targetScreenRadius = keyholeRadius * 0.61;
  const angularRadius = Math.atan((targetScreenRadius / (height * 0.5)) * Math.tan(fovy * 0.5));
  const distance = earthRadius / Math.max(Math.sin(angularRadius), 1e-4);
  const altitude = Math.max(earthRadius * 1.55, distance - earthRadius);
  viewer.camera.flyTo({
    destination: Cesium.Cartesian3.fromRadians(cartographic.longitude, cartographic.latitude, altitude),
    orientation: { heading: viewer.camera.heading, pitch: -Cesium.Math.PI_OVER_TWO, roll: 0 },
    duration,
    easingFunction: Cesium.EasingFunction.CUBIC_IN_OUT,
  });
}

function shortMissionLabel(name, maxLength = 24) {
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
 * Build the source-owned launch-site marker presentation. Overview markers
 * compete in the bounded ambient-label domain; the selected mission moves to
 * the protected selected lane and gains the former launch-site detail line.
 * @param {object} launch Normalized Launch Library mission.
 * @param {Cesium.Cartesian3|function():Cesium.Cartesian3} position Existing display position.
 * @param {boolean} [selected=false] Whether the mission owns the selected view.
 * @returns {object}
 */
export function createRocketMissionMarkerOverlayEntry(launch, position, selected = false) {
  const mission = shortMissionLabel(launch?.name, 26).toUpperCase();
  const siteName = compactLaunchSiteName(launch?.launchSite);
  const launchTimeMs = Date.parse(launch?.launchTime);
  const details = selected
    ? [siteName
      ? `LAUNCH SITE · ${shortMissionLabel(siteName, 20).toUpperCase()}`
      : 'LAUNCH SITE']
    : [];
  return {
    id: `launch:${launch?.id}`,
    position,
    variant: 'label',
    title: mission,
    details,
    accent: '#22e6e6',
    priority: selected
      ? Number.MAX_SAFE_INTEGER
      : Number.isFinite(launchTimeMs) ? Math.floor(launchTimeMs / 1000) : 0,
    selected,
    protected: selected,
    paintLane: selected ? 'selected' : 'ambient-label',
    collisionGroup: 'ambient-label',
    interactive: false,
    distanceScale: {
      near: 1000,
      nearValue: 1.08,
      far: 20_000_000,
      farValue: 0.78,
    },
    gapPx: 12,
    verticalOnly: true,
    placement: 'above',
    edgeFade: 'keyhole',
    horizonCull: true,
    terrainOcclusion: false,
  };
}

/**
 * Build one protected label belonging to the selected mission's trajectory,
 * live payload position, or orbit. Copy is already source-formatted by the
 * caller; newline semantics become explicit host detail rows.
 * @param {object} input
 * @param {string} input.id Stable mission-element identity.
 * @param {Cesium.Cartesian3|function():Cesium.Cartesian3} input.position Existing cached position.
 * @param {string} input.text Former native-label text, including newlines.
 * @param {string} input.accent Source-owned label color.
 * @param {number} [input.priority=0] Protected placement order.
 * @param {number} [input.gapPx=8] Anchor-to-label gap.
 * @returns {object}
 */
export function createRocketMissionElementOverlayEntry({
  id,
  position,
  text,
  accent,
  priority = 0,
  gapPx = 8,
}) {
  const [title, ...details] = String(text || '').split('\n');
  return {
    id: String(id),
    position,
    variant: 'label',
    title,
    details,
    accent,
    priority,
    selected: true,
    protected: true,
    paintLane: 'selected',
    collisionGroup: 'ambient-label',
    interactive: false,
    gapPx,
    verticalOnly: true,
    placement: 'above',
    edgeFade: 'keyhole',
    horizonCull: true,
    terrainOcclusion: false,
  };
}

/** Keep the newest ambient mission markers with stable identity tie-breaking. */
export function selectRocketMissionMarkerOverlayCohort(
  entries,
  limit = ROCKET_MISSION_AMBIENT_OVERLAY_COHORT_LIMIT,
) {
  const cap = Math.max(0, Math.min(
    ROCKET_MISSION_AMBIENT_OVERLAY_COHORT_LIMIT,
    Math.floor(Number(limit) || 0),
  ));
  if (!Array.isArray(entries) || cap === 0) return [];
  return entries.slice().sort((a, b) => (
    b.priority - a.priority || String(a.id).localeCompare(String(b.id))
  )).slice(0, cap);
}

function missionHoverReticleImage() {
  if (_missionHoverReticleImage) return _missionHoverReticleImage;
  const canvas = document.createElement('canvas');
  const size = 48;
  const inset = 6;
  const arm = 12;
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d');
  context.strokeStyle = '#22e6e6';
  context.lineWidth = 2;
  context.lineCap = 'square';
  context.shadowColor = 'rgba(34, 230, 230, .72)';
  context.shadowBlur = 5;
  context.beginPath();
  context.moveTo(inset, inset + arm);
  context.lineTo(inset, inset);
  context.lineTo(inset + arm, inset);
  context.moveTo(size - inset - arm, inset);
  context.lineTo(size - inset, inset);
  context.lineTo(size - inset, inset + arm);
  context.moveTo(inset, size - inset - arm);
  context.lineTo(inset, size - inset);
  context.lineTo(inset + arm, size - inset);
  context.moveTo(size - inset - arm, size - inset);
  context.lineTo(size - inset, size - inset);
  context.lineTo(size - inset, size - inset - arm);
  context.stroke();
  _missionHoverReticleImage = canvas;
  return canvas;
}

/**
 * Resolve the one permitted screen-space replay overlay state.
 * @param {object} input Overlay state.
 * @param {boolean} input.replayActive Whether replay owns the camera.
 * @param {boolean} input.ascending Whether the replay marker is on ascent.
 * @param {boolean} input.countdownActive Whether the T-minus hold is active.
 * @returns {'countdown'|'ascent'|'orbit'|null}
 */
export function replayOverlayMode({
  replayActive,
  ascending,
  countdownActive,
  preCountdownActive = false,
}) {
  if (!replayActive) return null;
  if (preCountdownActive) return null;
  if (countdownActive) return 'countdown';
  return ascending ? 'ascent' : 'orbit';
}

/**
 * Rotate an upright screen-space rocket so its nose follows a projected path.
 * @param {{x: number, y: number}} from Current screen point.
 * @param {{x: number, y: number}} to Forward screen point.
 * @returns {number} Clockwise CSS rotation in radians.
 */
export function replayVehicleScreenRotation(from, to) {
  const dx = Number(to?.x) - Number(from?.x);
  const dy = Number(to?.y) - Number(from?.y);
  if (!Number.isFinite(dx) || !Number.isFinite(dy) || Math.hypot(dx, dy) < 0.01) return 0;
  return Math.atan2(dx, -dy);
}

/**
 * Reduce small screen-space reprojection jitter without allowing the marker
 * to lag behind a camera jump or a phase transition.
 * @param {{x:number,y:number}|null} previous Previous rendered position.
 * @param {{x:number,y:number}} next Current path projection.
 * @param {number} [alpha] Interpolation amount.
 * @param {number} [snapDistance] Maximum distance to smooth.
 * @returns {{x:number,y:number}}
 */
export function smoothReplayWindowPosition(
  previous,
  next,
  alpha = 0.55,
  snapDistance = 24,
) {
  if (!previous || !next) return next;
  const distance = Math.hypot(next.x - previous.x, next.y - previous.y);
  if (!Number.isFinite(distance) || distance > snapDistance) return next;
  const amount = Cesium.Math.clamp(Number(alpha) || 0, 0, 1);
  return {
    x: Cesium.Math.lerp(previous.x, next.x, amount),
    y: Cesium.Math.lerp(previous.y, next.y, amount),
  };
}

function createReplayVehicleOverlay() {
  if (_replayVehicleOverlay || typeof document === 'undefined') return;
  const host = document.getElementById('cesiumContainer') || document.body;
  _replayVehicleOverlay = document.createElement('div');
  _replayVehicleOverlay.className = 'mission-replay-vehicle-overlay';
  _replayVehicleOverlay.hidden = true;
  _replayVehicleOverlay.setAttribute('aria-hidden', 'true');
  _replayVehicleOverlay.innerHTML = `
    <div class="mission-replay-flight-symbol">
      <svg class="mission-replay-rocket" viewBox="0 0 48 72" aria-hidden="true">
        <path class="mission-replay-rocket-body" d="M24 5C16 14 14 27 15 45L9 54L18 51L24 58L30 51L39 54L33 45C34 27 32 14 24 5Z"></path>
        <circle class="mission-replay-rocket-port" cx="24" cy="29" r="3.4"></circle>
      </svg>
      <svg class="mission-replay-thrust" viewBox="0 0 72 72" aria-hidden="true">
        <ellipse style="--thrust-index:0" cx="36" cy="7" rx="5" ry="1.8"></ellipse>
        <ellipse style="--thrust-index:1" cx="36" cy="15" rx="8" ry="2.4"></ellipse>
        <ellipse style="--thrust-index:2" cx="36" cy="24" rx="11" ry="3"></ellipse>
        <ellipse style="--thrust-index:3" cx="36" cy="35" rx="15" ry="3.8"></ellipse>
        <ellipse style="--thrust-index:4" cx="36" cy="48" rx="20" ry="4.7"></ellipse>
        <ellipse style="--thrust-index:5" cx="36" cy="63" rx="26" ry="5.8"></ellipse>
      </svg>
    </div>
    <div class="mission-replay-orbit-dot" aria-hidden="true"></div>
    <div class="mission-replay-overlay-callout">
      <strong data-replay-overlay-title></strong>
      <span data-replay-overlay-detail></span>
    </div>`;
  host.appendChild(_replayVehicleOverlay);
}

function hideReplayVehicleOverlay() {
  if (!_replayVehicleOverlay) return;
  _replayVehicleOverlay.hidden = true;
  _replayVehicleOverlay.classList.remove('is-thrusting', 'is-paused');
}

function destroyReplayVehicleOverlay() {
  _replayVehicleOverlay?.remove();
  _replayVehicleOverlay = null;
  _replayVehicleOverlayText = '';
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
  if (!launchTime || !Number.isFinite(date.getTime())) return 'UNAVAILABLE';
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

function entityLaunchId(entity) {
  if (!entity?.id || typeof entity.id !== 'string') return null;
  const match = entity.id.match(/^rocket-[^:]+:([^:]+)/);
  return match?.[1] || null;
}

function clearMissionOverlaySources() {
  _selectedMissionOverlayTimeText = null;
  _missionOverlayHost.clearSource(ROCKET_MISSION_AMBIENT_OVERLAY_SOURCE_ID);
  _missionOverlayHost.setVisible(ROCKET_MISSION_AMBIENT_OVERLAY_SOURCE_ID, false);
  _missionOverlayHost.clearSource(ROCKET_MISSION_SELECTED_OVERLAY_SOURCE_ID);
  _missionOverlayHost.setVisible(ROCKET_MISSION_SELECTED_OVERLAY_SOURCE_ID, false);
}

function syncMissionOverlayEntries() {
  if (!_enabled || !_dataSource?.show) {
    clearMissionOverlaySources();
    return;
  }
  const selectedRecord = _selectedLaunchId
    ? _missionOverlayRecords.get(_selectedLaunchId)
    : null;
  if (selectedRecord) {
    _missionOverlayHost.clearSource(ROCKET_MISSION_AMBIENT_OVERLAY_SOURCE_ID);
    _missionOverlayHost.setVisible(ROCKET_MISSION_AMBIENT_OVERLAY_SOURCE_ID, false);
    const entries = selectedRecord.elementEntryFactories.map((createEntry) => createEntry());
    if (_replayCameraLaunchId !== selectedRecord.launch.id) {
      entries.unshift(createRocketMissionMarkerOverlayEntry(
        selectedRecord.launch,
        selectedRecord.anchorPosition,
        true,
      ));
    }
    _missionOverlayHost.setEntries(
      ROCKET_MISSION_SELECTED_OVERLAY_SOURCE_ID,
      entries,
      ROCKET_MISSION_SELECTED_OVERLAY_SOURCE_OPTIONS,
    );
    _missionOverlayHost.setVisible(ROCKET_MISSION_SELECTED_OVERLAY_SOURCE_ID, true);
    _selectedMissionOverlayTimeText = selectedRecord.liveEventTime
      ? formatMissionEventTime(selectedRecord.liveEventTime())
      : null;
    return;
  }

  _missionOverlayHost.clearSource(ROCKET_MISSION_SELECTED_OVERLAY_SOURCE_ID);
  _missionOverlayHost.setVisible(ROCKET_MISSION_SELECTED_OVERLAY_SOURCE_ID, false);
  _selectedMissionOverlayTimeText = null;
  const entries = selectRocketMissionMarkerOverlayCohort(
    Array.from(_missionOverlayRecords.values(), (record) => {
      const entry = createRocketMissionMarkerOverlayEntry(
        record.launch,
        record.anchorPosition,
      );
      if (record.launch.id === _hoveredRosterLaunchId) {
        entry.pinned = true;
        entry.priority = Number.MAX_SAFE_INTEGER - 1;
      }
      return entry;
    }),
  );
  _missionOverlayHost.setEntries(
    ROCKET_MISSION_AMBIENT_OVERLAY_SOURCE_ID,
    entries,
    ROCKET_MISSION_AMBIENT_OVERLAY_SOURCE_OPTIONS,
  );
  _missionOverlayHost.setVisible(ROCKET_MISSION_AMBIENT_OVERLAY_SOURCE_ID, true);
}

function refreshSelectedMissionOverlayText() {
  const selectedRecord = _selectedLaunchId
    ? _missionOverlayRecords.get(_selectedLaunchId)
    : null;
  if (!selectedRecord?.liveEventTime) return;
  const nextText = formatMissionEventTime(selectedRecord.liveEventTime());
  if (nextText !== _selectedMissionOverlayTimeText) syncMissionOverlayEntries();
}

function setSelectedMission(launchId, isolate = true) {
  if (launchId) clearMissionRosterHover();
  if (_replayCameraLaunchId && _replayCameraLaunchId !== launchId) stopMissionReplay();
  if (_missionZoomAnchorId && _missionZoomAnchorId !== launchId) stopMissionZoomAnchor();
  _selectedLaunchId = launchId;
  _explicitSelection = Boolean(launchId && isolate);
  if (launchId) _animationStarts.set(launchId, Date.now());
  if (!launchId && _viewer) {
    stopMissionZoomAnchor();
    _viewer.selectedEntity = undefined;
  }
  if (!_dataSource) return;
  for (const entity of _dataSource.entities.values) {
    const relatedId = entityLaunchId(entity);
    entity.show = launchId
      ? relatedId === launchId
      : entity.id.startsWith('rocket-launch:');
  }
  syncMissionOrbitPrimitiveVisibility();
  syncMissionOverlayEntries();
  renderMissionPanel();
}

function hideLaunchPadZone() {
  if (_launchPadZonePrimitive) _launchPadZonePrimitive.show = false;
}

function removeLaunchPadZonePrimitive() {
  if (_launchPadZonePrimitive && _viewer?.scene?.primitives) {
    _viewer.scene.primitives.remove(_launchPadZonePrimitive);
  }
  _launchPadZonePrimitive = null;
  _launchPadZoneLaunchId = null;
}

function createLaunchPadZonePrimitive(launch) {
  removeLaunchPadZonePrimitive();
  const material = new Cesium.Material({
    fabric: {
      type: 'GevLaunchPadZone',
      uniforms: {
        color: Cesium.Color.fromCssColorString('#22e6e6'),
        fillAlpha: 0.105,
        rimAlpha: 0.72,
      },
      source: `
        czm_material czm_getMaterial(czm_materialInput materialInput) {
          czm_material material = czm_getDefaultMaterial(materialInput);
          vec2 centered = (materialInput.st - vec2(0.5)) * 2.0;
          float radius = length(centered);
          float inside = 1.0 - smoothstep(0.985, 1.0, radius);
          float rim = smoothstep(0.952, 0.985, radius) * inside;
          material.diffuse = color.rgb;
          material.emission = color.rgb * rim * 0.35;
          material.alpha = color.a * inside * mix(fillAlpha, rimAlpha, rim);
          return material;
        }`,
    },
  });
  const geometry = new Cesium.EllipseGeometry({
    center: Cesium.Cartesian3.fromDegrees(launch.lon, launch.lat),
    semiMajorAxis: LAUNCH_PAD_ZONE_RADIUS_M,
    semiMinorAxis: LAUNCH_PAD_ZONE_RADIUS_M,
    granularity: Cesium.Math.toRadians(0.08),
    vertexFormat: Cesium.MaterialAppearance.MaterialSupport.TEXTURED.vertexFormat,
  });
  _launchPadZonePrimitive = _viewer.scene.primitives.add(new Cesium.GroundPrimitive({
    geometryInstances: new Cesium.GeometryInstance({
      geometry,
      id: `rocket-pad-zone:${launch.id}`,
    }),
    appearance: new Cesium.MaterialAppearance({
      material,
      translucent: true,
      closed: false,
      faceForward: true,
      flat: true,
      // Keep the zone classified onto the photoreal surface, but bias only its
      // rasterized depth toward the camera. This avoids coplanar fragments
      // being intermittently buried by the launch-pad mesh at oblique angles
      // without adding a world-space height that would make the ring float.
      renderState: {
        depthTest: {
          enabled: true,
        },
        depthMask: false,
        polygonOffset: {
          enabled: true,
          factor: -1,
          units: -4,
        },
        blending: Cesium.BlendingState.ALPHA_BLEND,
      },
    }),
    classificationType: Cesium.ClassificationType.BOTH,
    asynchronous: true,
    show: true,
  }));
  _launchPadZoneLaunchId = launch.id;
}

function initLaunchPadZonePrimitive() {
  if (!_viewer || _launchPadZoneRemover) return;
  _launchPadZoneRemover = _viewer.scene.preRender.addEventListener(() => {
    if (!_enabled || !_dataSource?.show) {
      hideLaunchPadZone();
      return;
    }
    const nowMs = Date.now();
    if (nowMs - _lastMissionRingRotationMs >= 1000) {
      _missionRingDate.setTime(nowMs);
      updateMissionOrbitPrimitiveFrames(_missionRingDate);
      _lastMissionRingRotationMs = nowMs;
    }
    const launch = _launches.find((item) => item.id === _selectedLaunchId);
    const camera = _viewer?.camera;
    if (!launch || !camera) {
      hideLaunchPadZone();
      return;
    }
    const launchPosition = Cesium.Cartesian3.fromDegrees(launch.lon, launch.lat);
    const visible = launchPadZoneVisible({
      layerActive: Boolean(_dataSource?.show),
      selectedLaunchId: _selectedLaunchId,
      launchId: launch.id,
      cameraHeightM: camera.positionCartographic?.height,
      cameraDistanceM: Cesium.Cartesian3.distance(camera.positionWC, launchPosition),
    });
    if (!visible) {
      hideLaunchPadZone();
      return;
    }
    if (_launchPadZoneLaunchId !== launch.id) createLaunchPadZonePrimitive(launch);
    _launchPadZonePrimitive.show = true;
  });
}

function destroyLaunchPadZonePrimitive() {
  if (_launchPadZoneRemover) _launchPadZoneRemover();
  _launchPadZoneRemover = null;
  removeLaunchPadZonePrimitive();
}

function stopMissionZoomAnchor() {
  if (_missionZoomAnchorRemover) _missionZoomAnchorRemover();
  _missionZoomAnchorRemover = null;
  _missionZoomAnchorId = null;
  if (_viewer?.camera && !_replayCameraLaunchId) {
    _viewer.camera.lookAtTransform(Cesium.Matrix4.IDENTITY);
  }
}

function startMissionZoomAnchor(launch, initialRange) {
  if (!_viewer || !launch || _replayCameraLaunchId) return;
  stopMissionZoomAnchor();
  const target = Cesium.Cartesian3.fromDegrees(launch.lon, launch.lat);
  const range = Math.max(2000, Number(initialRange) || MISSION_GLOBE_VIEW_RANGE_M);
  _missionZoomAnchorId = launch.id;
  _viewer.camera.lookAt(
    target,
    new Cesium.HeadingPitchRange(0, missionZoomPitch(range), range),
  );
}

function syncReplayButton() {
  const button = _missionPanel?.querySelector('[data-mission-replay]');
  const transport = _missionPanel?.querySelector('[data-mission-replay-transport]');
  const speedControl = _missionPanel?.querySelector('.mission-replay-speed-control');
  if (!button) return;
  const active = Boolean(_replayCameraLaunchId && _replayCameraLaunchId === _selectedLaunchId);
  const replayAvailable = Boolean(_selectedLaunchId && _replayTracks.has(_selectedLaunchId));
  if (speedControl) speedControl.hidden = !replayAvailable;
  button.hidden = active || !replayAvailable;
  button.disabled = !replayAvailable;
  button.textContent = 'REPLAY ASCENT';
  button.classList.remove('active');
  button.setAttribute('aria-pressed', String(active));
  button.title = 'Replay the estimated ascent with a following camera';
  if (transport) {
    transport.hidden = !active;
    transport.classList.toggle('is-paused', active && _replayPaused);
    const toggleButton = transport.querySelector('[data-mission-replay-toggle]');
    if (toggleButton) {
      toggleButton.disabled = !active;
      toggleButton.textContent = _replayPaused ? '▶' : 'Ⅱ';
      toggleButton.setAttribute('aria-label', _replayPaused ? 'Resume replay' : 'Pause replay');
      toggleButton.title = _replayPaused ? 'Resume replay' : 'Pause replay';
    }
  }
}

function syncReplayCountdownButton(state) {
  const transport = _missionPanel?.querySelector('[data-mission-replay-transport]');
  if (!transport || !_replayCameraLaunchId) return;
  const phase = state.countdownActive
    ? `T minus ${state.countdownSeconds}`
    : state.preCountdownActive
      ? 'Preparing launch site'
    : state.elapsedSinceStart < 1
      ? 'Liftoff'
      : state.ascending ? 'Ascent replay' : 'Orbit replay';
  transport.setAttribute('aria-label', `${phase}${_replayPaused ? ', paused' : ''}`);
}

function syncReplaySpeedControl() {
  const input = _missionPanel?.querySelector('[data-mission-replay-speed]');
  const output = _missionPanel?.querySelector('[data-mission-replay-speed-output]');
  if (input) {
    input.value = String(_replaySpeed);
    const progress = ((_replaySpeed - REPLAY_SPEED_MIN) / (REPLAY_SPEED_MAX - REPLAY_SPEED_MIN)) * 100;
    input.style.setProperty('--replay-speed-progress', `${progress}%`);
  }
  if (output) output.textContent = `${_replaySpeed.toFixed(_replaySpeed % 1 ? 2 : 0)}×`;
}

function setReplaySpeed(value) {
  const nextSpeed = normalizeReplaySpeed(value);
  const previousSpeed = _replaySpeed;
  if (nextSpeed === previousSpeed) {
    syncReplaySpeedControl();
    return;
  }
  const now = _replayPaused && Number.isFinite(_replayPausedAtMs)
    ? _replayPausedAtMs
    : Date.now();
  for (const [launchId, startedAt] of _animationStarts) {
    if (!Number.isFinite(startedAt)) continue;
    const elapsedMissionMs = (now - startedAt) * previousSpeed;
    _animationStarts.set(launchId, now - elapsedMissionMs / nextSpeed);
  }
  _replaySpeed = nextSpeed;
  syncReplaySpeedControl();
}

function replayClockNow(launchId) {
  if (
    _replayPaused
    && _replayCameraLaunchId === launchId
    && Number.isFinite(_replayPausedAtMs)
  ) {
    return _replayPausedAtMs;
  }
  return Date.now();
}

function pauseMissionReplay() {
  if (!_replayCameraLaunchId || _replayPaused) return false;
  _replayPausedAtMs = Date.now();
  _replayPaused = true;
  syncReplayButton();
  return true;
}

function resumeMissionReplay() {
  if (!_replayCameraLaunchId || !_replayPaused || !Number.isFinite(_replayPausedAtMs)) {
    return false;
  }
  const resumedAt = Date.now();
  const startedAt = _animationStarts.get(_replayCameraLaunchId);
  if (Number.isFinite(startedAt)) {
    _animationStarts.set(
      _replayCameraLaunchId,
      replayStartAfterPause(startedAt, _replayPausedAtMs, resumedAt),
    );
  }
  _replayPaused = false;
  _replayPausedAtMs = null;
  syncReplayButton();
  return true;
}

function stopMissionReplay() {
  const stoppedLaunchId = _replayCameraLaunchId;
  _replayCameraToken++;
  if (_replayCameraRemover) _replayCameraRemover();
  _replayCameraRemover = null;
  _viewer?.camera?.cancelFlight();
  if (_viewer?.camera) _viewer.camera.lookAtTransform(Cesium.Matrix4.IDENTITY);
  _replayCameraLaunchId = null;
  _replayPaused = false;
  _replayPausedAtMs = null;
  if (stoppedLaunchId) _animationStarts.set(stoppedLaunchId, Date.now());
  // Own hold (perf wave 3) — every stopMissionReplay() call site (11 of them:
  // re-click same launch, TLE refresh, mission-data update, layer disable/
  // destroy, camera-ownership release, panel cancel button, …) funnels through
  // this one function, so releasing here covers every teardown path. Safe to
  // call even when replay was never held (releaseContinuousRender is a no-op
  // on an owner id that isn't currently held).
  releaseContinuousRender('rocket-replay');
  syncReplayButton();
  syncMissionOverlayEntries();
}

function startMissionReplay(launchId) {
  const launch = _launches.find((item) => item.id === launchId);
  const track = _replayTracks.get(launchId);
  if (!_viewer || !launch || !track) return false;
  if (_replayCameraLaunchId === launchId) {
    stopMissionReplay();
    return false;
  }

  stopMissionZoomAnchor();
  stopMissionReplay();
  _replayCameraLaunchId = launchId;
  _replayPaused = false;
  _replayPausedAtMs = null;
  // Own hold (perf wave 3) — mission replay is a discrete, explicit opt-in
  // mode (same shape as cctv.js's 'cctv-adjust' calibration-mode hold): the
  // preUpdate listener below mutates the chase camera every frame, which
  // request-on-demand rendering would otherwise never notice. Scoped to only
  // the replay's own lifetime, not the whole 'rocket-launches' layer — that
  // hold (above, in enable()/disable()) is unchanged by this carve-out.
  holdContinuousRender('rocket-replay');
  const token = ++_replayCameraToken;
  const ascentDurationSec = track.ascentDurationSec;
  // Start broadside to the ascent/orbit direction so the launch profile is
  // visible. The chase heading then eases toward the path tangent after the
  // camera is established.
  const initialHeading = replayInitialCameraHeading(track.ascentPath);
  track.lastCameraHeading = initialHeading;
  syncReplayButton();
  syncMissionOverlayEntries();
  releaseAircraftTracking(_dataManager);
  _viewer.trackedEntity = undefined;
  _viewer.camera.cancelFlight();
  _animationStarts.set(
    launchId,
    Date.now() + (REPLAY_TILE_SETTLE_DELAY_SEC + REPLAY_COUNTDOWN_DURATION_SEC) * 1000,
  );
  let cameraReady = false;
  let lastCameraUpdateMs = null;

  // Move the chase camera before scene traversal. Mutating it in preRender
  // makes Cesium discover a new view after 3D-tile refinement, which can cause
  // a self-sustaining refinement loop and visible stutter during slow replay.
  _replayCameraRemover = _viewer.scene.preUpdate.addEventListener(() => {
    if (token !== _replayCameraToken || _replayCameraLaunchId !== launchId) return;
    const state = track.beginReplayFrame();
    syncReplayCountdownButton(state);
    if (!cameraReady) return;
    const path = state.ascending
      ? track.ascentPath
      : track.animatedOrbitPath;
    const position = samplePath(path, state.phaseProgress);
    if (!position) return;
    const pathHeading = cameraHeadingForPath(
      path,
      state.phaseProgress,
      track.lastCameraHeading,
    );
    const orbitBlend = !state.ascending
      ? Cesium.Math.clamp(
        (Number(state.phaseProgress) || 0) / REPLAY_ORBIT_PULLBACK_FRACTION,
        0,
        1,
      )
      : 0;
    const desiredHeading = replayChaseCameraHeading(pathHeading, orbitBlend);
    if (state.ascending) track.orbitCameraWorldFrame = false;
    const nowMs = performance.now();
    const frameDurationMs = Number.isFinite(lastCameraUpdateMs)
      ? Cesium.Math.clamp(nowMs - lastCameraUpdateMs, 4, 50)
      : 1000 / 60;
    lastCameraUpdateMs = nowMs;
    track.lastCameraHeading = smoothReplayCameraHeading(
      track.lastCameraHeading,
      desiredHeading,
      Cesium.Math.toRadians(2) * frameDurationMs / (1000 / 60),
    );
    const cartographic = Cesium.Ellipsoid.WGS84.cartesianToCartographic(position);
    const altitude = Math.max(0, cartographic?.height || 0);
    const cameraView = replayCameraView(state, altitude);
    const defaultOrbitTarget = !state.ascending
      ? replayOrbitGlobeAnchor(position, orbitBlend)
      : position;
    const cameraTarget = !state.ascending
      ? replayOrbitCameraTarget(
        defaultOrbitTarget,
        track.orbitFrameSphere?.center,
        orbitBlend,
      )
      : defaultOrbitTarget;
    const cameraRange = !state.ascending
      ? replayOrbitGlobeRange(
        cameraView.range,
        altitude,
        orbitBlend,
        track.orbitFrameSphere?.radius,
      )
      : cameraView.range;
    if (state.ascending) {
      _viewer.camera.lookAt(
        cameraTarget,
        new Cesium.HeadingPitchRange(
          track.lastCameraHeading,
          cameraView.pitch,
          cameraRange,
        ),
      );
    } else {
      const tangentStep = Math.max(0.002, 0.8 / Math.max(2, path.length - 1));
      const tangentProgress = Math.min(1, state.phaseProgress + tangentStep);
      const tangentPosition = samplePath(
        path,
        tangentProgress > state.phaseProgress
          ? tangentProgress
          : Math.max(0, state.phaseProgress - tangentStep),
      );
      const orbitPose = replayOrbitCameraPose(
        position,
        tangentPosition,
        cameraTarget,
        cameraRange,
        cameraView.pitch,
      );
      if (orbitPose) {
        if (!track.orbitCameraWorldFrame) {
          _viewer.camera.lookAtTransform(Cesium.Matrix4.IDENTITY);
          track.orbitCameraWorldFrame = true;
        }
        _viewer.camera.setView({
          destination: orbitPose.destination,
          orientation: {
            direction: orbitPose.direction,
            up: orbitPose.up,
          },
        });
      }
    }
    if (state.elapsedSinceStart >= ascentDurationSec
      + REPLAY_ORBIT_DURATION_SEC) {
      stopMissionReplay();
    }
  });

  _viewer.camera.flyToBoundingSphere(
    new Cesium.BoundingSphere(track.ascentPath[0], 0),
    {
      offset: new Cesium.HeadingPitchRange(
        initialHeading,
        Cesium.Math.toRadians(-20),
        REPLAY_INITIAL_RANGE_M,
      ),
      duration: 1.4,
      easingFunction: Cesium.EasingFunction.CUBIC_IN_OUT,
      complete: () => {
        cameraReady = true;
      },
      cancel: () => {
        if (token === _replayCameraToken && _replayCameraLaunchId === launchId) stopMissionReplay();
      },
    },
  );
  return true;
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
  const status = success === true ? 'RECOVERED'
    : success === false ? 'LOST'
      : attempted ? 'RECOVERY ATTEMPT'
        : recoveryType ? recoveryType.toUpperCase()
          : launcherStatus ? launcherStatus.toUpperCase()
            : 'NO RECOVERY DATA';
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
    ...launcherStages.map((stage, index) => normalizeLanding(stage, `Launcher stage ${index + 1}`, 'LAUNCHER', index)),
    ...spacecraftStages.map((stage, index) => normalizeLanding(stage, `Spacecraft stage ${index + 1}`, 'SPACECRAFT', index)),
  ];
  const payloadFlights = rocket.payloads || launch.payloads || [];
  if (Array.isArray(payloadFlights)) {
    payloadFlights.forEach((flight, index) => {
      if (!flight?.landing) return;
      stages.push(normalizeLanding(
        { ...flight, type: payloads[index]?.type || 'Payload', serial_number: payloads[index]?.name },
        payloads[index]?.name || `Payload ${index + 1}`,
        'PAYLOAD',
        index,
      ));
    });
  }
  return stages;
}

function landingEndpoint(stage, launch, insertionPosition) {
  if (Number.isFinite(stage.lat) && Number.isFinite(stage.lon)) {
    return { lat: stage.lat, lon: stage.lon, accuracy: 'CONFIRMED' };
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

function stageReentryRecoveryPath(ascentPath, endpoint, stageIndex, stageCount) {
  if (!ascentPath?.length || !endpoint) return [];
  const progress = Cesium.Math.clamp(0.28 + (stageIndex / Math.max(stageCount, 1)) * 0.34, 0.28, 0.68);
  const separation = samplePath(ascentPath, progress);
  const destination = Cesium.Cartesian3.fromDegrees(endpoint.lon, endpoint.lat, 12);
  return surfaceSafeSegment(separation, destination);
}

function atmosphericReentryIndex(path) {
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

function missionTableRows(items, columns, emptyText) {
  if (!items.length) return `<tr><td colspan="${columns}" class="mission-table-empty">${emptyText}</td></tr>`;
  return items.map((item) => item).join('');
}

function setMissionPanelField(selector, value, title = '') {
  const output = _missionPanel?.querySelector(selector);
  if (!output) return;
  const row = output.closest('[data-mission-field]');
  const available = value !== null && value !== undefined && String(value).trim() !== '';
  if (row) row.hidden = !available;
  if (!available) {
    output.textContent = '';
    output.removeAttribute('title');
    return;
  }
  output.textContent = value;
  if (title) output.title = title;
  else output.removeAttribute('title');
}

function renderMissionPanel() {
  if (!_missionPanel) return;
  const launch = _launches.find((item) => item.id === _selectedLaunchId);
  const index = launch ? _launches.indexOf(launch) : -1;
  _missionPanel.hidden = !launch;
  if (!launch) return;
  _missionPanel.querySelector('[data-mission-title]').textContent = shortMissionLabel(launch.name, 32).toUpperCase();
  setMissionPanelField('[data-mission-provider]', launch.provider);
  setMissionPanelField('[data-mission-status]', launch.status);
  setMissionPanelField(
    '[data-mission-site]',
    launch.launchSite && launch.launchSite !== 'Unknown launch site' ? launch.launchSite : null,
  );
  setMissionPanelField('[data-mission-time]', launch.launchTime);
  const pathPresentation = missionPathPresentation(launch, _replayTracks.has(launch.id));
  setMissionPanelField('[data-mission-orbit]', pathPresentation.orbit);
  _missionPanel.querySelector('[data-mission-ascent-source]').textContent = pathPresentation.ascent;
  const payloadRows = launch.payloads.length
    ? launch.payloads.slice(0, 5).map((payload) => {
      const detail = [
        payload.manufacturer,
        payload.operator && payload.operator !== payload.manufacturer ? payload.operator : null,
        Number.isFinite(payload.massKg) ? `${payload.massKg.toLocaleString()} KG` : null,
      ].filter(Boolean).join(' · ');
      return `<tr><td>${escapeMissionText(payload.name)}${payload.amount > 1 ? ` ×${payload.amount}` : ''}${detail ? `<small>${escapeMissionText(detail)}</small>` : ''}</td><td>${escapeMissionText(payload.type || 'UNSPECIFIED')}</td><td>${escapeMissionText(payload.destination || launch.orbit?.name || 'UNAVAILABLE')}</td></tr>`;
    })
    : [];
  if (launch.payloads.length > 5) {
    payloadRows.push(`<tr><td colspan="3" class="mission-table-empty">+${launch.payloads.length - 5} additional payload records</td></tr>`);
  }
  _missionPanel.querySelector('[data-mission-payloads]').innerHTML = missionTableRows(
    payloadRows,
    3,
    'CLASSIFIED / MULTI-PAYLOAD',
  );
  const stageRows = launch.recoveryStages.map((stage) => {
    const endpoint = stage.endpoint;
    const destination = stage.destination || (endpoint?.accuracy === 'PAD / RTLS' ? launch.launchSite : 'UNAVAILABLE');
    const position = endpoint
      ? `${endpoint.lat.toFixed(2)}, ${endpoint.lon.toFixed(2)} · ${endpoint.accuracy}`
      : stage.downrangeKm > 0 ? `${stage.downrangeKm.toLocaleString()} KM DOWNRANGE` : 'POSITION UNAVAILABLE';
    const stageDetail = [
      Number.isFinite(stage.flightNumber) ? `FLIGHT ${stage.flightNumber}` : null,
      stage.reused ? 'REUSED' : null,
      stage.recoveryType,
    ].filter(Boolean).join(' · ');
    return `<tr><td>${escapeMissionText(stage.name)}${stageDetail ? `<small>${escapeMissionText(stageDetail)}</small>` : ''}</td><td>${escapeMissionText(stage.status)}</td><td>${escapeMissionText(destination)}<small>${escapeMissionText(position)}</small></td></tr>`;
  });
  _missionPanel.querySelector('[data-mission-stages]').innerHTML = missionTableRows(
    stageRows,
    3,
    'NO STAGE RE-ENTRY / RECOVERY DATA',
  );
  const stageSection = _missionPanel.querySelector('[data-mission-stages-section]');
  if (stageSection) stageSection.hidden = stageRows.length === 0;
  updateMissionTelemetry(true);
  _missionPanel.querySelector('[data-mission-index]').textContent = `${index + 1} / ${_launches.length}`;
  _missionPanel.querySelector('[data-mission-prev]').disabled = index <= 0;
  _missionPanel.querySelector('[data-mission-next]').disabled = index < 0 || index >= _launches.length - 1;
  syncReplayButton();
  const panelScroller = _missionPanel.closest('.global-context-panel-inner');
  if (panelScroller) panelScroller.scrollTop = 0;
}

function renderMissionRoster() {
  if (!_missionRoster) return;
  const list = _missionRoster.querySelector('[data-mission-roster-list]');
  const count = _missionRoster.querySelector('[data-mission-roster-count]');
  if (count) count.textContent = `${_launches.length} / 30D`;
  if (!list) return;
  const entries = missionRosterEntries(_launches);
  if (!entries.length) {
    list.innerHTML = '<div class="space-mission-roster-empty">NO MISSIONS AVAILABLE IN THE CURRENT 30-DAY WINDOW</div>';
    return;
  }
  list.innerHTML = entries.map(({ launch, index }) => {
    const color = missionMarkerColor(launch).toCssColorString();
    const date = launch.launchTime?.slice(0, 10) || 'DATE UNAVAILABLE';
    const provider = launch.provider || 'UNSPECIFIED OPERATOR';
    const label = shortMissionLabel(launch.name, 27).toUpperCase();
    return `<button type="button" class="space-mission-roster-item" data-mission-roster-index="${index}" aria-label="Select ${escapeMissionText(label)}"><span class="space-mission-roster-marker" style="--mission-roster-color:${color}" aria-hidden="true"></span><span class="space-mission-roster-copy"><strong>${escapeMissionText(label)}</strong><small>${escapeMissionText(provider)} · ${escapeMissionText(date)}</small></span><span class="space-mission-roster-chevron" aria-hidden="true">›</span></button>`;
  }).join('');
}

function escapeMissionText(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[character]);
}

function updateMissionTelemetry(force = false) {
  if (!_missionPanel || !_selectedLaunchId || !_dataSource) return;
  const now = performance.now();
  if (!force && now - _lastPanelTelemetryMs < 250) return;
  _lastPanelTelemetryMs = now;
  const satellite = _dataSource.entities.getById(`rocket-satellite:${_selectedLaunchId}`);
  const position = satellite?.position?.getValue(Cesium.JulianDate.now(_declutterTime));
  const altitudeM = position ? Cesium.Cartographic.fromCartesian(position)?.height : null;
  setMissionPanelField(
    '[data-mission-distance]',
    Number.isFinite(altitudeM)
      ? `${Math.max(0, altitudeM / 1000).toLocaleString(undefined, { maximumFractionDigits: 0 })} KM`
      : null,
  );
  const speedMps = _satelliteTelemetry.get(_selectedLaunchId)?.speedMps;
  setMissionPanelField(
    '[data-mission-speed]',
    Number.isFinite(speedMps)
      ? `${(speedMps / 1000).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} KM/S`
      : null,
    Number.isFinite(speedMps)
      ? `${(speedMps * 3.6).toLocaleString(undefined, { maximumFractionDigits: 0 })} km/h`
      : '',
  );
}

function selectMissionAt(index) {
  const launch = _launches[index];
  if (!launch) return;
  setSelectedMission(launch.id, true);
  focusMission(launch);
}

function clearMissionRosterHover() {
  if (_missionRosterHoverTimer) clearTimeout(_missionRosterHoverTimer);
  _missionRosterHoverTimer = null;
  const changed = _hoveredRosterLaunchId !== null;
  _hoveredRosterLaunchId = null;
  if (changed) syncMissionOverlayEntries();
}

function previewMissionFromRoster(launch) {
  if (!_viewer || !launch || _selectedLaunchId) return;
  const range = missionHoverPreviewRange(_viewer.camera.positionCartographic?.height);
  const position = Cesium.Cartesian3.fromDegrees(launch.lon, launch.lat);
  _viewer.camera.flyToBoundingSphere(
    new Cesium.BoundingSphere(position, 0),
    {
      offset: new Cesium.HeadingPitchRange(0, -Cesium.Math.PI_OVER_TWO, range),
      duration: 0.8,
      easingFunction: Cesium.EasingFunction.CUBIC_IN_OUT,
    },
  );
}

function scheduleMissionRosterPreview(index) {
  const launch = _launches[index];
  if (!launch || _selectedLaunchId) return;
  if (_missionRosterHoverTimer) clearTimeout(_missionRosterHoverTimer);
  _hoveredRosterLaunchId = launch.id;
  syncMissionOverlayEntries();
  _missionRosterHoverTimer = setTimeout(() => {
    _missionRosterHoverTimer = null;
    if (_hoveredRosterLaunchId === launch.id) previewMissionFromRoster(launch);
  }, 140);
}

function focusMission(launch) {
  if (!_viewer || !launch) return;
  stopMissionZoomAnchor();
  _viewer.selectedEntity = _dataSource.entities.getById(`rocket-launch:${launch.id}`);
  const orbitEntity = _dataSource.entities.getById(`rocket-orbit:${launch.id}`);
  const orbitPositions = orbitEntity?.polyline?.positions?.getValue(Cesium.JulianDate.now());
  const launchPosition = Cesium.Cartesian3.fromDegrees(launch.lon, launch.lat);
  let range = 18000000;
  if (orbitPositions?.length > 1) {
    const canvas = _viewer.scene.canvas;
    const fovy = _viewer.camera.frustum?.fovy || Cesium.Math.toRadians(60);
    const aspect = Math.max(0.1, (canvas.clientWidth || canvas.width) / Math.max(1, canvas.clientHeight || canvas.height));
    const fovx = 2 * Math.atan(Math.tan(fovy * 0.5) * aspect);
    const paddedHalfAngle = Math.min(fovy, fovx) * 0.5 * 0.62;
    const orbitExtent = orbitPositions.reduce(
      (largest, point) => Math.max(largest, Cesium.Cartesian3.distance(launchPosition, point)),
      0,
    );
    range = Math.max(
      orbitExtent / Math.max(Math.sin(paddedHalfAngle), 0.1),
      18000000,
    );
  }
  const targetNormal = Cesium.Cartesian3.normalize(launchPosition, new Cesium.Cartesian3());
  const destination = Cesium.Cartesian3.add(
    launchPosition,
    Cesium.Cartesian3.multiplyByScalar(targetNormal, range, new Cesium.Cartesian3()),
    new Cesium.Cartesian3(),
  );
  const direction = Cesium.Cartesian3.negate(targetNormal, new Cesium.Cartesian3());
  let right = Cesium.Cartesian3.cross(direction, Cesium.Cartesian3.UNIT_Z, new Cesium.Cartesian3());
  if (Cesium.Cartesian3.magnitudeSquared(right) < 1e-8) {
    right = Cesium.Cartesian3.cross(direction, Cesium.Cartesian3.UNIT_Y, right);
  }
  Cesium.Cartesian3.normalize(right, right);
  const up = Cesium.Cartesian3.normalize(
    Cesium.Cartesian3.cross(right, direction, new Cesium.Cartesian3()),
    new Cesium.Cartesian3(),
  );
  _viewer.camera.flyTo({
    destination,
    orientation: { direction, up },
    duration: 1.1,
    complete: () => {
      if (_selectedLaunchId === launch.id) startMissionZoomAnchor(launch, range);
    },
  });
}

function focusLaunchSite(launch) {
  if (!_viewer || !launch) return;
  stopMissionReplay();
  stopMissionZoomAnchor();
  const launchPosition = Cesium.Cartesian3.fromDegrees(launch.lon, launch.lat);
  _viewer.selectedEntity = _dataSource.entities.getById(`rocket-launch:${launch.id}`);
  _viewer.camera.flyToBoundingSphere(
    new Cesium.BoundingSphere(launchPosition, 0),
    {
      offset: new Cesium.HeadingPitchRange(
        0,
        Cesium.Math.toRadians(-42),
        MISSION_FOCUS_RANGE_M,
      ),
      duration: 1.4,
      easingFunction: Cesium.EasingFunction.CUBIC_IN_OUT,
      complete: () => {
        if (_selectedLaunchId === launch.id) {
          startMissionZoomAnchor(launch, MISSION_FOCUS_RANGE_M);
        }
      },
    },
  );
}

function createMissionPanel() {
  if (_missionPanel || typeof document === 'undefined') return;
  const host = document.getElementById('space-mission-panel-host')
    || document.getElementById('right-context-rail');
  if (!host) return;
  _missionRoster = document.getElementById('space-mission-roster');
  if (_missionRoster) {
    _missionRoster.onclick = (event) => {
      const button = event.target instanceof Element
        ? event.target.closest('[data-mission-roster-index]')
        : null;
      if (!button) return;
      selectMissionAt(Number(button.dataset.missionRosterIndex));
    };
    _missionRoster.onmouseover = (event) => {
      const button = event.target instanceof Element
        ? event.target.closest('[data-mission-roster-index]')
        : null;
      if (!button || button.contains(event.relatedTarget)) return;
      scheduleMissionRosterPreview(Number(button.dataset.missionRosterIndex));
    };
    _missionRoster.onfocusin = (event) => {
      const button = event.target instanceof Element
        ? event.target.closest('[data-mission-roster-index]')
        : null;
      if (button) scheduleMissionRosterPreview(Number(button.dataset.missionRosterIndex));
    };
    _missionRoster.onmouseleave = clearMissionRosterHover;
    _missionRoster.onfocusout = (event) => {
      if (!_missionRoster.contains(event.relatedTarget)) clearMissionRosterHover();
    };
  }
  _missionPanel = document.createElement('aside');
  _missionPanel.id = 'space-mission-panel';
  _missionPanel.className = 'context-space-mission-detail';
  _missionPanel.setAttribute('aria-label', 'Selected Space Mission');
  _missionPanel.innerHTML = `<div class="space-mission-view-header"><span>SELECTED SPACE MISSION</span><button type="button" data-mission-close title="Show all missions" aria-label="Deselect mission">×</button></div><div class="space-mission-detail"><strong data-mission-title>MISSION</strong><span data-mission-field data-mission-provider></span><span data-mission-field>STATUS · <b data-mission-status></b></span><span data-mission-field>LAUNCH SITE · <b data-mission-site></b></span><span data-mission-field>LAUNCH TIME · <b data-mission-time></b></span><span data-mission-field>ORBIT · <b data-mission-orbit></b></span><span>ASCENT PATH · <b data-mission-ascent-source></b></span><span data-mission-field>CURRENT DISTANCE FROM EARTH · <b data-mission-distance></b></span><span data-mission-field>SATELLITE SPEED · <b data-mission-speed></b></span></div><section class="mission-data-section"><h4>PAYLOAD</h4><div class="mission-table-scroll"><table class="mission-data-table"><thead><tr><th>NAME</th><th>TYPE</th><th>DESTINATION</th></tr></thead><tbody data-mission-payloads></tbody></table></div></section><section class="mission-data-section" data-mission-stages-section><h4>STAGE / RE-ENTRY / RECOVERY</h4><div class="mission-table-scroll"><table class="mission-data-table"><thead><tr><th>STAGE</th><th>STATUS</th><th>FINAL POSITION</th></tr></thead><tbody data-mission-stages></tbody></table></div></section><div class="mission-replay-speed-control"><div class="mission-replay-speed-header"><label for="space-mission-replay-speed">REPLAY SPEED</label><output class="gev-slider-value" for="space-mission-replay-speed" data-mission-replay-speed-output>1×</output></div><input id="space-mission-replay-speed" class="gev-quantitative-slider" type="range" min="0.25" max="4" step="0.25" value="1" data-mission-replay-speed aria-label="Replay speed multiplier"><div class="mission-replay-speed-scale" aria-hidden="true"><span>0.25×</span><span>1×</span><span>4×</span></div></div><div class="mission-action-row"><button type="button" class="mission-focus-button" data-mission-focus>FOCUS</button><button type="button" class="mission-replay-button" data-mission-replay aria-pressed="false">REPLAY ASCENT</button></div><div class="space-mission-nav"><button type="button" class="mission-nav-button" data-mission-prev title="Previous mission"><span aria-hidden="true">‹</span> PREV</button><span class="mission-nav-index" data-mission-index>—</span><button type="button" class="mission-nav-button" data-mission-next title="Next mission">NEXT <span aria-hidden="true">›</span></button></div><button type="button" class="panel-layer-toggle" data-mission-show-all>SHOW ALL / DESELECT</button>`;
  _missionPanel.querySelector('.mission-action-row').insertAdjacentHTML(
    'beforeend',
    `<div class="mission-replay-transport" data-mission-replay-transport hidden>
      <button type="button" data-mission-replay-toggle title="Pause replay" aria-label="Pause replay">Ⅱ</button>
      <button type="button" class="cancel" data-mission-replay-cancel title="Cancel replay" aria-label="Cancel replay"><span aria-hidden="true">×</span></button>
    </div>`,
  );
  host.appendChild(_missionPanel);
  _missionPanel.querySelector('[data-mission-prev]').addEventListener('click', () => selectMissionAt(_launches.findIndex((item) => item.id === _selectedLaunchId) - 1));
  _missionPanel.querySelector('[data-mission-next]').addEventListener('click', () => selectMissionAt(_launches.findIndex((item) => item.id === _selectedLaunchId) + 1));
  _missionPanel.querySelector('[data-mission-close]').addEventListener('click', () => setSelectedMission(null));
  _missionPanel.querySelector('[data-mission-show-all]').addEventListener('click', () => setSelectedMission(null));
  _missionPanel.querySelector('[data-mission-focus]').addEventListener('click', () => {
    const launch = _launches.find((item) => item.id === _selectedLaunchId);
    if (launch) focusLaunchSite(launch);
  });
  _missionPanel.querySelector('[data-mission-replay]').addEventListener('click', () => {
    if (_selectedLaunchId) startMissionReplay(_selectedLaunchId);
  });
  _missionPanel.querySelector('[data-mission-replay-toggle]').addEventListener('click', () => {
    if (_replayPaused) resumeMissionReplay();
    else pauseMissionReplay();
  });
  _missionPanel.querySelector('[data-mission-replay-cancel]').addEventListener('click', stopMissionReplay);
  _missionPanel.querySelector('[data-mission-replay-speed]').addEventListener('input', (event) => {
    setReplaySpeed(event.currentTarget.value);
  });
  syncReplaySpeedControl();
}

function updateReplayVehicleOverlay(occluder) {
  if (!_viewer || !_replayVehicleOverlay || !_selectedLaunchId) {
    hideReplayVehicleOverlay();
    return null;
  }
  const launch = _launches.find((item) => item.id === _selectedLaunchId);
  const track = _replayTracks.get(_selectedLaunchId);
  if (!launch || !track) {
    hideReplayVehicleOverlay();
    return null;
  }
  const replayActive = _replayCameraLaunchId === launch.id;
  const state = track.getReplayState();
  const mode = replayOverlayMode({
    replayActive,
    ascending: state.ascending,
    countdownActive: state.countdownActive,
    preCountdownActive: state.preCountdownActive,
  });
  if (!mode) {
    track.lastOverlayWindowPosition = null;
    track.lastOverlayMode = null;
    hideReplayVehicleOverlay();
    return null;
  }
  const path = state.ascending
    ? track.ascentPath
    : track.animatedOrbitPath;
  // Do not call scene.sampleHeight() from this post-render path. A selected
  // mission can remain visible from globe range, and a periodic remote height
  // probe forces Google Photorealistic 3D Tiles to reconsider its refinement
  // set even though the camera is stationary. That presented as a one-second
  // shrink/expand pulse across the globe. Replay follows its already-built,
  // surface-safe Cartesian path and therefore needs no runtime pad sampling.
  const position = samplePath(path, state.phaseProgress);
  if (!position || !occluder.isPointVisible(position)) {
    hideReplayVehicleOverlay();
    return null;
  }
  const windowPosition = Cesium.SceneTransforms.worldToWindowCoordinates(
    _viewer.scene,
    position,
  );
  if (!windowPosition) {
    hideReplayVehicleOverlay();
    return null;
  }
  const canvas = _viewer.scene.canvas;
  if (
    windowPosition.x < -80
    || windowPosition.y < -100
    || windowPosition.x > canvas.clientWidth + 80
    || windowPosition.y > canvas.clientHeight + 100
  ) {
    hideReplayVehicleOverlay();
    return null;
  }
  // The replay camera already targets this same frame-cached world position.
  // Applying a second temporal filter here made the DOM vehicle trail the
  // camera until the snap threshold was crossed, producing a repeating
  // forward/back jump. Keep smoothing only for the non-tracked close-up pad
  // marker, where the user can move the camera independently.
  const renderedWindowPosition = !replayActive && track.lastOverlayMode === mode
    ? smoothReplayWindowPosition(track.lastOverlayWindowPosition, windowPosition)
    : windowPosition;
  track.lastOverlayWindowPosition = renderedWindowPosition;
  track.lastOverlayMode = mode;
  _replayVehicleOverlay.hidden = false;
  _replayVehicleOverlay.dataset.mode = mode;
  _replayVehicleOverlay.classList.toggle(
    'is-thrusting',
    replayActive && state.ascending && !state.countdownActive,
  );
  _replayVehicleOverlay.classList.toggle('is-paused', replayActive && _replayPaused);
  _replayVehicleOverlay.style.transform = `translate3d(${renderedWindowPosition.x}px, ${renderedWindowPosition.y}px, 0) translate(-50%, -50%)`;
  let vehicleRotation = 0;
  if (replayActive && !state.countdownActive) {
    const tangentStep = Math.max(0.002, 0.8 / Math.max(2, path.length - 1));
    const forwardProgress = Math.min(1, state.phaseProgress + tangentStep);
    const backwardProgress = Math.max(0, state.phaseProgress - tangentStep);
    const useForward = forwardProgress > state.phaseProgress;
    const tangentPosition = samplePath(
      path,
      useForward ? forwardProgress : backwardProgress,
    );
    const tangentWindowPosition = tangentPosition
      ? Cesium.SceneTransforms.worldToWindowCoordinates(_viewer.scene, tangentPosition)
      : null;
    if (tangentWindowPosition) {
      const screenDelta = Math.hypot(
        tangentWindowPosition.x - windowPosition.x,
        tangentWindowPosition.y - windowPosition.y,
      );
      // When the path points almost directly into/out of the camera, its
      // screen projection has no trustworthy direction. Keep the last valid
      // path-facing pose instead of snapping the rocket to a camera-facing
      // upright orientation.
      if (screenDelta >= 2) {
        vehicleRotation = useForward
          ? replayVehicleScreenRotation(windowPosition, tangentWindowPosition)
          : replayVehicleScreenRotation(tangentWindowPosition, windowPosition);
        track.lastVehicleRotation = vehicleRotation;
      } else if (Number.isFinite(track.lastVehicleRotation)) {
        vehicleRotation = track.lastVehicleRotation;
      }
    }
  }
  _replayVehicleOverlay.style.setProperty(
    '--mission-replay-rotation',
    `${Cesium.Math.toDegrees(vehicleRotation)}deg`,
  );

  const mission = shortMissionLabel(launch.name, 22).toUpperCase();
  const siteName = compactLaunchSiteName(launch.launchSite);
  const siteCallout = siteName
    ? `LAUNCH SITE · ${shortMissionLabel(siteName, 20).toUpperCase()}`
    : 'LAUNCH SITE';
  let title = mission;
  let detail = siteCallout;
  if (mode === 'countdown') {
    title = `T−${String(state.countdownSeconds).padStart(2, '0')} · ${mission}`;
    detail = `LAUNCH STANDBY\n${siteCallout}`;
  } else if (mode === 'ascent') {
    title = state.elapsedSinceStart < 1
      ? `LIFTOFF · ${mission}`
      : `${launch.trajectory.length > 1 ? 'ASCENT REPLAY' : 'ASCENT ESTIMATE'} · ${mission}`;
    detail = formatMissionEventTime(state.eventTime);
  } else if (mode === 'recovery') {
    title = `STAGE RE-ENTRY / RECOVERY · ${mission}`;
    detail = formatMissionEventTime(state.eventTime);
  } else if (mode === 'orbit') {
    title = `ORBIT REPLAY · ${mission}`;
    detail = formatMissionEventTime(state.eventTime);
  }
  if (_replayPaused) title = `PAUSED · ${title}`;
  const nextText = `${title}\n${detail}`;
  if (nextText !== _replayVehicleOverlayText) {
    _replayVehicleOverlayText = nextText;
    _replayVehicleOverlay.querySelector('[data-replay-overlay-title]').textContent = title;
    _replayVehicleOverlay.querySelector('[data-replay-overlay-detail]').textContent = detail;
  }
  return mode;
}

function setGraphicVisibility(graphic, visible, time) {
  if (!graphic) return;
  const next = Boolean(visible);
  const current = graphic.show?.getValue?.(time);
  if (current !== next) graphic.show = next;
}

function updateMissionFrame() {
  if (!_enabled || !_viewer || !_dataSource?.show) {
    hideReplayVehicleOverlay();
    return;
  }
  updateMissionTelemetry();
  const time = Cesium.JulianDate.now(_declutterTime);
  _declutterOccluder.cameraPosition = _viewer.scene.camera.positionWC;
  updateReplayVehicleOverlay(_declutterOccluder);
  refreshSelectedMissionOverlayText();
  for (const entity of _dataSource.entities.values) {
    if (!entity.show) continue;
    if (!entity.position) continue;
    const id = entityLaunchId(entity);
    if (!id) continue;
    const position = entity.position.getValue(time);
    let horizonVisible = Boolean(position && _declutterOccluder.isPointVisible(position));
    const launchAnchor = entity.id.startsWith('rocket-launch:');
    if (launchAnchor) {
      horizonVisible = missionAnchorVisible(
        _viewer.scene.camera.positionWC,
        position,
        id,
        _selectedLaunchId,
      );
      // Keep entity.show reserved for mission-selection isolation. Horizon
      // state is applied to the individual graphics below so a rear-side
      // anchor remains eligible for reevaluation as the camera moves.
    }
    if (entity.point) {
      setGraphicVisibility(entity.point, horizonVisible, time);
    }
    if (launchAnchor && entity.billboard) {
      setGraphicVisibility(
        entity.billboard,
        horizonVisible && id === _hoveredRosterLaunchId,
        time,
      );
    }
  }
}

/**
 * Select a stable marker color from the mission operator and payload name.
 * Labels stay cyan so the layer remains visually coherent.
 * @param {object} launch Normalized launch record.
 * @returns {Cesium.Color}
 */
export function missionMarkerColor(launch) {
  const identity = `${launch.provider || ''} ${launch.name || ''} ${launch.missionName || ''}`.toLowerCase();
  if (/nasa|national aeronautics/.test(identity)) return Cesium.Color.fromCssColorString('#ff9f43');
  if (/starlink|spacex|space exploration/.test(identity)) return Cesium.Color.fromCssColorString('#4cc9f0');
  if (/rocket lab/.test(identity)) return Cesium.Color.fromCssColorString('#7bed9f');
  if (/isro|indian space/.test(identity)) return Cesium.Color.fromCssColorString('#ff66c4');
  if (/cnsa|china national|long march/.test(identity)) return Cesium.Color.fromCssColorString('#ffd166');
  if (/blue origin/.test(identity)) return Cesium.Color.fromCssColorString('#a78bfa');
  if (/ula|united launch alliance/.test(identity)) return Cesium.Color.fromCssColorString('#f97316');
  if (/arianespace|esa|european space/.test(identity)) return Cesium.Color.fromCssColorString('#60a5fa');
  if (launch.provider) return Cesium.Color.fromCssColorString('#c084fc');
  return Cesium.Color.fromCssColorString('#22e6e6');
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
      name: launch.name || 'Unnamed launch',
      status: launch.status?.name || 'Unknown',
      launchTime: Number.isFinite(date) ? new Date(date).toISOString() : null,
      launchSite: pad.name || location.name || 'Unknown launch site',
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

function addLaunchEntity(launch, activeTleText = _activeTleText) {
  const position = Cesium.Cartesian3.fromDegrees(launch.lon, launch.lat);
  const overlayRecord = {
    launch,
    anchorPosition: position,
    elementEntryFactories: [],
    liveEventTime: null,
  };
  _missionOverlayRecords.set(launch.id, overlayRecord);
  const orbitAllowed = launchStatusAllowsOrbit(launch.status);
  const coreTrack = orbitAllowed && launch.satelliteQuery
    ? getSatelliteOrbitTrack(launch.satelliteQuery, { launchTime: launch.launchTime })
    : null;
  const satelliteTrack = coreTrack || (orbitAllowed && activeTleText && launch.satelliteQuery
    ? findSatelliteOrbitTrackInTle(
      activeTleText,
      launch.satelliteQuery,
      { launchTime: launch.launchTime },
    )
    : null);
  const orbitPath = !orbitAllowed
    ? null
    : satelliteTrack?.orbitPath?.length > 1
      ? satelliteTrack.orbitPath
      : approximateOrbitPath(launch);
  launch.recoveryStages.forEach((stage) => {
    stage.endpoint = landingEndpoint(stage, launch, orbitPath?.[0] || null);
  });
  if (satelliteTrack) _orbitMatches++;
  const entity = _dataSource.entities.add({
    id: `rocket-launch:${launch.id}`,
    position,
    point: {
      pixelSize: 5,
      color: missionMarkerColor(launch),
      outlineColor: missionMarkerColor(launch),
      outlineWidth: 0,
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
    },
    billboard: {
      image: missionHoverReticleImage(),
      width: 24,
      height: 24,
      show: false,
      horizontalOrigin: Cesium.HorizontalOrigin.CENTER,
      verticalOrigin: Cesium.VerticalOrigin.CENTER,
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
    },
    properties: {
      launchId: launch.id,
      launchName: launch.name,
      launchTime: launch.launchTime,
      launchSite: launch.launchSite,
      provider: launch.provider,
      mission: launch.mission,
      status: launch.status,
      source: launch.source,
      orbit: JSON.stringify(launch.orbit || {}),
      satelliteName: satelliteTrack?.name || '',
      noradId: satelliteTrack?.noradId || '',
    },
  });
  const points = launch.trajectory
    .filter((point) => Number.isFinite(Number(point.latitude)) && Number.isFinite(Number(point.longitude)))
    .map((point) => ({
      stage: String(point.stage || point.stage_name || point.phase || point.stageName || 'trajectory'),
      position: Cesium.Cartesian3.fromDegrees(Number(point.longitude), Number(point.latitude), Number(point.altitude || 0)),
    }));
  if (points.length > 1) {
    const segments = [];
    points.forEach((point) => {
      const previous = segments.at(-1);
      if (!previous || previous.stage !== point.stage) segments.push({ stage: point.stage, positions: [] });
      segments.at(-1).positions.push(point.position);
    });
    segments.forEach((segment, index) => {
      if (segment.positions.length < 2) return;
      _dataSource.entities.add({
        id: `rocket-trajectory:${launch.id}:${index}`,
        polyline: {
          positions: surfaceSafePath(segment.positions),
          width: 2,
          material: Cesium.Color.fromCssColorString(TRAJECTORY_STAGE_COLORS[index % TRAJECTORY_STAGE_COLORS.length]).withAlpha(0.8),
          clampToGround: false,
          arcType: Cesium.ArcType.NONE,
        },
        properties: { launchId: launch.id, stage: segment.stage, source: launch.source },
      });
    });
  }
  if (orbitPath?.length > 1) {
    const orbitCurrent = satelliteTrack?.current || { longitude: launch.lon, latitude: launch.lat, altitude: 0 };
    const orbitPeriodSec = satelliteTrack?.periodSec || estimatedOrbitPeriodSeconds(orbitPath);
    const launchEpochMs = Date.parse(launch.launchTime);
    const disclosedInsertionOffsetSec = orbitInsertionOffsetSeconds(launch);
    const insertionDurationSec = Number.isFinite(disclosedInsertionOffsetSec)
      ? Math.max(0, disclosedInsertionOffsetSec)
      : 600;
    const insertionEpochMs = Number.isFinite(launchEpochMs)
      ? launchEpochMs + insertionDurationSec * 1000
      : Number.NaN;
    let insertionReference = points.at(-1)?.position || null;
    if (!insertionReference && satelliteTrack?.positionAt && Number.isFinite(insertionEpochMs)) {
      const propagatedInsertion = satelliteTrack.positionAt(new Date(insertionEpochMs));
      if (propagatedInsertion) {
        insertionReference = Cesium.Cartesian3.fromDegrees(
          propagatedInsertion.longitude,
          propagatedInsertion.latitude,
          propagatedInsertion.altitude,
        );
      }
    }
    if (!insertionReference && !satelliteTrack) {
      // A projected orbit has no authoritative historical phase. Start its
      // plane over the launch site, advance only by the estimated powered
      // ascent duration, and join the forward orbit tangent. Using the UTC
      // epoch as phase sent some ascents toward the far side of Earth and
      // forced a visible 180-degree corrective hook before insertion.
      const insertionProgress = Cesium.Math.clamp(
        insertionDurationSec / orbitPeriodSec,
        1 / 96,
        0.16,
      );
      insertionReference = samplePath(orbitPath, insertionProgress);
    }
    const { ascentPath, animatedOrbitPath } = buildMissionPaths(
      position,
      points.map((point) => point.position),
      orbitPath,
      insertionReference,
    );
    const ascentDurationSec = replayAscentDurationSeconds(launch, ascentPath);
    // Cesium can evaluate CallbackProperty values multiple times while it
    // traverses one frame. Camera tracking and the HTML replay overlay must
    // use the exact same replay epoch as those callbacks; sampling Date.now()
    // independently made the vehicle advance relative to the camera and then
    // snap back on the next frame.
    let replayStateForFrame = null;
    const sampleReplayState = () => replayState(
      launch,
      _animationStarts.get(launch.id) || Date.now(),
      ascentDurationSec,
      REPLAY_ORBIT_DURATION_SEC,
      orbitPeriodSec,
      _replaySpeed,
      replayClockNow(launch.id),
      REPLAY_TILE_SETTLE_DELAY_SEC,
      _replayCameraLaunchId !== launch.id,
    );
    // preUpdate runs before Cesium evaluates entity CallbackProperties. Seed
    // one state there and retain it through postRender so every consumer in
    // that traversal sees the same timestamp. scene.frameState.frameNumber is
    // advanced between some of those phases, so it is not a reliable cache key.
    const beginReplayFrame = () => {
      replayStateForFrame = sampleReplayState();
      return replayStateForFrame;
    };
    const getReplayState = () => {
      if (!replayStateForFrame) {
        replayStateForFrame = sampleReplayState();
      }
      return replayStateForFrame;
    };
    launch.recoveryStages.forEach((stage, stageIndex) => {
      stage.endpoint = landingEndpoint(stage, launch, ascentPath.at(-1));
      const path = stageReentryRecoveryPath(ascentPath, stage.endpoint, stageIndex, launch.recoveryStages.length);
      if (path.length < 2) return;
      const reentryIndex = atmosphericReentryIndex(path);
      const reentryPath = path.slice(reentryIndex);
      const color = Cesium.Color.fromCssColorString(
        TRAJECTORY_STAGE_COLORS[(stageIndex + 1) % TRAJECTORY_STAGE_COLORS.length],
      );
      _dataSource.entities.add({
        id: `rocket-reentry-recovery:${launch.id}:${stageIndex}`,
        polyline: {
          positions: path,
          width: 2,
          material: new Cesium.PolylineDashMaterialProperty({
            color: color.withAlpha(0.82),
            dashLength: 12,
            dashPattern: 0xAAAA,
          }),
          arcType: Cesium.ArcType.NONE,
        },
        properties: {
          launchId: launch.id,
          stageId: stage.id,
          phase: 'STAGE_REENTRY_RECOVERY',
          accuracy: stage.endpoint.accuracy,
          source: launch.source,
        },
      });
      if (reentryPath.length > 1) {
        _dataSource.entities.add({
          id: `rocket-reentry:${launch.id}:${stageIndex}`,
          polyline: {
            positions: reentryPath,
            width: 2.5,
            material: new Cesium.PolylineDashMaterialProperty({
              color: Cesium.Color.fromCssColorString('#ffd166').withAlpha(0.9),
              dashLength: 8,
              dashPattern: 0xF0F0,
            }),
            arcType: Cesium.ArcType.NONE,
          },
          properties: {
            launchId: launch.id,
            stageId: stage.id,
            phase: 'ATMOSPHERIC_REENTRY',
            altitudeM: STAGE_REENTRY_ALTITUDE_M,
            source: 'Estimated 100 km atmospheric interface',
          },
        });
        const reentryPosition = path[reentryIndex];
        overlayRecord.elementEntryFactories.push(() => (
          createRocketMissionElementOverlayEntry({
            id: `reentry:${launch.id}:${stageIndex}`,
            position: reentryPosition,
            text: 'STAGE RE-ENTRY',
            accent: '#ffd166',
            priority: 700_000 - stageIndex,
            gapPx: 8,
          })
        ));
      }
      _dataSource.entities.add({
        id: `rocket-recovery-end:${launch.id}:${stageIndex}`,
        position: path.at(-1),
        point: {
          pixelSize: 4,
          color,
          outlineWidth: 0,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
        properties: {
          launchId: launch.id,
          stageId: stage.id,
          phase: 'RECOVERY_ENDPOINT',
          source: launch.source,
        },
      });
    });
    _replayTracks.set(launch.id, {
      ascentPath,
      animatedOrbitPath,
      orbitFrameSphere: replayOrbitFrameSphere(animatedOrbitPath),
      ascentDurationSec,
      beginReplayFrame,
      getReplayState,
      lastCameraHeading: Math.PI,
      orbitCameraWorldFrame: false,
      lastVehicleRotation: 0,
      lastOverlayWindowPosition: null,
      lastOverlayMode: null,
    });
    let livePosition = Cesium.Cartesian3.fromDegrees(
      orbitCurrent.longitude,
      orbitCurrent.latitude,
      orbitCurrent.altitude,
    );
    const liveTime = new Date();
    const liveTelemetry = { speedMps: null };
    _satelliteTelemetry.set(launch.id, liveTelemetry);
    let liveFrameNumber = -1;
    const fallbackPeriodSec = estimatedOrbitPeriodSeconds(orbitPath);
    const updateLiveState = () => {
      const frameNumber = _viewer?.scene?.frameState?.frameNumber ?? -1;
      if (frameNumber !== -1 && frameNumber === liveFrameNumber) return;
      liveFrameNumber = frameNumber;
      const nowMs = Date.now();
      liveTime.setTime(nowMs);
      if (satelliteTrack) {
        const propagated = satelliteTrack.positionAt?.(liveTime) || satelliteTrack.current;
        if (propagated) {
          Cesium.Cartesian3.fromDegrees(
            propagated.longitude,
            propagated.latitude,
            propagated.altitude,
            undefined,
            livePosition,
          );
          liveTelemetry.speedMps = Number.isFinite(propagated.speedMps)
            ? propagated.speedMps
            : null;
        }
      } else {
        // In-place write keeps one Cartesian3 for the mission's lifetime —
        // the estimated branch previously reallocated per propagation.
        livePosition = samplePath(
          orbitPath,
          orbitProgressAtTime(nowMs, fallbackPeriodSec),
          livePosition,
        ) || livePosition;
      }
    };
    _dataSource.entities.add({
      id: `rocket-satellite:${launch.id}`,
      position: new Cesium.CallbackProperty(() => {
        updateLiveState();
        return livePosition;
      }, false),
      point: {
        pixelSize: 6,
        color: Cesium.Color.fromCssColorString(satelliteTrack ? '#7bed9f' : '#ffd166'),
        outlineWidth: 0,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      },
      properties: {
        launchId: launch.id,
        noradId: satelliteTrack?.noradId || '',
        phase: satelliteTrack ? 'CURRENT_SATELLITE_POSITION' : 'ESTIMATED_ORBIT_POSITION',
        source: satelliteTrack ? 'Satellites layer' : 'Approximate mission orbit',
      },
    });
    overlayRecord.liveEventTime = () => liveTime;
    overlayRecord.elementEntryFactories.push(() => {
      const name = satelliteTrack
        ? shortMissionLabel(satelliteTrack.name, 22).toUpperCase()
        : 'EST. ORBIT POSITION';
      return createRocketMissionElementOverlayEntry({
        id: `payload-position:${launch.id}`,
        position: () => livePosition,
        text: `${name}\n${formatMissionEventTime(liveTime)}`,
        accent: satelliteTrack ? '#7bed9f' : '#ffd166',
        priority: 900_000,
        gapPx: 12,
      });
    });
    // Live satellite rings use a primitive collection so the core Satellite
    // GMST transform can rotate their baked ECEF geometry without rebuilding
    // it. Estimated launch-site-relative rings remain ordinary entities.
    const primitiveOrbitAdded = addMissionOrbitPrimitive(launch, orbitPath, satelliteTrack);
    if (!primitiveOrbitAdded) {
      _dataSource.entities.add({
        id: `rocket-orbit:${launch.id}`,
        polyline: {
          positions: orbitPath,
          // The 3 px canvas gives the periodic dot room to read as round; the
          // shader masks the ten intervening dashes down to a thin center stroke.
          width: 3,
          material: new MissionOrbitPatternMaterialProperty(
            Cesium.Color.fromCssColorString('#c084fc').withAlpha(0.95),
          ),
          arcType: Cesium.ArcType.NONE,
        },
        properties: {
          launchId: launch.id,
          satelliteName: '',
          noradId: '',
          source: 'Approximate mission orbit',
        },
      });
    }
    const orbitLabelBakePosition = ascentPath.at(-1);
    let orbitLabelPosition = orbitLabelBakePosition;
    const primitivePath = _missionOrbitPrimitives.get(launch.id);
    if (primitivePath) {
      primitivePath.labelBakePosition = orbitLabelBakePosition;
      primitivePath.labelPosition = Cesium.Matrix4.multiplyByPoint(
        primitivePath.primitive.modelMatrix,
        orbitLabelBakePosition,
        new Cesium.Cartesian3(),
      );
      orbitLabelPosition = () => primitivePath.labelPosition;
    }
    overlayRecord.elementEntryFactories.push(() => (
      createRocketMissionElementOverlayEntry({
        id: `orbit:${launch.id}`,
        position: orbitLabelPosition,
        text: satelliteTrack ? 'ORBIT' : 'PROJECTED ORBIT',
        accent: satelliteTrack ? '#22e6e6' : '#c084fc',
        priority: 800_000,
        gapPx: 8,
      })
    ));
    const replayPosition = new Cesium.CallbackProperty(() => {
      const state = getReplayState();
      return state.ascending
        ? samplePath(ascentPath, state.phaseProgress)
        : samplePath(animatedOrbitPath, state.phaseProgress);
    }, false);
    _dataSource.entities.add({
      id: `rocket-vehicle:${launch.id}`,
      position: replayPosition,
      properties: { launchId: launch.id, noradId: satelliteTrack?.noradId || '', phase: 'ASCENT_THEN_ORBIT', source: satelliteTrack ? 'Satellite trajectory animation' : 'Approximate trajectory animation' },
    });
    _dataSource.entities.add({
      id: `rocket-transfer:${launch.id}`,
      polyline: {
        positions: ascentPath,
        width: 1.5,
        // The animated vehicle uses Cartesian interpolation between these
        // exact samples. Prevent Cesium from replacing each segment with a
        // geodesic arc, which would visually separate the dot from the line.
        arcType: Cesium.ArcType.NONE,
        material: new Cesium.PolylineDashMaterialProperty({
          color: Cesium.Color.fromCssColorString('#7bed9f').withAlpha(0.8),
          dashLength: 24,
          dashPattern: 0xF0F0,
        }),
      },
      properties: {
        launchId: launch.id,
        phase: 'APPROXIMATE_TRANSFER',
        source: satelliteTrack
          ? 'Launch site to propagated insertion'
          : 'Launch site to forward projected insertion',
      },
    });
  }
}

function clearPostTleRetry() {
  if (_retryTimer) clearTimeout(_retryTimer);
  _retryTimer = null;
}

function schedulePostTleRetry(token) {
  if (_retryTimer || token !== _lifecycleToken || !shouldRetryAfterActiveTle({
    enabled: _enabled,
    retryCount: _postTleRetryCount,
    activeTleText: _activeTleText,
    renderedTleText: _renderedTleText,
  })) return;
  _postTleRetryCount++;
  _retryTimer = setTimeout(() => {
    _retryTimer = null;
    if (_enabled && token === _lifecycleToken) requestMissionUpdate();
  }, POST_TLE_RETRY_DELAY_MS);
}

function ensureActiveTleLookup(token) {
  if (_activeTleText) return Promise.resolve(_activeTleText);
  if (_activeTlePromise && _activeTlePromiseToken === token) return _activeTlePromise;
  const request = fetch('/api/celestrak/active')
    .then((activeResponse) => {
      if (!activeResponse.ok) throw new Error(`HTTP ${activeResponse.status}`);
      return activeResponse.text();
    })
    .then((text) => {
      if (!_enabled || token !== _lifecycleToken) return null;
      _activeTleText = text;
      _focusAfterActiveLookup = Boolean(_selectedLaunchId);
      schedulePostTleRetry(token);
      return text;
    })
    .catch((error) => {
      if (_enabled && token === _lifecycleToken) {
        console.warn('[Data:RocketLaunches] Active satellite lookup unavailable:', error.message);
      }
      return null;
    })
    .finally(() => {
      if (_activeTlePromise === request) {
        _activeTlePromise = null;
        _activeTlePromiseToken = 0;
      }
    });
  _activeTlePromise = request;
  _activeTlePromiseToken = token;
  return request;
}

async function captureSatelliteDependency() {
  if (!_dataManager || _satelliteStateBeforeMission) return;
  _satelliteStateBeforeMission = {
    // Effective visibility: a user enable still mid-activation is intent ON —
    // capturing settled false would restore the user's enable away on exit.
    enabled: _dataManager.isEffectivelyEnabled?.('satellites')
      ?? _dataManager.isEnabled('satellites'),
    params: satelliteParamsAfterSpaceMissions(
      _dataManager.getLayerParams('satellites'),
    ),
  };
  _dataManager.setLayerParams(
    'satellites',
    satelliteParamsForSpaceMissions(_satelliteStateBeforeMission.params),
  );
  const token = _lifecycleToken;
  const activation = Promise.resolve(_dataManager.setEnabled('satellites', true));
  _satelliteActivationPromise = activation;
  try {
    const activated = await activation;
    // Space Missions without its satellite dependency is a broken replay
    // surface; fail the mission enable so the manager's fail-closed path and
    // the Context rollback see an honest failure instead of a silent success.
    if (
      token === _lifecycleToken
      && _enabled
      && (activated === false || !_dataManager.isEnabled('satellites'))
    ) {
      throw new Error('Space Missions requires the satellites layer, which failed to start');
    }
  } finally {
    if (token === _lifecycleToken && _satelliteActivationPromise === activation) {
      _satelliteActivationPromise = null;
    }
  }
}

async function restoreSatelliteDependency() {
  const snapshot = _satelliteStateBeforeMission;
  if (!snapshot || !_dataManager) return;
  _satelliteStateBeforeMission = null;
  _satelliteActivationPromise = null;
  _dataManager.setLayerParams(
    'satellites',
    satelliteParamsAfterSpaceMissions(snapshot.params),
  );
  const restored = await _dataManager.setEnabled('satellites', snapshot.enabled);
  if (
    restored === false
    || _dataManager.isEnabled('satellites') !== snapshot.enabled
  ) {
    throw new Error('Space Missions could not restore the satellites layer');
  }
}

async function performMissionUpdate(token) {
  try {
    ensureActiveTleLookup(token);
    const response = await fetch(API_URL);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const launches = normalizeRocketLaunches(await response.json());
    if (!_enabled || token !== _lifecycleToken || !_dataSource) return;
    const activeTleText = _activeTleText;
    if (_replayCameraLaunchId) stopMissionReplay();
    _launches = launches;
    removeMissionOrbitPrimitives();
    _dataSource.entities.removeAll();
    _missionOverlayRecords.clear();
    _satelliteTelemetry.clear();
    _replayTracks.clear();
    _orbitMatches = 0;
    launches.forEach((launch) => addLaunchEntity(launch, activeTleText));
    _renderedTleText = activeTleText;
    if (_renderedTleText === _activeTleText) clearPostTleRetry();
    _count = launches.length;
    renderMissionRoster();
    if (!_selectedLaunchId || !launches.some((launch) => launch.id === _selectedLaunchId)) {
      setSelectedMission(null, false);
    } else {
      setSelectedMission(_selectedLaunchId, true);
      if (_focusAfterActiveLookup) {
        focusMission(launches.find((launch) => launch.id === _selectedLaunchId));
      }
    }
    _focusAfterActiveLookup = false;
    renderMissionPanel();
    _lastUpdate = Date.now();
    _lastError = null;
  } catch (error) {
    if (_enabled && token === _lifecycleToken) {
      _lastError = error.message;
      console.warn('[Data:RocketLaunches] Fetch error:', error);
    }
  }
}

function requestMissionUpdate() {
  if (!_enabled) return Promise.resolve();
  const token = _lifecycleToken;
  _updateDirty = true;
  if (_updatePromise && _updatePromiseToken === token) return _updatePromise;
  let request;
  request = (async () => {
    while (_enabled && token === _lifecycleToken && _updateDirty) {
      _updateDirty = false;
      await performMissionUpdate(token);
    }
  })().finally(() => {
    if (_updatePromise === request) {
      _updatePromise = null;
      _updatePromiseToken = 0;
    }
  });
  _updatePromise = request;
  _updatePromiseToken = token;
  return request;
}

const rocketLaunchesLayer = {
  ...LAYER_METADATA['rocket-launches'],
  updateInterval: 300000,

  init(viewer) {
    _viewer = viewer;
    _enabled = false;
    createMissionPanel();
    createReplayVehicleOverlay();
    _dataSource = new Cesium.CustomDataSource('rocket-launches');
    _dataSource.show = false;
    viewer.dataSources.add(_dataSource);
    _count = 0;
    _lastUpdate = null;
    _lastError = null;
    _orbitMatches = 0;
    clearMissionOverlaySources();
    _clickHandler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
    _clickHandler.setInputAction((movement) => {
      if (!_enabled || !_dataSource?.show) return;
      const entity = viewer.scene.drillPick(movement.position, 12)
        .map((picked) => picked?.id)
        .find((candidate) => entityLaunchId(candidate));
      const launchId = entityLaunchId(entity);
      if (!launchId) return;
      setSelectedMission(launchId);
      focusMission(_launches.find((launch) => launch.id === launchId));
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
    _moveHandler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
    _moveHandler.setInputAction((movement) => {
      if (!_enabled || !_dataSource?.show) return;
      const missionEntity = viewer.scene.drillPick(movement.endPosition, 12)
        .map((picked) => picked?.id)
        .find((candidate) => entityLaunchId(candidate));
      viewer.scene.canvas.style.cursor = missionEntity ? 'pointer' : '';
    }, Cesium.ScreenSpaceEventType.MOUSE_MOVE);
    // Apply horizon visibility before Cesium traverses and picks the scene.
    // A postRender write is one frame late and can remain visibly stale when
    // request-on-demand rendering stops after a globe camera move.
    _declutterHandler = viewer.scene.preRender.addEventListener(updateMissionFrame);
    initLaunchPadZonePrimitive();
  },

  async enable() {
    _enabled = true;
    holdContinuousRender('rocket-launches'); // per-frame animator (perf wave 2)
    _lifecycleToken++;
    _postTleRetryCount = 0;
    try {
      await this._enableBody();
    } catch (error) {
      // Enable is a transaction: a failed dependency must not leave mission
      // UI/datasource visible or the satellite snapshot retained (a retained
      // snapshot makes the next enable skip dependency capture entirely).
      try {
        await this.disable();
      } catch (cleanupError) {
        console.warn('[Missions] enable rollback failed:', cleanupError);
      }
      throw error;
    }
  },
  async _enableBody() {
    _updateDirty = false;
    if (_dataSource) _dataSource.show = true;
    syncMissionOrbitPrimitiveVisibility();
    focusFullGlobe(_viewer);
    document.getElementById('cockpit-context')?.setAttribute('hidden', '');
    if (_selectedLaunchId) setSelectedMission(_selectedLaunchId, _explicitSelection);
    else setSelectedMission(null, false);
    await captureSatelliteDependency();
  },
  async disable() {
    _enabled = false;
    releaseContinuousRender('rocket-launches');
    _lifecycleToken++;
    _updateDirty = false;
    clearPostTleRetry();
    clearMissionRosterHover();
    stopMissionReplay();
    stopMissionZoomAnchor();
    if (_dataSource) _dataSource.show = false;
    syncMissionOrbitPrimitiveVisibility();
    if (_viewer?.scene?.canvas) _viewer.scene.canvas.style.cursor = '';
    hideLaunchPadZone();
    hideReplayVehicleOverlay();
    _selectedLaunchId = null;
    clearMissionOverlaySources();
    await restoreSatelliteDependency();
    renderMissionPanel();
  },

  update() {
    return requestMissionUpdate();
  },

  /** Release only Space Mission camera ownership, preserving layer and selection state. */
  releaseCameraOwnership() {
    clearMissionRosterHover();
    stopMissionReplay();
    stopMissionZoomAnchor();
  },

  async destroy(viewer) {
    releaseContinuousRender('rocket-launches'); // direct-destroy path (perf wave 2 fix)
    _enabled = false;
    _lifecycleToken++;
    _updateDirty = false;
    await restoreSatelliteDependency();
    clearMissionRosterHover();
    stopMissionReplay();
    stopMissionZoomAnchor();
    clearPostTleRetry();
    if (_clickHandler) _clickHandler.destroy();
    _clickHandler = null;
    if (_moveHandler) _moveHandler.destroy();
    _moveHandler = null;
    if (_declutterHandler) _declutterHandler();
    _declutterHandler = null;
    destroyLaunchPadZonePrimitive();
    removeMissionOrbitPrimitives();
    clearMissionOverlaySources();
    destroyReplayVehicleOverlay();
    _launches = [];
    _missionOverlayRecords.clear();
    _animationStarts.clear();
    _satelliteTelemetry.clear();
    _replayTracks.clear();
    _missionPanel?.remove();
    _missionPanel = null;
    if (_missionRoster) {
      _missionRoster.onclick = null;
      _missionRoster.onmouseover = null;
      _missionRoster.onfocusin = null;
      _missionRoster.onmouseleave = null;
      _missionRoster.onfocusout = null;
    }
    _missionRoster = null;
    _viewer = null;
    if (_dataSource) viewer.dataSources.remove(_dataSource, true);
    _dataSource = null;
    _count = 0;
    _orbitMatches = 0;
    _lastUpdate = null;
    _activeTleText = null;
    _activeTlePromise = null;
    _activeTlePromiseToken = 0;
    _renderedTleText = null;
    _postTleRetryCount = 0;
    _satelliteStateBeforeMission = null;
    _satelliteActivationPromise = null;
    _dataManager = null;
  },

  getStats() { return { count: _count, orbitMatches: _orbitMatches, lastUpdate: _lastUpdate, error: _lastError }; },
  attachDataManager(dataManager) { _dataManager = dataManager; },
};

/** Test seam for real layer lifecycle coverage with a recording host. */
export function _setRocketMissionOverlayHostForTest(host = null) {
  _missionOverlayHost = host ? { ...DEFAULT_OVERLAY_HOST, ...host } : DEFAULT_OVERLAY_HOST;
}

/** Test seam that exercises the real selection/deselection path. */
export function _setSelectedRocketMissionForTest(launchId = null) {
  setSelectedMission(launchId, Boolean(launchId));
}

/**
 * Test seam for the mission-replay render-hold carve-out (perf wave 3).
 * Exercises the real startMissionReplay/stopMissionReplay functions — same
 * path the panel's REPLAY ASCENT/cancel buttons call — without needing a full
 * DOM-driven panel render just to reach them.
 * @param {string} launchId
 * @returns {boolean} Whatever startMissionReplay returns.
 */
export function _startMissionReplayForTest(launchId) {
  return startMissionReplay(launchId);
}

/** Test seam for the mission-replay render-hold carve-out (perf wave 3). */
export function _stopMissionReplayForTest() {
  stopMissionReplay();
}

export default rocketLaunchesLayer;
