/**
 * Internet-radio station directory and direct-playback layer.
 *
 * Radio Browser supplies public-domain directory metadata through the local
 * `/api/radio/*` broker. Audio always travels directly from the broadcaster
 * to one active HTMLAudioElement after an explicit user action; GEV does not
 * proxy, cache, record, or redistribute streams.
 *
 * @module radio
 */

import { buildRadioCategories, buildRadioTunerBand, buildRadioTunerTicks, filterRadioStations, isEnglishRadioStation, normalizeRadioTag, radioCategoryColor, radioClusterBadgeText, radioClusterCategoryId, radioGlobeNeedsRecentering, radioGlobeRecenterHeight, radioRequestIsCurrent, radioSelectionBracketSvg, radioStationCameraPlan, radioStationCategoryId, radioStationIdFromPick, radioStationResolutionMatches, radioTunerCommitSlot, radioTunerPointerPosition, radioTunerSlot, radioTuningStaticShouldPlay, radioViewIsGlobal, rankRadioStationsForRequest, rankRadioStationsForViewport, stationMatchesRadioCategory } from './radioTunerMath.js';
import { createRadioClusterOverlayEntry, createRadioSelectedOverlayEntry, createRadioSingletonOverlayEntry, radioCameraPositionChanged, radioGlobeLabel, radioSingletonLabelLimit, reconcileRadioClusterCandidates, selectRadioClusterCandidates, selectRadioSingletonCandidates } from './radioOverlayEntries.js';
import { LAYER_METADATA } from './layerMetadata.js';
import { clearOverlaySource } from '../overlays/worldOverlay.js';
import { cancelRadioVolumeTransition } from './radioAudio.js';
import { DEFAULT_RADIO_FILTER, DEFAULT_RADIO_VOLUME, EMPTY_ACCEPTED_CATALOG_SNAPSHOT, RADIO_OVERLAY_SOURCE_ID } from './radioConstants.js';
import { disableRadioLayer, getRadioStats, initRadioLayer, setRadioLifecyclePresentation } from './radioLifecycle.js';
import { syncRadioLifecyclePresentation } from './radioOverlay.js';
import { getRadioParams, pauseRadioPlayback, playPreparedRadioForVoice, playSelectedRadio, setRadioParams, setRadioVoiceDucking, setRadioVolume, stopRadioPlayback, toggleRadioPlayback } from './radioPlayback.js';
import { getRadioAcceptedCatalogSnapshot } from './radioPolicy.js';
import { cycleRadioStation, selectRadioStation, selectRequestedRadioStation, setRadioFilter } from './radioSelection.js';
import { emitState, getRadioUIState, resetRadioClusterOverlayIdentities, subscribeToRadio, subscribeToRadioPlaybackControls } from './radioSelectors.js';
import { S, _listeners, _playbackControlListeners } from './radioState.js';
import { beginRadioTuning, cancelRadioTuning, commitRadioTuningStation, endRadioTuning, getRadioTunerStations, previewRadioTuningStation, setRadioTuningStatic } from './radioTuning.js';
import { updateRadioLayer } from './radioUpdate.js';

export { radioCameraNavigationAllowed } from './radioCamera.js';
export { DEFAULT_RADIO_FILTER, GLOBAL_RADIO_ALTITUDE_M, RADIO_CATEGORY_COLORS, RADIO_GLOBE_INTERACTION_MAX_DISTANCE_M, RADIO_GLOBE_RECENTER_MAX_HEIGHT_M, RADIO_OVERLAY_COHORT_LIMIT, RADIO_OVERLAY_SOURCE_ID, RADIO_OVERLAY_SOURCE_OPTIONS, RADIO_PREFIX, RADIO_SINGLETON_GLOBAL_LIMIT, RADIO_SINGLETON_MID_LIMIT, RADIO_SINGLETON_NEAR_LIMIT, RADIO_TUNER_DIRECTORY_LIMIT, RADIO_TUNER_STATION_LIMIT } from './radioConstants.js';
export { retainRadioClusterIdentitiesForStations } from './radioOverlay.js';
export { confirmRadioPlayback, getRadioParams, pauseRadioPlayback, playPreparedRadioForVoice, playSelectedRadio, setRadioParams, setRadioVoiceDucking, setRadioVolume, stopRadioPlayback, toggleRadioPlayback } from './radioPlayback.js';
export { getRadioAcceptedCatalogSnapshot } from './radioPolicy.js';
export { cycleRadioStation, selectRadioStation, selectRequestedRadioStation, setRadioFilter } from './radioSelection.js';
export { getRadioUIState, subscribeToRadio, subscribeToRadioPlaybackControls } from './radioSelectors.js';
export { beginRadioTuning, cancelRadioTuning, commitRadioTuningStation, endRadioTuning, getRadioTunerStations, previewRadioTuningStation, setRadioTuningStatic } from './radioTuning.js';

export {
  buildRadioCategories,
  buildRadioTunerBand,
  buildRadioTunerTicks,
  filterRadioStations,
  isEnglishRadioStation,
  normalizeRadioTag,
  radioCategoryColor,
  radioClusterBadgeText,
  radioClusterCategoryId,
  radioGlobeNeedsRecentering,
  radioGlobeRecenterHeight,
  radioRequestIsCurrent,
  radioSelectionBracketSvg,
  radioStationCameraPlan,
  radioStationCategoryId,
  radioStationIdFromPick,
  radioStationResolutionMatches,
  radioTunerCommitSlot,
  radioTunerPointerPosition,
  radioTunerSlot,
  radioTuningStaticShouldPlay,
  radioViewIsGlobal,
  rankRadioStationsForRequest,
  rankRadioStationsForViewport,
  stationMatchesRadioCategory,
};

export {
  createRadioClusterOverlayEntry,
  createRadioSelectedOverlayEntry,
  createRadioSingletonOverlayEntry,
  radioCameraPositionChanged,
  radioGlobeLabel,
  radioSingletonLabelLimit,
  reconcileRadioClusterCandidates,
  selectRadioClusterCandidates,
  selectRadioSingletonCandidates,
};

/** Radio layer lifecycle implementation. */
export const radioLayer = {
  ...LAYER_METADATA.radio,
  updateInterval: 45 * 60 * 1000,

  /** Initialize the Cesium data source and the single audio element. */
  init: initRadioLayer,

  /** Show stations. Enabling or preset restoration never starts audio. */
  enable() {
    S._enabled = true;
    syncRadioLifecyclePresentation();
    emitState();
  },

  /** Apply the manager-owned lifecycle gate to visible and pickable Radio state. */
  setLifecyclePresentation: setRadioLifecyclePresentation,

  /** Hide the layer and stop playback without forgetting the selected station. */
  disable: disableRadioLayer,

  /** Refresh directory metadata through the hardened same-origin broker. */
  update: updateRadioLayer,

  /** Release rendering, event, request, and playback resources. */
  destroy() {
    this.disable();
    cancelRadioVolumeTransition();
    S._voiceDucked = false;
    S._voiceRestoring = false;
    endRadioTuning();
    const closedTuningNoise = S._tuningNoiseContext?.close?.();
    if (closedTuningNoise?.catch) void closedTuningNoise.catch(() => {});
    S._tuningNoiseContext = null;
    if (S._audio) S._audio.volume = DEFAULT_RADIO_VOLUME;
    S._audio = null;
    S._userVolume = DEFAULT_RADIO_VOLUME;
    S._removeClusterListener?.();
    S._removeClusterListener = null;
    if (S._dataSource && S._viewer) S._viewer.dataSources.remove(S._dataSource, true);
    S._dataSource = null;
    clearOverlaySource(RADIO_OVERLAY_SOURCE_ID);
    S._stations = [];
    S._acceptedCatalogSnapshot = EMPTY_ACCEPTED_CATALOG_SNAPSHOT;
    S._stationById.clear();
    S._categories = Object.freeze([]);
    S._filter = DEFAULT_RADIO_FILTER;
    S._renderById.clear();
    resetRadioClusterOverlayIdentities();
    S._lastHorizonCameraPosition = null;
    S._horizonScanCount = 0;
    S._selectedId = null;
    S._tuningPreviewId = null;
    S._tuningStartStationId = null;
    S._tuningResolutionSnapshot = EMPTY_ACCEPTED_CATALOG_SNAPSHOT;
    S._tuningStationById = new Map();
    S._tuningUnavailableStationId = null;
    S._cancelledTuningPresentationStation = null;
    S._loading = false;
    S._stale = false;
    S._degraded = false;
    S._error = null;
    S._updatedAt = null;
    S._managerLifecyclePresentation = null;
    S._viewer = null;
    emitState();
    _listeners.clear();
    _playbackControlListeners.clear();
  },

  /** Layer statistics for HUD/debug surfaces. */
  getStats: getRadioStats,

  subscribe: subscribeToRadio,
  subscribePlaybackControls: subscribeToRadioPlaybackControls,
  getAcceptedCatalogSnapshot: getRadioAcceptedCatalogSnapshot,
  getUIState: getRadioUIState,
  getParams: getRadioParams,
  setParams: setRadioParams,
  getOverlayDiagnostics: () => ({
    ...S._overlayDiagnostics,
    singletonTexts: [...S._overlayDiagnostics.singletonTexts],
    singletonIds: [...S._overlayDiagnostics.singletonIds],
    clusterTexts: [...S._overlayDiagnostics.clusterTexts],
    clusterIds: [...S._overlayDiagnostics.clusterIds],
    clusterMemberships: S._overlayDiagnostics.clusterMemberships.map((entry) => ({ ...entry })),
  }),
  getTunerStations: getRadioTunerStations,
  beginTuning: beginRadioTuning,
  setTuningStatic: setRadioTuningStatic,
  previewTuningStation: previewRadioTuningStation,
  commitTuningStation: commitRadioTuningStation,
  cancelTuning: cancelRadioTuning,
  endTuning: endRadioTuning,
  setFilter: setRadioFilter,
  selectStation: selectRadioStation,
  selectRequestedStation: selectRequestedRadioStation,
  cycleStation: cycleRadioStation,
  togglePlayback: toggleRadioPlayback,
  play: playSelectedRadio,
  playForVoice: playPreparedRadioForVoice,
  pause: pauseRadioPlayback,
  stopPlayback: stopRadioPlayback,
  setVolume: setRadioVolume,
  setVoiceDucked: setRadioVoiceDucking,
};

export default radioLayer;
