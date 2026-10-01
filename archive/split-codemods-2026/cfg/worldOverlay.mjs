export default {
  file: 'src/overlays/worldOverlay.js',
  prefix: 'worldOverlayCore',
  layerName: null,
  parentKeeps: 'initWorldOverlay destroyWorldOverlay normalizeOverlayEntry',
  map: {
    worldOverlayCoreHelpers: 'nowMs compareProtectedCandidates comparePaintItems sortPooledRange zeroDemandEntry pruneKeyedIndex sourceActive invalidateHost inertPaintLaneHandle',
    worldOverlayCoreEntries: 'registerWorldOverlayPaintLane setOverlayEntries upsertOverlayEntry removeOverlayEntry clearOverlaySource setOverlaySourceVisible updateEntryDiagnostics getOverlayPaintRect hitTestWorldOverlay getWorldOverlayDiagnostics isOverlayPointVisible overlayRectIntersectsAny overlayRectIntersectsAnyHard leastOverlappingPlacement',
    worldOverlayCoreDom: 'ensureOverlayDom sizeCanvasSurface ensureCanvasSize refreshUiOccluders markLayoutDirty markOccludersDirty clearCanvasSurface clearCanvas activeEntryCount activeCustomPaintLaneCount activeFadeCount overlayHasPaintWork syncAccessibleActions',
    worldOverlayCoreProject: 'prepareProjectionMatrix prepareCustomPaintFrame getProjectionRecord resetFrameDomains snapshotAndProject collectFrameCandidates addPaintItem sourceCanPaint',
    worldOverlayCorePaint: 'solveDomains publishPaintRect paintCustomLane paintEntryItem paintFrame localizeScaledPlacement resetFrameDiagnostics drawWorldOverlay createDevFacade',
  },
  stateConsts: '_customPaintFrame _scratchViewProjection _viewProjectionScalars _uiOcclusionRects',
  layerMethods: {},
  headers: {},
};
