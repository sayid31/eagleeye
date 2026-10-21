

import { decodeBloomIntensity } from './bloom.js';

import { IntelHUD } from './hud.js';
import { ShareLinkManager } from './sharelink.js';

import { OrbitController } from './orbit.js';
import { CelestialRing } from './celestialRing.js';
import { initTrackedReadout } from './data/trackedReadout.js';
import { initWorldOverlay } from './overlays/worldOverlay.js';
import { initDetection, setDetectionStyle } from './data/detection.js';
import { canonicalizeDensity, normalizeAllocationStrategy } from './data/detectionPolicy.js';
import { createLoadingFeedbackState, createTrafficSyncFeedbackState } from './loadingFeedback.js';

import { cockpitEntryAllowed } from './contextModePolicy.js';

import {
  registerCctvFocusRequestListener,
  routeCctvFocusRequest,
} from './cctvFocusRequest.js';
import {
  flyToWorldTarget,
  registerWorldFocusRequestListener,
  routeWorldFocusRequest,
} from './worldFocus.js';
import {
  registerNavigationAuthorityListener,
  stampInitialShareGesture,
} from './navigationPolicy.js';

import {
  setScopeMaskEnabled,
  setScopeMaskFeather,
  setScopeMaskOpacity,
  setScopeTerminusOverride,
  clampScopeTerminusPct,
} from './scopeMask.js';
import { PANEL_Z_BASE } from './panelPositionConstants.js';
import { panelAdaptiveLayoutMixin } from './panelAdaptiveLayoutMixin.js';
import { cctvPanelMixin } from './cctvPanelMixin.js';
import { radioPanelMixin } from './radioPanelMixin.js';
import { contextModeMixin } from './contextModeMixin.js';
import { navigationLocationMixin } from './navigationLocationMixin.js';
import { CockpitViewController } from './cockpitViewController.js';
import { cockpitControlMixin } from './cockpitControlMixin.js';
import { styleStagesMixin } from './uiStyleStages.js';
import { detectionUiMixin } from './uiDetection.js';
import { presetDefaultsMixin } from './uiPresets.js';
import { shareStateMixin } from './uiShareState.js';
import { panelChromeMixin } from './uiPanelChrome.js';
import { dataManagerAttachMixin } from './uiDataManager.js';
import { hudPortalMixin } from './uiHudPortal.js';
import { publicApiMixin } from './uiPublicApi.js';
import { cleanViewMixin } from './uiCleanView.js';
import { loadingFeedbackMixin } from './uiLoadingFeedback.js';
import { disposeMixin } from './uiDispose.js';
import { createSettleOnce } from './settleOnce.js';
import { COCKPIT_ENTRY_COLLAPSE_PANEL_IDS, DETECTION_ALLOCATION_STORAGE_KEY, STYLES, STYLE_STATUS_LABELS } from './uiConstants.js';
export { STYLES } from './uiConstants.js';

/**
 * Central UI orchestrator for the EagleEye View application.
 *
 * Responsibilities:
 * - CesiumJS PostProcessStage pipeline: registers per-style GLSL stages
 *   (NVG, FLIR, CRT, anime, noir, snow) and manages intensity crossfades.
 * - Bloom and sharpen post-processing toggle/intensity control.
 * - Draggable/collapsible panel system with localStorage persistence,
 *   z-order stacking, and viewport-clamped positioning.
 * - CCTV panel: camera selection, coverage toggle, projection, calibration
 *   sliders, auto-hop, and summary typewriter effect.
 * - Location bar with city/POI preset pills, QWERTY key navigation,
 *   geocoding search, and inter-city world-jump transitions.
 * - Orbit controller integration for POI fly-around.
 * - Recording mode with safe-frame overlay and HUD mode switching.
 * - Share link encoding/decoding (delegates to ShareLinkManager).
 * - Detection overlay mode cycling and density tuning.
 * - Toast notification system.
 * - Intel HUD lifecycle and variant switching.
 */

export class StyleManager {
  /**
   * @param {Cesium.Viewer} viewer - The CesiumJS viewer instance.
   * @param {object} [options]
   */
  constructor(viewer, { mapStackController = null } = {}) {
    this.viewer = viewer;
    this.mapStackController = mapStackController;
    this.stages = {};
    this.activeStyle = 'normal';
    document.documentElement.dataset.gevStyle = this.activeStyle;
    this.transitions = new Map();
    this.startTime = Date.now();

    // True once the user manually changes detection (button/key/slider/voice).
    // Gates per-style detection defaults so they never stomp an explicit choice.
    this._detectionUserOverridden = false;

    // Bloom/sharpen state
    this.bloomEnabled = false;
    this.sharpenEnabled = false;
    this._bloomStage = null;
    this._sharpenStage = null;
    this._recordingMode = false;
    this._recordingConfig = { hidePanels: true, hudMode: 'minimal', safeFrame: '16:9' };
    this._preRecordingHudState = null;
    this._panelZCounter = PANEL_Z_BASE + 10;
    this._animFrameId = null;
    this._lastLoadingFeedbackUpdateAt = 0;
    this._loadingFeedbackState = createLoadingFeedbackState();
    this._loadingFeedbackEvent = null;
    this._loadingFeedbackTicker = null;
    this._globalStatusNotice = null;
    this._shareTrackingAcquiringKey = null;
    this._shareTrackingNoticeGeneration = 0;
    this._globeResetPromise = null;
    this._globeResetHandler = null;
    this._clearSelectedLayersPromise = null;
    this._clearSelectedLayersManagerPromise = null;
    this._clearSelectedLayersHandler = null;
    this._dataManager = null;
    this._cctvUnsubscribe = null;
    this._radioUnsubscribe = null;
    this._radioState = null;
    this._radioCategorySignature = '';
    this._radioTunerStations = [];
    this._radioTunerPool = [];
    this._radioTunerDragging = false;
    this._radioTunerDragStartSlot = 0;
    this._radioTunerDragSnapshot = null;
    this._radioTunerLastSlot = 0;
    this._radioTunerDragDirection = 0;
    this._radioTunerCoordinate = 0;
    this._radioTunerPointerId = null;
    this._radioTunerKeyboardKey = null;
    this._radioTunerAbort = null;
    this._radioTunerBandSignature = '';
    this._radioTunerSelectedId = null;
    this._radioTunerBandPinnedForNavigation = false;
    this._radioTunerCameraRemove = null;
    this._refreshRadioTunerBand = null;
    this._cctvState = null;
    this._cctvSummaryTypingTimer = null;
    this._lastCctvSummaryText = '';
    // Auto-expand guard: last active camera id seen while the layer was
    // enabled; routine state notifications with the same id never re-expand.
    this._lastSeenCctvActiveId = null;
    this._cctvChipHideTimer = null;
    this._cctvChipWasBusy = false;
    this._leftStackLayoutFrame = null;
    this._leftStackReconsiderAutoCollapse = false;
    this._leftStackResizeObserver = null;
    this._leftStackMutationObserver = null;
    this._leftStackHudTransitionHandler = null;
    this._leftStackCollapsedHeights = new Map();
    this._leftStackPreferredPanelId = null;
    this._rightPanelStack = document.getElementById('right-context-rail');
    this._rightStackLayoutFrame = null;
    this._rightStackReconsiderAutoCollapse = false;
    this._rightStackResizeObserver = null;
    this._rightStackMutationObserver = null;
    this._rightStackHudTransitionHandler = null;
    this._rightStackPreferredPanelId = null;
    this._adaptivePanelSettleTimer = null;
    this._windowResizeHandler = null;
    this._loadingVisibilityHandler = null;
    this._cctvRequestFocusHandler = null;
    this._removeCctvRequestFocusListener = null;
    this._worldRequestFocusHandler = null;
    this._removeWorldRequestFocusListener = null;
    this._removeNavigationAuthorityListener = null;
    this._navigationOwnerChangedRemover = null;
    this._navigationGeneration = 0;
    this._activeLocationSearchGeneration = null;
    this._initialShareState = null;
    this._initialShareNavigationGeneration = null;
    this._initialShareRestoreTimeout = null;
    this._layerStateCoordinator = null;
    this._layerStateRestorePromise = null;
    this._awarenessSelectedHandler = null;
    this._awarenessClearedHandler = null;
    this._disposed = false;
    this._draggableResizeObserver = null;

    // DOM refs
    this._styleIndicator = document.getElementById('active-style-name');
    this._sliderPanel = document.getElementById('param-slider-panel');
    this._sliderContainer = document.getElementById('param-sliders');
    this._ppToggles = document.getElementById('pp-toggles');
    this._bloomBtn = document.getElementById('bloom-toggle');
    this._bloomSliderRow = document.getElementById('bloom-slider-row');
    this._bloomSlider = document.getElementById('bloom-intensity-slider');
    this._bloomSliderValue = document.getElementById('bloom-intensity-value');
    this._sharpenBtn = document.getElementById('sharpen-toggle');
    this._sharpenSliderRow = document.getElementById('sharpen-slider-row');
    this._sharpenSlider = document.getElementById('sharpen-intensity-slider');
    this._sharpenSliderValue = document.getElementById('sharpen-intensity-value');
    this._hudBtn = document.getElementById('hud-toggle');
    this._hudLayoutRow = document.getElementById('hud-layout-row');
    this._hudLayoutSelect = document.getElementById('hud-layout-select');
    this._detectionSliderRow = document.getElementById('detection-slider-row');
    this._detectionDensitySlider = document.getElementById('detection-density-slider');
    this._detectionDensityValue = document.getElementById('detection-density-value');
    this._detectionAllocationRow = document.getElementById('detection-allocation-row');
    this._detectionAllocationBtns = [
      document.getElementById('detection-allocation-elastic'),
      document.getElementById('detection-allocation-weighted'),
    ].filter(Boolean);
    this._detectionFadeRow = document.getElementById('detection-fade-row');
    this._detectionFadeSlider = document.getElementById('detection-fade-slider');
    this._detectionFadeValue = document.getElementById('detection-fade-value');
    this._detectionOpacityRow = document.getElementById('detection-opacity-row');
    this._detectionOpacitySlider = document.getElementById('detection-opacity-slider');
    this._detectionOpacityValue = document.getElementById('detection-opacity-value');
    let storedDetectionAllocation = 'ELASTIC';
    try {
      storedDetectionAllocation = localStorage.getItem(DETECTION_ALLOCATION_STORAGE_KEY) || 'ELASTIC';
    } catch { /* storage can be unavailable in privacy/test contexts */ }
    this._detectionAllocationPreference = normalizeAllocationStrategy(storedDetectionAllocation);
    this._celestialBtn = document.getElementById('celestial-toggle');
    this._scopeBtn = document.getElementById('scope-toggle');
    this._scopeFeatherSlider = document.getElementById('scope-feather-slider');
    this._scopeFeatherValue = document.getElementById('scope-feather-value');
    this._scopeIntensitySlider = document.getElementById('scope-intensity-slider');
    this._scopeIntensityValue = document.getElementById('scope-intensity-value');
    this._mapStackChips = document.getElementById('map-stack-chips');
    this._mapStackStatus = document.getElementById('map-stack-status');
    this._mapStackChangeHandler = null;
    this._cleanViewBtn = document.getElementById('clean-view-toggle');
    this._cleanViewExitBtn = document.getElementById('clean-view-exit');
    this._dataPanel = document.getElementById('data-panel');
    this._scenePanel = document.getElementById('scene-panel');
    this._cctvPanel = document.getElementById('cctv-panel');
    this._radioPanel = document.getElementById('radio-panel');
    this._contextRadioDock = document.getElementById('context-radio-dock');
    this._contextRadioToggleBtn = document.getElementById('context-radio-toggle-btn');
    this._contextRadioMini = document.getElementById('context-radio-mini');
    this._contextRadioMiniEnableBtn = document.getElementById('context-radio-mini-enable-btn');
    this._contextRadioDetailsBtn = document.getElementById('context-radio-details-btn');
    this._contextRadioMiniCloseBtn = document.getElementById('context-radio-mini-close-btn');
    this._contextRadioMiniStation = document.getElementById('context-radio-mini-station');
    this._contextRadioMiniPrevBtn = document.getElementById('context-radio-mini-prev-btn');
    this._contextRadioMiniPlayBtn = document.getElementById('context-radio-mini-play-btn');
    this._contextRadioMiniNextBtn = document.getElementById('context-radio-mini-next-btn');
    this._contextRadioMiniVolume = document.getElementById('context-radio-mini-volume');
    this._contextRadioMiniVolumeValue = document.getElementById('context-radio-mini-volume-value');
    this._cockpitUtilityControls = document.getElementById('cockpit-utility-controls');
    this._cockpitDisplayToggleBtn = document.getElementById('cockpit-display-toggle-btn');
    this._cockpitDisplayPanel = document.getElementById('cockpit-display-panel');
    this._cockpitDisplayPortalRecords = [];
    this._cockpitDisplayPortalActive = false;
    this._cockpitDisplayModeHandler = null;
    this._cockpitRadioToggleBtn = document.getElementById('cockpit-radio-toggle-btn');
    this._cockpitRadioPanel = document.getElementById('cockpit-radio-panel');
    this._cockpitRadioEnableBtn = document.getElementById('cockpit-radio-enable-btn');
    this._cockpitRadioStation = document.getElementById('cockpit-radio-station');
    this._cockpitRadioPrevBtn = document.getElementById('cockpit-radio-prev-btn');
    this._cockpitRadioPlayBtn = document.getElementById('cockpit-radio-play-btn');
    this._cockpitRadioNextBtn = document.getElementById('cockpit-radio-next-btn');
    this._cockpitRadioVolume = document.getElementById('cockpit-radio-volume');
    this._cockpitRadioVolumeValue = document.getElementById('cockpit-radio-volume-value');
    this._radioLayerState = document.getElementById('radio-layer-state');
    this._radioEnableBtn = document.getElementById('radio-enable-btn');
    this._radioFilter = document.getElementById('radio-filter');
    this._radioStationName = document.getElementById('radio-station-name');
    this._radioStationMeta = document.getElementById('radio-station-meta');
    this._radioStationTags = document.getElementById('radio-station-tags');
    this._radioTuner = document.getElementById('radio-tuner');
    this._radioTunerSlider = document.getElementById('radio-tuner-slider');
    this._radioTunerNeedle = document.getElementById('radio-tuner-needle');
    this._radioTunerBandLabel = document.getElementById('radio-tuner-band-label');
    this._radioTunerValue = document.getElementById('radio-tuner-value');
    this._radioTunerStation = document.getElementById('radio-tuner-station');
    this._radioPrevBtn = document.getElementById('radio-prev-btn');
    this._radioPlayBtn = document.getElementById('radio-play-btn');
    this._radioNextBtn = document.getElementById('radio-next-btn');
    this._radioStopBtn = document.getElementById('radio-stop-btn');
    this._radioVolume = document.getElementById('radio-volume');
    this._radioVolumeValue = document.getElementById('radio-volume-value');
    this._radioPlaybackState = document.getElementById('radio-playback-state');
    this._radioStationHomepage = document.getElementById('radio-station-homepage');
    this._globalContextFlightsBtn = document.getElementById('global-context-flights-btn');
    this._globalContextMissionsBtn = document.getElementById('global-context-missions-btn');
    this._contextModeStandby = document.getElementById('context-mode-standby');
    this._contextFlightsView = document.getElementById('context-flights-view');
    this._contextMissionsView = document.getElementById('context-missions-view');
    this._contextMode = null;
    this._contextModeChanging = false;
    this._contextModeGeneration = 0;
    this._contextModeEntering = null;
    this._contextModeEntryIntent = null;
    this._contextModeReplacementIntent = null;
    this._contextModeDeferredEntryIntent = null;
    this._contextSessionSnapshot = null;
    this._contextRestoreState = null;
    this._contextLayerReactionPromises = new Set();
    this._preservePanelStateDuringLayerClear = false;
    this._userFacingContextNotificationTokens = new Set();
    this._dataManagerBeforeDestroyUnsubscribe = null;
    this._dataManagerVisibilityGuardUnsubscribe = null;
    this._dataManagerVisibilityRequestUnsubscribe = null;
    this._installationsSearchBtn = document.getElementById('installations-search-btn');
    this._leftPanelStack = document.getElementById('left-panel-stack');
    this._cctvEnableBtn = document.getElementById('cctv-enable-btn');
    this._cctvNearestBtn = document.getElementById('cctv-nearest-btn');
    this._cctvPrevBtn = document.getElementById('cctv-prev-btn');
    this._cctvNextBtn = document.getElementById('cctv-next-btn');
    this._cctvCameraTrigger = document.getElementById('cctv-camera-trigger');
    this._cctvCameraListbox = document.getElementById('cctv-camera-listbox');
    this._cctvFocusBtn = document.getElementById('cctv-focus-btn');
    this._cctvCoverageBtn = document.getElementById('cctv-coverage-btn');
    this._cctvAutoHopBtn = document.getElementById('cctv-auto-hop-btn');
    this._cctvProjectionBtn = document.getElementById('cctv-projection-btn');
    this._cctvQualityChip = document.getElementById('cctv-quality-chip');
    this._cctvAdjustBtn = document.getElementById('cctv-adjust-btn');
    this._cctvCalReadout = document.getElementById('cctv-cal-readout');
    this._cctvCalibSaveBtn = document.getElementById('cctv-calib-save-btn');
    this._cctvCalibResetBtn = document.getElementById('cctv-calib-reset-btn');
    this._cctvFrame = document.getElementById('cctv-frame');
    this._cctvFrameVideo = document.getElementById('cctv-frame-video');
    this._cctvFrameWrap = document.getElementById('cctv-frame-wrap');
    this._cctvFrameRequestToken = 0;
    this._cctvFramePreloader = null;
    this._cctvSourceBadge = document.getElementById('cctv-source-badge');
    this._cctvMeta = document.getElementById('cctv-meta');
    this._cctvSummary = document.getElementById('cctv-summary');
    this._shareBtn = document.getElementById('share-btn');
    this._clearSelectedLayersBtn = document.getElementById('clear-selected-layers');
    this._globalLoadingStatus = document.getElementById('global-loading-status');
    this._globalLoadingLabel = document.getElementById('global-loading-label');
    this._globalLoadingDetail = document.getElementById('global-loading-detail');
    this._resetGlobeBtn = document.getElementById('reset-globe-view');
    this._cockpitResetGlobeBtn = document.getElementById('cockpit-reset-globe');
    this._styleButtons = document.getElementById('style-buttons');
    this._trafficSyncChip = document.getElementById('traffic-sync-chip');
    this._trafficSyncLabel = document.getElementById('traffic-sync-label');
    this._trafficSyncProgress = document.getElementById('traffic-sync-progress');
    this._cctvSyncChip = document.getElementById('cctv-sync-chip');
    this._cctvSyncLabel = document.getElementById('cctv-sync-label');
    this._cctvSyncProgress = document.getElementById('cctv-sync-progress');
    this._toast = document.getElementById('toast');
    this._locationSearch = document.getElementById('location-search');
    this._searchToggle = document.getElementById('search-toggle');
    this._locationPills = document.getElementById('location-pills');
    this._poiRow = document.getElementById('poi-row');
    this._locationBarDivider = document.getElementById('location-bar-divider');
    this._styleMiniValue = document.getElementById('style-mini-value');
    this._locationMiniCity = document.getElementById('location-mini-city');
    this._locationMiniPoi = document.getElementById('location-mini-poi');
    this._safeFrameOverlay = document.getElementById('safe-frame-overlay');
    this._safeFrameBox = document.getElementById('safe-frame-box');
    this._activeLocationId = null;
    this._expandedCityId = null;
    this._activePoiIndex = null;
    this._currentTarget = null; // Cesium.Cartesian3 of current POI target
    this._currentPoi = null;    // Current POI data object
    // Formatted address of the last free-text geocode search. Preset pills set
    // _activeLocationId instead; a search has no preset record, so this is the
    // only thing the mini-status can report for it.
    this._searchedLocationLabel = null;
    this._trafficSyncFeedbackState = createTrafficSyncFeedbackState();
    this._trafficTransitionTimer = null;
    this._lastTrafficChipUpdateAt = 0;

    // Orbit controller
    this.orbitController = new OrbitController(viewer);
    this._orbitIndicator = null;

    // Intel HUD
    this.hud = new IntelHUD(viewer);
    this._cockpitVisionMode = 'optical';
    this._cockpitVisionRestore = null;
    this._cockpitPanelRestore = null;
    // True only while the open Data Layers panel is the reason Cockpit's
    // Contact panel is collapsed. A user-collapsed Contact panel must remain
    // collapsed when Data Layers closes.
    this._cockpitContextCollapsedForDataPanel = false;
    /** Pre-Contacts detection state, restored on deactivation (see _syncContactsDetection). */
    this._contactsDetectionRestore = null;
    this.cockpitView = new CockpitViewController(viewer, {
      // Reads the live `_dataManager` field at call time: the controller is
      // built before attachDataManager() runs, so a captured value would be
      // permanently null and every facade read (tracked info, focusTarget)
      // would silently return nothing.
      getDataManager: () => this._dataManager,
      onVisionChange: (mode, active, options) => this._setCockpitVision(mode, active, options),
      onCameraTakeover: () => this._stampNavigation({ cancelPendingSelection: false }),
      getInheritedVisionLabel: () => (
        STYLE_STATUS_LABELS[this.activeStyle]
        || String(this.activeStyle || 'normal').toUpperCase()
      ),
      isEntryAllowed: () => cockpitEntryAllowed({
        contextMode: this._contextMode,
        contextModeChanging: this._contextModeChanging,
        flightsEnabled: !!this._dataManager?.isEnabled('flights'),
        militaryEnabled: !!this._dataManager?.isEnabled('military'),
      }),
      onEntered: () => {
        // A new Cockpit session owns both side rails. Clear standard map-view
        // panels once on entry; NEXT/PREVIOUS never reaches this callback, so
        // panels the operator opens while already inside remain untouched.
        this._cockpitPanelRestore = new Map();
        this._cockpitContextCollapsedForDataPanel = false;
        for (const panelId of COCKPIT_ENTRY_COLLAPSE_PANEL_IDS) {
          const panel = document.getElementById(panelId);
          if (panel) {
            this._cockpitPanelRestore.set(panelId, panel.classList.contains('collapsed'));
          }
          this.setPanelCollapsed(panelId, true, {
            persist: false,
            syncShare: false,
          });
        }
        this.cockpitView?.setContextCollapsed(false);
        this.cockpitView?.setSignalCollapsed(false, { user: true });
      },
      onExited: () => {
        const restore = this._cockpitPanelRestore;
        this._cockpitPanelRestore = null;
        this._cockpitContextCollapsedForDataPanel = false;
        if (!restore) return;
        for (const [panelId, wasCollapsed] of restore) {
          this.setPanelCollapsed(panelId, wasCollapsed, {
            persist: false,
            syncShare: false,
          });
        }
      },
      restoreTrackingFrame: (entity) => {
        const [layerId, ...idParts] = String(entity?.gevTrackedId || '').split(':');
        const trackedId = idParts.join(':');
        if (!trackedId) return false;
        if (layerId === 'flights' || layerId === 'military') {
          return this._dataManager?.refocusTrackedById(layerId, trackedId) === true;
        }
        return false;
      },
    });

    // Full-globe sun/moon ring. It is a crisp screen-space overlay above the
    // Cesium canvas but below the HUD/detection/readout z ladder.
    this.celestialRing = new CelestialRing(viewer, {
      enabled: false,
      onAutoDisable: () => this.setCelestialRingEnabled(false, {
        syncShare: !!this.shareLinkManager,
        focus: false,
      }),
    });

    // Share Link Manager
    this.shareLinkManager = new ShareLinkManager(viewer, {
      onRestore: async (state) => {
        const {
          style,
          bloom,
          sharpen,
          bloomIntensity,
          bloomVersion,
          sharpenIntensity,
          hudVariant,
          hudVisible,
          detectionMode,
          detectionDensity,
          detectionAllocation,
          detectionFadePct,
          detectionOutsideOpacityPct,
          celestialRing,
          scopeEnabled,
          scopeFeatherPct,
          scopeIntensityPct,
          scopeTerminusPct,
          panelState,
          styleParams,
        } = state || {};
        // Ignore the retired 'ai-edit' style from older share links.
        if (style && style !== 'normal' && style !== 'ai-edit') {
          this.setStyle(style, { applyPreset: true, revealParameters: false, restore: true });
        }
        if (styleParams && style && this.stages[style] && STYLES[style]?.uniforms) {
          for (const [uniformName, uniformValue] of Object.entries(styleParams)) {
            if (!Object.hasOwn(STYLES[style].uniforms, uniformName)) continue;
            this.stages[style].uniforms[uniformName] = uniformValue;
          }
          this._updateSliderPanel(style, { reveal: false });
        }
        if (typeof bloomIntensity === 'number' && this._bloomSlider) {
          const intensity = decodeBloomIntensity(bloomIntensity, bloomVersion);
          this._setBloomIntensity(intensity, { syncShare: false });
        }
        if (typeof sharpenIntensity === 'number' && this._sharpenSlider) {
          const pct = Math.max(0, Math.min(100, Math.round(sharpenIntensity)));
          this._sharpenSlider.value = String(pct);
          this._sharpenSliderValue.textContent = `${pct}%`;
          this._applySharpenIntensity(pct / 100);
        }
        if (typeof bloom === 'boolean') this._setBloomEnabled(bloom);
        if (typeof sharpen === 'boolean') this._setSharpenEnabled(sharpen);
        if (hudVariant) this._setHudVariant(hudVariant);
        if (typeof hudVisible === 'boolean') {
          this.hud.setMode(hudVisible ? 'on' : 'off');
          this._updateHudButtonState();
        }
        if (typeof detectionDensity === 'number' && this._detectionDensitySlider) {
          const pct = canonicalizeDensity(detectionDensity);
          this._detectionDensitySlider.value = String(pct);
          this._detectionDensityValue.textContent = `${pct}%`;
          this._applyDetectionDensityFromUi();
        }
        if (detectionAllocation) {
          this._setDetectionAllocation(detectionAllocation, { syncShare: false, persist: false });
        }
        if (typeof detectionFadePct === 'number' && this._detectionFadeSlider) {
          this._detectionFadeSlider.value = String(detectionFadePct);
        }
        if (typeof detectionOutsideOpacityPct === 'number' && this._detectionOpacitySlider) {
          this._detectionOpacitySlider.value = String(detectionOutsideOpacityPct);
        }
        this._applyDetectionFadeFromUi();
        if (detectionMode) this._setDetectionMode(detectionMode);
        if (typeof celestialRing === 'boolean') {
          this.setCelestialRingEnabled(celestialRing, { syncShare: false, focus: false });
        }
        if (typeof scopeEnabled === 'boolean') {
          setScopeMaskEnabled(scopeEnabled);
          this._scopeBtn?.classList.toggle('active', scopeEnabled);
          this._scopeBtn?.setAttribute('aria-pressed', String(scopeEnabled));
        }
        if (typeof scopeFeatherPct === 'number' && this._scopeFeatherSlider) {
          const pct = Math.max(0, Math.min(100, Math.round(scopeFeatherPct)));
          this._scopeFeatherSlider.value = String(pct);
          if (this._scopeFeatherValue) this._scopeFeatherValue.textContent = `${pct}%`;
          setScopeMaskFeather(pct / 100);
        }
        if (typeof scopeIntensityPct === 'number' && this._scopeIntensitySlider) {
          const pct = Math.max(0, Math.min(100, Math.round(scopeIntensityPct)));
          this._scopeIntensitySlider.value = String(pct);
          if (this._scopeIntensityValue) this._scopeIntensityValue.textContent = `${pct}%`;
          setScopeMaskOpacity(pct / 100);
        }
        // null restores the altitude-adaptive ramp; a number pins the terminus
        // (clamped to the supported 94..100 band, same as the `sce` hash key).
        if (scopeTerminusPct === null) setScopeTerminusOverride(null);
        else if (typeof scopeTerminusPct === 'number') {
          const pinned = clampScopeTerminusPct(scopeTerminusPct);
          setScopeTerminusOverride(pinned == null ? null : pinned / 100);
        }
        // The basemap is deliberately NOT restored from the link or the reloaded
        // hash: boot already activated Esri (DEFAULT_BOOT_STACK), and re-applying
        // a persisted `map=photoreal` would load Google 3D right behind it.
        // Google 3D (and every other stack) stays a manual in-session choice.
        if (panelState) this._restorePanelState(panelState);
        this._syncShareState();
      },
      isNavigationCurrent: (generation) => generation === this._navigationGeneration,
      cancelOwnedNavigation: () => this.viewer.camera.cancelFlight(),
    });
    this.shareLinkManager.setPanelStateProvider(() => this._buildSharePanelState());
    this.shareLinkManager.setStyleParamStateProvider((styleName) => {
      const shader = STYLES[styleName];
      const stage = this.stages[styleName];
      if (!shader?.uniforms || !stage) return null;
      return Object.fromEntries(
        Object.keys(shader.uniforms).map((uniformName) => [uniformName, stage.uniforms[uniformName]]),
      );
    });
    // Parse before panel chrome initializes so every valid share URL starts
    // from deterministic markup defaults instead of recipient-local panel
    // preferences. Encoded panel fields are applied after all panels exist.
    this._initialShareState = this.shareLinkManager.parseInitialHash();

    this._detectionBtn = document.getElementById('detection-toggle');
    this._models3dBtn = document.getElementById('models3d-toggle');
    this._models3dModeRow = document.getElementById('models3d-mode-row');
    this._models3dModeBtns = [
      document.getElementById('models3d-mode-proximity'),
      document.getElementById('models3d-mode-all'),
    ];
    // DISPLAY-rail 3D-aircraft toggle (flights layer param). DEFAULT-ON in
    // PROXIMITY (owner directive 2026-08-22) — mirrors the `models3d` default in
    // layerState.js and `_models3dEnabled` in both flight layers, and the `active`
    // class the button carries in index.html. A fresh boot skips layer-state
    // restoration, so these initializers are the only thing keeping the lit
    // button and the armed layer in agreement.
    this._models3dEnabled = true;
    this._models3dMode = 'proximity'; // 'proximity' (nearest in view) | 'all' (every in-view plane)

    // The shared world-overlay host must own its one postRender lane before
    // detection and tracked-readout initialize. It stays transparent until a
    // production source explicitly registers entries.
    initWorldOverlay(viewer);

    // Initialize detection overlay BEFORE style stages so the composite
    // stage is first in the post-process pipeline
    initDetection(
      viewer,
      ['traffic', 'flights', 'military', 'satellites', 'cctv', 'bikeshare', 'ais-live-vessels'],
      // Read the live manager at call time, not a captured reference —
      // initDetection runs from inside this constructor, before
      // attachDataManager() has necessarily fired (same reasoning as
      // CockpitViewController.getDataManager above).
      () => this._dataManager,
      (modeLabel) => {
        this._updateDetectionButton(modeLabel);
      },
    );
    initTrackedReadout(viewer);
    setDetectionStyle(this.activeStyle);
    this._applyDetectionDensityFromUi();

    this._initStages();
    this._initBloomSharpen();
    this._initUI();
    this._initMapStackControl();
    this._initPanelChrome();
    this._initLeftPanelAdaptiveLayout();
    this._initRightPanelAdaptiveLayout();
    this._initRadioPanel();
    this._initCctvPanel();
    this._initGlobalContextPanel();
    this._initLocationBar();
    this._initShareButton();
    this._initClearSelectedLayersButton();
    this._initResetGlobeButton();
    this._initHUDToggle();
    this._initModels3dToggle();
    this._applyGlobalPostDefaults();
    this._initOrbit();
    this._initRecordingOverlay();
    this._startAnimationLoop();
    this._startTrafficChipTicker();
    this._updateStyleMiniStatus();
    this._updateLocationMiniStatus();

    // Restore from URL hash if present
    const savedState = this._initialShareState;
    this._initialShareRestorePromise = savedState
      ? new Promise((resolve) => { this._resolveInitialShareRestore = resolve; })
      : Promise.resolve({ status: 'not-requested', share: null, layers: [] });
    // Narrower than the aggregate above: settles once the shared camera and
    // visual/panel callback finish, WITHOUT waiting for saved layers. The
    // startup splash gates on this one so a heavy layer (CCTV) restores behind
    // the visible app instead of holding the cover.
    this._initialViewReadyGate = savedState ? createSettleOnce() : null;
    if (savedState) {
      this._hasShareState = true;
      // Reserve camera authority now; the delayed mesh-friendly flight may
      // run only if no newer user, voice, or tracking navigation has won.
      this._initialShareNavigationGeneration = this._beginDeferredNavigation(
        'shared view',
        { cancelPendingSelection: false },
      );
      this._initialShareRestoreTimeout = setTimeout(() => {
        this._initialShareRestoreTimeout = null;
        if (this._disposed) return;
        const generation = this._initialShareNavigationGeneration;
        const applyCamera = Number.isInteger(generation)
          && this._reassertNavigationHandoff(generation);
        void (async () => {
          try {
            const share = await this.shareLinkManager.applyState(savedState, {
              applyCamera,
              navigationToken: generation,
            });
            // Camera + visual/panel restore is done; saved layers continue
            // behind the visible app (hash writes stay suppressed below).
            this._initialViewReadyGate?.settle({ status: 'settled', share });
            const layers = await (this._layerStateRestorePromise || Promise.resolve([]));
            const tracking = share.camera === 'applied'
              ? await this._layerStateCoordinator?.restoreShareTrackingSelection?.()
              : {
                  status: 'superseded',
                  cleared: this._layerStateCoordinator?.cancelPendingShareTracking?.(
                    'shared-camera-superseded',
                    { clearSelection: true },
                  ) === true,
                };
            this.shareLinkManager.completeInitialRestore();
            this._settleInitialShareRestore({ status: 'settled', share, layers, tracking });
          } catch (error) {
            this.shareLinkManager.completeInitialRestore();
            this._settleInitialShareRestore({
              status: 'failed',
              error: String(error?.message || error),
              share: null,
              layers: [],
            });
          }
        })();
      }, 1500);
    } else {
      this._syncShareState();
    }
    // A recipient can orbit before or during the delayed share flight. That
    // gesture keeps ordinary layer state but revokes the passive base camera
    // and selected-subject Follow so delayed work cannot seize navigation.
    this._initialShareGestureHandler = () => {
      if (
        this._disposed
        || !this._hasShareState
        || !this._resolveInitialShareRestore
      ) return;
      stampInitialShareGesture((options) => this._stampNavigation(options));
    };
    this.viewer?.canvas?.addEventListener('pointerdown', this._initialShareGestureHandler, {
      passive: true,
    });
    this.viewer?.canvas?.addEventListener('wheel', this._initialShareGestureHandler, {
      passive: true,
    });

    // Keep the parameter panel from overlapping toggle controls.
    this._layoutRightPanels();
    this._syncCctvPanelViewport();
    this._windowResizeHandler = () => {
      this._scheduleRightPanelLayout({ reconsiderAutoCollapse: true });
      this._syncCctvPanelViewport();
      if (this._isCctvListboxOpen?.()) this._positionCctvListbox();
      this._scheduleLeftPanelLayout({ reconsiderAutoCollapse: true });
    };
    window.addEventListener('resize', this._windowResizeHandler);
    // The loading-chip ticker is stopped while the tab is hidden (it can do no
    // useful work off-screen and must not hold a 60ms timer there). Resample on
    // return so the time-driven reducer catches up on real elapsed time — and
    // re-arms its own ticker if the batch is still running.
    this._loadingVisibilityHandler = () => {
      if (!document.hidden) this._updateGlobalLoadingFeedback();
    };
    document.addEventListener('visibilitychange', this._loadingVisibilityHandler);
    this._cctvRequestFocusHandler = (event) => routeCctvFocusRequest(
      event,
      (activate, focus) => this._runExplicitCctvFocus(activate, focus),
      (cameraId, durationSec) => this._dataManager?.focusCamera('cctv', cameraId, durationSec),
    );
    this._removeCctvRequestFocusListener = registerCctvFocusRequestListener(
      window,
      this._cctvRequestFocusHandler,
    );
    this._worldRequestFocusHandler = (event) => routeWorldFocusRequest(
      event,
      (detail, fly) => this._runExplicitWorldFocus(detail, fly),
      (detail) => flyToWorldTarget(this.viewer, detail),
    );
    this._removeWorldRequestFocusListener = registerWorldFocusRequestListener(
      window,
      this._worldRequestFocusHandler,
    );
    this._navigationOwnerChangedRemover = viewer.trackedEntityChanged.addEventListener((entity) => {
      if (entity && !this._disposed) this._stampNavigation({ cancelPendingSelection: false });
    });
    // Vessel/installation focus flies without ever assigning a tracked entity,
    // so it cannot reach the listener above. It announces instead.
    this._removeNavigationAuthorityListener = registerNavigationAuthorityListener(
      window,
      (event) => {
        if (this._disposed) return;
        this._stampNavigation({
          cancelPendingSelection: event?.detail?.cancelPendingSelection !== false,
        });
      },
    );
  }

  /** Whether the full-globe celestial overlay is enabled by user preference. */
  get celestialRingEnabled() {
    return !!this.celestialRing?.enabled;
  }

  /** Whether a share link was used to load the page */
  get hasShareState() {
    return !!this._hasShareState;
  }

  /**
   * Terminal result for the shared camera + visual/panel restore only — the
   * startup splash gates on this. Saved layers keep restoring afterwards; use
   * `initialRestorePromise` for the complete aggregate.
   */
  get initialViewReadyPromise() {
    return this._initialViewReadyGate?.promise
      || Promise.resolve({ status: 'not-requested', share: null });
  }

  /** Terminal result for the complete initial share restoration. */
  get initialRestorePromise() {
    return this._initialShareRestorePromise || Promise.resolve({ status: 'not-requested' });
  }

}

// Method groups live in ui*.js mixins; attached once at module load.
Object.assign(StyleManager.prototype, styleStagesMixin, detectionUiMixin, presetDefaultsMixin, shareStateMixin, panelChromeMixin, dataManagerAttachMixin, hudPortalMixin, publicApiMixin, cleanViewMixin, loadingFeedbackMixin, disposeMixin);

// Adaptive panel layout, drag/position persistence, and the shared
// setPanelCollapsed/share-state entry points live in panelAdaptiveLayoutMixin.js
// (see that file's header for why this is a mixin rather than pure functions).
Object.assign(StyleManager.prototype, panelAdaptiveLayoutMixin);

// CCTV panel wiring, calibration inline-edit, and state-driven re-render live
// in cctvPanelMixin.js (see that file's header for why this is a mixin rather
// than pure functions).
Object.assign(StyleManager.prototype, cctvPanelMixin);

// Radio panel wiring (main panel, Context-mode mini launcher, Cockpit-style
// companion), tuner interaction, and state-driven re-render live in
// radioPanelMixin.js (see that file's header for why this is a mixin rather
// than pure functions).
Object.assign(StyleManager.prototype, radioPanelMixin);

// Global Context mode (Contacts/Space Missions exclusive-layer transaction
// system) — session capture/restore, layer isolation, the mode state
// machine, the layer-change reaction handler, and panel button sync — lives
// in contextModeMixin.js (see that file's header for why this is a mixin
// rather than pure functions, and for the boundary rationale on what stayed
// behind in ui.js).
Object.assign(StyleManager.prototype, contextModeMixin);

// Navigation Authority (camera-ownership generation/handoff) and the
// Location Bar (city pill / POI / world-jump-transition / mini-status UI)
// live in navigationLocationMixin.js (see that file's header for why this is
// a mixin rather than pure functions, and for the boundary rationale on what
// stayed behind in ui.js — Orbit mode, setOrbit(), and the constructor's
// navigation-authority listener wiring).
Object.assign(StyleManager.prototype, navigationLocationMixin);

// Cockpit Control Facade (cockpit status/entry/exit/navigation, plus the
// voice/scene control-state and visual-state snapshot/restore pair) lives
// in cockpitControlMixin.js (see that file's header for the split-import
// rationale on STYLES; layer access there is via the DataLayerManager
// facade, not direct militaryAwareness/militaryFlights/flights imports).
Object.assign(StyleManager.prototype, cockpitControlMixin);
