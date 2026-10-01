export default {
  file: 'src/data/militaryAwareness.js',
  prefix: 'militaryAwareness',
  layerName: 'militaryAwarenessLayer',
  map: {
    militaryAwarenessPanel: 'ensurePanel hidePanel escapeHtml rowHtml navigationControlsHtml renderResults rotateAwarenessPages startAwarenessPageRotation stopAwarenessPageRotation',
    militaryAwarenessSources: 'sourceState collectSourceStates sourceRevision isSame summarizeInstallationViewport summarizeAwarenessCohortForNavigation contactsWindowFromSnapshot buildAwarenessContextSnapshot collectAircraftProximityWindow evaluateSubject',
    militaryAwarenessNavigation: 'focusNearbyTarget subjectKey normalizeContextId normalizedSubjectKey resetNavigationVisitedCycle _getAwarenessNavigationStateForTest selectKnownContextTarget requestFocus focusSubject focusCurrentSubject selectNavigationTargets currentTrackedFlightSubject alternativeFlightAvailable closestFlightWithinRadius findExpandedFlightTarget subjectCohortFeedUnknown canNavigateNext focusCompatibleHistory navigateHistory historySubjectItem historySourceItem navigationState',
    militaryAwarenessOverlay: 'ensureDirectionOverlay scheduleDirectionOverlayUpdate cancelDirectionOverlayUpdate updateDirectionOverlay clearVisual renderVisual',
    militaryAwarenessSubject: 'selectSubject resolveSubjectPosition collectionSubjectPosition resolveSubjectLabel refreshSelectedSubject subjectFromContext markSubjectEvicted clearAwarenessSubject cameraMotionSignature awarenessNeedsContinuousRender syncAwarenessRenderHold',
    militaryAwarenessDependencies: 'attachRuntimeListeners detachRuntimeListeners releaseAircraftTracking refreshAfterDeferredDependency enableDependencies releaseOwnedDependencies activateOperationalContext closestToCurrentView focusAttentionTarget',
  },
  layerMethods: {
    init: { fn: 'initAwarenessLayer', mod: 'militaryAwarenessLifecycle' },
    enable: { fn: 'enableAwarenessLayer', mod: 'militaryAwarenessLifecycle' },
    disable: { fn: 'disableAwarenessLayer', mod: 'militaryAwarenessLifecycle' },
    getContextSnapshot: { fn: 'getAwarenessContextSnapshot', mod: 'militaryAwarenessLifecycle' },
    releaseCameraOwnership: { fn: 'releaseAwarenessCameraOwnership', mod: 'militaryAwarenessLifecycle' },
  },
  headers: {},
};
