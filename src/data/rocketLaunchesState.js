// Moved out of rocketLaunches.js (rocketLaunchesState).

import * as Cesium from 'cesium';
import { DEFAULT_OVERLAY_HOST } from './rocketLaunchesConstants.js';

export const _animationStarts = new Map();

export const _satelliteTelemetry = new Map();

export const _replayTracks = new Map();

export const _missionOverlayRecords = new Map();

export const _missionOrbitPrimitives = new Map();

export const _declutterTime = new Cesium.JulianDate();

export const _declutterOccluder = new Cesium.EllipsoidalOccluder(
  Cesium.Ellipsoid.WGS84,
  new Cesium.Cartesian3(),
);

export const _missionRingDate = new Date(0);

export const _pathDistanceCache = new WeakMap();

/** Mutable layer state (formerly module-private `let` variables of rocketLaunches.js). */
export const S = {
  _dataSource: null,
  _count: 0,
  _lastUpdate: null,
  _lastError: null,
  _orbitMatches: 0,
  _clickHandler: null,
  _moveHandler: null,
  _viewer: null,
  _declutterHandler: null,
  _dataManager: null,
  _retryTimer: null,
  _postTleRetryCount: 0,
  _updatePromise: null,
  _updatePromiseToken: 0,
  _updateDirty: false,
  _lifecycleToken: 0,
  _enabled: false,
  _selectedLaunchId: null,
  _explicitSelection: false,
  _launches: [],
  _missionPanel: null,
  _missionRoster: null,
  _missionRosterHoverTimer: null,
  _hoveredRosterLaunchId: null,
  _missionHoverReticleImage: null,
  _replayVehicleOverlay: null,
  _replayVehicleOverlayText: '',
  _lastPanelTelemetryMs: 0,
  _lastMissionRingRotationMs: 0,
  _activeTleText: null,
  _activeTlePromise: null,
  _activeTlePromiseToken: 0,
  _renderedTleText: null,
  _focusAfterActiveLookup: false,
  _satelliteStateBeforeMission: null,
  _satelliteActivationPromise: null,
  _replayCameraRemover: null,
  _replayCameraLaunchId: null,
  _replayCameraToken: 0,
  _replayPaused: false,
  _replayPausedAtMs: null,
  _replaySpeed: 1,
  _missionOverlayHost: DEFAULT_OVERLAY_HOST,
  _selectedMissionOverlayTimeText: null,
  _missionZoomAnchorRemover: null,
  _missionZoomAnchorId: null,
  _launchPadZonePrimitive: null,
  _launchPadZoneRemover: null,
  _launchPadZoneLaunchId: null,
  _missionOrbitPatternRegistered: false,
};
