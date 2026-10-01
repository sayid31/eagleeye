export default {
  file: 'src/voice/gevActions.js',
  prefix: 'gevActions',
  layerName: null,
  parentKeeps: 'createGevActionRunner',
  map: {
    gevActionsNormalize: 'withContextModeVocabulary normalizeStackId normalizePanelId normalizeLayerId normalizeCockpitTargetLayer normalizeCockpitNavigationHints normalizeAircraftClassFilter normalizeContextMode normalizeCockpitAction normalizeStyle normalizeLocationId clampStr clampNumber cleanText layerTitle formatTrackedEntityLabel compassDir',
    gevActionsLayers: 'readLayerLifecycleSummary focusDataLayerRow setPanelOpen',
    gevActionsAnnotations: 'sanitizeAnnotationSpec annotateMap clearAnnotations',
    gevActionsCctv: 'controlCctv cctvVoiceFocusOutcome',
    gevActionsTracking: 'selectedCockpitTarget trackEntity stopAllTracking frameOverhead runManagedVoiceNavigation collectTrackedEntities',
    gevActionsCamera: 'controlScene installViewTargetPrewarm adjustCameraZoom nextIssPass haversineKm getViewTargetCartographic cameraViewSignature getViewTargetCartesian approximateCoordinateDistanceSq polygonCenter',
    gevActionsLocation: 'flyToRequestedLocation',
    gevActionsContext: 'getCurrentViewState getEntityContext aircraftProximityWindowForQuery centerMatchesSubject shouldScanVisibleEntities selectedEntityContext visibleEntityContexts insertNearestRecord getSceneContext logSlowContext summarizeEntity summarizeContextRecord propertyObject unwrapProperties compactProperties',
    gevActionsAnalyst: 'activeContactsWindow analystProviders runAnalystQuery',
  },
  layerMethods: {},
  headers: {},
};
