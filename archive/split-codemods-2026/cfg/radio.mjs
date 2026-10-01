export default {
  file: 'src/data/radio.js',
  prefix: 'radio',
  layerName: 'radioLayer',
  map: {
    radioPolicy: 'isNonGlobalRadioIpv4 isSafeRadioHttpsUrl isValidRadioDirectoryStation freezeRadioStation createAcceptedCatalogSnapshot getRadioAcceptedCatalogSnapshot',
    radioSelectors: 'resetRadioClusterOverlayIdentities selectedStation selectedPresentationStation visibleStations viewportRadioAnchor rankedVisibleStations captureRadioTuningResolutionSnapshot tuningResolutionStation getRadioUIState emitState subscribeToRadio subscribeToRadioPlaybackControls emitPlaybackControl',
    radioAudio: 'cancelRadioVolumeTransition audioEventBelongsToActiveAttempt installAudio stopTuningNoiseSource syncTuningNoiseGain installTuningNoise clearRadioTuningNoise',
    radioCamera: 'radioCameraState radioCameraNavigationAllowed radioGlobeRecenterPlan radioCameraNavigationIsCurrent cancelActiveRadioCameraFlight invalidateRadioCameraNavigation radioCameraNavigationOwnsSelection startRadioCameraFlight focusRadioNavigationTarget beginRadioCameraNavigation rotateRadioStationIntoView',
    radioTuning: 'getRadioTunerStations beginRadioTuning setRadioTuningStatic previewRadioTuningStation endRadioTuning cancelRadioTuning commitRadioTuningStation tryRadioFallback recordDirectoryClick',
    radioPlayback: 'playSelectedRadio confirmRadioPlayback playPreparedRadioForVoice stopRadioPlayback toggleRadioPlayback pauseRadioPlayback setRadioVolume setRadioParams getRadioParams setRadioVoiceDucking',
    radioSelection: 'updateSelectionEntity focusStation selectRadioStation cycleRadioStation selectRequestedRadioStation setRadioFilter',
    radioOverlay: 'clusterPointCollection publishRadioOverlayEntries scheduleRadioOverlayPublish updateRenderVisibility retainRadioClusterIdentitiesForStations reconcileStations installClusterStyling pickedRadioStationAt radioPresentationAllowed syncRadioLifecyclePresentation installInteraction removeInteraction',
  },
  layerMethods: {
    init: { fn: 'initRadioLayer', mod: 'radioLifecycle' },
    setLifecyclePresentation: { fn: 'setRadioLifecyclePresentation', mod: 'radioLifecycle' },
    disable: { fn: 'disableRadioLayer', mod: 'radioLifecycle' },
    getStats: { fn: 'getRadioStats', mod: 'radioLifecycle' },
    update: { fn: 'updateRadioLayer', mod: 'radioUpdate' },
  },
  headers: {},
};
