/**
 * Cockpit view/camera controller — extracted from ui.js as a standalone
 * class. This is a mechanical relocation, not a redesign: the class is
 * unchanged, only its file moved. See ui.js for how StyleManager wires it
 * (`new CockpitViewController(viewer, {...})`).
 *
 * Layer access is via the `getDataManager` facade callback (constructor
 * option), not direct layer-module imports — merged from the lazy-loading
 * refactor (feat/lazy-layers-splash-crash-fix). A lazy-registered layer may
 * not have a resolved module yet, so calls route through
 * `DataLayerManager`'s `getTrackedInfo`/`callLayerMethod`/`getContextSnapshot`
 * facade instead of a captured `flightsLayer`/`militaryFlightsLayer`/
 * `militaryAwarenessLayer` singleton.
 */
import * as Cesium from 'cesium';

import { controlsMixin } from './cockpitViewControllerControls.js';
import { frameMixin } from './cockpitViewControllerFrame.js';
import { hudMixin } from './cockpitViewControllerHud.js';
import { briefMixin } from './cockpitViewControllerBrief.js';
import { signalsMixin } from './cockpitViewControllerSignals.js';

export class CockpitViewController {
  constructor(viewer, {
    onVisionChange = null,
    onCameraTakeover = null,
    isEntryAllowed = null,
    onEntered = null,
    onExited = null,
    getInheritedVisionLabel = null,
    restoreTrackingFrame = null,
    getDataManager = null,
  } = {}) {
    this.viewer = viewer;
    // Reads the owning StyleManager's live `_dataManager` field rather than
    // capturing a snapshot — the controller is constructed before
    // attachDataManager() runs (see StyleManager constructor), so a captured
    // value would be permanently null. Facade calls (see file header), not
    // direct layer-module imports.
    this.getDataManager = typeof getDataManager === 'function' ? getDataManager : () => null;
    this.active = false;
    this.trackedEntity = null;
    this.trackedEntityWasShown = true;
    this.heading = null;
    this.lastFrameMs = 0;
    this.lastCameraUpdateMs = 0;
    this.lastHudUpdateMs = 0;
    this.lastContextUpdateMs = 0;
    this.lastGroundProbeMs = 0;
    this.contextNavigationDeadlineMs = 0;
    this.surfaceWaitStartedMs = 0;
    this.surfaceAcquiring = false;
    this.surfaceFallback = false;
    this.lastCompassSignature = '';
    this.entry = document.getElementById('cockpit-entry');
    this.tr3bToggle = document.getElementById('tr3b-toggle');
    this._tr3bSignature = null;
    this.mapViewButton = document.getElementById('map-view-switch');
    this.resetGlobeButton = document.getElementById('cockpit-reset-globe');
    this.hud = document.getElementById('cockpit-hud');
    this.entryFocusOrigin = null;
    this.callsign = document.getElementById('cockpit-callsign');
    this.speed = document.getElementById('cockpit-speed-value');
    this.speedRim = document.getElementById('cockpit-speed-rim');
    this.speedRimValue = document.getElementById('cockpit-speed-rim-value');
    this.speedRimTicks = Array.from(document.querySelectorAll('[data-speed-rim-tick]'));
    this.altitude = document.getElementById('cockpit-altitude-value');
    this.altitudeRim = document.getElementById('cockpit-altitude-rim');
    this.altitudeRimValue = document.getElementById('cockpit-altitude-rim-value');
    this.altitudeRimTicks = Array.from(document.querySelectorAll('[data-altitude-rim-tick]'));
    this.headingValue = document.getElementById('cockpit-heading-value');
    this.compassTape = document.getElementById('cockpit-compass-tape');
    this.clock = document.getElementById('cockpit-clock');
    this.position = document.getElementById('cockpit-position');
    this.aircraftMeta = document.getElementById('cockpit-aircraft-meta');
    this.route = document.getElementById('cockpit-route');
    this.routeFrom = document.getElementById('cockpit-route-from');
    this.routeTo = document.getElementById('cockpit-route-to');
    this.routeStatus = document.getElementById('cockpit-route-status');
    this.routeDirection = document.getElementById('cockpit-route-direction');
    this.routeDirectionLabel = document.getElementById('cockpit-route-direction-label');
    this.visionPrevious = document.getElementById('cockpit-vision-previous');
    this.visionCurrent = document.getElementById('cockpit-vision-current');
    this.visionCurrentLabel = document.getElementById('cockpit-vision-current-label');
    this.visionNext = document.getElementById('cockpit-vision-next');
    this.visionMode = 'optical';
    this.onVisionChange = onVisionChange;
    this.onCameraTakeover = onCameraTakeover;
    this.onEntered = onEntered;
    this.onExited = onExited;
    this.getInheritedVisionLabel = typeof getInheritedVisionLabel === 'function'
      ? getInheritedVisionLabel
      : () => 'NORMAL';
    this.restoreTrackingFrame = typeof restoreTrackingFrame === 'function'
      ? restoreTrackingFrame
      : () => false;
    this.isEntryAllowed = typeof isEntryAllowed === 'function' ? isEntryAllowed : () => true;
    this.context = document.getElementById('cockpit-context');
    this.contextSubject = document.getElementById('cockpit-context-subject');
    this.contextNearestLabel = document.getElementById('cockpit-context-nearest-label');
    this.contextBearing = document.getElementById('cockpit-context-bearing');
    this.contextDistance = document.getElementById('cockpit-context-distance');
    this.contextDirection = document.getElementById('cockpit-context-direction');
    this.contextUncertainty = document.getElementById('cockpit-context-uncertainty');
    this.contextUpdated = document.getElementById('cockpit-context-updated');
    this.contextCohorts = new Map(Array.from(document.querySelectorAll('[data-context-cohort]'))
      .map((element) => [element.dataset.contextCohort, element]));
    this.contextPrevious = document.getElementById('cockpit-context-previous');
    this.contextNext = document.getElementById('cockpit-context-next');
    this.contextToggle = document.getElementById('cockpit-context-toggle');
    this.weatherToggle = document.getElementById('cockpit-weather-toggle');
    this.weatherState = document.getElementById('cockpit-weather-state');
    this.contextCollapsed = false;
    this.signalStream = document.getElementById('cockpit-signal-stream');
    this.signalList = document.getElementById('cockpit-signal-list');
    this.signalToggle = document.getElementById('cockpit-signal-toggle');
    this.briefKicker = document.getElementById('cockpit-brief-kicker');
    this.briefSubtitle = document.getElementById('cockpit-brief-subtitle');
    this.briefPrevious = document.getElementById('cockpit-brief-previous');
    this.briefNext = document.getElementById('cockpit-brief-next');
    this.briefAutoToggle = document.getElementById('cockpit-brief-auto');
    this.briefPosition = document.getElementById('cockpit-brief-position');
    this.briefSource = document.getElementById('cockpit-brief-source');
    this.briefPages = Array.from(document.querySelectorAll('[data-cockpit-brief-page]'));
    this.briefTabs = Array.from(document.querySelectorAll('[data-cockpit-brief-index]'));
    this.newsStatus = document.getElementById('cockpit-news-status');
    this.newsList = document.getElementById('cockpit-news-list');
    this.localPlace = document.getElementById('cockpit-local-place');
    this.localCoordinates = document.getElementById('cockpit-local-coordinates');
    this.localTemperature = document.getElementById('cockpit-local-temperature');
    this.localWind = document.getElementById('cockpit-local-wind');
    this.localWindDirection = document.getElementById('cockpit-local-wind-direction');
    this.localCondition = document.getElementById('cockpit-local-condition');
    this.localCloud = document.getElementById('cockpit-local-cloud');
    this.localPrecipitation = document.getElementById('cockpit-local-precipitation');
    this.signalCollapsed = false;
    this.signalUserCollapsed = false;
    this.signalItems = [];
    this.signalSignatures = new Map();
    this.briefPageIndex = 0;
    this.briefAutoRotateEnabled = false;
    this.briefTimer = null;
    this.lastAircraftInfo = null;
    this.regionalBrief = null;
    this.regionalBriefAnchor = null;
    this.regionalBriefFetchedAt = 0;
    this.regionalBriefAbort = null;
    this.regionalBriefRequestToken = 0;
    this.regionalBriefSubjectId = null;
    this.contextLayoutFrame = null;
    this.contextLayoutStamp = null;
    this.scratchTarget = new Cesium.Cartesian3();
    this.cockpitAnchor = new Cesium.Cartesian3();
    this.cockpitAnchorValid = false;
    this.scratchCamera = new Cesium.Cartesian3();
    this.scratchAdvance = new Cesium.Cartesian3();
    this.scratchCorrection = new Cesium.Cartesian3();
    this.scratchForward = new Cesium.Cartesian3();
    this.scratchHorizontal = new Cesium.Cartesian3();
    this.scratchUp = new Cesium.Cartesian3();
    this.scratchLocal = new Cesium.Cartesian3();
    this.scratchEnu = new Cesium.Matrix4();
    this.scratchAnchorCartographic = new Cesium.Cartographic();
    this.scratchCameraCartographic = new Cesium.Cartographic();
    this.scratchTargetCartographic = new Cesium.Cartographic();
    this._listenerRemovers = [];

    // Camera mutations belong before scene update/culling. Changing the camera
    // from preRender makes 3D Tiles discover a new view after traversal and can
    // create a self-sustaining refinement loop under a moving cockpit camera.
    this._listenerRemovers.push(
      viewer.scene.preUpdate.addEventListener(() => this.update()),
      viewer.trackedEntityChanged.addEventListener(() => {
        if (this.active) this._adoptTrackedEntity(performance.now());
        else this.syncEntry();
      }),
    );
    this._listen(this.entry, 'click', () => this.enter());
    this._listen(this.tr3bToggle, 'click', () => this.toggleTrackedTr3b());
    this._listen(this.mapViewButton, 'click', () => this.exit());
    this._listen(this.visionPrevious, 'click', () => this.cycleVisionMode(-1));
    this._listen(this.visionCurrent, 'click', () => this.cycleVisionMode(1));
    this._listen(this.visionNext, 'click', () => this.cycleVisionMode(1));
    this._listen(this.contextPrevious, 'click', () => this.navigateContext(-1, { origin: 'user' }));
    this._listen(this.contextNext, 'click', () => this.navigateContext(1, { origin: 'user' }));
    this._listen(this.contextToggle, 'click', () => this.setContextCollapsed(!this.contextCollapsed));
    this._listen(this.weatherToggle, 'click', () => {
      const enabled = this.weatherToggle.getAttribute('aria-pressed') !== 'true';
      this.syncWeatherToggle(enabled);
      window.dispatchEvent(new CustomEvent('gev:cockpit-weather-toggle', {
        detail: { enabled },
      }));
    });
    this._listen(window, 'gev:cockpit-weather-state', (event) => {
      this.syncWeatherToggle(event?.detail?.enabled !== false);
    });
    this._listen(this.signalToggle, 'click', () => this.setSignalCollapsed(
      !this.signalCollapsed,
      { user: true },
    ));
    this._listen(this.signalList, 'click', (event) => {
      const target = event.target.closest('button[data-signal-layer][data-signal-id]');
      if (!target) return;
      event.preventDefault();
      this.getDataManager()?.focusTarget(
        target.dataset.signalLayer,
        target.dataset.signalId,
        { origin: 'user' },
      );
    });
    this._listen(this.briefPrevious, 'click', () => this.showBriefPage(this.briefPageIndex - 1, { manual: true }));
    this._listen(this.briefNext, 'click', () => this.showBriefPage(this.briefPageIndex + 1, { manual: true }));
    this._listen(this.briefAutoToggle, 'click', () => {
      this.setBriefAutoRotate(!this.briefAutoRotateEnabled);
    });
    this.briefTabs.forEach((button) => this._listen(button, 'click', () => {
      this.showBriefPage(Number(button.dataset.cockpitBriefIndex), { manual: true });
    }));
    this._listen(document, 'visibilitychange', () => {
      if (document.hidden) this.stopBriefRotation();
      else if (this.briefAutoRotateEnabled) this.startBriefRotation();
    });
    this._listen(window, 'resize', () => this.scheduleContextLayout());
    this._listen(document, 'keydown', (event) => this.onKeyDown(event), true);
  }

  

  

  

  

  

  

  

  

  

  

  

  

  

  

  

  

  

  

  

  

  

  

  

  

  

  

  

  

  

  

  

  

  

  

  

  dispose() {
    this.exit({ restoreTracking: false });
    this.regionalBriefAbort?.abort();
    this.regionalBriefAbort = null;
    this.regionalBriefRequestToken += 1;
    this.stopBriefRotation();
    if (this.contextLayoutFrame !== null) cancelAnimationFrame(this.contextLayoutFrame);
    this.contextLayoutFrame = null;
    for (const removeListener of this._listenerRemovers.splice(0)) removeListener?.();
  }
}

// Method groups live in cockpitViewController*.js mixins; attached once at module load.
Object.assign(CockpitViewController.prototype, controlsMixin, frameMixin, hudMixin, briefMixin, signalsMixin);
