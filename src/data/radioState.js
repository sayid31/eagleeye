// Moved out of radio.js (radioState).

import * as Cesium from 'cesium';
import { DEFAULT_RADIO_FILTER, DEFAULT_RADIO_VOLUME, EMPTY_ACCEPTED_CATALOG_SNAPSHOT } from './radioConstants.js';

export const _radioEarthScreenCenter = new Cesium.Cartesian2();

export const _radioEarthToCenter = new Cesium.Cartesian3();

export const _listeners = new Set();

export const _playbackControlListeners = new Set();

/** Mutable layer state (formerly module-private `let` variables of radio.js). */
export const S = {
  _viewer: null,
  _dataSource: null,
  _enabled: false,
  _managerLifecyclePresentation: null,
  _loading: false,
  _stale: false,
  _degraded: false,
  _error: null,
  _updatedAt: null,
  _acceptedCatalogSnapshot: EMPTY_ACCEPTED_CATALOG_SNAPSHOT,
  _stations: [],
  _stationById: new Map(),
  _categories: [],
  _renderById: new Map(),
  _filter: DEFAULT_RADIO_FILTER,
  _selectedId: null,
  _selectedEntity: null,
  _selectionGeneration: 0,
  _selectionTimer: null,
  _radioCameraNavigationGeneration: 0,
  _radioCameraFlightSequence: 0,
  _activeRadioCameraFlight: null,
  _audio: null,
  _audioStationId: null,
  _audioState: 'stopped',
  _audioError: null,
  _userVolume: DEFAULT_RADIO_VOLUME,
  _tuningActive: false,
  _tuningStatic: false,
  _tuningAwaitingStationId: null,
  _tuningPreviewId: null,
  _tuningStartStationId: null,
  _tuningResolutionSnapshot: EMPTY_ACCEPTED_CATALOG_SNAPSHOT,
  _tuningStationById: new Map(),
  _tuningUnavailableStationId: null,
  _cancelledTuningPresentationStation: null,
  _tuningCameraNavigation: null,
  _tuningNoiseContext: null,
  _tuningNoiseSource: null,
  _tuningNoiseFilter: null,
  _tuningNoiseGain: null,
  _voiceDucked: false,
  _voiceRestoring: false,
  _voiceRestoreTimer: null,
  _volumeFadeFrame: null,
  _volumeTransitionGeneration: 0,
  _playGeneration: 0,
  _playAttemptSequence: 0,
  _activePlaybackAttempt: null,
  _playFallbackId: null,
  _playFallbackFocus: null,
  _playFallbackOrigin: 'programmatic',
  _playFallbackAttemptId: null,
  _clickHandler: null,
  _horizonTimer: null,
  _lastHorizonCameraPosition: null,
  _horizonScanCount: 0,
  _abortController: null,
  _requestGeneration: 0,
  _sessionGeneration: 0,
  _removeClusterListener: null,
  _overlayPublishTimer: null,
  _clusterOverlayIdentitySequence: 0,
  _clusterOverlayIdentities: [],
  _overlayDiagnostics: {
  entryCount: 0,
  selectedCount: 0,
  singletonTexts: [],
  singletonIds: [],
  clusterTexts: [],
  clusterIds: [],
  clusterMemberships: [],
},
};
