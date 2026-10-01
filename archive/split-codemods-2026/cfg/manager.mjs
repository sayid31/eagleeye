export default {
  file: 'src/data/manager.js',
  className: 'DataLayerManager',
  prefix: 'manager',
  parentKeeps: 'layerFeedState',
  mixins: {
    managerRegistration: { exportName: 'registrationMixin', methods: 'register registerForQa unregisterForQa _newEntry _registerLayer registerLazy _ensureModuleResolved finalizeRegistrations _moduleStats _normalizedStats', header: 'DataLayerManager registration: eager/lazy layer registration, module resolution and stats normalization.' },
    managerUpdate: { exportName: 'updateMixin', methods: '_invalidateRefresh _runPeriodicUpdate refreshLayer resolveLayerTrackingTarget _armUpdateLoop', header: 'DataLayerManager periodic update loop, manual refresh and tracking-target resolution.' },
    managerParams: { exportName: 'paramsMixin', methods: 'clearSelectedLayers restoreEnabledLayerIds waitForLayerSettled _reserveLayerParamsIntent _applyLayerParamsIntent setLayerParams cancelPendingLayerRestore adoptLayerParams adoptLayerVisibility restoreLayerState getLayerParams', header: 'DataLayerManager layer params, restore/adopt flows and bulk clear.' },
    managerLifecycleQueries: { exportName: 'lifecycleQueriesMixin', methods: 'destroyLayer destroyAll isEnabled getLayerLifecycleState getAll', header: 'DataLayerManager layer teardown and lifecycle state queries.' },
    managerDelegates: { exportName: 'delegatesMixin', methods: '_callLayerMethod callLayerMethod layerHasMethod getTrackedInfo stopTracking cancelPendingTrackingRestore refocusTrackedById clearSelection releaseCameraOwnership getContextSnapshot navigateNext focusTarget beginWorldJump endWorldJump searchNearby getLayerStatsRaw focusCamera subscribeLayer getLayerUIState endTuning getDetectableObjects getLayerDisplayName', header: 'DataLayerManager thin delegates to per-layer methods (tracking, focus, context, detection).' },
    managerSubscriptions: { exportName: 'subscriptionsMixin', methods: 'subscribe subscribeVisibilityRequests addVisibilityGuard subscribeBeforeDestroy _notifyListeners _notifyVisibilityRequest _visibilityBlockReason', header: 'DataLayerManager listener subscriptions, visibility guards and notification fan-out.' },
  },
  helpers: {},
};
