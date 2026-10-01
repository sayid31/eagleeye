export default {
  file: 'src/cockpitViewController.js',
  className: 'CockpitViewController',
  prefix: 'cockpitViewController',
  parentKeeps: '',
  mixins: {
    cockpitViewControllerControls: { exportName: 'controlsMixin', methods: '_listen syncWeatherToggle readAircraftInfo dispatchCockpitModeChanged toggleTrackedTr3b syncTr3bToggle syncEntry navigateContext _adoptTrackedEntity setVisionMode cycleVisionMode clearPredictiveRoute onKeyDown', header: 'CockpitViewController controls: listeners, TR-3B toggle, vision mode, entity adoption and keys.' },
    cockpitViewControllerFrame: { exportName: 'frameMixin', methods: 'enter exit update', header: 'CockpitViewController enter/exit and the per-frame camera update.' },
    cockpitViewControllerHud: { exportName: 'hudMixin', methods: 'updateHud updateRoute updateContext scheduleContextLayout', header: 'CockpitViewController HUD, predictive route and context panel updates.' },
    cockpitViewControllerBrief: { exportName: 'briefMixin', methods: 'showBriefPage setBriefAutoRotate startBriefRotation stopBriefRotation updateLocalPosition maybeRefreshRegionalBrief renderRegionalBriefStatus renderRegionalBrief', header: 'CockpitViewController regional brief pages, rotation and refresh.' },
    cockpitViewControllerSignals: { exportName: 'signalsMixin', methods: 'renderCockpitSignals pushCockpitSignal updateCockpitSignals setContextCollapsed setSignalCollapsed syncContextLayout syncSignalLayout', header: 'CockpitViewController signal feed and context/signal panel layout.' },
  },
  helpers: {},
};
