import * as Cesium from 'cesium';
import { retroShader } from './styles/retro.js';
import { animeShader } from './styles/anime.js';
import { noirShader } from './styles/noir.js';
import { snowShader } from './styles/snow.js';
import { nightVisionShader } from './styles/surveillance.js';
import { thermalShader } from './styles/thermal.js';
import {
  BLOOM_INTENSITY_DEFAULT,
  BLOOM_SCALE_VERSION,
  bloomStrengthFromIntensity,
  clampBloomIntensity,
  decodeBloomIntensity,
} from './bloom.js';
import { LOCATIONS, CITY_POIS, GLOBE_VIEW, flyToGlobeView, flyToPresetLocation, flyToPOI, searchAndFlyTo } from './locations.js';
import { locationMiniStatus } from './locationStatus.js';
import { interruptCameraMotion } from './cameraVerbs.js';
import {
  aircraftTrackingTarget,
  enterCockpitWithTracking,
} from './cockpitTracking.js';
import { IntelHUD } from './hud.js';
import { ShareLinkManager } from './sharelink.js';
import {
  isExplicitLayerStateOrigin,
  LayerStateCoordinator,
} from './data/layerState.js';
import { renderMapStackChips, syncMapStackChips } from './mapStackChips.js';
import { OrbitController } from './orbit.js';
import {
  CelestialRing,
  getKeyholeFadeTuning,
  isCelestialRingStyleSupported,
  setKeyholeFadeTuning,
} from './celestialRing.js';
import { destroyTrackedReadout, initTrackedReadout } from './data/trackedReadout.js';
import { destroyWorldOverlay, initWorldOverlay } from './overlays/worldOverlay.js';
import {
  destroyDetection,
  initDetection,
  cycleMode as cycleDetectionMode,
  getDetectionDiagnostics as readDetectionDiagnostics,
  getDetectionTuning,
  getMode as getDetectionMode,
  setMode as setDetectionModeByLabel,
  suspendDetection,
  resumeDetection,
  setDetectionStyle,
  setDetectionTuning,
} from './data/detection.js';
import {
  ALLOCATION_STRATEGIES,
  canonicalizeDensity,
  defaultDensityForProfile,
  normalizeAllocationStrategy,
  normalizeProfile,
  profileForDensity,
} from './data/detectionPolicy.js';
import trafficLayer from './data/traffic.js';
import flightsLayer from './data/flights.js';
import militaryFlightsLayer from './data/militaryFlights.js';
import { isTr3b, toggleTr3b } from './data/tr3bRegistry.js';
import satellitesLayer from './data/satellites.js';
import cctvLayer from './data/cctv.js';
import radioLayer from './data/radio.js';
import bikeshareLayer from './data/bikeshare.js';
import aisLiveVesselsLayer from './data/aisLiveVessels.js';
import militaryAwarenessLayer from './data/militaryAwareness.js';
import militaryInstallationsLayer from './data/militaryInstallations.js';
import rocketLaunchesLayer from './data/rocketLaunches.js';
import {
  aggregateLayerLoading,
  canPresentDeferredStatusNotice,
  createGlobalStatusNotice,
  createLoadingFeedbackState,
  createTrafficSyncFeedbackState,
  presentGlobalLoadingStatus,
  presentGlobalStatusNotice,
  presentLoadingFeedback,
  reduceLoadingFeedback,
  reduceTrafficSyncFeedback,
} from './loadingFeedback.js';
import { setSplitFlapText } from './splitFlap.js';
import {
  cockpitEntryAllowed,
  contextAllowedLayerIds,
  contextLayerEnableBlockReason,
  contextRestoreLayerIds,
  contextSnapshotLayerIds,
  isExplicitUserIntentOrigin,
  mergeContextTransitionErrors,
  recordContextRestoreExplicitChange,
  recordContextSessionUserChange,
  runWithContextModeChanging,
  settleContextModeChange,
  settleContextIntentReplay,
  settleUserFacingContextAction,
  shouldCaptureContextSession,
  shouldDeferContextEntryDuringClear,
  shouldExitContextForLayerChange,
  spaceMissionEntryCancellationDisposition,
  contextModeWord,
} from './contextModePolicy.js';
import {
  shouldExpandGlobalContextPanel,
} from './rightRailPolicy.js';
import {
  resolveCockpitUtilityAnchor,
  resolveCockpitUtilityLayout,
} from './cockpitUtilityLayout.js';
import {
  applyCockpitVisionStageIntensities,
  captureCockpitVisionBaseline,
  COCKPIT_VISION_MODES,
  normalizeCockpitVisionMode,
} from './cockpitVisionPolicy.js';
import {
  applyContactsDetection,
  shareCacheNeedsHeal,
  shareableDetectionState,
} from './contactsDetectionPolicy.js';
import { formatAwarenessLabel } from './data/militaryAwarenessEngine.js';
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
  beginDeferredNavigation,
  reassertNavigationHandoff,
  registerNavigationAuthorityListener,
  runExplicitNavigation,
  stampInitialShareGesture,
} from './navigationPolicy.js';
import {
  cachedGroundFloor,
  cachedMeshFloor,
  GROUND_FLOOR_LIFT_M,
  meshFloorPreferred,
  warmGroundFloor,
} from './data/groundFloor.js';
import { sampleMeshFloorCells } from './data/meshFloorSampler.js';
import { holdContinuousRender, releaseContinuousRender, governorRequestRender } from './renderGovernor.js';
import {
  setScopeMaskEnabled,
  isScopeMaskEnabled,
  setScopeMaskFeather,
  getScopeMaskFeather,
  setScopeMaskOpacity,
  getScopeMaskOpacity,
  setScopeTerminusOverride,
  getScopeTerminusOverride,
  clampScopeTerminusPct,
} from './scopeMask.js';
import {
  fetchRegionalBrief,
  regionalDistanceM,
  weatherCodeLabel,
} from './data/regionalBrief.js';
import {
  altitudeRulerCurveInset,
  altitudeRulerTicks,
  bearingBetweenCoordinates,
  cockpitAnchorCorrectionStep,
  cockpitAltitudeDisplayFt,
  cockpitGroundSafeHeight,
  cockpitSurfaceWaitExpired,
  cockpitUiUpdateDue,
  compassDivisions,
  formatAltitudeRulerTick,
  formatCockpitContextScope,
  formatCompassDivision,
  formatSpeedRulerTick,
  normalizeHeading,
  relativeBearing,
  resolveCockpitContextReadout,
  resolveTrackedAircraftInfo,
  slewHeading,
  speedRulerTicks,
} from './cockpitMath.js';
import { PANEL_POSITION_STORAGE_VERSION, PANEL_Z_BASE } from './panelPositionConstants.js';
import { panelAdaptiveLayoutMixin } from './panelAdaptiveLayoutMixin.js';
import { cctvPanelMixin } from './cctvPanelMixin.js';
import { radioPanelMixin } from './radioPanelMixin.js';

/** Duration (ms) for shader intensity crossfade between style presets. */
const TRANSITION_DURATION_MS = 500;
/** Map of style name to its GLSL shader module for post-process stages. */
const STYLES = { retro: retroShader, surveillance: nightVisionShader, thermal: thermalShader, anime: animeShader, noir: noirShader, snow: snowShader };
/** Standard map-view panels cleared out of the way on a fresh Cockpit entry. */
const COCKPIT_ENTRY_COLLAPSE_PANEL_IDS = Object.freeze([
  'data-panel',
  'cctv-panel',
  'scene-panel',
  'pp-toggles',
  'global-context-panel',
  'radio-panel',
]);
const DETECTION_ALLOCATION_STORAGE_KEY = 'gev:detection-allocation:v1';
const COCKPIT_HEADING_SLEW_DPS = 28;
const COCKPIT_FORWARD_OFFSET_M = 7;
const COCKPIT_UP_OFFSET_M = 2.6;
const COCKPIT_MIN_GROUND_CLEARANCE_M = 12;
const COCKPIT_VIEW_PITCH_DEG = -4;
const COCKPIT_CAMERA_UPDATE_MS = 50;
const COCKPIT_HUD_UPDATE_MS = 100;
const COCKPIT_CONTEXT_UPDATE_MS = 250;
const COCKPIT_LAYOUT_SETTLE_MS = 240;
// Cockpit's Display/Radio strip hangs off the REC readout it shares the right
// margin with, and never touches the briefing card underneath it.
const COCKPIT_UTILITY_REC_GAP_PX = 12;
const COCKPIT_UTILITY_SIGNAL_GAP_PX = 8;
const COCKPIT_UTILITY_MIN_TOP_PX = 96;
const COCKPIT_UTILITY_MIN_TOP_RATIO = 0.12;
const COCKPIT_UTILITY_LAUNCHER_MIN_HEIGHT_PX = 50;
const COCKPIT_GROUND_PROBE_MS = 500;
const COCKPIT_GROUND_WAIT_TIMEOUT_MS = 5000;
const COCKPIT_BRIEF_ROTATE_MS = 9000;
const COCKPIT_BRIEF_CYCLE_OFF_HELP = 'Cycle briefing pages automatically every 9 seconds (Signals → News → Local). Pauses while you hover or focus the panel. Live signal data refreshes continuously either way.';
const COCKPIT_BRIEF_CYCLE_ON_HELP = 'Stop automatic page cycling. Previous, Next, and the SIG/NEWS/LOCAL tabs stay available.';
const COCKPIT_REGIONAL_REFRESH_MS = 5 * 60_000;
const COCKPIT_REGIONAL_REFRESH_DISTANCE_M = 25_000;
const COCKPIT_BRIEF_PAGES = [
  {
    id: 'signals',
    kicker: 'LIVE SIGNALS',
    subtitle: 'OBSERVED / MAPPED PINGS',
    source: 'SOURCE-BACKED EVENTS · NO SYNTHETIC NEWS',
  },
  {
    id: 'news',
    kicker: 'REGIONAL NEWS',
    subtitle: 'LATEST LOCATION-MATCHED REPORTING',
    source: 'GOOGLE NEWS RSS · LOCATION QUERY · RECENT',
  },
  {
    id: 'local',
    kicker: 'LOCAL INFO',
    subtitle: 'PLACE / CONDITIONS / POSITION',
    source: 'OPENSTREETMAP · OPEN-METEO · UTC',
  },
];
/**
 * Whether an element currently occupies screen space a layout must respect.
 *
 * A rect alone is not enough: `visibility: hidden` and `opacity: 0` (how the
 * Intel HUD retires as a whole) leave the rect intact, so anything anchoring to
 * a HUD readout must walk the ancestors as well.
 *
 * @param {Element|null|undefined} element - Candidate element.
 * @returns {boolean} True when the element is painted and has area.
 */
function isRenderedOnScreen(element) {
  if (!element) return false;
  for (let node = element; node instanceof Element; node = node.parentElement) {
    const style = getComputedStyle(node);
    if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) {
      return false;
    }
  }
  const rect = element.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}
/** Display labels shown in the mini-status readout for each active style. */
const STYLE_STATUS_LABELS = {
  normal: 'NORMAL',
  retro: 'CRT',
  surveillance: 'NVG',
  thermal: 'FLIR',
  anime: 'ANIME',
  noir: 'NOIR',
  snow: 'SNOW',
};
/**
 * The tactical detection look: Dense at 75%.
 *
 * Owner playtest 2026-08-18: "detection mode… 75% weighted, with the 16% fade
 * and 5% outside, whatever we had. I want that as the default. It should just
 * happen." Fade and outside opacity live in GLOBAL_POST_DEFAULTS, so "whatever
 * we had" still needs nothing here — but they are 7% and 1% now, the outside
 * default having moved 5 → 3 → 1 as the owner locked final tuning after field trials (2026-08-24). What the quote asked for is the
 * baseline of the day, not the two numbers it happened to name.
 *
 * ONE object, shared by the first-load baseline below, by every military style,
 * AND by the Contacts context mode (which OWNS detection while active and
 * restores the prior state on exit — see contactsDetectionPolicy.js). Cockpit
 * deliberately does NOT touch detection: entering it with SPARSE selected leaves
 * SPARSE. Declared ahead of GLOBAL_POST_DEFAULTS because that baseline now reads
 * from it.
 */
const MILITARY_DETECTION_PRESET = Object.freeze({ mode: 'dense', densityPct: 75 });

/** Baseline post-processing settings applied on first load (before share-link restore). */
const GLOBAL_POST_DEFAULTS = {
  bloom: { enabled: false, intensity: BLOOM_INTENSITY_DEFAULT },
  sharpen: { enabled: true, intensity: 49 },
  hudVariant: 'tactical',
  hudVisible: true,
  // Detection is ON for EVERY style on a first run, Normal included (owner
  // directive 2026-08-22: "detect should also be on by default"). It is the
  // same preset object the military styles and Contacts already apply, so there
  // is one tactical look, not several that can drift.
  //
  // This is a first-LOAD baseline, not an override: `_applyGlobalPostDefaults`
  // runs before any share-link restore, so a link's `dm`/`dd` still lands on top
  // of it. It also deliberately leaves `_detectionUserOverridden` alone — the
  // flag means the OPERATOR hand-edited detection, and a factory default is not
  // that. Turning detection off by hand therefore still sets the flag and still
  // suppresses the military-style auto-enable for the rest of the session.
  detectionMode: MILITARY_DETECTION_PRESET.mode.toUpperCase(),
  detectionDensity: MILITARY_DETECTION_PRESET.densityPct,
  detectionAllocation: 'ELASTIC',
  detectionFadePct: 7,
  detectionOutsideOpacityPct: 1,
  celestialRing: false,
};

// Tactical style defaults applied when users select military style presets.
const STYLE_PRESET_DEFAULTS = {
  retro: {
    bloom: { enabled: false, intensity: BLOOM_INTENSITY_DEFAULT },
    sharpen: { enabled: true, intensity: 49 },
    styleParams: {
      retro: {
        pixelation: 1.0,
        distortion: 0,
        instability: 0.42,
      },
    },
    hudVariant: 'tactical',
    hudVisible: true,
    detection: MILITARY_DETECTION_PRESET,
  },
  surveillance: {
    bloom: { enabled: false, intensity: BLOOM_INTENSITY_DEFAULT },
    sharpen: { enabled: true, intensity: 49 },
    styleParams: {
      surveillance: {
        gain: 0.18,
        bloom: 0.22,
        scanlineStr: 0.96,
        pixelation: 1.0,
      },
    },
    hudVariant: 'tactical',
    hudVisible: true,
    detection: MILITARY_DETECTION_PRESET,
  },
  thermal: {
    bloom: { enabled: false, intensity: BLOOM_INTENSITY_DEFAULT },
    sharpen: { enabled: true, intensity: 49 },
    styleParams: {
      thermal: {
        sensitivity: 0.85,
        bloom: 0.2,
        mode: 0.33,
        pixelation: 1.0,
      },
    },
    hudVariant: 'tactical',
    hudVisible: true,
    detection: MILITARY_DETECTION_PRESET,
  },
};

/**
 * GLSL fragment shader implementing an unsharp-mask sharpening filter.
 * Samples a 3x3 neighborhood, computes box blur, then adds the
 * difference (center - blur) scaled by `amount` for edge enhancement.
 */
const SHARPEN_SHADER = /* glsl */ `
  uniform sampler2D colorTexture;
  uniform vec2 colorTextureDimensions;
  uniform float amount;
  in vec2 v_textureCoordinates;

  void main() {
    vec2 uv = v_textureCoordinates;
    vec2 texel = 1.0 / colorTextureDimensions;
    vec4 center = texture(colorTexture, uv);
    vec4 blur = (
      texture(colorTexture, uv + vec2(-texel.x, -texel.y)) +
      texture(colorTexture, uv + vec2( 0.0,     -texel.y)) +
      texture(colorTexture, uv + vec2( texel.x, -texel.y)) +
      texture(colorTexture, uv + vec2(-texel.x,  0.0))     +
      center +
      texture(colorTexture, uv + vec2( texel.x,  0.0))     +
      texture(colorTexture, uv + vec2(-texel.x,  texel.y)) +
      texture(colorTexture, uv + vec2( 0.0,      texel.y)) +
      texture(colorTexture, uv + vec2( texel.x,  texel.y))
    ) / 9.0;
    vec4 sharpened = center + (center - blur) * amount;
    out_FragColor = vec4(clamp(sharpened.rgb, 0.0, 1.0), center.a);
  }
`;

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

function formatCockpitBriefAge(value) {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return 'TIME UNKNOWN';
  const minutes = Math.max(0, Math.round((Date.now() - timestamp) / 60_000));
  if (minutes < 60) return `${minutes}M AGO`;
  const hours = Math.round(minutes / 60);
  return hours < 48 ? `${hours}H AGO` : `${Math.round(hours / 24)}D AGO`;
}

function formatCockpitWindDirection(value) {
  if (!Number.isFinite(value)) return 'DIR UNKNOWN';
  const labels = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  const normalized = ((value % 360) + 360) % 360;
  return `${labels[Math.round(normalized / 45) % labels.length]} · ${Math.round(normalized)}°`;
}

function setCockpitRollingValue(element, text, numericValue, {
  circularRange = null,
  immediate = false,
} = {}) {
  if (!element) return;
  const nextText = String(text);
  const previousText = element.dataset.rollingText;
  const previousValue = Number(element.dataset.rollingValue);
  const nowMs = performance.now();
  const lastRollMs = Number(element.dataset.rollingAt);
  if (!immediate
    && previousText !== undefined
    && previousText !== nextText
    && Number.isFinite(lastRollMs)
    && nowMs - lastRollMs < 220) {
    return;
  }
  element.dataset.rollingText = nextText;
  element.dataset.rollingAt = String(nowMs);
  if (Number.isFinite(numericValue)) element.dataset.rollingValue = String(numericValue);
  else delete element.dataset.rollingValue;
  element.setAttribute('aria-label', nextText);

  if (immediate || previousText === undefined || previousText === nextText) {
    if (previousText !== nextText || !element.querySelector('.cockpit-roll-token')) {
      element.replaceChildren(...Array.from(nextText, (character) => {
        const token = document.createElement('span');
        token.className = 'cockpit-roll-token';
        token.setAttribute('aria-hidden', 'true');
        token.textContent = character;
        return token;
      }));
    }
    return;
  }

  let delta = Number.isFinite(numericValue) && Number.isFinite(previousValue)
    ? numericValue - previousValue
    : 0;
  if (Number.isFinite(circularRange) && circularRange > 0) {
    const halfRange = circularRange / 2;
    if (delta > halfRange) delta -= circularRange;
    else if (delta < -halfRange) delta += circularRange;
  }
  const direction = delta < 0 ? 'down' : 'up';
  const width = Math.max(previousText.length, nextText.length);
  const from = previousText.padStart(width, ' ');
  const to = nextText.padStart(width, ' ');
  const fragment = document.createDocumentFragment();

  for (let index = 0; index < width; index += 1) {
    const previousCharacter = from[index];
    const nextCharacter = to[index];
    const token = document.createElement('span');
    token.className = 'cockpit-roll-token';
    token.setAttribute('aria-hidden', 'true');

    if (previousCharacter === nextCharacter
      || !/\d/.test(previousCharacter)
      || !/\d/.test(nextCharacter)) {
      token.textContent = nextCharacter === ' ' ? '\u00a0' : nextCharacter;
      fragment.append(token);
      continue;
    }

    token.classList.add('is-rolling', `roll-${direction}`);
    const track = document.createElement('span');
    track.className = 'cockpit-roll-track';
    const first = document.createElement('span');
    const second = document.createElement('span');
    first.textContent = direction === 'up' ? previousCharacter : nextCharacter;
    second.textContent = direction === 'up' ? nextCharacter : previousCharacter;
    track.append(first, second);
    token.append(track);
    fragment.append(token);
  }

  element.replaceChildren(fragment);
}

class CockpitViewController {
  constructor(viewer, {
    onVisionChange = null,
    onCameraTakeover = null,
    isEntryAllowed = null,
    onEntered = null,
    onExited = null,
    getInheritedVisionLabel = null,
    restoreTrackingFrame = null,
  } = {}) {
    this.viewer = viewer;
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
      militaryAwarenessLayer.focusTarget?.(
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

  _listen(target, type, handler, options) {
    if (!target?.addEventListener) return;
    target.addEventListener(type, handler, options);
    this._listenerRemovers.push(() => target.removeEventListener(type, handler, options));
  }

  syncWeatherToggle(enabled) {
    if (!this.weatherToggle) return;
    const active = !!enabled;
    this.weatherToggle.setAttribute('aria-pressed', String(active));
    this.weatherToggle.setAttribute(
      'aria-label',
      `${active ? 'Disable' : 'Enable'} cockpit weather effects`,
    );
    this.weatherToggle.title = `${active ? 'Disable' : 'Enable'} cockpit weather effects`;
    if (this.weatherState) this.weatherState.textContent = active ? 'ON' : 'OFF';
  }

  readAircraftInfo() {
    // In cockpit mode the controller takes the entity off `viewer.trackedEntity`
    // (see update()), so the cockpit's own handle is the tracked identity there.
    const trackedEntity = this.viewer?.trackedEntity || this.trackedEntity;
    return resolveTrackedAircraftInfo({
      civilian: flightsLayer.getTrackedInfo?.() || null,
      military: militaryFlightsLayer.getTrackedInfo?.() || null,
      trackedId: trackedEntity?.gevTrackedId || '',
    });
  }

  dispatchCockpitModeChanged(active, info = null) {
    const subjectId = active
      ? String(info?.icao24 || '').trim().toLowerCase() || null
      : null;
    const layerId = active && ['flights', 'military'].includes(info?.layerId)
      ? info.layerId
      : null;
    window.dispatchEvent(new CustomEvent('gev:cockpit-mode-changed', {
      detail: { active: active === true, subjectId, layerId },
    }));
  }

  /**
   * TR-3B Easter egg: flip the tracked contact between its real silhouette and
   * the black triangle. The registry owns the session state; the owning layer
   * re-derives what renders.
   * @returns {boolean} True when a tracked contact was converted/restored.
   */
  toggleTrackedTr3b() {
    const info = this.readAircraftInfo();
    const icao24 = String(info?.icao24 || '').trim();
    if (!icao24) return false;
    toggleTr3b(icao24);
    const layer = info.layerId === 'military' ? militaryFlightsLayer : flightsLayer;
    layer.refreshTr3b?.(icao24);
    this._tr3bSignature = null; // force the chip to repaint on the next sync
    this.syncTr3bToggle(info);
    return true;
  }

  /**
   * Show the 🛸 chip whenever a contact is tracked (its own gate — converting
   * does not depend on the cockpit entry policy) and mirror the conversion
   * state. Change-only DOM writes: this runs on the preUpdate cadence.
   * @param {object|null} info Tracked-aircraft descriptor, or null.
   */
  syncTr3bToggle(info) {
    if (!this.tr3bToggle) return;
    const icao24 = String(info?.icao24 || '').trim();
    const converted = !!icao24 && isTr3b(icao24);
    const signature = icao24 ? `${icao24}:${converted ? 1 : 0}` : '';
    if (this._tr3bSignature === signature) return;
    this._tr3bSignature = signature;
    this.tr3bToggle.hidden = !icao24;
    this.tr3bToggle.setAttribute('aria-pressed', converted ? 'true' : 'false');
    this.tr3bToggle.title = converted ? 'Restore real aircraft' : 'Reclassify as TR-3B';
  }

  syncEntry() {
    if (this.active) return;
    const info = this.readAircraftInfo();
    const trackedContact = !!(info && this.viewer.trackedEntity?.position);
    this.syncTr3bToggle(trackedContact ? info : null);
    const available = !!(this.isEntryAllowed() && trackedContact);
    // Change-only DOM writes: this runs on a preUpdate cadence, and
    // unconditional `hidden` assignments invalidate style/layout every frame
    // even when nothing changed. (perf item 9)
    if (this._entryAvailable === available) return;
    this._entryAvailable = available;
    if (this.entry) this.entry.hidden = !available;
    if (this.mapViewButton) this.mapViewButton.hidden = true;
    if (this.resetGlobeButton) this.resetGlobeButton.hidden = true;
  }

  /**
   * Navigate Contacts through one Cockpit-owned funnel. A short grace window
   * covers feed-refresh handoffs where the old source releases before the new
   * source publishes its entity; trackedEntityChanged adopts synchronously as
   * soon as the replacement exists, so the normal path does not wait.
   */
  navigateContext(direction, options = {}) {
    const method = direction < 0 ? 'navigatePrevious' : 'navigateNext';
    const wasActive = this.active;
    if (wasActive) this.contextNavigationDeadlineMs = performance.now() + 1500;
    const navigationOptions = wasActive ? { ...options, aircraftOnly: true } : options;
    const changed = Boolean(militaryAwarenessLayer?.[method]?.(navigationOptions));
    if (!changed) {
      this.contextNavigationDeadlineMs = 0;
      return false;
    }
    if (wasActive) this._adoptTrackedEntity(performance.now());
    return true;
  }

  /** Adopt a newly selected aircraft without ever leaving Cockpit. */
  _adoptTrackedEntity(nowMs, suppliedInfo = null) {
    const nextEntity = this.viewer.trackedEntity;
    if (!this.active || !nextEntity?.position || nextEntity === this.trackedEntity) return false;
    const info = suppliedInfo || this.readAircraftInfo();
    if (!info) return false;
    if (this.trackedEntity && this.viewer.entities.contains(this.trackedEntity)) {
      this.trackedEntity.show = this.trackedEntityWasShown;
    }
    this.trackedEntity = nextEntity;
    this.trackedEntityWasShown = nextEntity.show;
    nextEntity.show = false;
    this.viewer.trackedEntity = undefined;
    this.cockpitAnchorValid = false;
    this.heading = normalizeHeading(info.track ?? 0);
    this.lastFrameMs = nowMs;
    this.lastHudUpdateMs = 0;
    this.lastContextUpdateMs = 0;
    this.lastCameraUpdateMs = 0;
    this.contextNavigationDeadlineMs = 0;
    this.dispatchCockpitModeChanged(true, info);
    return true;
  }

  setVisionMode(mode, { revealParameters = false } = {}) {
    const next = normalizeCockpitVisionMode(mode);
    this.visionMode = next;
    const inherited = String(this.getInheritedVisionLabel?.() || 'NORMAL').toUpperCase();
    const labels = { optical: inherited, crt: 'CRT', nvg: 'NVG', thermal: 'FLIR', noir: 'NOIR' };
    const names = { optical: inherited, crt: 'CRT', nvg: 'Night vision', thermal: 'Thermal', noir: 'Noir' };
    if (this.visionCurrent) {
      this.visionCurrent.dataset.cockpitVision = next;
      this.visionCurrent.setAttribute('aria-label', `Current cockpit vision style: ${names[next]}. Activate for next style.`);
      this.visionCurrent.title = `Current style: ${names[next]} — click for next`;
    }
    if (this.visionCurrentLabel) this.visionCurrentLabel.textContent = labels[next];
    this.onVisionChange?.(next, this.active, { revealParameters });
  }

  cycleVisionMode(direction = 1) {
    const modes = COCKPIT_VISION_MODES;
    const currentIndex = Math.max(0, modes.indexOf(this.visionMode));
    const step = direction < 0 ? -1 : 1;
    const nextIndex = (currentIndex + step + modes.length) % modes.length;
    this.setVisionMode(modes[nextIndex], { revealParameters: true });
  }

  clearPredictiveRoute() {
    if (this.routeDirection) this.routeDirection.hidden = true;
  }

  onKeyDown(event) {
    if (event.repeat || event.isComposing) return;
    if (event.key === 'Escape' && this.active) {
      if (document.getElementById('context-radio-dock')?.classList.contains('disclosure-open')) return;
      if (document.querySelector('#cockpit-utility-controls [aria-expanded="true"]')) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      this.exit();
      return;
    }
    if (event.target?.closest?.('input, textarea, select, [contenteditable]')) return;
    const key = event.key?.toLowerCase();
    if (key === 'c' && !event.metaKey && !event.ctrlKey && !event.altKey) {
      if (!this.active) {
        const cockpitAttempt = !!(this.readAircraftInfo() && this.viewer.trackedEntity?.position);
        if (!cockpitAttempt) return;
      }
      event.preventDefault();
      event.stopImmediatePropagation();
      if (!this.active && !this.isEntryAllowed()) return;
      const changed = this.active ? this.exit() : this.enter();
      return;
    }
  }

  enter() {
    if (this.active) return false;
    if (!this.isEntryAllowed()) return false;
    const info = this.readAircraftInfo();
    const entity = this.viewer.trackedEntity;
    if (!info || !entity?.position) return false;
    this.entryFocusOrigin = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    // Retire deferred navigation before cancelFlight can run its callbacks.
    this.onCameraTakeover?.();
    this.viewer.camera.cancelFlight();
    this.trackedEntity = entity;
    this.trackedEntityWasShown = entity.show;
    entity.show = false;
    this.heading = normalizeHeading(info.track ?? 0);
    this.lastFrameMs = performance.now();
    this.lastCameraUpdateMs = 0;
    this.lastHudUpdateMs = 0;
    this.lastContextUpdateMs = 0;
    this.contextNavigationDeadlineMs = 0;
    this.lastGroundProbeMs = 0;
    this.surfaceWaitStartedMs = performance.now();
    this.surfaceAcquiring = false;
    this.surfaceFallback = false;
    this.lastCompassSignature = '';
    this.cockpitAnchorValid = false;
    this.lastCameraUpdateMs = 0;
    this.active = true;
    // Cockpit animates the camera from preUpdate every frame — preUpdate only
    // runs on rendered frames, so idle mode would freeze the cockpit solid.
    // (perf wave 2)
    holdContinuousRender('cockpit');
    this.viewer.trackedEntity = undefined;
    this.viewer.scene.screenSpaceCameraController.enableInputs = false;
    document.body.classList.add('cockpit-mode');
    // Activation writes entry/quick/map visibility directly, bypassing
    // syncEntry's change-only cache — invalidate it so the exit-path
    // syncEntry re-applies every write (notably re-hiding mapViewButton).
    this._entryAvailable = undefined;
    if (this.entry) this.entry.hidden = true;
    if (this.tr3bToggle) {
      this.tr3bToggle.hidden = true;
      this._tr3bSignature = null;
    }
    if (this.mapViewButton) this.mapViewButton.hidden = false;
    if (this.resetGlobeButton) this.resetGlobeButton.hidden = false;
    if (this.hud) this.hud.hidden = false;
    if (this.signalStream) this.signalStream.hidden = false;
    this.hud?.classList.add('signals-active');
    this.signalItems = [];
    this.signalSignatures.clear();
    this.showBriefPage(0);
    this.startBriefRotation();
    const trackLabel = info.callsign || info.registration || info.icao24 || 'AIRCRAFT';
    const trackHeading = String(Math.round(normalizeHeading(info.track ?? 0))).padStart(3, '0');
    this.pushCockpitSignal(
      'track',
      'track',
      'TRACK ACQUIRED',
      `${trackLabel} · COURSE ${trackHeading}°`,
    );
    this.updateHud(info, performance.now(), true);
    this.setVisionMode(this.visionMode);
    this.scheduleContextLayout();
    this.mapViewButton?.focus({ preventScroll: true });
    this.onEntered?.();
    this.dispatchCockpitModeChanged(true, info);
    return true;
  }

  exit({ restoreTracking = true } = {}) {
    if (!this.active) return false;
    const entity = this.trackedEntity;
    this.active = false;
    releaseContinuousRender('cockpit');
    this.trackedEntity = null;
    this.heading = null;
    this.cockpitAnchorValid = false;
    this.surfaceWaitStartedMs = 0;
    this.surfaceAcquiring = false;
    this.surfaceFallback = false;
    this.lastHudUpdateMs = 0;
    this.lastContextUpdateMs = 0;
    this.contextNavigationDeadlineMs = 0;
    this.lastCompassSignature = '';
    this.stopBriefRotation();
    this.regionalBriefAbort?.abort();
    this.regionalBriefAbort = null;
    this.regionalBriefRequestToken += 1;
    this.regionalBriefSubjectId = null;
    document.body.classList.remove('cockpit-mode');
    this.onExited?.();
    this.hud?.style.removeProperty('--cockpit-utility-top');
    this.hud?.style.removeProperty('--cockpit-utility-max-height');
    if (this.hud) this.hud.hidden = true;
    if (this.route) this.route.hidden = true;
    this.clearPredictiveRoute();
    this.setVisionMode('optical');
    if (this.signalStream) this.signalStream.hidden = true;
    this.hud?.classList.remove('signals-active');
    this.viewer.scene.screenSpaceCameraController.enableInputs = true;
    if (entity && this.viewer.entities.contains(entity)) entity.show = this.trackedEntityWasShown;
    this.trackedEntityWasShown = true;
    this.dispatchCockpitModeChanged(false);
    if (restoreTracking && entity && this.viewer.entities.contains(entity)) {
      this.viewer.trackedEntity = entity;
      this.restoreTrackingFrame(entity);
    }
    this.syncEntry();
    const restoreTarget = this.entryFocusOrigin === this.entry
      ? this.entry
      : (this.entry || this.entryFocusOrigin);
    this.entryFocusOrigin = null;
    if (restoreTarget?.isConnected && !restoreTarget.hidden) {
      restoreTarget.focus({ preventScroll: true });
    }
    return true;
  }

  update() {
    if (!this.active) {
      // Entry availability changes on a human timescale (tracking start/stop,
      // info arriving after a poll) — polling it every rendered frame ran
      // readAircraftInfo() + DOM pokes at display rate in plain map mode.
      // 250 ms keeps the chip imperceptibly fresh; trackedEntityChanged still
      // fires syncEntry immediately on the events that matter. (perf item 9)
      const nowMs = performance.now();
      if (nowMs - (this._lastEntrySyncMs || 0) >= 250) {
        this._lastEntrySyncMs = nowMs;
        this.syncEntry();
      }
      return;
    }

    const nowMs = performance.now();
    const info = this.readAircraftInfo();

    // Adopt a newly selected track before the camera cadence gate. A context
    // NEXT/PREV selection can otherwise spend one frame driving the old
    // aircraft with the new aircraft's metadata.
    this._adoptTrackedEntity(nowMs, info);
    if (!info || !this.trackedEntity || !this.viewer.entities.contains(this.trackedEntity)) {
      if (nowMs < this.contextNavigationDeadlineMs) return;
      this.exit({ restoreTracking: false });
      return;
    }
    if (!cockpitUiUpdateDue(nowMs, this.lastCameraUpdateMs, COCKPIT_CAMERA_UPDATE_MS)) return;
    this.lastCameraUpdateMs = nowMs;

    const target = this.trackedEntity.position.getValue(this.viewer.clock.currentTime, this.scratchTarget);
    if (!target) return;
    const dtSec = Math.min(0.1, Math.max(0, (nowMs - this.lastFrameMs) / 1000));
    this.lastFrameMs = nowMs;
    if (Number.isFinite(info.track)) {
      this.heading = slewHeading(
        this.heading ?? info.track, info.track, COCKPIT_HEADING_SLEW_DPS * dtSec,
      );
    }

    if (!this.cockpitAnchorValid) {
      Cesium.Cartesian3.clone(target, this.cockpitAnchor);
      this.cockpitAnchorValid = true;
    }

    // First-person motion cannot use the delayed feed correction as a raw
    // camera destination: a harmless icon re-anchor becomes a whole-world
    // surge/reversal in cockpit view. Advance the camera anchor inertially
    // from the reported course/speed and converge on the authoritative layer
    // display position at a bounded rate. This preserves the layer's required
    // 15/30-second interpolation and per-frame cache without exposing its
    // sample-boundary corrections to the camera.
    const headingRad = Cesium.Math.toRadians(this.heading ?? 0);
    const pitchRad = Cesium.Math.toRadians(COCKPIT_VIEW_PITCH_DEG);
    const speedMps = Number.isFinite(info.velocityMps) ? Math.max(0, info.velocityMps) : 0;

    if (info.stale) {
      // A feed backoff has no authoritative velocity epoch to advance from.
      // Hold the cockpit on the exact layer-rendered position so the camera
      // cannot coast away while the icon correctly remains fixed.
      Cesium.Cartesian3.clone(target, this.cockpitAnchor);
    } else {
      Cesium.Transforms.eastNorthUpToFixedFrame(
        this.cockpitAnchor, Cesium.Ellipsoid.WGS84, this.scratchEnu,
      );
      this.scratchLocal.x = Math.sin(headingRad);
      this.scratchLocal.y = Math.cos(headingRad);
      this.scratchLocal.z = 0;
      Cesium.Matrix4.multiplyByPointAsVector(this.scratchEnu, this.scratchLocal, this.scratchHorizontal);
      Cesium.Cartesian3.normalize(this.scratchHorizontal, this.scratchHorizontal);
      Cesium.Cartesian3.multiplyByScalar(
        this.scratchHorizontal, speedMps * dtSec, this.scratchAdvance,
      );
      Cesium.Cartesian3.add(this.cockpitAnchor, this.scratchAdvance, this.cockpitAnchor);
      Cesium.Cartesian3.subtract(target, this.cockpitAnchor, this.scratchCorrection);
      const correctionDistanceM = Cesium.Cartesian3.magnitude(this.scratchCorrection);
      const correctionStepM = cockpitAnchorCorrectionStep(correctionDistanceM, speedMps, dtSec);
      if (correctionStepM > 0 && correctionDistanceM > 0) {
        Cesium.Cartesian3.multiplyByScalar(
          this.scratchCorrection, correctionStepM / correctionDistanceM, this.scratchCorrection,
        );
        Cesium.Cartesian3.add(this.cockpitAnchor, this.scratchCorrection, this.cockpitAnchor);
      }
    }

    // The inertial anchor is independent of the layer's render-floor clamp and
    // can otherwise coast into a photoreal mesh while a landing contact is
    // between fixes. Clamp it against the same mesh-first shared floor used by
    // aircraft rendering. For a slow contact whose floor cell is still cold,
    // its already-clamped render position is a conservative temporary floor.
    const anchorCartographic = Cesium.Cartographic.fromCartesian(
      this.cockpitAnchor, Cesium.Ellipsoid.WGS84, this.scratchAnchorCartographic,
    );
    const targetCartographic = Cesium.Cartographic.fromCartesian(
      target, Cesium.Ellipsoid.WGS84, this.scratchTargetCartographic,
    );
    let cockpitFloorM = cachedGroundFloor(info.latitude, info.longitude);
    if (info.onGround === true) {
      const groundPoint = [{ lat: info.latitude, lon: info.longitude }];
      warmGroundFloor(groundPoint);
      const meshFloorM = cachedMeshFloor(info.latitude, info.longitude);
      if (meshFloorPreferred() && !Number.isFinite(meshFloorM)) {
        if (cockpitUiUpdateDue(nowMs, this.lastGroundProbeMs, COCKPIT_GROUND_PROBE_MS)) {
          this.lastGroundProbeMs = nowMs;
          const viewerCartographic = this.viewer.camera.positionCartographic;
          sampleMeshFloorCells(this.viewer.scene, groundPoint, {
            excludeObjects: [this.trackedEntity],
            viewerLat: Cesium.Math.toDegrees(viewerCartographic.latitude),
            viewerLon: Cesium.Math.toDegrees(viewerCartographic.longitude),
          });
        }
        cockpitFloorM = cachedMeshFloor(info.latitude, info.longitude);
        if (!Number.isFinite(cockpitFloorM)) {
          if (!this.surfaceWaitStartedMs) this.surfaceWaitStartedMs = nowMs;
          if (!cockpitSurfaceWaitExpired(nowMs, this.surfaceWaitStartedMs, COCKPIT_GROUND_WAIT_TIMEOUT_MS)) {
            // Keep the already-safe map camera in place while the photoreal
            // surface under a parked aircraft is acquired. The bounded wait
            // prevents a permanently cold mesh cell from freezing cockpit.
            this.surfaceAcquiring = true;
            this.surfaceFallback = false;
            if (cockpitUiUpdateDue(nowMs, this.lastHudUpdateMs, COCKPIT_HUD_UPDATE_MS)) {
              this.lastHudUpdateMs = nowMs;
              this.updateHud(info, nowMs);
            }
            return;
          }
          this.surfaceAcquiring = false;
          this.surfaceFallback = true;
        } else {
          this.surfaceWaitStartedMs = 0;
          this.surfaceAcquiring = false;
          this.surfaceFallback = false;
        }
      }
    } else {
      this.surfaceWaitStartedMs = 0;
      this.surfaceAcquiring = false;
      this.surfaceFallback = false;
    }
    if (!Number.isFinite(cockpitFloorM)
        && speedMps < 90
        && Number.isFinite(targetCartographic?.height)) {
      cockpitFloorM = targetCartographic.height - GROUND_FLOOR_LIFT_M;
    }
    if (anchorCartographic && Number.isFinite(cockpitFloorM)) {
      const minimumAnchorHeightM = cockpitGroundSafeHeight(
        anchorCartographic.height,
        cockpitFloorM,
        COCKPIT_MIN_GROUND_CLEARANCE_M - COCKPIT_UP_OFFSET_M,
      );
      if (minimumAnchorHeightM !== anchorCartographic.height) {
        anchorCartographic.height = minimumAnchorHeightM;
        Cesium.Ellipsoid.WGS84.cartographicToCartesian(anchorCartographic, this.cockpitAnchor);
      }
    }

    // Rebuild the local frame at the stabilized anchor after advancing it.
    Cesium.Transforms.eastNorthUpToFixedFrame(
      this.cockpitAnchor, Cesium.Ellipsoid.WGS84, this.scratchEnu,
    );
    this.scratchLocal.x = Math.sin(headingRad);
    this.scratchLocal.y = Math.cos(headingRad);
    this.scratchLocal.z = 0;
    Cesium.Matrix4.multiplyByPointAsVector(this.scratchEnu, this.scratchLocal, this.scratchHorizontal);
    Cesium.Cartesian3.normalize(this.scratchHorizontal, this.scratchHorizontal);

    this.scratchLocal.x = Math.sin(headingRad) * Math.cos(pitchRad);
    this.scratchLocal.y = Math.cos(headingRad) * Math.cos(pitchRad);
    this.scratchLocal.z = Math.sin(pitchRad);
    Cesium.Matrix4.multiplyByPointAsVector(this.scratchEnu, this.scratchLocal, this.scratchForward);
    Cesium.Cartesian3.normalize(this.scratchForward, this.scratchForward);

    this.scratchLocal.x = -Math.sin(headingRad) * Math.sin(pitchRad);
    this.scratchLocal.y = -Math.cos(headingRad) * Math.sin(pitchRad);
    this.scratchLocal.z = Math.cos(pitchRad);
    Cesium.Matrix4.multiplyByPointAsVector(this.scratchEnu, this.scratchLocal, this.scratchUp);
    Cesium.Cartesian3.normalize(this.scratchUp, this.scratchUp);

    Cesium.Cartesian3.multiplyByScalar(
      this.scratchHorizontal, COCKPIT_FORWARD_OFFSET_M, this.scratchCamera,
    );
    Cesium.Cartesian3.add(this.cockpitAnchor, this.scratchCamera, this.scratchCamera);
    Cesium.Matrix4.getTranslation(this.scratchEnu, this.scratchTarget);
    Cesium.Cartesian3.normalize(this.scratchTarget, this.scratchTarget);
    Cesium.Cartesian3.multiplyByScalar(this.scratchTarget, COCKPIT_UP_OFFSET_M, this.scratchTarget);
    Cesium.Cartesian3.add(this.scratchCamera, this.scratchTarget, this.scratchCamera);

    // Recheck at the final forward-offset camera coordinate because a taxiing
    // aircraft can cross into an adjacent coarse floor cell between updates.
    const cameraCartographic = Cesium.Cartographic.fromCartesian(
      this.scratchCamera, Cesium.Ellipsoid.WGS84, this.scratchCameraCartographic,
    );
    if (cameraCartographic) {
      const cameraLat = Cesium.Math.toDegrees(cameraCartographic.latitude);
      const cameraLon = Cesium.Math.toDegrees(cameraCartographic.longitude);
      const cameraFloorM = cachedGroundFloor(cameraLat, cameraLon);
      if (Number.isFinite(cameraFloorM)) {
        cockpitFloorM = Math.max(cockpitFloorM ?? Number.NEGATIVE_INFINITY, cameraFloorM);
      }
      const safeHeightM = cockpitGroundSafeHeight(
        cameraCartographic.height,
        cockpitFloorM,
        COCKPIT_MIN_GROUND_CLEARANCE_M,
      );
      if (safeHeightM !== cameraCartographic.height) {
        cameraCartographic.height = safeHeightM;
        Cesium.Ellipsoid.WGS84.cartographicToCartesian(cameraCartographic, this.scratchCamera);
      }
    }

    this.viewer.camera.setView({
      destination: this.scratchCamera,
      orientation: { direction: this.scratchForward, up: this.scratchUp },
    });
    if (cockpitUiUpdateDue(nowMs, this.lastHudUpdateMs, COCKPIT_HUD_UPDATE_MS)) {
      this.lastHudUpdateMs = nowMs;
      this.updateHud(info, nowMs);
    }
  }

  updateHud(info, nowMs = performance.now(), forceContext = false) {
    this.lastAircraftInfo = info;
    const heading = normalizeHeading(this.heading ?? info.track ?? 0);
    if (this.callsign) {
      this.callsign.textContent = info.callsign || info.registration || info.icao24 || 'AIRCRAFT';
    }
    const speedKt = Number.isFinite(info.velocityMps) ? info.velocityMps * 1.94384 : null;
    setCockpitRollingValue(
      this.speed,
      formatSpeedRulerTick(speedKt),
      speedKt,
      { immediate: forceContext },
    );
    if (this.speedRim) this.speedRim.classList.toggle('unavailable', speedKt === null);
    if (this.speedRimValue) this.speedRimValue.textContent = formatSpeedRulerTick(speedKt);
    const speedTicks = speedRulerTicks(speedKt, this.speedRimTicks.length);
    this.speedRimTicks.forEach((element, index) => {
      const tick = speedTicks[index];
      element.hidden = !tick;
      if (!tick) return;
      element.style.setProperty('--slot', tick.slot.toFixed(4));
      element.style.setProperty('--depth', tick.depth.toFixed(4));
      element.style.setProperty('--curve', altitudeRulerCurveInset(tick.slot).toFixed(5));
      element.classList.toggle('major', tick.major);
      const label = element.querySelector('b');
      if (label) label.textContent = formatSpeedRulerTick(tick.valueKt);
    });
    const altitudeFt = cockpitAltitudeDisplayFt(info.altitudeM, info.onGround);
    if (this.altitude) {
      const displayedAltitudeFt = Number.isFinite(altitudeFt)
        ? Math.round(altitudeFt)
        : null;
      setCockpitRollingValue(
        this.altitude,
        displayedAltitudeFt !== null
          ? displayedAltitudeFt.toLocaleString('en-US')
          : '-----',
        displayedAltitudeFt,
        { immediate: forceContext },
      );
    }
    if (this.altitudeRim) this.altitudeRim.classList.toggle('unavailable', altitudeFt === null);
    if (this.altitudeRimValue) {
      this.altitudeRimValue.textContent = formatAltitudeRulerTick(altitudeFt);
    }
    const altitudeTicks = altitudeRulerTicks(altitudeFt, this.altitudeRimTicks.length);
    this.altitudeRimTicks.forEach((element, index) => {
      const tick = altitudeTicks[index];
      element.hidden = !tick;
      if (!tick) return;
      element.style.setProperty('--slot', tick.slot.toFixed(4));
      element.style.setProperty('--depth', tick.depth.toFixed(4));
      element.style.setProperty('--curve', altitudeRulerCurveInset(tick.slot).toFixed(5));
      element.classList.toggle('major', tick.major);
      const label = element.querySelector('b');
      if (label) label.textContent = formatAltitudeRulerTick(tick.valueFt);
    });
    setCockpitRollingValue(
      this.headingValue,
      String(Math.round(heading) % 360).padStart(3, '0'),
      heading,
      { circularRange: 360, immediate: forceContext },
    );
    if (this.compassTape) {
      const divisions = compassDivisions(heading);
      const signature = divisions.join(',');
      if (signature !== this.lastCompassSignature) {
        this.lastCompassSignature = signature;
        this.compassTape.innerHTML = divisions
          .map((division, index) => {
            const slot = index - 3;
            return `<span class="${slot === 0 ? 'active' : ''}" style="--slot:${slot};--depth:${Math.abs(slot)}">${formatCompassDivision(division)}</span>`;
          })
          .join('');
      }
    }
    if (this.clock) this.clock.textContent = new Date().toISOString().slice(11, 19) + 'Z';
    if (this.position) {
      const lat = Number.isFinite(info.latitude)
        ? `${Math.abs(info.latitude).toFixed(3)}°${info.latitude >= 0 ? 'N' : 'S'}` : '--';
      const lon = Number.isFinite(info.longitude)
        ? `${Math.abs(info.longitude).toFixed(3)}°${info.longitude >= 0 ? 'E' : 'W'}` : '--';
      this.position.textContent = `${lat} · ${lon}`;
    }
    if (this.aircraftMeta) {
      const feedState = this.surfaceAcquiring
        ? 'ACQUIRING SURFACE'
        : (this.surfaceFallback ? 'SURFACE FALLBACK' : (info.stale ? 'STALE FEED' : 'LIVE TRACK'));
      this.aircraftMeta.textContent = `${info.layerId === 'military' ? 'MILITARY' : 'COMMERCIAL'} · ${feedState} · COURSE ALIGNED`;
    }
    this.updateRoute(info);
    if (forceContext
      || cockpitUiUpdateDue(nowMs, this.lastContextUpdateMs, COCKPIT_CONTEXT_UPDATE_MS)) {
      this.lastContextUpdateMs = nowMs;
      this.updateLocalPosition(info);
      this.maybeRefreshRegionalBrief(info);
      this.updateContext(info, heading);
    }
    if (this.hud) this.hud.dataset.layer = info.layerId || 'flights';
  }

  updateRoute(info) {
    const origin = info?.route?.origin;
    const destination = info?.route?.destination;
    const validDestination = Number.isFinite(destination?.lat) && Number.isFinite(destination?.lon);
    const routeLabel = (airport) => [airport?.code, airport?.name].filter(Boolean).join(' · ') || 'UNKNOWN';
    if (this.routeFrom) this.routeFrom.textContent = routeLabel(origin);
    if (this.routeTo) this.routeTo.textContent = routeLabel(destination);
    if (this.routeStatus) {
      this.routeStatus.textContent = validDestination
        ? 'ARROW · ESTIMATED DIRECTION'
        : 'ROUTE DATA UNAVAILABLE';
    }
    if (this.route) this.route.hidden = !origin && !destination;
    if (!validDestination || !Number.isFinite(info?.longitude) || !Number.isFinite(info?.latitude)) {
      this.clearPredictiveRoute();
      return;
    }
    const destinationBearing = bearingBetweenCoordinates(
      info.latitude,
      info.longitude,
      destination.lat,
      destination.lon,
    );
    const relative = relativeBearing(destinationBearing, this.heading ?? info.track ?? 0);
    if (!Number.isFinite(destinationBearing) || !Number.isFinite(relative)) {
      this.clearPredictiveRoute();
      return;
    }
    if (this.routeDirection) {
      const displayedRelative = Math.max(-120, Math.min(120, relative));
      this.routeDirection.hidden = false;
      this.routeDirection.style.setProperty('--route-angle', `${displayedRelative.toFixed(2)}deg`);
    }
    if (this.routeDirectionLabel) {
      this.routeDirectionLabel.textContent = `DEST ${String(Math.round(destinationBearing)).padStart(3, '0')}°`;
    }
  }

  updateContext(info, heading) {
    if (!this.context) return;
    const snapshot = militaryAwarenessLayer.getContextSnapshot?.() || null;
    const trackedId = info.icao24 || info.id;
    const readout = resolveCockpitContextReadout({ snapshot, info });
    if (!readout.visible) {
      this.context.hidden = true;
      this.hud?.classList.remove('context-active');
      this.contextLayoutStamp = null;
      this.pushCockpitSignal(
        'context-status',
        'info',
        'CONTEXT STANDBY',
        'ENABLE GLOBAL CONTEXT FOR PROXIMITY PINGS',
      );
      return;
    }

    this.context.hidden = false;
    this.hud?.classList.add('context-active');
    if (this.contextSubject) {
      const installationCoverage = snapshot.cohorts
        .find((cohort) => cohort.id === 'military-installations')?.coverage;
      this.contextSubject.textContent = formatCockpitContextScope(
        snapshot.subject.label || trackedId,
        snapshot.radiusM,
        installationCoverage,
      );
    }
    // Navigation stays wired in every state — the operator must always be able
    // to step off the current contact from the panel that hosts the controls.
    if (this.contextPrevious) this.contextPrevious.disabled = !snapshot.navigation?.canPrevious;
    if (this.contextNext) this.contextNext.disabled = !snapshot.navigation?.canNext;

    if (readout.contactLost) {
      // The subject left its source. Every number below is measured against a
      // position that stopped updating, so hold the last rendered readout and
      // say so instead of re-deriving stale geometry as if it were live.
      const enteringLost = this.context.dataset.state !== 'lost';
      this.context.dataset.state = 'lost';
      if (this.contextUncertainty) {
        this.contextUncertainty.textContent = 'CONTACT LOST · LAST KNOWN READOUT · NOT AN ALL-CLEAR';
      }
      // The cue changes the footer's height; re-run layout once on the way in
      // rather than every frame the contact stays lost.
      if (enteringLost) this.scheduleContextLayout();
      this.pushCockpitSignal(
        'context-status',
        'warning',
        `CONTACT LOST · ${snapshot.subject.label || snapshot.subject.id || 'SUBJECT'}`,
        'SUBJECT LEFT ITS FEED · READOUT HOLDING LAST KNOWN',
      );
      return;
    }

    let unknownCount = 0;
    const nearest = [];
    for (const cohort of snapshot.cohorts) {
      const element = this.contextCohorts.get(cohort.id);
      const value = element?.querySelector('strong');
      if (value) value.textContent = cohort.count === null ? '?' : String(cohort.count);
      element?.classList.toggle('unknown', cohort.relationship === 'UNKNOWN');
      if (cohort.count === null) unknownCount += 1;
      for (const item of cohort.nearest) nearest.push({ ...item, cohort });
    }
    nearest.sort((a, b) => (a.distanceM ?? Infinity) - (b.distanceM ?? Infinity));
    const closest = nearest[0] || null;
    const closestLabel = formatAwarenessLabel(closest);
    if (this.contextNearestLabel) {
      this.contextNearestLabel.textContent = closest
        ? `${closest.cohort.label.toUpperCase()} · ${closestLabel}` : 'NO AVAILABLE EXAMPLE';
      this.contextNearestLabel.setAttribute(
        'aria-label',
        closest && closestLabel === '—'
          ? `${closest.cohort.label}, Unavailable`
          : this.contextNearestLabel.textContent,
      );
    }
    if (this.contextDistance) {
      const distanceM = closest?.distanceM;
      this.contextDistance.textContent = Number.isFinite(distanceM)
        ? `${distanceM < 10000 ? (distanceM / 1000).toFixed(1) : Math.round(distanceM / 1000)} KM` : '—';
      this.contextDistance.setAttribute(
        'aria-label',
        Number.isFinite(distanceM) ? this.contextDistance.textContent : 'Unavailable',
      );
    }

    // The arrow and BRG are nose-relative to the tracked aircraft. When the
    // subject is a vessel, an installation, or another aircraft, the rest of
    // this row is measured from that subject — so the aircraft-frame half is
    // dashed rather than presented alongside subject-frame distances as if the
    // two shared an origin.
    let relative = null;
    if (readout.aircraftRelative
      && closest?.position && Number.isFinite(info.latitude) && Number.isFinite(info.longitude)) {
      const cartographic = Cesium.Cartographic.fromCartesian(closest.position);
      const bearing = cartographic ? bearingBetweenCoordinates(
        info.latitude,
        info.longitude,
        Cesium.Math.toDegrees(cartographic.latitude),
        Cesium.Math.toDegrees(cartographic.longitude),
      ) : null;
      relative = relativeBearing(bearing, heading);
    }
    if (this.contextDirection) {
      this.contextDirection.style.transform = `rotate(${relative ?? 0}deg)`;
      this.contextDirection.classList.toggle('unknown', relative === null);
    }
    if (this.contextBearing) {
      if (relative === null) this.contextBearing.textContent = 'BRG —';
      else if (Math.abs(relative) < 8) this.contextBearing.textContent = 'AHEAD';
      else this.contextBearing.textContent = `${relative < 0 ? 'L' : 'R'} ${String(Math.round(Math.abs(relative))).padStart(3, '0')}°`;
    }
    if (this.contextUncertainty) {
      this.contextUncertainty.textContent = unknownCount
        ? `${unknownCount} INPUT${unknownCount === 1 ? '' : 'S'} UNKNOWN · NOT AN ALL-CLEAR`
        : 'AVAILABLE INPUTS CURRENT · NOT AN ALL-CLEAR';
    }
    if (this.contextUpdated) {
      this.contextUpdated.textContent = Number.isFinite(snapshot.evaluatedAt)
        ? new Date(snapshot.evaluatedAt).toISOString().slice(11, 19) + 'Z' : '--:--:--Z';
    }
    this.context.dataset.state = unknownCount ? 'uncertain' : 'current';
    this.updateCockpitSignals(snapshot, unknownCount);
    if (this.contextLayoutStamp !== snapshot.evaluatedAt) {
      this.contextLayoutStamp = snapshot.evaluatedAt;
      this.scheduleContextLayout();
    }
  }

  scheduleContextLayout() {
    const contextVisible = this.context && !this.context.hidden;
    const signalVisible = this.signalStream && !this.signalStream.hidden;
    if ((!contextVisible && !signalVisible) || this.contextLayoutFrame !== null) return;
    this.contextLayoutFrame = requestAnimationFrame(() => {
      this.contextLayoutFrame = null;
      this.syncContextLayout();
      this.syncSignalLayout();
    });
  }

  showBriefPage(index, { manual = false } = {}) {
    const count = COCKPIT_BRIEF_PAGES.length;
    this.briefPageIndex = ((Number(index) % count) + count) % count;
    const page = COCKPIT_BRIEF_PAGES[this.briefPageIndex];
    this.briefPages.forEach((element) => {
      element.hidden = element.dataset.cockpitBriefPage !== page.id;
    });
    this.briefTabs.forEach((button) => {
      const current = Number(button.dataset.cockpitBriefIndex) === this.briefPageIndex;
      button.setAttribute('aria-current', current ? 'true' : 'false');
    });
    if (this.briefKicker) {
      const indicator = this.briefKicker.querySelector('i');
      this.briefKicker.replaceChildren(...[indicator, document.createTextNode(` ${page.kicker}`)].filter(Boolean));
    }
    if (this.briefSubtitle) this.briefSubtitle.textContent = page.subtitle;
    if (this.briefPosition) this.briefPosition.textContent = `${this.briefPageIndex + 1} / ${count}`;
    if (this.briefSource) this.briefSource.textContent = page.source;
    if (this.signalStream) this.signalStream.dataset.briefPage = page.id;
    if (manual && this.briefAutoRotateEnabled) this.startBriefRotation({ reset: true });
    this.scheduleContextLayout();
  }

  setBriefAutoRotate(enabled) {
    this.briefAutoRotateEnabled = Boolean(enabled);
    if (this.briefAutoToggle) {
      this.briefAutoToggle.setAttribute('aria-pressed', String(this.briefAutoRotateEnabled));
      const label = this.briefAutoRotateEnabled ? 'CYCLE ON' : 'CYCLE OFF';
      this.briefAutoToggle.textContent = label;
      const help = this.briefAutoRotateEnabled
        ? COCKPIT_BRIEF_CYCLE_ON_HELP
        : COCKPIT_BRIEF_CYCLE_OFF_HELP;
      this.briefAutoToggle.setAttribute('aria-label', label);
      this.briefAutoToggle.title = help;
    }
    if (this.briefAutoRotateEnabled) this.startBriefRotation({ reset: true });
    else this.stopBriefRotation();
  }

  startBriefRotation({ reset = false } = {}) {
    if (reset) this.stopBriefRotation();
    if (!this.briefAutoRotateEnabled
      || this.briefTimer
      || !this.active
      || this.signalCollapsed
      || document.hidden) return;
    this.briefTimer = window.setTimeout(() => {
      this.briefTimer = null;
      const hasPointer = this.signalStream?.matches(':hover') === true;
      const hasFocus = this.signalStream?.contains(document.activeElement) === true;
      const isInteracting = hasPointer || hasFocus;
      if (!isInteracting) {
        this.showBriefPage(this.briefPageIndex + 1);
      }
      this.startBriefRotation();
    }, COCKPIT_BRIEF_ROTATE_MS);
  }

  stopBriefRotation() {
    if (this.briefTimer) window.clearTimeout(this.briefTimer);
    this.briefTimer = null;
  }

  updateLocalPosition(info) {
    if (!this.localCoordinates) return;
    if (!Number.isFinite(info.latitude) || !Number.isFinite(info.longitude)) {
      this.localCoordinates.textContent = 'POSITION UNAVAILABLE';
      return;
    }
    const lat = `${Math.abs(info.latitude).toFixed(3)}°${info.latitude >= 0 ? 'N' : 'S'}`;
    const lon = `${Math.abs(info.longitude).toFixed(3)}°${info.longitude >= 0 ? 'E' : 'W'}`;
    this.localCoordinates.textContent = `${lat} · ${lon}`;
  }

  maybeRefreshRegionalBrief(info) {
    if (!this.active || !Number.isFinite(info.latitude) || !Number.isFinite(info.longitude)) return;
    const subjectId = `${info.layerId || 'aircraft'}:${info.icao24 || info.registration || info.callsign || 'unknown'}`;
    if (subjectId !== this.regionalBriefSubjectId) {
      this.regionalBriefAbort?.abort();
      this.regionalBriefAbort = null;
      this.regionalBriefRequestToken += 1;
      this.regionalBriefSubjectId = subjectId;
      this.regionalBrief = null;
      this.regionalBriefAnchor = null;
      this.regionalBriefFetchedAt = 0;
    }
    const point = { latitude: info.latitude, longitude: info.longitude };
    const ageMs = Date.now() - this.regionalBriefFetchedAt;
    const distanceM = regionalDistanceM(this.regionalBriefAnchor, point);
    if (this.regionalBriefAbort || (ageMs < COCKPIT_REGIONAL_REFRESH_MS
      && distanceM < COCKPIT_REGIONAL_REFRESH_DISTANCE_M)) return;

    this.regionalBriefAnchor = point;
    this.regionalBriefFetchedAt = Date.now();
    const controller = new AbortController();
    const requestToken = ++this.regionalBriefRequestToken;
    this.regionalBriefAbort = controller;
    if (!this.regionalBrief) this.renderRegionalBriefStatus('loading', info);
    fetchRegionalBrief(point.latitude, point.longitude, { signal: controller.signal })
      .then((payload) => {
        if (!this.active
          || requestToken !== this.regionalBriefRequestToken
          || subjectId !== this.regionalBriefSubjectId) return;
        this.regionalBrief = payload;
        this.renderRegionalBrief(payload, info);
      })
      .catch((error) => {
        if (error?.name !== 'AbortError'
          && this.active
          && requestToken === this.regionalBriefRequestToken
          && subjectId === this.regionalBriefSubjectId) {
          this.renderRegionalBriefStatus('unavailable', info);
        }
      })
      .finally(() => {
        if (this.regionalBriefAbort === controller) this.regionalBriefAbort = null;
      });
  }

  renderRegionalBriefStatus(status, info) {
    if (this.newsStatus) {
      this.newsStatus.hidden = false;
      this.newsStatus.dataset.state = status;
      this.newsStatus.textContent = status === 'loading'
        ? 'ACQUIRING REGIONAL NEWS'
        : 'REGIONAL NEWS UNAVAILABLE';
    }
    if (status === 'unavailable') this.newsList?.replaceChildren();
    if (this.localPlace && status === 'loading') this.localPlace.textContent = 'RESOLVING REGION';
    if (this.localPlace && status === 'unavailable') this.localPlace.textContent = 'REGION UNAVAILABLE';
    this.updateLocalPosition(info);
  }

  renderRegionalBrief(payload, info) {
    const articles = Array.isArray(payload?.articles) ? payload.articles : [];
    if (this.newsStatus) {
      this.newsStatus.hidden = articles.length > 0;
      this.newsStatus.dataset.state = payload?.newsStatus || 'unavailable';
      this.newsStatus.textContent = payload?.newsStatus === 'empty'
        ? 'NO RECENT LOCATION MATCHES'
        : 'REGIONAL NEWS UNAVAILABLE';
    }
    if (this.newsList) {
      this.newsList.replaceChildren(...articles.slice(0, 4).map((article) => {
        const entry = document.createElement('li');
        const link = document.createElement('a');
        link.href = article.url;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        const title = document.createElement('strong');
        title.textContent = article.title;
        const metadata = document.createElement('span');
        metadata.textContent = `${article.domain || 'SOURCE'} · ${formatCockpitBriefAge(article.publishedAt)}`;
        link.append(title, metadata);
        entry.append(link);
        return entry;
      }));
    }

    const placeLabel = payload?.place?.label || payload?.place?.country || 'REGION UNAVAILABLE';
    if (this.localPlace) this.localPlace.textContent = placeLabel.toUpperCase();
    this.updateLocalPosition(info);
    const weather = payload?.weather;
    if (this.localTemperature) {
      this.localTemperature.textContent = Number.isFinite(weather?.temperatureC)
        ? `${Math.round(weather.temperatureC)}°C` : '—';
    }
    if (this.localWind) {
      this.localWind.textContent = Number.isFinite(weather?.windKph)
        ? `${Math.round(weather.windKph)} KM/H` : '—';
    }
    if (this.localWindDirection) {
      this.localWindDirection.textContent = formatCockpitWindDirection(weather?.windDirectionDeg);
    }
    if (this.localCondition) this.localCondition.textContent = weatherCodeLabel(weather?.weatherCode);
    if (this.localCloud) {
      this.localCloud.textContent = Number.isFinite(weather?.cloudCoverPct)
        ? `CLOUD ${Math.round(weather.cloudCoverPct)}%` : 'CLOUD UNKNOWN';
    }
    if (this.localPrecipitation) {
      this.localPrecipitation.textContent = Number.isFinite(weather?.precipitationMm)
        ? weather.precipitationMm.toFixed(1) : '—';
    }
    if (this.signalStream) this.signalStream.dataset.regionalStatus = payload?.status || 'partial';
    if (this.briefPageIndex === 1 && this.briefSource) {
      this.briefSource.textContent = `${String(payload?.newsSource || 'REGIONAL NEWS').toUpperCase()} · LOCATION QUERY`;
    }
    this.scheduleContextLayout();
  }

  renderCockpitSignals() {
    if (!this.signalList) return;
    this.signalList.replaceChildren(...this.signalItems.map((item) => {
      const entry = document.createElement('li');
      entry.className = item.tone;
      const time = document.createElement('time');
      time.textContent = new Date(item.timestamp).toISOString().slice(11, 19) + 'Z';
      const body = document.createElement('div');
      const heading = item.target ? document.createElement('button') : document.createElement('strong');
      if (item.target) {
        heading.type = 'button';
        heading.className = 'cockpit-signal-target';
        heading.dataset.signalLayer = item.target.layerId;
        heading.dataset.signalId = item.target.id;
        heading.setAttribute('aria-label', `Select flight ${item.title}`);
        const label = document.createElement('span');
        label.className = 'cockpit-signal-target-label';
        label.textContent = item.title;
        const rule = document.createElement('span');
        rule.className = 'cockpit-signal-target-rule';
        rule.setAttribute('aria-hidden', 'true');
        const chevron = document.createElement('span');
        chevron.className = 'material-symbols-outlined cockpit-signal-target-chevron';
        chevron.setAttribute('aria-hidden', 'true');
        chevron.textContent = 'chevron_right';
        heading.append(label, rule, chevron);
        entry.classList.add('actionable');
      } else {
        heading.textContent = item.title;
      }
      const copy = document.createElement('span');
      copy.textContent = item.detail;
      body.append(heading, copy);
      entry.append(time, body);
      return entry;
    }));
    this.scheduleContextLayout();
  }

  pushCockpitSignal(key, tone, title, detail, target = null) {
    if (!this.signalList || !title || !detail) return;
    const signature = `${title}|${detail}|${target?.layerId || ''}|${target?.id || ''}`;
    if (this.signalSignatures.get(key) === signature) return;
    this.signalSignatures.set(key, signature);
    this.signalItems.unshift({ key, tone, title, detail, target, timestamp: Date.now() });
    this.signalItems = this.signalItems.slice(0, 5);
    this.renderCockpitSignals();
  }

  updateCockpitSignals(snapshot, unknownCount) {
    const previous = new Map(this.signalItems.map((item) => [item.key, item]));
    const contacts = [];
    const subject = snapshot.subject;
    if (['flights', 'military'].includes(subject?.layerId) && subject?.id) {
      contacts.push({
        key: `flight:${subject.layerId}:${subject.id}`,
        tone: 'track',
        title: subject.label || subject.id,
        detail: `${subject.layerId === 'military' ? 'MILITARY FLIGHT' : 'COMMERCIAL FLIGHT'} · CURRENT`,
        target: { layerId: subject.layerId, id: String(subject.id) },
        distanceM: -1,
      });
    }
    for (const cohort of snapshot.cohorts) {
      if (!['flights', 'military'].includes(cohort.id)) continue;
      for (const item of cohort.nearest) {
        const id = item.icao24 || item.id;
        if (!id) continue;
        contacts.push({
          key: `flight:${cohort.id}:${id}`,
          tone: cohort.id === 'military' ? 'nearby military' : 'nearby',
          // `id` above is IDENTITY (the ICAO hex). Display must not reuse it:
          // the row's own `id` already carries the layer's label convention
          // (callsign → registration → hex), so a callsign-less enriched
          // contact reads as its registration here too. Same helper the
          // Context panel's nearest list uses.
          title: formatAwarenessLabel(item),
          detail: `${cohort.id === 'military' ? 'MILITARY FLIGHT' : 'COMMERCIAL FLIGHT'} · ${
            Number.isFinite(item.distanceM)
              ? `${item.distanceM < 10000 ? (item.distanceM / 1000).toFixed(1) : Math.round(item.distanceM / 1000)} KM`
              : 'DISTANCE UNKNOWN'
          }`,
          target: { layerId: cohort.id, id: String(id) },
          distanceM: item.distanceM ?? Infinity,
        });
      }
    }
    contacts.sort((a, b) => a.distanceM - b.distanceM);
    const nextItems = contacts.slice(0, 5).map((item) => ({
      ...item,
      timestamp: previous.get(item.key)?.timestamp || snapshot.evaluatedAt || Date.now(),
    }));
    if (unknownCount) {
      const sources = snapshot.cohorts
        .filter((cohort) => cohort.count === null)
        .map((cohort) => cohort.source)
        .join(' · ');
      nextItems.splice(4, Math.max(0, nextItems.length - 4), {
        key: 'input-status',
        tone: 'warning',
        title: `${unknownCount} INPUT${unknownCount === 1 ? '' : 'S'} UNKNOWN`,
        detail: sources || 'SOURCE STATUS UNAVAILABLE',
        target: null,
        timestamp: previous.get('input-status')?.timestamp || snapshot.evaluatedAt || Date.now(),
      });
    }
    this.signalItems = nextItems;
    this.signalSignatures.clear();
    this.renderCockpitSignals();
  }

  setContextCollapsed(collapsed) {
    const wasCollapsed = this.contextCollapsed;
    this.contextCollapsed = Boolean(collapsed);
    if (this.context) this.context.dataset.collapsed = String(this.contextCollapsed);
    if (this.contextToggle) {
      const expanded = !this.contextCollapsed;
      this.contextToggle.setAttribute('aria-expanded', String(expanded));
      this.contextToggle.setAttribute('aria-label', `${expanded ? 'Collapse' : 'Expand'} Contact panel`);
      this.contextToggle.title = `${expanded ? 'Collapse' : 'Expand'} contact panel`;
      const icon = this.contextToggle.querySelector('.material-symbols-outlined');
      if (icon) icon.textContent = expanded ? 'chevron_left' : 'chevron_right';
    }
    if (this.active && wasCollapsed && !this.contextCollapsed) {
      window.dispatchEvent(new CustomEvent('gev:cockpit-context-expanded'));
    }
    this.scheduleContextLayout();
  }

  setSignalCollapsed(collapsed, { user = false } = {}) {
    const wasCollapsed = this.signalCollapsed;
    this.signalCollapsed = Boolean(collapsed);
    if (user) this.signalUserCollapsed = this.signalCollapsed;
    if (this.signalStream) this.signalStream.dataset.collapsed = String(this.signalCollapsed);
    if (this.signalToggle) {
      const expanded = !this.signalCollapsed;
      this.signalToggle.setAttribute('aria-expanded', String(expanded));
      this.signalToggle.setAttribute('aria-label', `${expanded ? 'Collapse' : 'Expand'} cockpit briefing panel`);
      this.signalToggle.title = `${expanded ? 'Collapse' : 'Expand'} briefing panel`;
      const icon = this.signalToggle.querySelector('.material-symbols-outlined');
      if (icon) icon.textContent = expanded ? 'right_panel_close' : 'right_panel_open';
    }
    if (this.signalCollapsed) this.stopBriefRotation();
    else this.startBriefRotation({ reset: true });
    if (this.active && wasCollapsed && !this.signalCollapsed) {
      window.dispatchEvent(new CustomEvent('gev:cockpit-signal-expanded'));
    }
    this.scheduleContextLayout();
  }

  syncContextLayout() {
    if (!this.context || this.context.hidden) return;
    if (window.matchMedia('(max-width: 760px)').matches) {
      this.context.dataset.layoutMode = 'compact-bottom';
      this.context.style.removeProperty('--cockpit-context-left');
      this.context.style.removeProperty('--cockpit-context-top');
      this.context.style.removeProperty('--cockpit-context-max-height');
      return;
    }

    const desktopInset = Math.max(24, Math.min(58, window.innerWidth * 0.04));
    this.context.dataset.layoutMode = 'bottom-left';
    this.context.style.setProperty('--cockpit-context-left', `${desktopInset.toFixed(1)}px`);
    this.context.style.removeProperty('--cockpit-context-top');
    this.context.style.removeProperty('--cockpit-context-max-height');
  }

  syncSignalLayout() {
    if (!this.signalStream || this.signalStream.hidden) return;
    const utilityControls = document.getElementById('cockpit-utility-controls');
    if (window.matchMedia('(max-width: 760px)').matches) {
      this.signalStream.dataset.layoutMode = 'compact-top';
      utilityControls?.classList.remove('layout-primary-only');
      utilityControls?.querySelectorAll('.cockpit-utility-control').forEach((control) => {
        const hiddenSibling = Boolean(
          utilityControls.querySelector('.cockpit-utility-control.is-expanded')
          && !control.classList.contains('is-expanded')
        );
        control.setAttribute('aria-hidden', String(hiddenSibling));
      });
      this.hud?.style.removeProperty('--cockpit-utility-top');
      this.hud?.style.removeProperty('--cockpit-utility-max-height');
      this.hud?.style.removeProperty('--cockpit-utility-expanded-max-height');
      this.signalStream.style.removeProperty('--cockpit-signal-right');
      this.signalStream.style.removeProperty('--cockpit-signal-top');
      this.signalStream.style.removeProperty('--cockpit-signal-max-height');
      return;
    }

    const desktopInset = Math.max(24, Math.min(58, window.innerWidth * 0.04));
    this.signalStream.dataset.layoutMode = 'bottom-right';
    this.signalStream.style.setProperty('--cockpit-signal-right', `${desktopInset.toFixed(1)}px`);
    this.signalStream.style.removeProperty('--cockpit-signal-top');
    this.signalStream.style.removeProperty('--cockpit-signal-max-height');
    const signalBounds = this.signalStream.getBoundingClientRect();
    const utilityBounds = utilityControls?.getBoundingClientRect();
    if (utilityBounds) {
      const expandedControl = utilityControls?.querySelector('.cockpit-utility-control.is-expanded');
      const collapsedControl = utilityControls?.querySelector(
        '.cockpit-utility-control:not(.is-expanded)',
      );
      const collapsedLauncher = collapsedControl?.querySelector('.cockpit-utility-launcher');
      const expandedHeight = expandedControl
        ? Math.max(expandedControl.scrollHeight, expandedControl.getBoundingClientRect().height)
        : 0;
      const collapsedHeight = collapsedLauncher
        ? Math.max(COCKPIT_UTILITY_LAUNCHER_MIN_HEIGHT_PX, collapsedLauncher.scrollHeight)
        : 0;
      // Cockpit owns this anchor outright. The strip used to inherit the left
      // accordion's committed top, which is solved against left-lane obstacles
      // and dropped the strip straight through the briefing card below it.
      // The readout only anchors the strip while it is genuinely on screen:
      // the Minimal variant drops it with `display:none`, but HUD Off hides the
      // whole Intel HUD with `visibility`/`opacity`, which keeps its rect.
      const recReadout = document.querySelector('#intel-hud .hud-top-right');
      const recBounds = isRenderedOnScreen(recReadout) ? recReadout.getBoundingClientRect() : null;
      const utilityAnchor = resolveCockpitUtilityAnchor({
        recBottom: recBounds ? recBounds.bottom : 0,
        signalTop: signalBounds.top,
        stripHeight: utilityBounds.height,
        viewportHeight: window.innerHeight,
        collapsedHeight,
        recGap: COCKPIT_UTILITY_REC_GAP_PX,
        signalGap: COCKPIT_UTILITY_SIGNAL_GAP_PX,
        minTopFloor: COCKPIT_UTILITY_MIN_TOP_PX,
        minTopRatio: COCKPIT_UTILITY_MIN_TOP_RATIO,
      });
      const availableHeight = utilityAnchor.maxHeight;
      this.hud?.style.setProperty('--cockpit-utility-top', `${utilityAnchor.top.toFixed(1)}px`);
      this.hud?.style.setProperty('--cockpit-utility-max-height', `${availableHeight.toFixed(2)}px`);
      const utilityLayout = expandedControl && collapsedControl
        ? resolveCockpitUtilityLayout({ availableHeight, expandedHeight, collapsedHeight })
        : { primaryOnly: false, expandedMaxHeight: availableHeight };
      utilityControls?.classList.toggle('layout-primary-only', utilityLayout.primaryOnly);
      this.hud?.style.setProperty(
        '--cockpit-utility-expanded-max-height',
        `${utilityLayout.expandedMaxHeight.toFixed(2)}px`,
      );
      utilityControls?.querySelectorAll('.cockpit-utility-control').forEach((control) => {
        const hiddenSibling = utilityLayout.primaryOnly && control === collapsedControl;
        control.setAttribute('aria-hidden', String(hiddenSibling));
        if (hiddenSibling && control.contains(document.activeElement)) {
          expandedControl?.querySelector('.cockpit-utility-glyph')?.focus({ preventScroll: true });
        }
      });
    }
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
    this._cctvSelect = document.getElementById('cctv-camera-select');
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
        if (layerId === 'flights') return flightsLayer.refocusTrackedById?.(trackedId) === true;
        if (layerId === 'military') return militaryFlightsLayer.refocusTrackedById?.(trackedId) === true;
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
          mapStack,
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
        const mapStackRestore = mapStack
          ? this._setMapStack(mapStack, { syncShare: false })
          : Promise.resolve();
        if (panelState) this._restorePanelState(panelState);
        await mapStackRestore;
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
    initDetection(viewer, [trafficLayer, flightsLayer, militaryFlightsLayer, satellitesLayer, cctvLayer, bikeshareLayer, aisLiveVesselsLayer], (modeLabel) => {
      this._updateDetectionButton(modeLabel);
    });
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
      (cameraId, durationSec) => cctvLayer.focusCamera(cameraId, durationSec),
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

  /** Advance camera authority and settle any older search UI immediately. */
  _stampNavigation({ cancelPendingSelection = true, clearSearchedLocation = true } = {}) {
    this._navigationGeneration += 1;
    // A newer destination owns the camera, so the last free-text search is no
    // longer where we are. DEFERRED navigation opts out here and clears at the
    // reassert seam instead: a geocode that never resolves moves no camera, and
    // a lookup that fails must not blank a readout that is still true.
    if (clearSearchedLocation) this.clearSearchedLocation();
    if (cancelPendingSelection) {
      if (this._hasShareState && this._resolveInitialShareRestore && !this._layerStateCoordinator) {
        this._initialShareSelectionSuperseded = true;
      }
      const passivelyClearedShareSelection = this._layerStateCoordinator
        ?.cancelPendingShareTracking?.(
          'superseded-by-explicit-navigation',
          { clearSelection: true },
        ) === true;
      try { flightsLayer.cancelPendingTrackingRestore?.(); } catch { /* best effort */ }
      try { militaryFlightsLayer.cancelPendingTrackingRestore?.(); } catch { /* best effort */ }
      try { satellitesLayer.cancelPendingTrackingRestore?.(); } catch { /* best effort */ }
      // A deliberate destination supersedes share-selected entities that have
      // not arrived yet. Active owners publish their clear when released.
      if (!passivelyClearedShareSelection && !flightsLayer.getTrackedInfo?.()) {
        this._dataManager?.setLayerParams('flights', {
          selectedFlightsTrackingId: null,
        }, { origin: 'tool' });
      }
      if (!passivelyClearedShareSelection && !militaryFlightsLayer.getTrackedInfo?.()) {
        this._dataManager?.setLayerParams('military', {
          selectedMilitaryTrackingId: null,
        }, { origin: 'tool' });
      }
      if (!passivelyClearedShareSelection && !satellitesLayer.getTrackedInfo?.()) {
        this._dataManager?.setLayerParams('satellites', {
          selectedSatTrackingId: null,
        }, { origin: 'tool' });
      }
    }
    if (this._activeLocationSearchGeneration !== null) {
      this._settleLocationSearchUi(this._activeLocationSearchGeneration);
    }
    return this._navigationGeneration;
  }

  /** Settle only the search generation that still owns the shared input UI. */
  _settleLocationSearchUi(generation) {
    if (this._activeLocationSearchGeneration !== generation) return;
    this._activeLocationSearchGeneration = null;
    this._locationSearch?.classList.remove('searching', 'expanded');
    if (this._locationSearch) this._locationSearch.value = '';
    this._locationSearch?.blur();
  }

  /** Release every follow owner while preserving Contact and vessel selection. */
  _releaseFollowCamera({
    preserveVesselSelection = true,
    preserveCameraFlight = false,
    trackingOrigin = 'tool',
  } = {}) {
    let contactSelected = false;
    try {
      contactSelected = Boolean(
        militaryAwarenessLayer.releaseCameraOwnership?.({
          preserveVesselSelection,
          origin: trackingOrigin,
        }),
      );
    } catch {
      try { flightsLayer.stopTracking?.({ origin: trackingOrigin }); } catch { /* best-effort release */ }
      try { militaryFlightsLayer.stopTracking?.({ origin: trackingOrigin }); } catch { /* best-effort release */ }
      if (!preserveVesselSelection) {
        try { aisLiveVesselsLayer.clearSelection?.(); } catch { /* best-effort release */ }
      }
    }
    try { satellitesLayer.stopTracking?.({ origin: trackingOrigin }); } catch { /* best-effort release */ }
    try { rocketLaunchesLayer.releaseCameraOwnership?.(); } catch { /* best-effort release */ }
    this.viewer.trackedEntity = undefined;
    interruptCameraMotion('explicit-navigation');
    this._stopOrbit();
    if (!preserveCameraFlight) this.viewer.camera.cancelFlight();
    try {
      this.viewer.camera.lookAtTransform(Cesium.Matrix4.IDENTITY);
    } catch { /* teardown race */ }
    return contactSelected;
  }

  /** Run one immediate destination through the shared ownership policy. */
  _runExplicitNavigation(noun, navigate, releaseOptions = undefined) {
    return runExplicitNavigation({
      disposed: this._disposed,
      cockpitActive: !!this.cockpitView?.active,
      noun,
      showToast: (text) => this._showToast(text),
      stamp: () => this._stampNavigation(),
      release: () => this._releaseFollowCamera(releaseOptions),
      navigate,
    });
  }

  /** Accept a delayed lookup without releasing its current camera owner. */
  _beginDeferredNavigation(noun = 'location', { cancelPendingSelection = true } = {}) {
    return beginDeferredNavigation({
      disposed: this._disposed,
      cockpitActive: !!this.cockpitView?.active,
      noun,
      showToast: (text) => this._showToast(text),
      // The searched-location readout survives the STAMP; only a flight that
      // actually starts invalidates it (see the release hook below).
      stamp: () => this._stampNavigation({ cancelPendingSelection, clearSearchedLocation: false }),
    });
  }

  /** Final authority check and release immediately before a delayed flight. */
  _reassertNavigationHandoff(generation) {
    return reassertNavigationHandoff({
      generation,
      currentGeneration: this._navigationGeneration,
      cockpitActive: !!this.cockpitView?.active,
      disposed: this._disposed,
      showToast: (text) => this._showToast(text),
      // Reached only once the handoff is granted, immediately before the
      // deferred flight starts — so a lookup that failed, was superseded, or
      // was refused by the cockpit leaves the old readout standing.
      release: () => {
        this.clearSearchedLocation();
        return this._releaseFollowCamera();
      },
    });
  }

  /** Public lifecycle seam used by voice location navigation. */
  beginDeferredLocationNavigation() {
    return this._beginDeferredNavigation('location');
  }

  /** Public final-authority seam used by voice geocoding. */
  reassertDeferredLocationNavigation(generation) {
    return this._reassertNavigationHandoff(generation);
  }

  /** Public immediate route used by voice destinations. */
  runImmediateLocationNavigation(navigate) {
    return this.runImmediateNavigation('location', navigate);
  }

  /** Public authority facade used by validated voice camera destinations. */
  runImmediateNavigation(noun, navigate, releaseOptions = undefined) {
    return this._runExplicitNavigation(noun, navigate, releaseOptions);
  }

  /** Supersede deferred work when an owner-specific route handles release. */
  supersedeDeferredNavigation() {
    return this._stampNavigation();
  }

  /** Route a valid vessel/fire request through the shared navigation policy. */
  _runExplicitWorldFocus(detail, fly) {
    return this._runExplicitNavigation(detail?.kind || 'target', fly);
  }

  /** Return the aircraft tracker owned before a multi-step Cockpit transaction. */
  getAircraftTrackingTarget() {
    return aircraftTrackingTarget(this.cockpitView?.readAircraftInfo?.());
  }

  /**
   * On window resize, keep the draggable panel on-screen — a panel positioned near an edge can fall
   * outside a now-smaller viewport (audit U2). pp-toggles is right-pinned, so re-pin (horizontal) and
   * clamp its top. No-op until the panel has been positioned (explicit inline top).
   * @returns {void}
   */
  _reclampDraggablePanels() {
    const el = this._ppToggles;
    if (!el || !el.style.top || el.style.top === 'auto') return;
    const top = parseInt(el.style.top, 10);
    if (!Number.isFinite(top)) return;
    el.style.top = `${this._clampToViewport(0, top, el).top}px`;
    this._pinPanelToRight(el);
  }

  /**
   * Creates one CesiumJS PostProcessStage per visual style and registers
   * it with the scene. Each stage starts with intensity 0 (invisible)
   * so crossfade transitions can animate it in later.
   * @returns {void}
   */
  _initStages() {
    for (const [name, shader] of Object.entries(STYLES)) {
      const uniforms = { intensity: 0.0 };

      // Auto-detect time uniform — animated shaders (CRT scanlines, snow, etc.)
      // declare `uniform float time` and receive elapsed seconds each frame.
      if (shader.fragmentShader.includes('uniform float time')) {
        uniforms.time = 0.0;
      }

      // Initialize custom uniforms from shader metadata (e.g. gain, pixelation)
      if (shader.uniforms) {
        for (const [uName, uMeta] of Object.entries(shader.uniforms)) {
          uniforms[uName] = uMeta.default;
        }
      }

      const stage = new Cesium.PostProcessStage({
        name: `godsEyeView_${name}`,
        fragmentShader: shader.fragmentShader,
        uniforms,
      });

      // Zero-intensity stages are DISABLED (perf wave 1). History: the
      // first attempt at this deleted the product's signature scope — the
      // circular starfield mask was an EMERGENT artifact of these six
      // stacked "identity" passes, not an implemented feature. The owner
      // ruled to reimplement the scope explicitly (src/scopeMask.js, a
      // featherable zero-per-frame canvas), which frees these passes for
      // real. If the scope ever looks wrong, look there — not here.
      stage.enabled = false;
      this.viewer.scene.postProcessStages.add(stage);
      this.stages[name] = stage;
    }
    // Frozen after init — cached so the per-frame animation loop doesn't
    // rebuild Object.entries arrays every frame.
    this._stageEntries = Object.entries(this.stages);
  }

  /**
   * Single write path for style-stage intensity: keeps `enabled` in
   * lockstep so zero-intensity stages cost nothing (safe now that the
   * scope is explicit — see _initStages). The stage enables on the same
   * frame the first non-zero intensity lands, so crossfades never pop.
   * @param {Cesium.PostProcessStage} stage - Style post-process stage.
   * @param {number} value - Intensity in [0, 1].
   * @returns {void}
   */
  _setStageIntensity(stage, value) {
    if (!stage) return;
    stage.uniforms.intensity = value;
    stage.enabled = value > 0.001;
    // An animated shader becoming visible needs the style loop (its clock)
    // running again; the loop self-stops when nothing visible animates.
    if (stage.enabled && stage.uniforms.time !== undefined) this._startAnimationLoop();
    governorRequestRender('style-stage');
  }

  /**
   * Re-sync every stage's `enabled` flag from its CURRENT intensity.
   *
   * The cockpit-vision policy helpers (src/cockpitVisionPolicy.js) are pure
   * intensity math — they write `uniforms.intensity` directly and know
   * nothing about the enabled/intensity lockstep _setStageIntensity owns.
   * Without this sweep a stage the policy raised to 1 would stay DISABLED
   * and cockpit NVG/FLIR/CRT would render nothing at all. (Inert while the
   * chain is permanently enabled; load-bearing again once the explicit
   * scope frees the zero-intensity stages — see _initStages.)
   * @returns {void}
   */
  _syncStagesEnabledFromIntensity() {
    if (!this.stages) return;
    for (const stage of Object.values(this.stages)) {
      this._setStageIntensity(stage, stage.uniforms.intensity);
    }
  }

  /**
   * Contacts-scoped detection (owner playtest 2026-08-18: "when you click on
   * Contacts, detections should just turn on, and they should stay on in
   * Cockpit or in third-person tracking inside Contacts").
   *
   * The scope is the CONTACTS SESSION, not Cockpit. Cockpit enter/exit and
   * third-person tracking are moves WITHIN that session and deliberately do not
   * touch detection — an earlier build hooked this to cockpit enter/exit, which
   * is exactly what turned detections off when the owner left the cockpit.
   *
   * Called from `_syncContextModeButtons`, the single funnel every
   * `_contextMode` mutation routes through, and gated on the transaction having
   * SETTLED (`!_contextModeChanging`) so a failed activation can never strand
   * detection on.
   * @returns {void}
   */
  _syncContactsDetection() {
    if (this._contextModeChanging) return;
    const result = applyContactsDetection({
      active: this._contextMode === 'flights',
      restore: this._contactsDetectionRestore,
      // A map style picked DURING the session owns detection on the way out —
      // its auto-enable preset is younger than the entry snapshot.
      styleOwnsDetection: !this._detectionUserOverridden
        && Boolean(STYLE_PRESET_DEFAULTS[this.activeStyle]?.detection),
      // The snapshot must cover everything activation mutates — the preset
      // writes DENSITY as well as mode, so a mode-only snapshot returned
      // OFF @ 25% as OFF @ 75% and the next manual enable came back Dense.
      getState: () => {
        const state = this.getDetectionState();
        return { mode: state.detectionMode, densityPct: state.densityPct };
      },
      // Owner playtest: the force-on lands on the tactical look the military
      // styles apply — the SAME preset object — not on whatever profile the
      // operator last happened to leave detection at.
      applyPreset: () => this._applyDetectionPreset(MILITARY_DETECTION_PRESET),
      // The preset applier IS the state replayer: same density-then-mode order,
      // same slider writes, so a restore round-trips exactly.
      restoreState: (state) => this._applyDetectionPreset(state),
    });
    const hadOwnership = Boolean(this._contactsDetectionRestore);
    this._contactsDetectionRestore = result.restore;
    // Serialization reads that ownership: while Contacts holds it the link
    // carries the SAVED snapshot, and once released it carries live state. The
    // share cache therefore goes stale on any ownership transition, whether or
    // not the detection engine itself moved — and it does not always move.
    // Exiting while a military style owns detection returns changed:false (the
    // style's preset already matches), and returning early there left a copied
    // link claiming the operator's pre-Contacts values while the map showed
    // Dense @ 75%.
    if (!shareCacheNeedsHeal({
      changed: result.changed,
      hadOwnership,
      hasOwnership: Boolean(result.restore),
    })) return;
    if (result.changed) this._syncDetectionUiFromEngine();
    this._syncShareState();
  }

  /** Apply a temporary cockpit-only CRT/NVG/FLIR/NOIR post-process override. */
  _setCockpitVision(mode, active, { revealParameters = false } = {}) {
    const next = active ? normalizeCockpitVisionMode(mode) : 'optical';
    if (!this.stages) return;
    if (!active) {
      if (this._cockpitVisionRestore) {
        for (const [name, intensity] of Object.entries(this._cockpitVisionRestore)) {
          if (this.stages[name]) this._setStageIntensity(this.stages[name], intensity);
        }
      }
      this._cockpitVisionRestore = null;
      this._cockpitVisionMode = 'optical';
      this._syncIrBoost(); // Cockpit exit: fall back to the map preset's IR state
      this._updateSliderPanel(this.activeStyle, { reveal: false });
      this._revealCockpitStyleParameters({ openDisplay: revealParameters });
      return;
    }
    if (!this._cockpitVisionRestore) {
      this._cockpitVisionRestore = captureCockpitVisionBaseline(this.stages, this.transitions);
    }
    if (next === 'optical') {
      applyCockpitVisionStageIntensities(this.stages, next, this._cockpitVisionRestore);
      this._syncStagesEnabledFromIntensity();
      this._cockpitVisionMode = next;
      this._syncIrBoost();
      this._updateSliderPanel(this.activeStyle, { reveal: false });
      this._revealCockpitStyleParameters({ openDisplay: revealParameters });
      return;
    }
    const target = applyCockpitVisionStageIntensities(this.stages, next, this._cockpitVisionRestore);
    this._syncStagesEnabledFromIntensity();
    this._cockpitVisionMode = next;
    this._syncIrBoost(); // Cockpit vision override ('nvg'/'thermal' boost; CRT/NOIR clear)
    this._updateSliderPanel(target || null, { reveal: false });
    this._revealCockpitStyleParameters({ openDisplay: revealParameters });
  }

  /** IR hot-target boost (owner playtest 2026-08-16): under the luminance-
   *  mapped NVG/FLIR looks the 3D fleets flip to flat white so contacts read
   *  HOT instead of vanishing mid-gray; restored when the look exits. The
   *  EFFECTIVE look is Cockpit's vision override while Cockpit is active
   *  ('nvg'/'thermal', which can differ from the map preset in BOTH
   *  directions), otherwise the map preset ('surveillance'/'thermal'). */
  _syncIrBoost() {
    const cockpitMode = this.cockpitView?.active ? this._cockpitVisionMode : null;
    const effective = cockpitMode && cockpitMode !== 'optical' ? cockpitMode : this.activeStyle;
    const irBoost = effective === 'surveillance' || effective === 'thermal' || effective === 'nvg';
    this._dataManager?.setLayerParams('flights', { irBoost });
    this._dataManager?.setLayerParams('military', { irBoost });
    // Fog blends distant geometry toward an effectively-BLACK color in this
    // app (the Cesium globe is hidden), so beyond ~100 km every 3D aircraft
    // fogs to a black silhouette — lighting and shaders can't reach past it
    // (owner cockpit-FLIR field rounds, 2026-08-16). IR sensors see through
    // haze, so the boost styles simply turn fog off; the prior state restores
    // on exit. Transition-guarded so repeated syncs don't clobber the saved value.
    const scene = this.viewer?.scene;
    if (scene?.fog && irBoost !== this._irBoostActive) {
      this._irBoostActive = irBoost;
      if (irBoost) {
        this._irFogWasEnabled = scene.fog.enabled;
        scene.fog.enabled = false;
      } else if (this._irFogWasEnabled != null) {
        scene.fog.enabled = this._irFogWasEnabled;
        this._irFogWasEnabled = null;
      }
      scene.requestRender?.();
    }
  }

  /** Keep Cockpit's inherited label and restore target aligned with the active map preset. */
  _syncCockpitInheritedStyle() {
    if (!this.cockpitView?.active || !this.stages) return;
    this._cockpitVisionRestore = Object.fromEntries(
      Object.keys(this.stages).map((name) => [name, name === this.activeStyle ? 1 : 0]),
    );
    for (const name of Object.keys(this.stages)) this.transitions.delete(name);
    this.cockpitView.setVisionMode(this.cockpitView.visionMode);
  }

  /** Reveal shared style parameters, optionally opening Cockpit Display first. */
  _revealCockpitStyleParameters({ openDisplay = false } = {}) {
    if (!this.cockpitView?.active || !this._sliderPanel?.classList.contains('active')) return;
    if (openDisplay && this._cockpitDisplayToggleBtn?.getAttribute('aria-expanded') !== 'true') {
      this._setCockpitDisclosure?.('display', true);
      return;
    }
    if (this._cockpitDisplayToggleBtn?.getAttribute('aria-expanded') !== 'true') return;
    this._sliderPanel.classList.remove('collapsed');
    this._syncPanelCollapseButton(this._sliderPanel);
    requestAnimationFrame(() => requestAnimationFrame(() => {
      this._sliderPanel?.scrollIntoView?.({ block: 'nearest' });
    }));
  }

  /**
   * Configures Cesium's built-in bloom stage and adds a custom unsharp-mask
   * sharpen stage to the post-process pipeline. Both start disabled.
   * @returns {void}
   */
  _initBloomSharpen() {
    // Bloom — use Cesium's built-in bloom
    this._bloomStage = this.viewer.scene.postProcessStages.bloom;
    this._bloomStage.enabled = false;
    this._bloomStage.uniforms.glowOnly = false;
    this._bloomStage.uniforms.contrast = 256.0;
    this._bloomStage.uniforms.brightness = -0.35;
    this._bloomStage.uniforms.delta = 0.25;
    this._bloomStage.uniforms.sigma = 0.35;
    this._bloomStage.uniforms.stepSize = 1.0;

    // Sharpen — custom unsharp mask PostProcessStage
    this._sharpenStage = new Cesium.PostProcessStage({
      name: 'godsEyeView_sharpen',
      fragmentShader: SHARPEN_SHADER,
      uniforms: {
        amount: 1.3,
      },
    });
    this._sharpenStage.enabled = false;
    this.viewer.scene.postProcessStages.add(this._sharpenStage);
    if (this._sharpenSlider) {
      this._applySharpenIntensity(parseInt(this._sharpenSlider.value, 10) / 100);
    }
  }

  /**
   * Reads the current bloom intensity percentage from the UI slider.
   * @returns {number} Clamped bloom intensity (0-200).
   */
  _getBloomIntensity() {
    return clampBloomIntensity(parseInt(this._bloomSlider?.value || `${BLOOM_INTENSITY_DEFAULT}`, 10));
  }

  /**
   * Enables or disables the Cesium bloom stage based on both the user toggle
   * and whether the computed strength exceeds the perceptual threshold (0.06).
   * @returns {void}
   */
  _syncBloomStageEnabled() {
    if (!this._bloomStage) return;
    const strength = bloomStrengthFromIntensity(this._getBloomIntensity());
    this._bloomStage.enabled = this.bloomEnabled && strength > 0.06;
  }

  /**
   * Sets the bloom intensity, updates the slider UI, and applies the value.
   * @param {number} intensity - Raw intensity percentage.
   * @param {object} [options]
   * @param {boolean} [options.syncShare=true] - Whether to push state to the share link.
   * @returns {void}
   */
  _setBloomIntensity(intensity, { syncShare = true } = {}) {
    governorRequestRender('bloom');
    const clamped = clampBloomIntensity(intensity);
    if (this._bloomSlider) this._bloomSlider.value = String(clamped);
    if (this._bloomSliderValue) this._bloomSliderValue.textContent = `${clamped}%`;
    this._applyBloomIntensity(clamped);
    if (syncShare) this._syncShareState();
  }

  /**
   * Maps a bloom intensity percentage to Cesium bloom stage uniforms.
   * Uses smoothstep easing (Hermite interpolation: 3t^2 - 2t^3) to
   * produce a perceptually linear glow ramp from zero to full strength.
   * @param {number} intensity - Bloom intensity percentage (0-200).
   * @returns {void}
   */
  _applyBloomIntensity(intensity) {
    if (!this._bloomStage) return;
    const rawStrength = bloomStrengthFromIntensity(intensity);
    // Dead-zone: strengths below 0.06 are imperceptible, clamp to zero.
    const strength = rawStrength <= 0.06 ? 0.0 : ((rawStrength - 0.06) / 0.94);
    // Smoothstep easing for perceptually linear bloom ramp
    const eased = strength * strength * (3.0 - 2.0 * strength);

    // Mapping tuned for intuitive UX:
    // 0 => effectively no glow, 200 => strong glow.
    // Keep threshold strict at low values so only very bright highlights bloom.
    this._bloomStage.uniforms.contrast = 255.0 - (eased * 168.0);
    this._bloomStage.uniforms.brightness = -0.5 + (eased * 0.36);
    this._bloomStage.uniforms.sigma = 0.28 + (eased * 6.3);
    this._bloomStage.uniforms.delta = 0.2 + (eased * 2.25);
    this._bloomStage.uniforms.stepSize = 1.0 + (eased * 1.25);
    this._syncBloomStageEnabled();
  }

  /**
   * Toggles bloom on/off, syncs button state, and reveals/hides the intensity slider row.
   * @param {boolean} enabled - Whether bloom should be active.
   * @returns {void}
   */
  _setBloomEnabled(enabled) {
    governorRequestRender('bloom');
    this.bloomEnabled = !!enabled;
    this._syncBloomStageEnabled();
    this._bloomBtn.classList.toggle('active', this.bloomEnabled);
    this._bloomSliderRow.classList.toggle('visible', this.bloomEnabled);
    if (this.bloomEnabled) {
      this._applyBloomIntensity(this._getBloomIntensity());
    }
    this._syncShareState();
    this._layoutRightPanels();
  }

  /**
   * Maps a normalized sharpen value (0-1) to the unsharp-mask `amount` uniform.
   * Range: 0.1 (subtle) to 2.1 (aggressive edge enhancement).
   * @param {number} val - Normalized sharpen intensity (0.0 to 1.0).
   * @returns {void}
   */
  _applySharpenIntensity(val) {
    governorRequestRender('sharpen');
    if (!this._sharpenStage || !this._sharpenStage.uniforms) return;
    this._sharpenStage.uniforms.amount = 0.1 + val * 2.0;
  }

  /**
   * Toggles sharpening on/off, syncs button state, and reveals/hides the intensity slider row.
   * @param {boolean} enabled - Whether sharpening should be active.
   * @returns {void}
   */
  _setSharpenEnabled(enabled) {
    governorRequestRender('sharpen');
    this.sharpenEnabled = !!enabled;
    this._sharpenStage.enabled = this.sharpenEnabled;
    this._sharpenBtn.classList.toggle('active', this.sharpenEnabled);
    if (this._sharpenSliderRow) {
      this._sharpenSliderRow.classList.toggle('visible', this.sharpenEnabled);
    }
    if (this.sharpenEnabled && this._sharpenSlider) {
      this._applySharpenIntensity(parseInt(this._sharpenSlider.value, 10) / 100);
    }
    this._syncShareState();
    this._layoutRightPanels();
  }

  /**
   * Wires up all primary UI event listeners: style buttons, keyboard shortcuts
   * (1-8 style keys, H/O/V/F/D/C hotkeys, Escape), AI prompt input with
   * debounce, bloom/sharpen/HUD toggles, detection density slider, and
   * clean-view toggle.
   * @returns {void}
   */
  _initUI() {
    // Style buttons
    document.querySelectorAll('.style-btn').forEach(btn => {
      btn.addEventListener('click', () => this.setStyle(btn.dataset.style));
    });

    // Keyboard shortcuts: 1-7, H, Escape
    this._globalKeydownHandler = (e) => {
      // Ignore when interacting with a form control (except Escape). Global
      // hotkeys ('1'-'7', 'h', 'o', 'v', 'd', 'c', 'f') otherwise fire while a
      // <select> dropdown (e.g. HUD layout) is focused and its native
      // type-ahead is in use, or while typing in a text field (M9).
      const isFormControl = e.target?.matches?.('select, input, textarea')
        || e.target === this._locationSearch;
      if (isFormControl && e.key !== 'Escape') return;

      const keyMap = {
        '1': 'normal', '2': 'retro', '3': 'surveillance',
        '4': 'thermal', '5': 'anime', '6': 'noir',
        '7': 'snow',
      };
      if (keyMap[e.key]) this.setStyle(keyMap[e.key]);
      if (e.key === 'Escape') {
        if (this._locationSearch.classList.contains('expanded')) {
          this._locationSearch.classList.remove('expanded');
          this._locationSearch.value = '';
          this._locationSearch.blur();
        }
      }
      if (e.key.toLowerCase() === 'h') {
        this.shareLinkManager?.claimRestoreLane?.('visual');
        this.hud.toggle();
        this._updateHudButtonState();
        this._syncShareState();
      }
      if (e.key.toLowerCase() === 'o') this._toggleOrbit();
      if (e.key.toLowerCase() === 'v') this.toggleCleanView();
      if (e.key.toLowerCase() === 'f') {
        document.getElementById('data-panel').classList.toggle('active');
      }
      if (e.key.toLowerCase() === 'd') {
        this.shareLinkManager?.claimRestoreLane?.('visual');
        this._detectionUserOverridden = true;
        cycleDetectionMode();
        this._syncShareState();
      }
      if (e.key.toLowerCase() === 'c') {
        this._toggleCctvEnabled();
      }
    };
    document.addEventListener('keydown', this._globalKeydownHandler);

    // Bloom toggle
    this._bloomBtn.addEventListener('click', () => {
      this.shareLinkManager?.claimRestoreLane?.('visual');
      this._setBloomEnabled(!this.bloomEnabled);
    });

    // Bloom intensity slider
    this._bloomSlider.addEventListener('input', () => {
      this.shareLinkManager?.claimRestoreLane?.('visual');
      this._setBloomIntensity(parseInt(this._bloomSlider.value, 10));
    });

    // Sharpen toggle
    this._sharpenBtn.addEventListener('click', () => {
      this.shareLinkManager?.claimRestoreLane?.('visual');
      this._setSharpenEnabled(!this.sharpenEnabled);
    });

    // Scope mask — the explicit circular viewport treatment (owner ask:
    // standalone toggle + featherable edge; see src/scopeMask.js).
    this._scopeBtn?.addEventListener('click', () => {
      this.shareLinkManager?.claimRestoreLane?.('visual');
      const next = !isScopeMaskEnabled();
      setScopeMaskEnabled(next);
      this._scopeBtn.classList.toggle('active', next);
      this._scopeBtn.setAttribute('aria-pressed', String(next));
      this._syncShareState();
    });
    this._scopeFeatherSlider?.addEventListener('input', () => {
      this.shareLinkManager?.claimRestoreLane?.('visual');
      const pct = Math.max(0, Math.min(100, parseInt(this._scopeFeatherSlider.value, 10) || 0));
      if (this._scopeFeatherValue) this._scopeFeatherValue.textContent = `${pct}%`;
      setScopeMaskFeather(pct / 100);
      this._syncShareState();
    });
    // Intensity dial — independent of the feather (edge softness) slider above
    // and of the terminus/override system in scopeMask.js. Pure alpha
    // multiplier: 0% is fully transparent (no mask paint beyond the toggle's
    // off state), 100% is today's shipped look.
    this._scopeIntensitySlider?.addEventListener('input', () => {
      this.shareLinkManager?.claimRestoreLane?.('visual');
      const pct = Math.max(0, Math.min(100, parseInt(this._scopeIntensitySlider.value, 10) || 0));
      if (this._scopeIntensityValue) this._scopeIntensityValue.textContent = `${pct}%`;
      setScopeMaskOpacity(pct / 100);
      this._syncShareState();
    });

    if (this._sharpenSlider) {
      this._sharpenSlider.addEventListener('input', () => {
        this.shareLinkManager?.claimRestoreLane?.('visual');
        const pct = parseInt(this._sharpenSlider.value, 10);
        if (this._sharpenSliderValue) {
          this._sharpenSliderValue.textContent = `${pct}%`;
        }
        this._applySharpenIntensity(pct / 100);
        this._syncShareState();
      });
    }

    if (this._hudLayoutSelect) {
      this._hudLayoutSelect.addEventListener('change', () => {
        this.shareLinkManager?.claimRestoreLane?.('visual');
        this._setHudVariant(this._hudLayoutSelect.value);
      });
    }

    if (this._cleanViewBtn) {
      this._cleanViewBtn.addEventListener('click', () => this.toggleCleanView());
    }
    if (this._cleanViewExitBtn) {
      this._cleanViewExitBtn.addEventListener('click', () => this.toggleCleanView(false));
    }

    if (this._detectionDensitySlider) {
      this._detectionDensitySlider.addEventListener('input', () => {
        this.shareLinkManager?.claimRestoreLane?.('visual');
        this._detectionUserOverridden = true;
        const pct = canonicalizeDensity(this._detectionDensitySlider.value);
        this._detectionDensitySlider.value = String(pct);
        if (this._detectionDensityValue) {
          this._detectionDensityValue.textContent = `${pct}%`;
        }
        this._applyDetectionDensityFromUi();
        this._syncShareState();
      });
    }

    for (const button of this._detectionAllocationBtns) {
      button.addEventListener('click', () => {
        this.shareLinkManager?.claimRestoreLane?.('visual');
        this._detectionUserOverridden = true;
        this._setDetectionAllocation(button.dataset.allocation);
      });
    }

    for (const slider of [this._detectionFadeSlider, this._detectionOpacitySlider]) {
      slider?.addEventListener('input', () => {
        this.shareLinkManager?.claimRestoreLane?.('visual');
        this._applyDetectionFadeFromUi();
        this._syncShareState();
      });
    }

    if (this._celestialBtn) {
      this._celestialBtn.addEventListener('click', () => {
        const ringIsVisible = !!this.celestialRing?.visible;
        if (!this.celestialRingEnabled || !ringIsVisible) {
          this.setCelestialRingEnabled(true, { focus: true });
        } else {
          this.setCelestialRingEnabled(false);
        }
      });
    }
  }

  /**
   * Renders the owner-approved map stack chip row from the matching controller
   * entries. Cesium ion/Bing chips remain keyboard-focusable but unavailable,
   * with an accessible explanation, until a CESIUM_ION_TOKEN is configured.
   * @returns {void}
   */
  _initMapStackControl() {
    if (!this._mapStackChips || !this.mapStackController) return;

    if (!this._mapStackChangeHandler) {
      // Provider-driven transitions (notably Esri tile-error fallback) do not
      // pass through `_setMapStack()`. Follow the controller's existing public
      // event so the lit tile, the status line, AND the durable share state all
      // describe the rendered source — without the share sync, a silent
      // fallback leaves copyLink() encoding a stack that is no longer shown.
      this._mapStackChangeHandler = (event) => {
        this._renderMapStackState(event.detail);
        this._syncShareState();
        // The photoreal coverage-gap watchdog also fires silently through
        // this same event — unlike the Esri→OSM tile-failure fallback, a
        // sudden loss of Google 3D at a spot the user deliberately flew to
        // is visually obvious, so it gets an explicit toast on top of the
        // status chip's amber warn state.
        if (this.mapStackController?.consumeCoverageFallbackFlag?.()) {
          this._showToast(event.detail?.lastError || 'Google 3D has no coverage here — showing Esri Satellite');
        }
      };
      window.addEventListener('gev:map-stack-changed', this._mapStackChangeHandler);
    }

    renderMapStackChips(this._mapStackChips, this.mapStackController.getStacks(), {
      activeId: this.mapStackController.getActiveId(),
      onSelect: (stackId) => { this._setMapStack(stackId); },
    });

    this._renderMapStackState(this.mapStackController.getState());
  }

  /**
   * Switches the active map/globe source stack.
   * @param {string} stackId - Map stack id.
   * @param {object} [options]
   * @param {boolean} [options.syncShare=true] - Whether to update the share link.
   * @returns {Promise<void>}
   */
  async _setMapStack(stackId, { syncShare = true } = {}) {
    if (!this.mapStackController) return;
    if (syncShare) this.shareLinkManager?.claimRestoreLane?.('map');
    const before = this.mapStackController.getActiveId();
    this._renderMapStackState(this.mapStackController.getState('switching'));
    const state = await this.mapStackController.setStack(stackId);
    this._renderMapStackState(state);

    if (state?.activeId === before && stackId !== before && state?.lastError) {
      this._showToast(state.lastError);
    }
    if (syncShare) this._syncShareState();
  }

  /**
   * Syncs the map stack chip row and status chip with controller state. The
   * lit chip always follows `state.activeId`, never the click — a rejected or
   * superseded switch therefore leaves the genuinely active stack lit.
   * @param {object} state - Map stack controller state.
   * @returns {void}
   */
  _renderMapStackState(state) {
    if (!state) return;
    syncMapStackChips(this._mapStackChips, state.activeId);
    if (this._mapStackStatus) {
      const stack = state.activeStack;
      const label = state.status === 'switching'
        ? '...'
        : (stack?.shortLabel || stack?.label || 'MAP');
      this._mapStackStatus.textContent = label;
      this._mapStackStatus.classList.toggle('warn', !!state.lastError);
    }
  }

  /**
   * Reads and canonicalizes the five-stop density control. The engine derives
   * Sparse/Balanced/Dense from the same stop.
   * @returns {void}
   */
  _applyDetectionDensityFromUi() {
    if (!this._detectionDensitySlider) return;
    const pct = canonicalizeDensity(this._detectionDensitySlider.value);
    this._detectionDensitySlider.value = String(pct);
    if (this._detectionDensityValue) this._detectionDensityValue.textContent = `${pct}%`;
    setDetectionTuning({ densityPct: pct });
    this._updateDetectionButton(getDetectionMode());
  }

  /** Apply responsive keyhole fade controls from normalized UI percentages. */
  _applyDetectionFadeFromUi() {
    const fadePct = Math.max(0, Math.min(40, Math.round(Number(this._detectionFadeSlider?.value) || 0)));
    const outsideOpacityValue = this._detectionOpacitySlider?.value;
    const outsideOpacityPct = Math.max(
      0,
      Math.min(100, Math.round(outsideOpacityValue == null ? 3 : Number(outsideOpacityValue) || 0)),
    );
    if (this._detectionFadeSlider) this._detectionFadeSlider.value = String(fadePct);
    if (this._detectionFadeValue) this._detectionFadeValue.textContent = `${fadePct}%`;
    if (this._detectionOpacitySlider) this._detectionOpacitySlider.value = String(outsideOpacityPct);
    if (this._detectionOpacityValue) this._detectionOpacityValue.textContent = `${outsideOpacityPct}%`;
    setKeyholeFadeTuning({
      fadeRatio: fadePct / 100,
      outsideOpacity: outsideOpacityPct / 100,
    });
    this.viewer.scene.requestRender?.();
  }

  _setDetectionAllocation(strategy, { syncShare = true, persist = true } = {}) {
    const raw = String(strategy || '').trim().toUpperCase();
    if (!ALLOCATION_STRATEGIES.includes(raw)) return false;
    const normalized = normalizeAllocationStrategy(raw);
    this._detectionAllocationPreference = normalized;
    setDetectionTuning({ allocationStrategy: normalized });
    for (const button of this._detectionAllocationBtns) {
      const active = button.dataset.allocation === normalized;
      button.classList.toggle('active', active);
      button.setAttribute('aria-checked', String(active));
    }
    if (persist) {
      try { localStorage.setItem(DETECTION_ALLOCATION_STORAGE_KEY, normalized); } catch { /* best effort */ }
    }
    if (syncShare) this._syncShareState();
    return true;
  }

  _syncDetectionUiFromEngine() {
    const tuning = getDetectionTuning();
    if (this._detectionDensitySlider) this._detectionDensitySlider.value = String(tuning.densityPct);
    if (this._detectionDensityValue) this._detectionDensityValue.textContent = `${tuning.densityPct}%`;
    this._setDetectionAllocation(tuning.allocationStrategy, { syncShare: false, persist: false });
    const fadeTuning = getKeyholeFadeTuning();
    if (this._detectionFadeSlider) this._detectionFadeSlider.value = String(Math.round(fadeTuning.fadeRatio * 100));
    if (this._detectionOpacitySlider) {
      this._detectionOpacitySlider.value = String(Math.round(fadeTuning.outsideOpacity * 100));
    }
    this._applyDetectionFadeFromUi();
    this._updateDetectionButton(getDetectionMode());
  }

  /**
   * Activates a detection overlay mode by label (e.g. 'OFF', 'SPARSE', 'PANOPTIC').
   * @param {string} modeLabel - Detection mode label to set.
   * @returns {void}
   */
  _setDetectionMode(modeLabel) {
    if (!modeLabel) return;
    setDetectionModeByLabel(modeLabel);
    this._syncDetectionUiFromEngine();
    this._syncShareState();
  }

  /**
   * Switches the HUD layout variant (e.g. 'tactical', 'minimal') and syncs
   * the layout dropdown if present.
   * @param {string} variantName - HUD variant identifier.
   * @returns {void}
   */
  _setHudVariant(variantName) {
    if (!variantName) return;
    this.hud.setVariant(variantName);
    if (this._hudLayoutSelect && this._hudLayoutSelect.value !== this.hud.getVariant()) {
      this._hudLayoutSelect.value = this.hud.getVariant();
    }
    this._syncShareState();
    this._scheduleAdaptivePanelLayout({ settle: true });
  }

  /**
   * Keeps both responsive panel lanes and Cockpit's utility strip on the same
   * measured layout commit. HUD visibility transitions can outlive the first
   * animation frame, so variant changes receive one bounded settling pass.
   * @param {{settle?: boolean}} [options] Whether to remeasure after transitions.
   * @returns {void}
   */
  _scheduleAdaptivePanelLayout({ settle = false } = {}) {
    this._scheduleLeftPanelLayout({ reconsiderAutoCollapse: true });
    this._scheduleRightPanelLayout({ reconsiderAutoCollapse: true });
    this.cockpitView?.scheduleContextLayout();
    if (!settle) return;
    clearTimeout(this._adaptivePanelSettleTimer);
    this._adaptivePanelSettleTimer = setTimeout(() => {
      this._adaptivePanelSettleTimer = null;
      this._scheduleLeftPanelLayout({ reconsiderAutoCollapse: true });
      this._scheduleRightPanelLayout({ reconsiderAutoCollapse: true });
      this.cockpitView?.scheduleContextLayout();
    }, COCKPIT_LAYOUT_SETTLE_MS);
  }

  /**
   * Applies preset defaults (bloom, sharpen, shader uniforms, HUD variant)
   * when a military-class style (CRT, NVG, FLIR) is selected. Does nothing
   * for styles without entries in STYLE_PRESET_DEFAULTS.
   * @param {string} styleName - The style whose defaults to apply.
   * @returns {void}
   */
  _applyStylePresetDefaults(styleName) {
    const preset = STYLE_PRESET_DEFAULTS[styleName];
    if (!preset) return;

    if (preset.styleParams && typeof preset.styleParams === 'object') {
      for (const [targetStyle, params] of Object.entries(preset.styleParams)) {
        const stage = this.stages[targetStyle];
        if (!stage || !params || typeof params !== 'object') continue;
        for (const [uniformName, uniformValue] of Object.entries(params)) {
          if (stage.uniforms[uniformName] === undefined) continue;
          stage.uniforms[uniformName] = uniformValue;
          governorRequestRender('style-param');
        }
      }
    }

    const bloomInput = preset.bloom || {};
    if (typeof bloomInput.intensity === 'number' && this._bloomSlider) {
      this._setBloomIntensity(clampBloomIntensity(bloomInput.intensity), { syncShare: false });
    }
    if (typeof bloomInput.enabled === 'boolean') {
      this._setBloomEnabled(bloomInput.enabled);
    }

    const sharpenInput = preset.sharpen || {};
    if (typeof sharpenInput.intensity === 'number' && this._sharpenSlider) {
      const sharpenPct = Math.max(0, Math.min(100, Math.round(sharpenInput.intensity)));
      this._sharpenSlider.value = String(sharpenPct);
      this._sharpenSliderValue.textContent = `${sharpenPct}%`;
      this._applySharpenIntensity(sharpenPct / 100);
    }
    if (typeof sharpenInput.enabled === 'boolean') {
      this._setSharpenEnabled(sharpenInput.enabled);
    }

    if (preset.hudVariant) {
      this._setHudVariant(preset.hudVariant);
    }
    if (typeof preset.hudVisible === 'boolean') {
      this.hud.setMode(preset.hudVisible ? 'on' : 'off');
      this._updateHudButtonState();
    }

    // A style may set a detection default (e.g. military styles -> Dense for
    // the "epic" default view), but ONLY if the user hasn't manually changed
    // detection this session. Detection is user-controlled and persists across
    // style switches, so an explicit Sparse/Off choice is never stomped.
    if (preset.detection && !this._detectionUserOverridden) {
      this._applyDetectionPreset(preset.detection);
    }
  }

  /**
   * Apply a detection preset's density and mode through the real UI path.
   *
   * Deliberately does NOT consult `_detectionUserOverridden` — the CALLER owns
   * that decision. The style path checks it (an explicit Sparse/Off must
   * survive a style switch); Cockpit entry does not (owner: detection is on in
   * the cockpit "regardless").
   * @param {{mode?: string, densityPct?: number}} det Preset detection config.
   * @returns {void}
   */
  _applyDetectionPreset(det) {
    if (!det) return;
    if (typeof det.densityPct === 'number' && this._detectionDensitySlider) {
      const pct = canonicalizeDensity(det.densityPct);
      this._detectionDensitySlider.value = String(pct);
      if (this._detectionDensityValue) this._detectionDensityValue.textContent = `${pct}%`;
      this._applyDetectionDensityFromUi();
    }
    if (det.mode) this._setDetectionMode(String(det.mode).toUpperCase());
  }

  /**
   * Applies the global post-processing baseline (GLOBAL_POST_DEFAULTS) at
   * startup before any share-link restore runs. Sets bloom, sharpen, HUD,
   * and detection to their factory defaults.
   * @returns {void}
   */
  _applyGlobalPostDefaults() {
    const defaults = GLOBAL_POST_DEFAULTS;
    if (typeof defaults.bloom?.intensity === 'number' && this._bloomSlider) {
      this._setBloomIntensity(clampBloomIntensity(defaults.bloom.intensity), { syncShare: false });
    }
    if (typeof defaults.bloom?.enabled === 'boolean') {
      this._setBloomEnabled(defaults.bloom.enabled);
    }

    if (typeof defaults.sharpen?.intensity === 'number' && this._sharpenSlider) {
      const sharpenPct = Math.max(0, Math.min(100, Math.round(defaults.sharpen.intensity)));
      this._sharpenSlider.value = String(sharpenPct);
      this._sharpenSliderValue.textContent = `${sharpenPct}%`;
      this._applySharpenIntensity(sharpenPct / 100);
    }
    if (typeof defaults.sharpen?.enabled === 'boolean') {
      this._setSharpenEnabled(defaults.sharpen.enabled);
    }

    if (defaults.hudVariant) {
      this._setHudVariant(defaults.hudVariant);
    }
    if (typeof defaults.hudVisible === 'boolean') {
      this.hud.setMode(defaults.hudVisible ? 'on' : 'off');
      this._updateHudButtonState();
    }

    if (defaults.detectionMode) {
      this._setDetectionMode(defaults.detectionMode);
    }
    if (typeof defaults.detectionDensity === 'number' && this._detectionDensitySlider) {
      const density = canonicalizeDensity(defaults.detectionDensity);
      this._detectionDensitySlider.value = String(density);
      this._detectionDensityValue.textContent = `${density}%`;
      this._applyDetectionDensityFromUi();
    }
    this._setDetectionAllocation(
      this._detectionAllocationPreference || defaults.detectionAllocation || 'ELASTIC',
      { syncShare: false, persist: false },
    );
    if (this._detectionFadeSlider) {
      this._detectionFadeSlider.value = String(defaults.detectionFadePct ?? 7);
    }
    if (this._detectionOpacitySlider) {
      this._detectionOpacitySlider.value = String(defaults.detectionOutsideOpacityPct ?? 1);
    }
    this._applyDetectionFadeFromUi();
    if (typeof defaults.celestialRing === 'boolean') {
      this.setCelestialRingEnabled(defaults.celestialRing, { syncShare: false, focus: false });
    }
  }

  /**
   * Pushes the current visual state (bloom, sharpen, HUD, detection) to
   * the ShareLinkManager so the URL hash stays in sync.
   * @returns {void}
   */
  /**
   * Detection as a DURABLE preference, for serialization into a share link.
   *
   * While Contacts is active it OWNS detection and forces Dense @ 75%. That is
   * a session-scoped override, not something the operator chose: it is undone
   * verbatim on deactivation. Serializing the forced values shipped a link that
   * pinned Dense @ 75% on the recipient — as a durable preference, with no
   * Contacts mode present to explain or undo it — even though the author's own
   * setting was (say) OFF @ 50%. Publish what deactivation would restore.
   *
   * `_contactsDetectionRestore` is exactly that snapshot and is null whenever
   * Contacts does not own detection, so the live values are used normally.
   */
  _shareableDetectionState() {
    return shareableDetectionState({
      owned: this._contactsDetectionRestore,
      liveMode: getDetectionMode(),
      liveDensityPct: parseInt(this._detectionDensitySlider?.value || '50', 10),
    });
  }

  _syncShareState() {
    const detection = this._shareableDetectionState();
    this.shareLinkManager.onToggleChange(this.bloomEnabled, this.sharpenEnabled, {
      bloomIntensity: this._getBloomIntensity(),
      bloomVersion: BLOOM_SCALE_VERSION,
      sharpenIntensity: parseInt(this._sharpenSlider?.value || '49', 10),
      hudVariant: this.hud.getVariant(),
      hudVisible: this.hud.visible,
      detectionMode: detection.mode,
      detectionDensity: detection.densityPct,
      detectionAllocation: getDetectionTuning().allocationStrategy,
      detectionFadePct: parseInt(this._detectionFadeSlider?.value || '7', 10),
      detectionOutsideOpacityPct: parseInt(this._detectionOpacitySlider?.value || '1', 10),
      celestialRingEnabled: this.celestialRingEnabled,
      scopeEnabled: isScopeMaskEnabled(),
      scopeFeatherPct: Math.round(getScopeMaskFeather() * 100),
      scopeIntensityPct: Math.round(getScopeMaskOpacity() * 100),
      // null when adaptive — the share layer omits `sce` entirely in that case.
      scopeTerminusPct: getScopeTerminusOverride() == null
        ? null
        : Math.round(getScopeTerminusOverride() * 100),
      mapStack: this.mapStackController?.getActiveId?.() || 'photoreal',
    });
  }

  /**
   * Updates the traffic sync status chip with loading phase label and progress.
   * Auto-hides after 1.5s when loading completes; stays visible while busy.
   * @param {boolean} [forceShow=false] - Force the chip visible regardless of busy state.
   * @returns {void}
   */
  _updateTrafficSyncChip(forceShow = false, now = performance.now()) {
    if (!this._trafficSyncChip || !this._trafficSyncLabel || !this._trafficSyncProgress) return;
    const layers = this._dataManager?.getAll?.();
    const traffic = Array.isArray(layers) ? layers.find((layer) => layer.id === 'traffic') : null;
    this._trafficSyncFeedbackState = reduceTrafficSyncFeedback(
      this._trafficSyncFeedbackState,
      { enabled: traffic?.enabled === true, stats: traffic?.stats || {}, forceShow },
      now,
    );
    const presentation = this._trafficSyncFeedbackState;
    // setSplitFlapText carries the same unchanged-text guard internally, and
    // the flap keeps textContent equal to the settled label throughout, so
    // this stays a no-op on the repeat ticks exactly as it did before.
    if (presentation.label) setSplitFlapText(this._trafficSyncLabel, presentation.label);
    // Written on every change INCLUDING the empty settled value — the reducer
    // clears the progress number once the sync lands, and a truthiness guard
    // here would strand the last "..." beside the settled label.
    if (this._trafficSyncProgress.textContent !== presentation.progressText) {
      this._trafficSyncProgress.textContent = presentation.progressText;
    }
    this._trafficSyncChip.classList.toggle('visible', presentation.visible);
  }

  /**
   * Updates the CCTV loading chip (same pattern as the traffic sync chip)
   * with staggered initial-load progress, e.g. "LOADING FRAMES 12/36".
   * Shows a brief "camera grid ready" confirmation, then hides.
   * @param {{active: boolean, loaded: number, total: number}|null|undefined} loading
   *   Loading progress from the CCTV layer UI state.
   * @param {boolean} enabled - Whether the CCTV layer is currently enabled.
   * @returns {void}
   */
  _updateCctvSyncChip(loading, enabled) {
    if (!this._cctvSyncChip || !this._cctvSyncLabel || !this._cctvSyncProgress) return;
    const total = Number(loading?.total) || 0;
    const loaded = Math.max(0, Math.min(Number(loading?.loaded) || 0, total));
    const busy = !!enabled && !!loading?.active && total > 0;

    if (busy) {
      clearTimeout(this._cctvChipHideTimer);
      this._cctvChipHideTimer = null;
      this._cctvChipWasBusy = true;
      setSplitFlapText(this._cctvSyncLabel, 'loading frames');
      // The counter is left plain on purpose: it ticks every few frames
      // during a grid load, and flapping it would read as a slot machine.
      this._cctvSyncProgress.textContent = `${loaded}/${total}`;
      this._cctvSyncChip.classList.add('visible');
      return;
    }

    if (this._cctvChipWasBusy && enabled && total > 0) {
      // Load just completed — flash the final count, then auto-hide.
      this._cctvChipWasBusy = false;
      setSplitFlapText(this._cctvSyncLabel, 'camera grid ready');
      this._cctvSyncProgress.textContent = `${total}/${total}`;
      this._cctvSyncChip.classList.add('visible');
      clearTimeout(this._cctvChipHideTimer);
      this._cctvChipHideTimer = window.setTimeout(() => {
        this._cctvChipHideTimer = null;
        this._cctvSyncChip.classList.remove('visible');
      }, 1500);
      return;
    }

    if (!this._cctvChipHideTimer) {
      this._cctvChipWasBusy = false;
      this._cctvSyncChip.classList.remove('visible');
    }
  }

  /**
   * Initializes panel collapse buttons and restores persisted collapsed state.
   * Also sets up hover-expand behavior for the style presets and location bar panels.
   * @returns {void}
   */
  _initPanelChrome() {
    const targets = new Set();
    document.querySelectorAll('.panel-collapse-btn[data-collapse-target]').forEach((btn) => {
      const targetId = btn.dataset.collapseTarget;
      if (targetId) targets.add(targetId);
      btn.addEventListener('click', () => {
        const targetId = btn.dataset.collapseTarget;
        if (!targetId) return;
        const nextCollapsed = !document.getElementById(targetId)?.classList.contains('collapsed');
        this.setPanelCollapsed(targetId, nextCollapsed, { explicit: true });
      });
    });

    for (const targetId of targets) {
      this._restorePanelCollapsedState(targetId, {
        allowStored: !this._initialShareState,
      });
    }
    // The command dock always starts compact; either wing reveals on hover,
    // focus, or click and collapses again after the interaction moves away.
    this.setPanelCollapsed('control-panel', true, { syncShare: false, persist: false });
    this.setPanelCollapsed('location-bar', true, { syncShare: false, persist: false });
    this._initAutoHoverPanel('control-panel', { openDelayMs: 140, closeDelayMs: 420 });
    this._initAutoHoverPanel('location-bar', { openDelayMs: 140, closeDelayMs: 420 });
    this._initCommandDockPins();
    this._initCommandDockTrayMetrics();
    this._maybeNotifyLayoutReset();
  }

  /**
   * Allows either command-dock tray to remain open until explicitly unpinned.
   * Both trays may be pinned; transient and error trays stack above them.
   * @returns {void}
   */
  _initCommandDockPins() {
    document.querySelectorAll('.dock-pin-btn[data-pin-target]').forEach((button) => {
      button.addEventListener('click', (event) => {
        event.stopPropagation();
        const panelId = button.dataset.pinTarget;
        this._setCommandDockPanelPinState(panelId);
      });
    });
  }

  _setCommandDockPanelPinState(panelId, pin, {
    restore = false,
    persist = true,
    syncShare = true,
  } = {}) {
    const panelEl = document.getElementById(panelId);
    const button = document.querySelector(`.dock-pin-btn[data-pin-target="${panelId}"]`);
    if (!panelEl || !button) return undefined;
    const shouldPin = typeof pin === 'boolean'
      ? pin
      : !panelEl.classList.contains('dock-pinned');
    panelEl.classList.toggle('dock-pinned', shouldPin);
    button.setAttribute('aria-pressed', String(shouldPin));
    document.querySelectorAll('#command-dock .dock-pinned-top').forEach((pinnedPanel) => {
      pinnedPanel.classList.remove('dock-pinned-top');
    });
    if (shouldPin) {
      panelEl.classList.add('dock-pinned-top');
      this.setPanelCollapsed(panelId, false, {
        explicit: !restore,
        restore,
        persist,
        syncShare: false,
      });
    } else {
      const remainingPinnedPanel = document.querySelector('#command-dock .dock-pinned');
      remainingPinnedPanel?.classList.add('dock-pinned-top');
      if (!restore && !panelEl.matches(':hover')) {
        this.setPanelCollapsed(panelId, true, {
          explicit: true,
          persist,
          syncShare: false,
        });
      }
    }
    this._updateCommandDockTrayStack();
    if (syncShare) {
      if (!restore) this.shareLinkManager?.claimRestoreLane?.('panel', panelId);
      this.shareLinkManager?.onPanelStateChange?.();
    }
    return shouldPin;
  }

  /**
   * Tracks the live pinned-tray height so a hovered sibling can stack above it
   * without hardcoded content dimensions.
   * @returns {void}
   */
  _initCommandDockTrayMetrics() {
    const dock = document.getElementById('command-dock');
    if (!dock) return;
    this._commandDockTrayObserver?.disconnect?.();
    if (typeof ResizeObserver === 'function') {
      this._commandDockTrayObserver = new ResizeObserver(() => this._updateCommandDockTrayStack());
      dock.querySelectorAll('.dock-popover-content').forEach((tray) => {
        this._commandDockTrayObserver.observe(tray);
      });
    }
    this._updateCommandDockTrayStack();
  }

  /**
   * Writes each pinned tray height and their combined stack height as CSS
   * variables. The most recently pinned tray forms the upper level.
   * @returns {void}
   */
  _updateCommandDockTrayStack() {
    const dock = document.getElementById('command-dock');
    if (!dock) return;
    const locationPanel = dock.querySelector('#location-bar.dock-pinned:not(.collapsed)');
    const presetsPanel = dock.querySelector('#control-panel.dock-pinned:not(.collapsed)');
    const locationHeight = locationPanel?.querySelector('.dock-popover-content')?.getBoundingClientRect().height || 0;
    const presetsHeight = presetsPanel?.querySelector('.dock-popover-content')?.getBoundingClientRect().height || 0;
    const pinnedCount = Number(locationHeight > 0) + Number(presetsHeight > 0);
    const locationHeightPx = Math.ceil(locationHeight);
    const presetsHeightPx = Math.ceil(presetsHeight);
    const topPinnedPanel = dock.querySelector('.dock-pinned-top.dock-pinned:not(.collapsed)');
    const lowerPinnedPanel = topPinnedPanel?.id === 'location-bar' ? presetsPanel : locationPanel;
    const lowerPinnedHeight = lowerPinnedPanel
      ?.querySelector('.dock-popover-content')
      ?.getBoundingClientRect().height || 0;
    const stackHeight = pinnedCount > 1
      ? `calc(${locationHeightPx}px + ${presetsHeightPx}px + 1.2rem)`
      : `${locationHeightPx + presetsHeightPx}px`;
    dock.style.setProperty('--dock-location-pinned-height', `${locationHeightPx}px`);
    dock.style.setProperty('--dock-presets-pinned-height', `${presetsHeightPx}px`);
    dock.style.setProperty('--dock-lower-pinned-height', `${Math.ceil(lowerPinnedHeight)}px`);
    dock.style.setProperty('--dock-pinned-stack-height', stackHeight);
    dock.classList.toggle('dock-has-pinned-tray', pinnedCount > 0);
    dock.classList.toggle('dock-has-two-pinned-trays', pinnedCount > 1);
  }

  /**
   * One-time toast when stored v6 panel positions are superseded by the v7
   * layout defaults (positions reset; collapsed states are preserved).
   * @returns {void}
   */
  _maybeNotifyLayoutReset() {
    try {
      const marker = `godsEyeView.${PANEL_POSITION_STORAGE_VERSION}.layoutResetNotified`;
      if (localStorage.getItem(marker)) return;
      localStorage.setItem(marker, '1');
      const hadOldPositions = Object.keys(localStorage)
        .some((key) => key.startsWith('godsEyeView.v6.panelPos.'));
      if (hadOldPositions) {
        this._showToast('Panel layout updated — positions reset to new defaults');
      }
    } catch {
      // storage unavailable
    }
  }

  /**
   * Configures intentional hover-expand / leave-collapse behavior on a panel.
   * Uses separate open/close timers to prevent accidental flicker from fast
   * mouse passes. Wheel events cancel pending opens to avoid surprise expansion
   * during scroll-through.
   * @param {string} panelId - DOM id of the panel element.
   * @param {object} [options]
   * @param {number} [options.openDelayMs=850] - Hover dwell time before auto-expanding.
   * @param {number} [options.closeDelayMs=1000] - Delay after pointer leaves before collapsing.
   * @returns {void}
   */
  _initAutoHoverPanel(panelId, { openDelayMs = 850, closeDelayMs = 1000 } = {}) {
    const panelEl = document.getElementById(panelId);
    if (!panelEl) return;
    const disclosure = panelEl.querySelector(`[data-dock-toggle-target="${panelId}"]`);
    let openTimer = null;
    let closeTimer = null;
    let lastWheelTime = 0;
    let disclosureFocusTimer = null;

    const clearOpen = () => {
      if (!openTimer) return;
      clearTimeout(openTimer);
      openTimer = null;
    };

    const clearClose = () => {
      if (!closeTimer) return;
      clearTimeout(closeTimer);
      closeTimer = null;
    };

    const scheduleOpen = () => {
      clearOpen();
      openTimer = window.setTimeout(() => {
        openTimer = null;
        if (!panelEl.matches(':hover')) return;
        if (performance.now() - lastWheelTime < 280) return;
        if (!panelEl.classList.contains('collapsed')) return;
        this.setPanelCollapsed(panelId, false);
      }, openDelayMs);
    };

    // Focus inside the tray defers the unpinned auto-dismiss, but only for the
    // KEYBOARD: the disclosure hands focus to a Map Source tile on Enter/Space,
    // and closing the tray out from under that focus would strand the caret.
    // Plain `document.activeElement` is the wrong test — Chromium focuses a
    // <button> on mouse press, so once Map Source moved into this tray a tile
    // CLICK left focus parked inside and the popover never dismissed on
    // mouse-away (owner field report; Location, whose input is genuinely
    // keyboard-focused when clicked, still dismissed). `:focus-visible` is the
    // platform's own pointer-vs-keyboard focus signal, so a typed-into field
    // still holds the tray open while a clicked tile does not. A browser
    // without `:focus-visible` keeps the conservative hold.
    const keyboardFocusInside = () => {
      const active = document.activeElement;
      if (!active || !panelEl.contains(active)) return false;
      try { return active.matches(':focus-visible'); } catch { return true; }
    };

    const scheduleClose = () => {
      clearClose();
      closeTimer = window.setTimeout(() => {
        closeTimer = null;
        if (panelEl.matches(':hover') || keyboardFocusInside()) return;
        if (panelEl.classList.contains('dock-pinned')) return;
        if (panelEl.classList.contains('collapsed')) return;
        this.setPanelCollapsed(panelId, true);
      }, closeDelayMs);
    };

    panelEl.addEventListener('wheel', () => {
      lastWheelTime = performance.now();
      clearOpen();
    }, { passive: true });

    panelEl.addEventListener('click', (event) => {
      if (event.target.closest('.panel-collapse-btn, .dock-tray-toggle')) return;
      clearOpen();
      clearClose();
      if (panelEl.classList.contains('collapsed')) {
        this.setPanelCollapsed(panelId, false, { explicit: true });
      }
    });

    panelEl.addEventListener('pointerenter', (event) => {
      const pointerType = event.pointerType || 'mouse';
      if (pointerType !== 'mouse' && pointerType !== 'pen') return;
      clearClose();
      if (panelEl.classList.contains('collapsed')) {
        scheduleOpen();
      }
    });

    panelEl.addEventListener('pointerleave', (event) => {
      const pointerType = event.pointerType || 'mouse';
      if (pointerType !== 'mouse' && pointerType !== 'pen') return;
      clearOpen();
      scheduleClose();
    });

    panelEl.addEventListener('pointerdown', () => {
      clearOpen();
      clearClose();
    });

    const focusMapSource = () => {
      if (panelId !== 'control-panel') return;
      panelEl.querySelector('.map-stack-chip.active, .map-stack-chip')?.focus?.({ preventScroll: true });
    };

    const scheduleMapSourceFocus = () => {
      clearTimeout(disclosureFocusTimer);
      disclosureFocusTimer = window.setTimeout(() => {
        disclosureFocusTimer = null;
        if (!panelEl.classList.contains('collapsed')) focusMapSource();
      }, 240);
    };

    const toggleDisclosure = ({ focusSource = false } = {}) => {
      clearOpen();
      clearClose();
      const shouldOpen = panelEl.classList.contains('collapsed');
      this.setPanelCollapsed(panelId, !shouldOpen, { explicit: true });
      if (shouldOpen && focusSource) scheduleMapSourceFocus();
    };

    disclosure?.addEventListener('click', (event) => {
      event.stopPropagation();
      // Keep native button activation semantics: Enter activates on keydown,
      // Space on keyup, and pointer clicks report a non-zero detail. Scheduling
      // focus from the synthesized click avoids a key latch that can outlive the
      // disclosure after a long Enter hold moves focus into the tray.
      toggleDisclosure({ focusSource: event.detail === 0 });
    });
    disclosure?.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      // The application-level Space shortcut must not steal activation from a
      // focused disclosure. One non-repeating keydown is enough; no keyup latch
      // is retained after focus moves into the tray.
      event.preventDefault();
      event.stopPropagation();
      if (event.repeat) return;
      toggleDisclosure({ focusSource: true });
    });

    panelEl.addEventListener('focusin', () => clearClose());
    panelEl.addEventListener('focusout', (event) => {
      if (panelEl.contains(event.relatedTarget)) return;
      scheduleClose();
    });
    panelEl.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape' || panelEl.classList.contains('collapsed')) return;
      event.preventDefault();
      clearOpen();
      clearClose();
      this.setPanelCollapsed(panelId, true, { explicit: true });
      disclosure?.focus?.({ preventScroll: true });
    });
  }

  /**
   * Sets up drag-to-reposition for legacy floating controls. The right rail
   * and left accordion remain fixed so their HUD alignment is deterministic.
   * @returns {void}
   */
  _initPanelDrag() {
    const dragSpecs = [
      {
        id: 'pp-toggles',
        panel: this._ppToggles,
        handle: this._ppToggles?.querySelector('.panel-drag-handle.compact'),
      },
    ].filter(Boolean);

    for (const spec of dragSpecs) {
      if (!spec.panel || !spec.handle) continue;
      this._restorePanelPosition(spec.id, spec.panel);
      this._makePanelDraggable(spec.id, spec.panel, spec.handle);
    }
    // Keep a positioned panel on-screen when its HEIGHT changes after restore — it expands to its
    // full row set a frame or two later, so the restore-time clamp used a stale (shorter) height and
    // the panel could still hang off the bottom (audit U2). Re-clamp on every size change.
    if (this._ppToggles && typeof ResizeObserver !== 'undefined') {
      this._draggableResizeObserver = new ResizeObserver(() => this._reclampDraggablePanels());
      this._draggableResizeObserver.observe(this._ppToggles);
    }
  }

  _persistAwarenessSelection(event, cleared = false) {
    if (!this._dataManager) return;
    const origin = String(event?.detail?.origin || 'programmatic');
    if (!isExplicitLayerStateOrigin(origin)) return;
    const layerId = String(event?.detail?.layerId || '');
    const config = {
      flights: {
        key: 'selectedFlightsTrackingId',
        normalize: (value) => String(value ?? '').trim().toLowerCase() || null,
      },
      military: {
        key: 'selectedMilitaryTrackingId',
        normalize: (value) => String(value ?? '').trim().toLowerCase() || null,
      },
      satellites: {
        key: 'selectedSatTrackingId',
        normalize: (value) => {
          const candidate = Number(value);
          return Number.isFinite(candidate) && candidate > 0 ? Math.trunc(candidate) : null;
        },
      },
    }[layerId];
    if (!config) return;
    const selectedValue = cleared ? null : config.normalize(event?.detail?.id);
    if (cleared || selectedValue === null) {
      this._dataManager.adoptLayerParams?.(layerId, {
        [config.key]: selectedValue,
      }, { origin });
      return;
    }
    // A direct selection promotes a Context-owned tracker dependency into
    // durable visibility before its selected ID is normalized. Context exit
    // also keeps this adopted layer instead of tearing down the user's track.
    const visibilityAdopted = this._dataManager.adoptLayerVisibility?.(
      layerId,
      true,
      { origin, adoptedFromSelection: true },
    );
    if (visibilityAdopted === false) return;
    // Clear the prior family before publishing the replacement. Otherwise the
    // coordinator briefly sees two IDs and correctly treats them as an
    // ambiguous incoming state, which would discard the new durable target.
    for (const [otherLayerId, otherKey] of [
      ['flights', 'selectedFlightsTrackingId'],
      ['military', 'selectedMilitaryTrackingId'],
      ['satellites', 'selectedSatTrackingId'],
    ]) {
      if (otherLayerId === layerId) continue;
      this._dataManager.setLayerParams(otherLayerId, { [otherKey]: null }, { origin });
    }
    this._dataManager.adoptLayerParams?.(layerId, {
      [config.key]: selectedValue,
    }, { origin });
  }

  /**
   * Connects the layer data manager for traffic sync, CCTV state subscription,
   * and layer enable/disable operations.
   * @param {object|null} dataManager - The DataManager instance, or null to detach.
   * @returns {void}
   */
  attachDataManager(dataManager) {
    if (this._dataManagerBeforeDestroyUnsubscribe) {
      this._dataManagerBeforeDestroyUnsubscribe();
      this._dataManagerBeforeDestroyUnsubscribe = null;
    }
    if (this._dataManagerVisibilityGuardUnsubscribe) {
      this._dataManagerVisibilityGuardUnsubscribe();
      this._dataManagerVisibilityGuardUnsubscribe = null;
    }
    if (this._dataManagerVisibilityRequestUnsubscribe) {
      this._dataManagerVisibilityRequestUnsubscribe();
      this._dataManagerVisibilityRequestUnsubscribe = null;
    }
    this._dataManager = dataManager || null;
    this.hud.attachDataManager(this._dataManager);
    this._updateTrafficSyncChip();
    if (this._dataManagerUnsubscribe) {
      this._dataManagerUnsubscribe();
      this._dataManagerUnsubscribe = null;
    }
    if (typeof this._dataManager?.subscribe === 'function') {
      this._dataManagerUnsubscribe = this._dataManager.subscribe((change) => {
        if (String(change?.type || '').startsWith('visibility')) {
          this._handleContextLayerChange(change);
        }
        this._loadingFeedbackEvent = change;
        this._updateGlobalLoadingFeedback(performance.now());
      });
    }
    this._updateGlobalLoadingFeedback(performance.now());
    if (typeof this._dataManager?.subscribeVisibilityRequests === 'function') {
      this._dataManagerVisibilityRequestUnsubscribe = this._dataManager.subscribeVisibilityRequests((change) => {
        if (shouldCaptureContextSession(change)) {
          // This event is synchronous with intent publication, before an
          // awaited guard or Clear All can alter the rest of the layer set.
          // Manager effective visibility already includes both the new entry
          // intent and Clear's reserved OFF baseline.
          this._captureContextSessionSnapshot({ excludeLayerIds: [change.layerId] });
          if (shouldDeferContextEntryDuringClear({
            change,
            clearInFlight: Boolean(this._clearSelectedLayersPromise),
          })) {
            this._contextModeDeferredEntryIntent = {
              layerId: change.layerId,
              intentEpoch: change.intentEpoch,
              origin: change.origin,
            };
            this._contextModeEntering = 'space-missions';
            this._syncContextModeButtons();
          }
        } else if (
          change?.layerId === 'rocket-launches'
          && change.enabled === false
          && isExplicitUserIntentOrigin(change.origin, change.layerId)
        ) {
          this._contextModeDeferredEntryIntent = null;
          if (this._clearSelectedLayersPromise) {
            this._contextSessionSnapshot = null;
            this._contextModeEntering = null;
            this._syncContextModeButtons();
          }
        }
      });
    }
    if (typeof this._dataManager?.addVisibilityGuard === 'function') {
      this._dataManagerVisibilityGuardUnsubscribe = this._dataManager.addVisibilityGuard(async (change) => {
        const layerName = this._dataManager?.layers?.get(change.layerId)?.module?.name || change.layerId;
        const reason = contextLayerEnableBlockReason({
          contextMode: this._contextModeEntering || this._contextMode,
          change,
          layerName,
        });
        if (reason) return reason;
        if (
          change.enabled
          && ['military-awareness', 'rocket-launches'].includes(change.layerId)
          && shouldCaptureContextSession(change)
          && (
            !this._contextModeChanging
            || (
              change.layerId === 'rocket-launches'
              && this._contextModeDeferredEntryIntent?.intentEpoch === change.intentEpoch
            )
          )
        ) {
          const entryMode = change.layerId === 'rocket-launches' ? 'space-missions' : null;
          const deferredClearEntry = this._contextModeDeferredEntryIntent?.intentEpoch === change.intentEpoch;
          // A deferred entry owns the state after Clear settles. Restoring
          // Clear's transient busy flag here would leave Context stuck.
          const priorChanging = deferredClearEntry ? false : this._contextModeChanging;
          const notificationToken = change.notificationToken || Symbol('direct-context-shell-entry');
          const ownsNotificationToken = !change.notificationToken;
          if (ownsNotificationToken) {
            this._userFacingContextNotificationTokens.add(notificationToken);
          }
          this._contextModeEntering = entryMode;
          this._contextModeChanging = true;
          try {
            if (deferredClearEntry) {
              await this._clearSelectedLayersManagerPromise;
              if (this._contextModeDeferredEntryIntent?.intentEpoch !== change.intentEpoch) return false;
              this._contextModeDeferredEntryIntent = null;
            }
            await this._clearLayersOutsideContextMode(entryMode, { notificationToken });
          } catch (error) {
            this._contextModeEntering = null;
            console.warn(`[Context] ${change.layerId} isolation failed`, error);
            try {
              await this._restoreContextSession({
                excludeLayerIds: [change.layerId],
                notificationToken,
              });
            } catch (restoreError) {
              console.warn(`[Context] ${change.layerId} rollback failed`, restoreError);
            }
            return `${entryMode === 'space-missions' ? 'Space Missions' : 'Context'} could not start because another layer did not stop cleanly`;
          } finally {
            if (ownsNotificationToken) {
              this._userFacingContextNotificationTokens.delete(notificationToken);
            }
            settleContextModeChange(this, priorChanging);
          }
        }
        return null;
      });
    }
    if (typeof this._dataManager?.subscribeBeforeDestroy === 'function') {
      this._dataManagerBeforeDestroyUnsubscribe = this._dataManager.subscribeBeforeDestroy(async ({ layerId } = {}) => {
        if (!this._contextSessionSnapshot) return;
        await runWithContextModeChanging(this, async () => {
          this._contextMode = null;
          this.cockpitView?.exit({ restoreTracking: false });
          this._syncContextModeButtons();
          await this._restoreContextSession({ excludeLayerIds: layerId ? [layerId] : [] });
        });
      });
    }
    this._syncContextModeButtons();
    if (this._cctvUnsubscribe) {
      this._cctvUnsubscribe();
      this._cctvUnsubscribe = null;
    }
    if (typeof cctvLayer.subscribe === 'function') {
      this._cctvUnsubscribe = cctvLayer.subscribe((state) => {
        this._renderCctvState(state);
      });
    }
    if (typeof cctvLayer.getUIState === 'function') {
      this._renderCctvState(cctvLayer.getUIState());
    }
    if (this._radioUnsubscribe) {
      this._radioUnsubscribe();
      this._radioUnsubscribe = null;
    }
    if (typeof radioLayer.subscribe === 'function') {
      this._radioUnsubscribe = radioLayer.subscribe((state) => {
        this._renderRadioState(state);
      });
    }
    if (!this._awarenessSelectedHandler) {
      this._awarenessSelectedHandler = (event) => this._persistAwarenessSelection(event, false);
      this._awarenessClearedHandler = (event) => this._persistAwarenessSelection(event, true);
      window.addEventListener('gev:awareness-subject-selected', this._awarenessSelectedHandler);
      window.addEventListener('gev:awareness-subject-cleared', this._awarenessClearedHandler);
    }
    this._layerStateCoordinator?.destroy();
    this._layerStateCoordinator = null;
    this._layerStateRestorePromise = null;
    if (this._dataManager) {
      this._layerStateCoordinator = new LayerStateCoordinator(
        this._dataManager,
        this.shareLinkManager,
        {
          onDurableStateChange: (state) => this._syncModels3dFromLayerState(state),
          onTrackingRestoreStatus: (result) => this._handleShareTrackingRestoreStatus(result),
        },
      );
      this._layerStateRestorePromise = this._layerStateCoordinator.start({
        shareLayerState: this._initialShareState?.layerState || null,
        shareCreatedAtMs: this._initialShareState?.sharedAtMs ?? null,
        // Any valid camera/style share isolates recipient-local preferences,
        // including legacy and malformed-v2 layer payloads.
        allowLocalState: !this._initialShareState,
      });
      if (this._initialShareSelectionSuperseded) {
        this._layerStateCoordinator.cancelPendingShareTracking(
          'superseded-before-layer-coordinator-start',
          { clearSelection: true },
        );
      }
      void this._layerStateRestorePromise.then(() => {
        this._syncModels3dFromLayerState(this._layerStateCoordinator?.getDurableState());
      });
    }
  }

  _handleShareTrackingRestoreStatus(result) {
    if (!result || this._disposed) return;
    const trackingKey = `${result.layerId || ''}:${result.targetId ?? ''}`;
    if (result.classification === 'pending') {
      this._shareTrackingNoticeGeneration += 1;
      this._shareTrackingAcquiringKey = trackingKey;
      this._showGlobalStatusNotice('ACQUIRING', {
        state: 'acquiring',
        detail: `SHARED ${String(result.label || 'SUBJECT').toUpperCase()}`,
        persistent: true,
      });
      return;
    }
    const ownsAcquiringNotice = this._shareTrackingAcquiringKey === trackingKey;
    if (ownsAcquiringNotice) {
      this._shareTrackingNoticeGeneration += 1;
      this._shareTrackingAcquiringKey = null;
      if (this._globalStatusNotice?.state === 'acquiring') {
        this._globalStatusNotice = null;
        this._updateGlobalLoadingFeedback();
      }
    }
    if (result.classification === 'followed' || result.classification === 'cancelled') return;
    // A stale terminal result must never replace a newer target's acquisition.
    if (this._shareTrackingAcquiringKey) return;
    const noticeGeneration = ownsAcquiringNotice
      ? this._shareTrackingNoticeGeneration
      : ++this._shareTrackingNoticeGeneration;
    const subject = result.label || 'entity';
    const message = result.classification === 'expired'
      ? `Shared ${subject} follow expired`
      : result.classification === 'source-unavailable'
        ? `Shared ${subject} could not be restored — feed unavailable`
        : `Shared ${subject} is unavailable`;
    const showAfterStartupCover = () => {
      requestAnimationFrame(() => {
        if (!canPresentDeferredStatusNotice(
          noticeGeneration,
          this._shareTrackingNoticeGeneration,
          this._disposed,
        )) return;
        const startupCover = document.getElementById('loading-screen');
        if (!startupCover || getComputedStyle(startupCover).visibility === 'hidden') {
          this._showGlobalStatusNotice(message);
          return;
        }
        let fallbackTimer = null;
        const showOnce = () => {
          startupCover.removeEventListener('transitionend', showOnce);
          if (fallbackTimer) clearTimeout(fallbackTimer);
          if (canPresentDeferredStatusNotice(
            noticeGeneration,
            this._shareTrackingNoticeGeneration,
            this._disposed,
          )) this._showGlobalStatusNotice(message);
        };
        startupCover.addEventListener('transitionend', showOnce, { once: true });
        fallbackTimer = setTimeout(showOnce, 1000);
      });
    };
    if (this._resolveInitialShareRestore) {
      void this.initialRestorePromise.then(showAfterStartupCover);
      return;
    }
    showAfterStartupCover();
  }

  _initGlobalContextPanel() {
    const contextTabs = [this._globalContextFlightsBtn, this._globalContextMissionsBtn].filter(Boolean);
    contextTabs.forEach((tab, index) => tab.addEventListener('keydown', (event) => {
      let nextIndex = null;
      if (event.key === 'ArrowRight') nextIndex = (index + 1) % contextTabs.length;
      else if (event.key === 'ArrowLeft') nextIndex = (index - 1 + contextTabs.length) % contextTabs.length;
      else if (event.key === 'Home') nextIndex = 0;
      else if (event.key === 'End') nextIndex = contextTabs.length - 1;
      if (nextIndex === null) return;
      event.preventDefault();
      contextTabs[nextIndex].focus({ preventScroll: true });
      contextTabs[nextIndex].click();
    }));
    this._globalContextFlightsBtn?.addEventListener('click', () => {
      const nextMode = this._contextMode === 'flights' ? null : 'flights';
      this._claimContextVisualAuthority();
      void this._runUserFacingContextAction(
        (notificationToken) => this._selectContextMode(
          nextMode,
          { notificationToken },
        ),
        'Contacts could not complete the requested transition; try again',
      ).then((succeeded) => {
        if (nextMode && shouldExpandGlobalContextPanel({
          action: 'contacts',
          explicitUserAction: true,
          succeeded: succeeded === true,
        })) this.setPanelCollapsed('global-context-panel', false, { explicit: true });
      });
    });
    this._globalContextMissionsBtn?.addEventListener('click', () => {
      const nextMode = this._contextMode === 'space-missions' ? null : 'space-missions';
      this._claimContextVisualAuthority();
      void this._runUserFacingContextAction(
        (notificationToken) => this._selectContextMode(
          nextMode,
          { notificationToken },
        ),
        'Space Missions could not complete the requested transition; try again',
      ).then((succeeded) => {
        if (nextMode && shouldExpandGlobalContextPanel({
          action: 'space-missions',
          explicitUserAction: true,
          succeeded: succeeded === true,
        })) this.setPanelCollapsed('global-context-panel', false, { explicit: true });
      });
    });
    this._installationsSearchBtn?.addEventListener('click', () => {
      if (!this._dataManager?.layers?.has('military-installations')) return;
      const button = this._installationsSearchBtn;
      button.disabled = true;
      void this._runUserFacingContextAction(async (notificationToken) => {
        const enabled = await this._dataManager.setEnabled('military-installations', true, {
          origin: 'user',
          notificationToken,
        });
        if (enabled === false || !this._dataManager.isEnabled('military-installations')) return false;
        const searched = await militaryInstallationsLayer.searchNearby?.();
        if (searched === false) return false;
        const stats = militaryInstallationsLayer.getStats?.();
        this._showToast(stats?.status === 'zoom-in'
          ? 'Zoom in to search mapped installations'
          : 'Nearby installations refreshed');
        return true;
      }, 'Nearby installations could not be refreshed; try again').finally(() => {
        button.disabled = false;
      });
    });
  }

  async _runUserFacingContextAction(
    operation,
    message = 'Context could not restore every layer; try again',
    { falseIsFailure = true } = {},
  ) {
    const notificationToken = Symbol('user-facing-context-action');
    this._userFacingContextNotificationTokens.add(notificationToken);
    try {
      return await settleUserFacingContextAction({
        operation: () => operation(notificationToken),
        falseIsFailure,
        onFailure: (error) => {
          console.warn('[Context] user-facing transition failed', error);
          this._showToast(message);
        },
      });
    } finally {
      this._userFacingContextNotificationTokens.delete(notificationToken);
    }
  }

  _trackContextLayerReaction(promise) {
    const tracked = Promise.resolve(promise);
    this._contextLayerReactionPromises.add(tracked);
    void tracked.finally(() => this._contextLayerReactionPromises.delete(tracked));
    return tracked;
  }

  async _waitForContextLayerSettlement() {
    while (this._contextLayerReactionPromises.size > 0) {
      await Promise.allSettled([...this._contextLayerReactionPromises]);
    }
  }

  _captureContextSessionSnapshot({ excludeLayerIds = [] } = {}) {
    if (!this._dataManager || this._contextSessionSnapshot) return;
    const params = {};
    for (const layerId of ['military-awareness', 'satellites']) {
      const value = this._dataManager.getLayerParams(layerId);
      if (value) params[layerId] = value;
    }
    this._contextSessionSnapshot = {
      enabledLayerIds: contextSnapshotLayerIds(
        this._dataManager.getEnabledLayerIds(),
        this._contextRestoreState?.enabledLayerIds,
        excludeLayerIds,
      ),
      userAdded: new Set(),
      userRemoved: new Set(),
      params,
    };
  }

  async _restoreContextSession({
    excludeLayerIds = [],
    notificationToken = null,
    signal = null,
  } = {}) {
    const snapshot = this._contextSessionSnapshot;
    if (!snapshot || !this._dataManager) return;
    // Clear the stored session before emitting restore notifications so none
    // of those transitions can be mistaken for a fresh Context entry.
    this._contextSessionSnapshot = null;
    const restoreState = {
      enabledLayerIds: contextRestoreLayerIds(snapshot),
      explicitLayerStates: new Map(),
    };
    this._contextRestoreState = restoreState;
    for (const [layerId, params] of Object.entries(snapshot.params)) {
      this._dataManager.setLayerParams(layerId, params);
    }
    let restoreError = null;
    const restoreSnapshot = async (restoreSignal = null) => {
      // Contacts owns the dependency intents it starts. Settle that
      // coordinator before restoring the remaining snapshot, otherwise its
      // dependency releases can supersede the restore's same-target requests
      // and make a valid Contacts-to-Missions handoff look like a failure.
      const contactsCoordinatorId = 'military-awareness';
      const settleContactsCoordinator = !restoreState.enabledLayerIds.has(contactsCoordinatorId)
        && this._dataManager.isEffectivelyEnabled(contactsCoordinatorId);
      if (settleContactsCoordinator) {
        const coordinatorSettled = await this._dataManager.setEnabled(
          contactsCoordinatorId,
          false,
          {
            origin: 'context-restore',
            ...(notificationToken ? { notificationToken } : {}),
            ...(restoreSignal ? { signal: restoreSignal } : {}),
          },
        );
        if (coordinatorSettled === false) {
          const error = new Error('Failed to settle Contacts before restoring Context');
          error.failedLayerIds = [contactsCoordinatorId];
          throw error;
        }
      }
      await this._dataManager.restoreEnabledLayerIds(restoreState.enabledLayerIds, {
        origin: 'context-restore',
        excludeLayerIds: settleContactsCoordinator
          ? [...excludeLayerIds, contactsCoordinatorId]
          : excludeLayerIds,
        notificationToken,
        ...(restoreSignal ? { signal: restoreSignal } : {}),
      });
    };
    try {
      await restoreSnapshot(signal);
    } catch (error) {
      restoreError = error;
      // A caller abort can arrive after only part of the exact restore has
      // settled. Finish that same target without the stale caller signal while
      // this restoreState still records newer explicit intents; replay below
      // then gives those newer intents final authority.
      if (signal?.aborted && !restoreState.cancelled) {
        try {
          await restoreSnapshot(null);
          restoreError = null;
        } catch (compensationError) {
          restoreError = mergeContextTransitionErrors(restoreError, compensationError);
        }
      }
    } finally {
      if (this._contextRestoreState === restoreState) this._contextRestoreState = null;
    }
    // Clear Selected Layers owns a newer global OFF intent. A restore that was
    // already awaiting lifecycle work must not replay its captured companion
    // intent or recreate the discarded session after Clear invalidates it.
    if (restoreState.cancelled) return;
    // A direct Radio command may finish after restore has already copied its
    // target and queued the opposite state. Replay that newer intent only
    // after the stale queue drains; the replay origin cannot recurse here.
    const replaySignal = signal?.aborted ? null : signal;
    const replayError = await settleContextIntentReplay({
      restoreState,
      setEnabled: (layerId, enabled, options = {}) => this._dataManager.setEnabled(
        layerId,
        enabled,
        { ...options, ...(replaySignal ? { signal: replaySignal } : {}) },
      ),
      notificationToken,
    });
    restoreError = mergeContextTransitionErrors(restoreError, replayError);
    if (restoreError && !this._contextSessionSnapshot) {
      // Keep the exact still-pending target so a later exit/teardown can retry
      // instead of silently losing the user's pre-Context layer state.
      this._contextSessionSnapshot = {
        enabledLayerIds: new Set(restoreState.enabledLayerIds),
        userAdded: new Set(),
        userRemoved: new Set(),
        params: snapshot.params,
      };
    }
    if (restoreError) throw restoreError;
  }

  /*
   * Cross-mode cancellation and failure deliberately settle on Context OFF.
   *
   * A reinstatement transaction lived here for three review rounds and was
   * removed on purpose. Restoring the prior mode is genuinely racy: the prior
   * mode has to be read before the teardown, but a second request arriving
   * while the first reinstatement is mid-activation reads `_contextMode` as
   * null and inherits nothing, so two overlapping cancellations still land on
   * OFF — and the only fix is a cross-transaction "logical prior mode" chain,
   * which is new shared mutable state read while an earlier transaction is
   * still awaiting. That trades a rare wrong resting state for a permanent
   * interleaving hazard.
   *
   * The defect that started this was the LIE, not the OFF: the transition
   * claimed to have cancelled cleanly while silently leaving Context off. So
   * the resting state stays OFF and is REPORTED as such, with the failed layer
   * ids preserved. A restore feature can be rebuilt post-launch on the
   * generation discipline the surrounding transaction already follows.
   */

  async _restoreContextSessionAfterLayerSettles(layerId, { notificationToken = null } = {}) {
    await this._dataManager?.waitForLayerSettled?.(layerId);
    return this._restoreContextSession({ notificationToken });
  }

  /**
   * Claim the visual restore lane for an explicit Context transition.
   *
   * Contacts OWNS detection while active (forced Dense @ 75%), so entering or
   * leaving it is a visual-lane gesture exactly like the HUD or detection
   * controls. Without this claim, the shared-view restore that lands 1.5 s into
   * startup re-applied the link's `dm`/`dd` over the forced preset and Contacts
   * lost its own overlay mid-session.
   *
   * Deliberately does NOT set `_detectionUserOverridden`: that flag means the
   * OPERATOR hand-edited detection and suppresses the military-style
   * auto-enable for the rest of the session. Context entry is not that, and
   * conflating them would silently disable a separate landed behavior.
   *
   * Call only for VALIDATED explicit transitions — never for programmatic or
   * restore-driven ones, which must stay eligible for the shared visual state.
   */
  _claimContextVisualAuthority() {
    this.shareLinkManager?.claimRestoreLane?.('visual');
  }

  async _selectContextMode(mode, { notificationToken = null, signal = null } = {}) {
    if (!this._dataManager) return false;
    if (this._clearSelectedLayersPromise) return false;
    this._contextTransitionFailedLayerIds = [];
    const generation = ++this._contextModeGeneration;
    const isCurrent = () => generation === this._contextModeGeneration;
    this._contextModeEntryIntent = null;
    this._contextModeReplacementIntent = null;
    this._contextModeChanging = true;
    this._globalContextFlightsBtn && (this._globalContextFlightsBtn.disabled = true);
    this._globalContextMissionsBtn && (this._globalContextMissionsBtn.disabled = true);
    try {
      if (mode !== 'flights' && this.cockpitView?.active) {
        this.cockpitView.exit({ restoreTracking: false });
      }
      if (!mode) {
        this._contextMode = null;
        this._syncContextModeButtons();
        await this._restoreContextSession({ notificationToken, signal });
        return isCurrent();
      }
      // A cross-mode switch dismantles the prior mode BEFORE the new one is
      // committed. If the caller aborts in that window the switch never lands,
      // and the resting state is Context OFF — reported as such by
      // setContextMode rather than dressed up as a clean cancellation. See the
      // note above _restoreContextSessionAfterLayerSettles.
      const crossModeSwitch = Boolean(this._contextMode && this._contextMode !== mode);
      if (crossModeSwitch) {
        this._contextMode = null;
        await this._restoreContextSession({ notificationToken, signal });
        if (!isCurrent()) return false;
        if (signal?.aborted) return false;
      }
      this._captureContextSessionSnapshot();
      this._contextMode = mode;
      this._syncContextModeButtons();
      // Replay isolation must settle before Space Missions starts. Contacts
      // keeps its non-dependency teardown in the background so slow source
      // shutdown does not delay cockpit entry.
      try {
        await this._clearLayersOutsideContextMode(mode, { notificationToken, signal });
      } catch (error) {
        if (!isCurrent()) return false;
        let transitionError = error;
        console.warn(`[Context] ${mode} isolation failed`, error);
        this._contextMode = null;
        this._syncContextModeButtons();
        try {
          await this._restoreContextSession({ notificationToken });
        } catch (restoreError) {
          transitionError = mergeContextTransitionErrors(transitionError, restoreError);
          this._contextTransitionFailedLayerIds = [...(transitionError.failedLayerIds || [])];
          throw transitionError;
        }
        this._contextTransitionFailedLayerIds = [...(transitionError?.failedLayerIds || [])];
        return false;
      }
      if (!isCurrent()) return false;
      // Entry is one transaction: isolation succeeded above, so a failed mode
      // activation must roll the cleared layers back instead of stranding the
      // user in a half-entered mode with an orphaned snapshot.
      const entryLayerId = mode === 'flights' ? 'military-awareness' : 'rocket-launches';
      if (mode === 'flights') {
        this._dataManager.setLayerParams('military-awareness', { passive: false });
      }
      let activated = false;
      let activationError = null;
      let activationIntent = null;
      let terminalIntentOutcome = null;
      try {
        activationIntent = this._dataManager._setEnabledWithIntent(
          entryLayerId,
          true,
          { notificationToken, ...(signal ? { signal } : {}) },
        );
        this._contextModeEntryIntent = {
          generation,
          layerId: entryLayerId,
          intentEpoch: activationIntent.intentEpoch,
        };
        activated = await activationIntent.promise;
        terminalIntentOutcome = await this._dataManager._waitForVisibilityIntent?.(
          entryLayerId,
          activationIntent.intentEpoch,
        );
      } catch (error) {
        activationError = error;
      }
      if (!isCurrent()) return false;
      let replacementIntent = mode === 'space-missions'
        && this._contextModeReplacementIntent?.generation === generation
        && this._contextModeReplacementIntent.layerId === entryLayerId
        ? this._contextModeReplacementIntent
        : null;
      while (replacementIntent) {
        const outcome = await this._dataManager._waitForVisibilityIntent?.(
          entryLayerId,
          replacementIntent.intentEpoch,
        );
        terminalIntentOutcome = outcome;
        if (!isCurrent()) return false;
        const replacementOwnsMode = outcome?.intentEpoch === replacementIntent.intentEpoch
          && outcome.enabled === true
          && outcome.succeeded === true;
        if (replacementOwnsMode) {
          this._contextModeEntering = null;
          this._contextModeEntryIntent = null;
          this._contextModeReplacementIntent = null;
          this._syncContextModeButtons();
          return true;
        }
        const successorEpoch = outcome?.cancellationReason === 'superseded'
          && outcome.successorEnabled === true
          && Number.isInteger(outcome.successorIntentEpoch)
          && outcome.successorIntentEpoch > replacementIntent.intentEpoch
          ? outcome.successorIntentEpoch
          : null;
        replacementIntent = successorEpoch === null ? null : {
          generation,
          layerId: entryLayerId,
          intentEpoch: successorEpoch,
        };
      }
      if (activationError || activated === false || !this._dataManager.isEnabled(entryLayerId)) {
        const cancelledAndSettled = terminalIntentOutcome?.succeeded === false
          && ['caller-abort', 'resource-abort', 'superseded'].includes(
            terminalIntentOutcome.cancellationReason,
          );
        let transitionError = null;
        if (!cancelledAndSettled) {
          transitionError = activationError instanceof Error
            ? activationError
            : new Error(`Context activation failed for: ${entryLayerId}`);
          transitionError.failedLayerIds = [...new Set([
            ...(transitionError.failedLayerIds || []),
            entryLayerId,
          ])];
          this._contextTransitionFailedLayerIds = [...transitionError.failedLayerIds];
          console.warn(`[Context] ${mode} activation failed; restoring previous layers`, activationError || 'not enabled');
        }
        this._contextMode = null;
        this._contextModeEntryIntent = null;
        this._contextModeReplacementIntent = null;
        this._syncContextModeButtons();
        try {
          await this._restoreContextSession({
            excludeLayerIds: [entryLayerId],
            notificationToken,
          });
        } catch (restoreError) {
          transitionError = mergeContextTransitionErrors(transitionError, restoreError);
          this._contextTransitionFailedLayerIds = [...(transitionError?.failedLayerIds || [])];
          throw transitionError;
        }
        // `null` means the requested entry was cancelled and its exact rollback
        // completed. The action wrapper treats that as a silent non-commit,
        // while callers still require literal `true` before expanding Context.
        return cancelledAndSettled ? null : false;
      }
      this._contextModeEntryIntent = null;
      return true;
    } finally {
      if (isCurrent()) {
        this._contextModeChanging = false;
        this._globalContextFlightsBtn && (this._globalContextFlightsBtn.disabled = false);
        this._globalContextMissionsBtn && (this._globalContextMissionsBtn.disabled = false);
        this._syncContextModeButtons();
      }
    }
  }

  async _deactivateContextForLayerChange({ notificationToken = null } = {}) {
    this._contextModeGeneration += 1;
    this._contextModeChanging = true;
    this._contextMode = null;
    this._contextModeEntryIntent = null;
    this._contextModeReplacementIntent = null;
    if (this.cockpitView?.active) this.cockpitView.exit({ restoreTracking: false });
    this._syncContextModeButtons();
    try {
      await this._restoreContextSession({ notificationToken });
    } finally {
      this._contextModeChanging = false;
      this._syncContextModeButtons();
    }
  }

  async _clearLayersOutsideContextMode(
    mode = null,
    { notificationToken = null, signal = null } = {},
  ) {
    const allowed = contextAllowedLayerIds(mode);
    const pending = [];
    for (const [layerId] of this._dataManager.layers || []) {
      // Effective visibility: a disallowed layer still mid-ENABLING must be
      // isolated too, or it settles ON inside the exclusive mode.
      if (!allowed.has(layerId) && this._dataManager.isEffectivelyEnabled(layerId)) {
        pending.push({
          layerId,
          transition: this._dataManager.setEnabled(layerId, false, {
            notificationToken,
            ...(signal ? { signal } : {}),
          }),
        });
      }
    }
    const results = await Promise.all(pending.map(({ transition }) => transition));
    const failed = pending
      .filter(({ layerId }, index) => results[index] === false || this._dataManager.isEnabled(layerId))
      .map(({ layerId }) => layerId);
    if (failed.length > 0) {
      const error = new Error(`Context isolation failed for: ${failed.join(', ')}`);
      error.failedLayerIds = failed;
      throw error;
    }
  }

  _handleContextLayerChange(change) {
    if (change?.layerId === 'radio' && [
      'visibility-transition',
      'visibility',
      'visibility-cancelled',
      'visibility-failed',
    ].includes(change.type)) {
      this._renderRadioState(radioLayer.getUIState());
    }
    if (change?.type === 'visibility-transition') return;
    // The effective mode must be read BEFORE the entering flag is cleared:
    // the entry layer's own enable event is the one that clears it, and the
    // session bookkeeping below needs to know a mode was being entered.
    const effectiveContextMode = this._contextModeEntering || this._contextMode;
    if (change?.type === 'visibility-cancelled') {
      const cancellationDisposition = spaceMissionEntryCancellationDisposition({
        change,
      });
      if (
        this._contextModeDeferredEntryIntent?.layerId === change.layerId
        && this._contextModeDeferredEntryIntent.intentEpoch === change.intentEpoch
      ) {
        if (cancellationDisposition !== 'replacement') {
          this._contextModeDeferredEntryIntent = null;
        }
      }
      if (cancellationDisposition === 'replacement') {
        this._contextModeEntering = 'space-missions';
        const entryIntent = this._contextModeEntryIntent;
        if (
          entryIntent?.generation === this._contextModeGeneration
          && entryIntent.layerId === change.layerId
          && entryIntent.intentEpoch === change.intentEpoch
        ) {
          this._contextModeReplacementIntent = {
            generation: entryIntent.generation,
            layerId: change.layerId,
            intentEpoch: change.successorIntentEpoch,
          };
        }
      } else if (cancellationDisposition === 'restore') {
        this._contextModeEntering = null;
        this._contextModeEntryIntent = null;
        this._contextModeReplacementIntent = null;
        if (this._contextSessionSnapshot && !this._contextModeChanging) {
          this._contextMode = null;
          void this._trackContextLayerReaction(this._runUserFacingContextAction(
            async (notificationToken) => {
              await this._restoreContextSessionAfterLayerSettles(
                change.layerId,
                { notificationToken },
              );
              return true;
            },
            'Space Missions cancellation could not restore the previous layer state',
          ));
        }
      }
      this._syncContextModeButtons();
      return;
    }
    if (
      change?.layerId === 'rocket-launches'
      && ['visibility', 'visibility-blocked', 'visibility-failed'].includes(change.type)
    ) {
      this._contextModeEntering = null;
    }
    if (change?.type === 'visibility-blocked') {
      if (!this._userFacingContextNotificationTokens.has(change.notificationToken)) {
        this._showToast(change.reason || 'That layer is unavailable in the current Context mode');
      }
      this._syncContextModeButtons();
      return;
    }
    if (change?.type === 'visibility-failed') {
      const failureMessage = `${change.layerId} could not ${change.enabled ? 'start' : 'stop'} cleanly`;
      // A failed direct Context-shell START has already had its siblings
      // cleared by the visibility guard. Wait outside the synchronous manager
      // notification for this queue to settle, then reconcile the complete
      // snapshot, including an uncertain failed shell.
      const needsDeferredShellRestore = (
        ['military-awareness', 'rocket-launches'].includes(change.layerId)
        && change.enabled
        && this._contextSessionSnapshot
        && !this._contextModeChanging
      );
      if (needsDeferredShellRestore) {
        this._contextMode = null;
        void this._trackContextLayerReaction(this._runUserFacingContextAction(
          async (notificationToken) => {
            await this._restoreContextSessionAfterLayerSettles(
              change.layerId,
              { notificationToken },
            );
            // The wrapper owns failure announcements. On a successful rollback
            // announce the original activation failure here so the same direct
            // action still produces exactly one accessible notification.
            this._showToast(failureMessage);
            return true;
          },
          failureMessage,
        ));
      } else if (!this._userFacingContextNotificationTokens.has(change.notificationToken)) {
        this._showToast(failureMessage);
      }
      this._syncContextModeButtons();
      return;
    }
    if (change?.type === 'visibility-will-change') {
      // Explicit entry capture happens on the synchronous visibility-requested
      // boundary. Keeping this later branch side-effect free prevents an
      // awaited Clear/guard from replacing that authoritative pre-entry view.
      return;
    }
    // Session bookkeeping must run BEFORE any exit path below: the exit
    // handlers restore `snapshot ∪ userAdded`, so a stale entry here becomes
    // a layer resurrected against the user's explicit disable.
    recordContextSessionUserChange({
      snapshot: this._contextSessionSnapshot,
      change,
      effectiveContextMode,
    });
    recordContextRestoreExplicitChange({
      restoreState: this._contextRestoreState,
      change,
    });
    if (shouldExitContextForLayerChange({
      contextMode: this._contextMode,
      globalContextEnabled: !!this._dataManager?.isEnabled('military-awareness'),
      change,
    })) {
      void this._trackContextLayerReaction(this._runUserFacingContextAction((notificationToken) => (
        this._deactivateContextForLayerChange({ notificationToken })
      )));
      return;
    }
    if (!this._contextModeChanging) {
      if (change.layerId === 'military-awareness') {
        // The coordinator remains manager-addressable for restoration and
        // programmatic routes, but Contacts is selected only from the
        // dedicated right-side Global Context chooser.
        this._contextMode = change.enabled
          ? null
          : (this._contextMode === 'flights' ? null : this._contextMode);
        if (change.enabled) {
          this._syncContextModeButtons();
        } else if (this._contextSessionSnapshot) {
          void this._trackContextLayerReaction(this._runUserFacingContextAction((notificationToken) => (
            this._deactivateContextForLayerChange({ notificationToken })
          )));
        }
      } else if (change.layerId === 'rocket-launches') {
        const ownsContextEntry = isExplicitUserIntentOrigin(change.origin, change.layerId)
          || this._contextMode === 'space-missions'
          || effectiveContextMode === 'space-missions';
        if (!ownsContextEntry) return;
        this._contextMode = change.enabled ? 'space-missions' : (this._contextMode === 'space-missions' ? null : this._contextMode);
        if (change.enabled) {
          this._syncContextModeButtons();
        } else if (this._contextSessionSnapshot) {
          void this._trackContextLayerReaction(this._runUserFacingContextAction((notificationToken) => (
            this._deactivateContextForLayerChange({ notificationToken })
          )));
        }
      } else if (
        this._contextMode === 'flights'
        && ['flights', 'military', 'ais-live-vessels', 'military-installations'].includes(change.layerId)
        && !change.enabled
      ) {
        void this._trackContextLayerReaction(this._runUserFacingContextAction((notificationToken) => (
          this._deactivateContextForLayerChange({ notificationToken })
        )));
      }
    }
    if (this.cockpitView?.active && !cockpitEntryAllowed({
      contextMode: this._contextMode,
      contextModeChanging: this._contextModeChanging,
      flightsEnabled: !!this._dataManager?.isEnabled('flights'),
      militaryEnabled: !!this._dataManager?.isEnabled('military'),
    })) {
      this.cockpitView.exit({ restoreTracking: false });
    }
    this._syncContextModeButtons();
  }

  _syncContextModeButtons() {
    const flightsActive = this._contextMode === 'flights';
    const missionsActive = this._contextMode === 'space-missions';
    const panel = document.getElementById('global-context-panel');
    panel?.classList.toggle('context-enabled', flightsActive || missionsActive);
    panel?.setAttribute('data-context-mode', this._contextMode || 'none');
    this._globalContextFlightsBtn?.classList.toggle('active', flightsActive);
    this._globalContextFlightsBtn?.setAttribute('aria-selected', String(flightsActive));
    this._globalContextMissionsBtn?.classList.toggle('active', missionsActive);
    this._globalContextMissionsBtn?.setAttribute('aria-selected', String(missionsActive));
    if (this._globalContextFlightsBtn) this._globalContextFlightsBtn.tabIndex = missionsActive ? -1 : 0;
    if (this._globalContextMissionsBtn) this._globalContextMissionsBtn.tabIndex = missionsActive ? 0 : -1;
    if (this._contextModeStandby) this._contextModeStandby.hidden = flightsActive || missionsActive;
    if (this._contextFlightsView) this._contextFlightsView.hidden = !flightsActive;
    if (this._contextMissionsView) this._contextMissionsView.hidden = !missionsActive;
    this.cockpitView?.syncEntry();
    // Every _contextMode mutation funnels through here; the sync no-ops until
    // the transaction settles, so this is the activation/deactivation edge.
    this._syncContactsDetection();
    this._scheduleRightPanelLayout();
  }

  /**
   * Toggles "clean view" mode which hides all UI panels via a CSS body class.
   * @param {boolean} [forceEnabled] - Explicit on/off. Omit to toggle.
   * @returns {void}
   */
  toggleCleanView(forceEnabled) {
    const shouldEnable = typeof forceEnabled === 'boolean'
      ? forceEnabled
      : !document.body.classList.contains('ui-clean-view');
    document.body.classList.toggle('ui-clean-view', shouldEnable);
    if (this._cleanViewBtn) {
      this._cleanViewBtn.classList.toggle('active', shouldEnable);
    }
    this._scheduleLeftPanelLayout();
  }

  // ── Public control facade ──────────────────────────────────────────────
  // Deliberate API for voice tools and scripting. Every setter keeps the DOM
  // sliders, share-link state, and scene snapshots in sync, and returns
  // { ok, ...resultingState } so callers confirm only what actually happened.

  /**
   * Sets HUD visibility mode. 'auto' restores style-driven show/hide.
   * @param {'on'|'off'|'auto'} mode - Visibility mode.
   * @returns {{ok: boolean, visible?: boolean, layout?: string, error?: string}}
   */
  setHudVisible(mode) {
    const normalized = String(mode ?? '').toLowerCase();
    if (!['on', 'off', 'auto'].includes(normalized)) {
      return { ok: false, error: `Unknown HUD visibility mode: ${mode}` };
    }
    this.shareLinkManager?.claimRestoreLane?.('visual');
    this.hud.setMode(normalized);
    this._updateHudButtonState();
    this._syncShareState();
    return { ok: true, visible: !!this.hud.visible, mode: normalized, layout: this.hud.getVariant() };
  }

  /**
   * Switches the HUD layout variant.
   * @param {'tactical'|'operator'|'minimal'} variantName - Layout variant.
   * @returns {{ok: boolean, layout?: string, visible?: boolean, error?: string}}
   */
  setHudLayout(variantName) {
    const variant = String(variantName ?? '').toLowerCase();
    if (!['tactical', 'operator', 'minimal'].includes(variant)) {
      return { ok: false, error: `Unknown HUD layout: ${variantName}` };
    }
    this.shareLinkManager?.claimRestoreLane?.('visual');
    this._setHudVariant(variant);
    return { ok: true, layout: this.hud.getVariant(), visible: !!this.hud.visible };
  }

  /**
   * Reads current detection overlay state (engine mode + UI density percent).
   * @returns {{detectionMode: string, densityPct: number|null, allocationStrategy:string, fadePct:number, outsideOpacityPct:number}}
   */
  getDetectionState() {
    const pct = this._detectionDensitySlider
      ? parseInt(this._detectionDensitySlider.value, 10)
      : null;
    return {
      detectionMode: getDetectionMode(),
      densityPct: pct,
      allocationStrategy: getDetectionTuning().allocationStrategy,
      fadePct: parseInt(this._detectionFadeSlider?.value || '7', 10),
      outsideOpacityPct: parseInt(this._detectionOpacitySlider?.value || '0', 10),
    };
  }

  /** Read-only overlay diagnostics used by browser QA and regression harnesses. */
  getDetectionDiagnostics() {
    return readDetectionDiagnostics();
  }

  /**
   * Controls the detection overlay: on/off, mode, and density percent.
   * Density writes the slider AND the engine so share links and scene
   * snapshots stay truthful.
   * @param {object} [options]
   * @param {boolean} [options.enabled] - false forces OFF; true restores the current density profile.
   * @param {'sparse'|'balanced'|'dense'|'panoptic'} [options.mode] - Profile (legacy aliases accepted).
   * @param {number} [options.densityPct] - 0-100 density percent.
   * @param {'elastic'|'weighted'} [options.allocationStrategy] - Layer-capacity policy.
   * @param {number} [options.fadePct] - Fade distance as 0-40% of the keyhole radius.
   * @param {number} [options.outsideOpacityPct] - Opacity beyond the fade distance, 0-100%.
   * @returns {{ok: boolean, detectionMode?: string, densityPct?: number|null, error?: string}}
   */
  setDetection({ enabled, mode, densityPct, allocationStrategy, fadePct, outsideOpacityPct } = {}) {
    if (enabled !== undefined && typeof enabled !== 'boolean') {
      return { ok: false, error: `Invalid detection enabled value: ${enabled}`, ...this.getDetectionState() };
    }
    let requestedProfile = null;
    if (typeof mode === 'string' && mode.trim()) {
      requestedProfile = normalizeProfile(mode);
      if (!requestedProfile) {
        return { ok: false, error: `Unknown detection mode: ${mode}`, ...this.getDetectionState() };
      }
    }
    let requestedDensity = null;
    if (densityPct != null) {
      if (!Number.isFinite(Number(densityPct))) {
        return { ok: false, error: `Invalid density: ${densityPct}`, ...this.getDetectionState() };
      }
      requestedDensity = canonicalizeDensity(Number(densityPct));
    }
    if (requestedProfile && requestedProfile !== 'OFF' && requestedDensity != null
      && profileForDensity(requestedDensity) !== requestedProfile) {
      return {
        ok: false,
        error: `Detection mode ${requestedProfile} conflicts with density ${requestedDensity}%`,
        ...this.getDetectionState(),
      };
    }
    let requestedAllocation = null;
    if (allocationStrategy != null) {
      requestedAllocation = String(allocationStrategy).trim().toUpperCase();
      if (!ALLOCATION_STRATEGIES.includes(requestedAllocation)) {
        return { ok: false, error: `Unknown allocation strategy: ${allocationStrategy}`, ...this.getDetectionState() };
      }
    }
    if (fadePct != null) {
      if (!Number.isFinite(Number(fadePct))) {
        return { ok: false, error: `Invalid fade distance: ${fadePct}`, ...this.getDetectionState() };
      }
    }
    if (outsideOpacityPct != null) {
      if (!Number.isFinite(Number(outsideOpacityPct))) {
        return { ok: false, error: `Invalid outside opacity: ${outsideOpacityPct}`, ...this.getDetectionState() };
      }
    }
    const hasExplicitVisualChange = typeof enabled === 'boolean'
      || requestedProfile !== null
      || requestedDensity !== null
      || requestedAllocation !== null
      || fadePct != null
      || outsideOpacityPct != null;
    if (hasExplicitVisualChange) {
      // Voice/scripted detection control counts as an explicit user choice, so
      // neither style presets nor a still-pending shared visual restore can
      // overwrite it afterward.
      this.shareLinkManager?.claimRestoreLane?.('visual');
      this._detectionUserOverridden = true;
    }
    if (requestedAllocation) {
      this._setDetectionAllocation(requestedAllocation, { syncShare: false });
    }
    if (fadePct != null && this._detectionFadeSlider) {
      this._detectionFadeSlider.value = String(Math.max(0, Math.min(40, Math.round(Number(fadePct)))));
    }
    if (outsideOpacityPct != null && this._detectionOpacitySlider) {
      this._detectionOpacitySlider.value = String(Math.max(0, Math.min(100, Math.round(Number(outsideOpacityPct)))));
    }
    if (fadePct != null || outsideOpacityPct != null) this._applyDetectionFadeFromUi();

    if (requestedProfile && requestedProfile !== 'OFF' && requestedDensity == null) {
      requestedDensity = defaultDensityForProfile(requestedProfile);
    }
    if (requestedDensity != null && this._detectionDensitySlider) {
      this._detectionDensitySlider.value = String(requestedDensity);
      this._applyDetectionDensityFromUi();
    }

    if (enabled === false || requestedProfile === 'OFF') {
      setDetectionModeByLabel('OFF');
    } else if (requestedProfile) {
      setDetectionModeByLabel(requestedProfile);
    } else if (enabled === true && getDetectionMode() === 'OFF') {
      setDetectionModeByLabel(profileForDensity(
        requestedDensity ?? this._detectionDensitySlider?.value ?? 50,
      ));
    }
    this._syncDetectionUiFromEngine();
    this._syncShareState();
    return { ok: true, ...this.getDetectionState() };
  }

  /**
   * Switches the basemap stack and reports whether the switch landed.
   * @param {string} stackId - One of mapStackController.getStacks() ids.
   * @returns {Promise<{ok: boolean, activeStack?: string, error?: string|null, available?: string[]}>}
   */
  async setMapStack(stackId) {
    if (!this.mapStackController) {
      return { ok: false, error: 'Map stack controller unavailable' };
    }
    const stacks = this.mapStackController.getStacks();
    const target = stacks.find((stack) => stack.id === stackId);
    if (!target) {
      return { ok: false, error: `Unknown map stack: ${stackId}`, available: stacks.map((s) => s.id) };
    }
    if (!target.available) {
      return { ok: false, error: `${target.label} requires a Cesium ion token`, activeStack: this.mapStackController.getActiveId() };
    }
    await this._setMapStack(stackId);
    const state = this.mapStackController.getState();
    const landed = state.activeId === stackId;
    return {
      ok: landed,
      activeStack: state.activeId,
      error: landed ? null : (state.lastError || 'Map stack did not switch'),
    };
  }

  /**
   * Controls bloom post-processing. Intensity is the UI percent (0-200).
   * @param {object} [options]
   * @param {boolean} [options.enabled]
   * @param {number} [options.intensityPct] - 0-200.
   * @returns {{ok: boolean, bloom: {enabled: boolean, intensityPct: number|null}}}
   */
  setBloom({ enabled, intensityPct } = {}) {
    const current = () => ({
      enabled: !!this.bloomEnabled,
      intensityPct: this._bloomSlider ? parseInt(this._bloomSlider.value, 10) : null,
    });
    if (enabled !== undefined && typeof enabled !== 'boolean') {
      return { ok: false, error: `Invalid bloom enabled value: ${enabled}`, bloom: current() };
    }
    if (intensityPct !== undefined
      && (typeof intensityPct !== 'number' || !Number.isFinite(intensityPct))) {
      return { ok: false, error: `Invalid bloom intensity: ${intensityPct}`, bloom: current() };
    }
    const hasExplicitVisualChange = intensityPct !== undefined || enabled !== undefined;
    if (hasExplicitVisualChange) this.shareLinkManager?.claimRestoreLane?.('visual');
    if (intensityPct !== undefined) {
      this._setBloomIntensity(Math.round(Math.max(0, Math.min(200, intensityPct))));
    }
    if (enabled !== undefined) this._setBloomEnabled(enabled);
    return {
      ok: true,
      bloom: current(),
    };
  }

  /**
   * Controls sharpen post-processing. Intensity is the UI percent (0-100).
   * @param {object} [options]
   * @param {boolean} [options.enabled]
   * @param {number} [options.intensityPct] - 0-100.
   * @returns {{ok: boolean, sharpen: {enabled: boolean, intensityPct: number|null}}}
   */
  setSharpen({ enabled, intensityPct } = {}) {
    const current = () => ({
      enabled: !!this.sharpenEnabled,
      intensityPct: this._sharpenSlider ? parseInt(this._sharpenSlider.value, 10) : null,
    });
    if (enabled !== undefined && typeof enabled !== 'boolean') {
      return { ok: false, error: `Invalid sharpen enabled value: ${enabled}`, sharpen: current() };
    }
    if (intensityPct !== undefined
      && (typeof intensityPct !== 'number' || !Number.isFinite(intensityPct))) {
      return { ok: false, error: `Invalid sharpen intensity: ${intensityPct}`, sharpen: current() };
    }
    const hasExplicitVisualChange = intensityPct !== undefined || enabled !== undefined;
    if (hasExplicitVisualChange) this.shareLinkManager?.claimRestoreLane?.('visual');
    if (intensityPct !== undefined) {
      const pct = Math.round(Math.max(0, Math.min(100, intensityPct)));
      if (this._sharpenSlider) this._sharpenSlider.value = String(pct);
      if (this._sharpenSliderValue) this._sharpenSliderValue.textContent = `${pct}%`;
      this._applySharpenIntensity(pct / 100);
      this._syncShareState();
    }
    if (enabled !== undefined) this._setSharpenEnabled(enabled);
    return {
      ok: true,
      sharpen: current(),
    };
  }

  /** Whether the full-globe celestial overlay is enabled by user preference. */
  get celestialRingEnabled() {
    return !!this.celestialRing?.enabled;
  }

  /**
   * Controls the celestial ring. The Display button uses `focus=true` when the
   * ring is disabled or unavailable at the current zoom, turning the control
   * into a reveal action instead of requiring a separate globe-navigation step.
   * @param {boolean} enabled
   * @param {object} [options]
   * @param {boolean} [options.syncShare=true]
   * @param {boolean} [options.focus=false]
   * @returns {{ok:boolean, celestialRing:{enabled:boolean,visible:boolean}, cameraFocused:boolean, error?:string}}
   */
  setCelestialRingEnabled(enabled, { syncShare = true, focus = false } = {}) {
    const styleSupported = isCelestialRingStyleSupported(this.activeStyle);
    const current = () => ({
      enabled: this.celestialRingEnabled,
      visible: !!this.celestialRing?.visible,
    });
    if (typeof enabled !== 'boolean') {
      return {
        ok: false,
        celestialRing: current(),
        cameraFocused: false,
        error: `Invalid celestial ring enabled value: ${enabled}`,
      };
    }
    if (typeof syncShare !== 'boolean' || typeof focus !== 'boolean') {
      return {
        ok: false,
        celestialRing: current(),
        cameraFocused: false,
        error: 'Celestial ring options must be boolean',
      };
    }
    if (!styleSupported && enabled) {
      return {
        ok: false,
        celestialRing: current(),
        cameraFocused: false,
        error: 'Celestial ring is available only in Normal style',
      };
    }
    if (syncShare) this.shareLinkManager?.claimRestoreLane?.('visual');
    const nextEnabled = styleSupported && enabled;
    this.celestialRing?.setEnabled(nextEnabled);
    this._celestialBtn?.classList.toggle('active', nextEnabled);
    this._celestialBtn?.setAttribute('aria-pressed', String(nextEnabled));
    if (this._celestialBtn) {
      this._celestialBtn.disabled = !styleSupported;
      this._celestialBtn.setAttribute('aria-disabled', String(!styleSupported));
      this._celestialBtn.title = styleSupported
        ? 'Celestial ring — reveal the full globe'
        : 'Celestial ring — available in Normal style';
    }
    let cameraFocused = false;
    if (nextEnabled && focus) {
      cameraFocused = !!this.celestialRing?.focusFullGlobe();
    }
    if (syncShare) this._syncShareState();
    return {
      ok: styleSupported || !enabled,
      celestialRing: current(),
      cameraFocused,
    };
  }

  /**
   * Starts or stops orbiting the active POI.
   * @param {boolean} [enabled] - Omit to toggle.
   * @returns {{ok: boolean, orbiting: boolean, error?: string}}
   */
  setOrbit(enabled) {
    const active = !!this.orbitController?.active;
    if (typeof enabled === 'boolean' && enabled === active) {
      return { ok: true, orbiting: active };
    }
    if (enabled === false) {
      this._stopOrbit();
      return { ok: true, orbiting: false };
    }
    if (!this._currentTarget) {
      return { ok: false, orbiting: false, error: 'No active landmark to orbit — fly to a landmark first' };
    }
    this._toggleOrbit();
    return { ok: true, orbiting: !!this.orbitController?.active };
  }

  /**
   * Enables/disables clean view (hides all UI chrome).
   * @param {boolean} [enabled] - Omit to toggle.
   * @returns {{ok: boolean, cleanView: boolean}}
   */
  setCleanView(enabled) {
    this.toggleCleanView(enabled);
    return { ok: true, cleanView: document.body.classList.contains('ui-clean-view') };
  }

  /**
   * Reads global context mode state for voice/state-sync consumers.
   * @returns {{mode: 'flights'|'space-missions'|null, active: boolean, changing: boolean, entering: 'flights'|'space-missions'|null, snapshotCaptured: boolean}}
   */
  getContextModeState() {
    return {
      mode: this._contextMode || null,
      active: Boolean(this._contextMode),
      changing: Boolean(this._contextModeChanging),
      entering: this._contextModeEntering || null,
      canContact: !this._contextMode || this._contextMode === 'flights',
      canMission: !this._contextMode || this._contextMode === 'space-missions',
      snapshotCaptured: Boolean(this._contextSessionSnapshot),
    };
  }

  /**
   * Sets global context mode (Contacts / Space Missions / off) for voice.
   * @param {'contacts'|'space-missions'|'off'|null} mode - Requested context target.
   * @param {object} [options]
   * @param {string|Symbol|null} [options.notificationToken]
   * @param {AbortSignal|null} [options.signal]
   * @param {Function|null} [options.isCurrent]
   * @param {boolean} [options.claimVisualAuthority] Whether this request is a
   *   genuine operator/voice Context intent that should take the visual restore
   *   lane. Cockpit choreography calls this facade INTERNALLY for its own
   *   enter/rollback steps; those transitions are not a Context request by the
   *   operator and must stay inert, so they pass `false`.
   * @returns {Promise<{ok:boolean, mode:'flights'|'space-missions'|null, active:boolean, action:string, error?:string}>}
   */
  async setContextMode(mode, {
    notificationToken = null,
    signal = null,
    isCurrent = null,
    claimVisualAuthority = true,
  } = {}) {
    const requestIsCurrent = () => !signal?.aborted
      && (typeof isCurrent !== 'function' || isCurrent());
    const cancellationResult = () => ({
      ok: false,
      action: 'set_context_mode',
      cancelled: true,
      error: 'Context request was superseded by a newer voice turn',
      ...this.getContextModeState(),
      ...(this._contextTransitionFailedLayerIds?.length
        ? { failedLayerIds: [...this._contextTransitionFailedLayerIds] }
        : {}),
    });
    if (!requestIsCurrent()) return cancellationResult();
    try {
      if (!mode || mode === 'off') {
        // Validated explicit transition — Context owns detection, so take the
        // visual lane before a delayed shared restore can reclaim it. Internal
        // Cockpit choreography opts out: it is not an operator Context request.
        if (claimVisualAuthority) this._claimContextVisualAuthority();
        const result = await this._selectContextMode(null, { notificationToken, signal });
        if (result === null || (!requestIsCurrent() && result !== true)) return cancellationResult();
        const state = this.getContextModeState();
        return {
          ok: result === true,
          action: 'set_context_mode',
          mode: state.mode,
          ...state,
          ...(result === true ? {} : { error: 'Context mode transition did not complete' }),
          ...(this._contextTransitionFailedLayerIds?.length
            ? { failedLayerIds: [...this._contextTransitionFailedLayerIds] }
            : {}),
        };
      }
      const canonical = mode === 'contacts' ? 'flights' : mode;
      if (!['flights', 'space-missions'].includes(canonical)) {
        return {
          ok: false,
          action: 'set_context_mode',
          error: `Unknown context mode: ${mode}`,
          mode: this._contextMode,
          ...this.getContextModeState(),
        };
      }
      const priorMode = this._contextMode;
      // Claimed only after the mode enum validates above, so a rejected request
      // takes no authority and leaves the shared visual state eligible. Internal
      // Cockpit choreography opts out: it is not an operator Context request.
      if (claimVisualAuthority) this._claimContextVisualAuthority();
      const transitioned = await this._selectContextMode(canonical, { notificationToken, signal });
      if (transitioned === null || (!requestIsCurrent() && transitioned !== true)) return cancellationResult();
      const state = this.getContextModeState();
      // A cross-mode switch tears the prior mode down before it commits, so a
      // cancelled or failed switch rests on Context OFF. Say that plainly:
      // reporting a bare "did not complete" while the operator's Context is
      // gone is the dishonesty this whole path was fixed for. The state fields
      // below carry the same verdict, so text and state cannot disagree.
      const crossModeSwitchLost = transitioned !== true
        && Boolean(priorMode) && priorMode !== canonical && !state.mode;
      return {
        ok: transitioned === true,
        action: 'set_context_mode',
        mode: state.mode,
        ...state,
        ...(transitioned === true ? {} : {
          // Named in the operator's vocabulary, not the internal id: this
          // string is read by the voice model, which takes 'contacts'.
          error: crossModeSwitchLost
            ? `Switch to ${contextModeWord(canonical)} did not complete — Context is now off`
            : 'Context mode transition did not complete',
          ...(crossModeSwitchLost ? { contextOff: true, priorMode } : {}),
        }),
        ...(this._contextTransitionFailedLayerIds?.length
          ? { failedLayerIds: [...this._contextTransitionFailedLayerIds] }
          : {}),
      };
    } catch (error) {
      if (!requestIsCurrent()) {
        return {
          ...cancellationResult(),
          ...(Array.isArray(error?.failedLayerIds)
            ? { failedLayerIds: [...error.failedLayerIds] }
            : {}),
        };
      }
      return {
        ok: false,
        action: 'set_context_mode',
        error: error?.message || 'Context mode transition failed',
        ...(Array.isArray(error?.failedLayerIds)
          ? { failedLayerIds: [...error.failedLayerIds] }
          : {}),
        ...this.getContextModeState(),
      };
    }
  }

  /**
   * Returns cockpit status for voice/state sync and navigation operations.
   * @returns {{active:boolean, entryAllowed:boolean, visionMode:string, subject:{id:string,layerId:string}|null, navigation:{canPrevious:boolean,canNext:boolean,canFocus:boolean}|null, awareness?: object}|null}
   */
  getCockpitState() {
    const snapshot = militaryAwarenessLayer.getContextSnapshot?.();
    const info = this.cockpitView?.readAircraftInfo?.();
    const active = Boolean(this.cockpitView?.active);
    const gateOpen = Boolean(this.cockpitView?.isEntryAllowed?.());
    // "Could Cockpit be ENTERED right now" — so it is false while already
    // inside, unconditionally. Cockpit takes the entity off
    // `viewer.trackedEntity` on entry and NEXT puts one back, which made this
    // flip true/false between calls while `active` stayed true; readers
    // (including the voice model) read that as a broken half-entered state.
    const entryAllowed = !active && Boolean(
      gateOpen
      && info
      && this.viewer?.trackedEntity?.position,
    );
    return {
      active,
      entryAllowed,
      // Why entry is unavailable, so a refusal can be explained rather than
      // guessed at.
      entryBlockedReason: entryAllowed || active
        ? null
        : (!gateOpen
          ? (this._contextModeChanging ? 'contacts-starting' : 'contacts-inactive')
          : 'no-tracked-aircraft'),
      visionMode: this.cockpitView?.visionMode || null,
      subject: info ? {
        id: info.icao24 || info.id || null,
        layerId: info.layerId || null,
        callsign: info.callsign || null,
      } : null,
      navigation: snapshot ? {
        canPrevious: Boolean(snapshot.navigation?.canPrevious),
        canNext: Boolean(snapshot.navigation?.canNext),
        canFocus: Boolean(snapshot.navigation?.canFocus),
      } : null,
      awareness: snapshot ? {
        radiusM: Number.isFinite(snapshot.radiusM) ? snapshot.radiusM : null,
        subject: snapshot.subject ? {
          id: snapshot.subject.id || null,
          layerId: snapshot.subject.layerId || null,
        } : null,
        cohorts: Array.isArray(snapshot.cohorts)
          ? snapshot.cohorts.map((cohort) => ({
            id: cohort?.id || null,
            source: cohort?.source || null,
            count: Number.isFinite(cohort?.count) ? cohort.count : null,
            relationship: cohort?.relationship || null,
            reason: cohort?.reason || null,
            coverage: cohort?.coverage || null,
          }))
          : [],
        navigation: snapshot.navigation ? {
          canPrevious: Boolean(snapshot.navigation.canPrevious),
          canNext: Boolean(snapshot.navigation.canNext),
          canFocus: Boolean(snapshot.navigation.canFocus),
        } : null,
      } : null,
      activeTracked: this.cockpitView?.active ? Boolean(this.cockpitView?.trackedEntity) : false,
      activeMapView: !this.cockpitView?.active && entryAllowed,
    };
  }

  /**
   * Point Cockpit entry at a requested contact layer before it enters.
   *
   * Reuses the filtered Context navigation NEXT already uses, so "cockpit in
   * that military helicopter" lands on the same contact "next military
   * helicopter" would. Cockpit flies aircraft only; vessel and installation
   * layers are refused by name rather than silently ignored.
   * @param {object} options Retarget request.
   * @param {string} options.targetLayer Requested contact layer.
   * @param {string|null} options.aircraftClass Optional class filter.
   * @param {{layerId: string}|null} options.currentTarget Current tracker.
   * @param {{layerId: string}|null} options.selectedTarget Pending selection.
   * @returns {{ok: boolean, retargeted?: boolean, error?: string}} Outcome.
   */
  _retargetCockpitEntryLayer({ targetLayer, aircraftClass, currentTarget, selectedTarget }) {
    if (!['flights', 'military'].includes(targetLayer)) {
      return {
        ok: false,
        error: `Cockpit flies aircraft only — ${targetLayer} contacts cannot be entered`,
      };
    }
    const activeLayer = selectedTarget?.layerId || currentTarget?.layerId || null;
    const alreadyOnLayer = activeLayer === targetLayer;
    if (alreadyOnLayer && !aircraftClass) return { ok: true, retargeted: false };
    const moved = militaryAwarenessLayer?.navigateNext
      ? !!militaryAwarenessLayer.navigateNext({
        targetLayer,
        aircraftClass,
        origin: 'voice',
      })
      : false;
    if (moved) return { ok: true, retargeted: true };
    // A filter that matched nothing still enters, as long as the layer is
    // already right — the operator asked for that layer and is on it.
    if (alreadyOnLayer) return { ok: true, retargeted: false };
    const label = targetLayer === 'military' ? 'military' : 'civilian';
    const filtered = aircraftClass ? `${aircraftClass} ` : '';
    return {
      ok: false,
      error: `No ${filtered}${label} contact is available to enter — track one first, or say "next ${label}"`,
    };
  }

  /**
   * Controls cockpit entry/exit and context navigation.
   * @param {'enter'|'exit'|'next'|'previous'|'status'} action - Cockpit action.
   * @param {object} [options]
   * @param {string|Symbol|null} [options.notificationToken]
   * @param {'flights'|'military'|'ais-live-vessels'|'military-installations'|null} [options.targetLayer]
   * @param {string|null} [options.aircraftClass]
   * @param {{layerId:'flights'|'military',id:string}|null} [options.selectedTarget]
   * @param {{layerId:'flights'|'military',id:string}|null} [options.rollbackTarget]
   * @returns {{ok:boolean, action:string, error?:string, state?:object}}
   */
  controlCockpit(action, {
    notificationToken = null,
    targetLayer = null,
    aircraftClass = null,
    selectedTarget = null,
    rollbackTarget = undefined,
  } = {}) {
    const normalized = String(action || '').toLowerCase();
    if (!this.cockpitView) {
      return {
        ok: false,
        action: 'control_cockpit',
        error: 'Cockpit controller unavailable',
        state: this.getCockpitState(),
      };
    }
    if (normalized === 'status') {
      return {
        ok: true,
        action: 'control_cockpit',
        state: this.getCockpitState(),
        notificationToken: notificationToken || null,
      };
    }
    if (normalized === 'enter') {
      // Entry is gated exactly as the manual entry chip is. Attempting it while
      // the gate is shut produced the half-entered look the operator reported
      // (a plane anchored under the camera with no cockpit around it), so
      // refuse with the reason instead of trying.
      if (!this.cockpitView.isEntryAllowed?.()) {
        return {
          ok: false,
          action: 'control_cockpit',
          error: this._contextModeChanging
            ? 'Contacts is still starting up — try Cockpit again in a moment'
            : 'Contacts must be active to enter Cockpit — say "open contacts" first',
          state: this.getCockpitState(),
        };
      }
      let currentTarget = this.getAircraftTrackingTarget();
      const layerForTarget = (target) => target?.layerId === 'military'
        ? militaryFlightsLayer
        : target?.layerId === 'flights' ? flightsLayer : null;
      // A requested layer retargets BEFORE entry, through the same filtered
      // navigation NEXT uses. Ignoring it entered on whatever was already
      // tracked and reported success, so "cockpit in that military helicopter"
      // silently put the operator in an airliner.
      if (targetLayer) {
        const requested = this._retargetCockpitEntryLayer({
          targetLayer,
          aircraftClass,
          currentTarget,
          selectedTarget,
        });
        if (!requested.ok) {
          return {
            ok: false,
            action: 'control_cockpit',
            error: requested.error,
            state: this.getCockpitState(),
          };
        }
        if (requested.retargeted) {
          // The retarget is now the authority; a selection sampled before it
          // would drag entry back to the wrong layer.
          selectedTarget = null;
          rollbackTarget = rollbackTarget === undefined ? currentTarget : rollbackTarget;
          currentTarget = this.getAircraftTrackingTarget();
        }
      }
      const selectedLayer = selectedTarget?.layerId === 'military'
        ? militaryFlightsLayer
        : selectedTarget?.layerId === 'flights' ? flightsLayer : null;
      const entry = enterCockpitWithTracking({
        cockpitView: this.cockpitView,
        selectedLayer,
        selectedTarget,
        currentLayer: layerForTarget(currentTarget),
        rollbackLayer: layerForTarget(
          rollbackTarget === undefined ? currentTarget : rollbackTarget,
        ),
        rollbackTarget,
        selectionOrigin: 'voice',
      });
      return {
        ok: entry.entered,
        action: 'control_cockpit',
        state: this.getCockpitState(),
        error: entry.error,
      };
    }
    if (normalized === 'exit') {
      const exited = !!this.cockpitView.exit();
      return {
        ok: exited,
        action: 'control_cockpit',
        state: this.getCockpitState(),
        error: exited ? null : 'Cockpit was already inactive',
      };
    }
    if (normalized === 'next' || normalized === 'previous') {
      const changed = this.cockpitView.navigateContext(
        normalized === 'next' ? 1 : -1,
        {
          targetLayer,
          aircraftClass,
          origin: 'voice',
        },
      );
      return {
        ok: changed,
        action: 'control_cockpit',
        state: this.getCockpitState(),
        error: changed ? null : 'No further context target was available',
      };
    }
    return {
      ok: false,
      action: 'control_cockpit',
      error: `Unknown cockpit action: ${action}`,
      state: this.getCockpitState(),
    };
  }

  /**
   * Full control-state snapshot — single source for voice read-back so the
   * agent confirms from the same state it acted on.
   * @returns {object} Current style/stack/HUD/detection/post-processing state.
   */
  getControlState() {
    return {
      style: this.activeStyle || 'normal',
      mapStack: this.mapStackController?.getActiveId?.() || null,
      hud: { visible: !!this.hud?.visible, layout: this.hud?.getVariant?.() || null },
      detection: this.getDetectionState(),
      bloom: {
        enabled: !!this.bloomEnabled,
        intensityPct: this._bloomSlider ? parseInt(this._bloomSlider.value, 10) : null,
      },
      sharpen: {
        enabled: !!this.sharpenEnabled,
        intensityPct: this._sharpenSlider ? parseInt(this._sharpenSlider.value, 10) : null,
      },
      celestialRing: {
        enabled: this.celestialRingEnabled,
        visible: !!this.celestialRing?.visible,
      },
      orbiting: !!this.orbitController?.active,
      recording: !!this._recordingMode,
      cleanView: document.body.classList.contains('ui-clean-view'),
    };
  }

  /**
   * Captures the current camera position and orientation as a serializable object.
   * @returns {{lat: number, lon: number, alt: number, heading: number, pitch: number, roll: number}|null}
   */
  getCameraState() {
    const carto = this.viewer.camera.positionCartographic;
    if (!carto) return null;
    return {
      lat: Cesium.Math.toDegrees(carto.latitude),
      lon: Cesium.Math.toDegrees(carto.longitude),
      alt: carto.height,
      heading: Cesium.Math.toDegrees(this.viewer.camera.heading),
      pitch: Cesium.Math.toDegrees(this.viewer.camera.pitch),
      roll: Cesium.Math.toDegrees(this.viewer.camera.roll),
    };
  }

  /**
   * Flies the camera to a previously captured camera state using cubic ease-in-out.
   * @param {{lat: number, lon: number, alt: number, heading?: number, pitch?: number, roll?: number}} cameraState
   * @param {number} [duration=2.8] - Flight duration in seconds.
   * @returns {void}
   */
  applyCameraState(cameraState, duration = 2.8) {
    if (!cameraState) return;
    this.viewer.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(
        cameraState.lon,
        cameraState.lat,
        cameraState.alt
      ),
      orientation: {
        heading: Cesium.Math.toRadians(cameraState.heading || 0),
        pitch: Cesium.Math.toRadians(cameraState.pitch || -35),
        roll: Cesium.Math.toRadians(cameraState.roll || 0),
      },
      duration: Math.max(0.2, duration || 0),
      easingFunction: Cesium.EasingFunction.CUBIC_IN_OUT,
    });
  }

  /**
   * Snapshots the full visual state (active style, bloom, sharpen, HUD, detection,
   * per-style shader uniform values) for serialization or scene recipe capture.
   * @returns {object} Serializable visual state object.
   */
  getVisualState() {
    const styleParams = {};
    for (const [styleName, stage] of Object.entries(this.stages)) {
      const shader = STYLES[styleName];
      if (!shader?.uniforms) continue;
      styleParams[styleName] = {};
      for (const uniformName of Object.keys(shader.uniforms)) {
        styleParams[styleName][uniformName] = stage.uniforms[uniformName];
      }
    }

    return {
      style: this.activeStyle,
      bloom: {
        enabled: this.bloomEnabled,
        intensity: this._getBloomIntensity(),
        version: BLOOM_SCALE_VERSION,
      },
      sharpen: {
        enabled: this.sharpenEnabled,
        intensity: parseInt(this._sharpenSlider?.value || '49', 10),
      },
      hud: {
        visible: this.hud.visible,
        variant: this.hud.getVariant(),
      },
      detection: {
        mode: getDetectionMode(),
        density: parseInt(this._detectionDensitySlider?.value || '50', 10),
        allocation: getDetectionTuning().allocationStrategy,
        fadePct: parseInt(this._detectionFadeSlider?.value || '7', 10),
        outsideOpacityPct: parseInt(this._detectionOpacitySlider?.value || '0', 10),
      },
      scope: {
        enabled: isScopeMaskEnabled(),
        featherPct: Math.round(getScopeMaskFeather() * 100),
        intensityPct: Math.round(getScopeMaskOpacity() * 100),
      },
      mapStack: this.mapStackController?.getActiveId?.() || 'photoreal',
      styleParams,
    };
  }

  /**
   * Restores a full visual state snapshot, applying style, bloom, sharpen,
   * HUD, detection, and per-style shader uniforms. Used by scene recipes
   * and share-link restore. Async so the map-stack switch resolves before
   * the share state is synced; callers may fire-and-forget.
   * @param {object} [state={}] - Visual state object (as returned by getVisualState).
   * @param {object} [options]
   * @param {(() => boolean)|null} [options.isCurrent] Caller liveness predicate.
   *   The map-stack switch is this method's ONLY suspension point, and the
   *   shader-uniform writes come after it — so a caller superseded while that
   *   switch is in flight would otherwise resume and commit the look of a
   *   state the operator has already moved past. Scene playback reproduced
   *   exactly that: a stale shot's uniforms landing on top of the live run.
   *   Omit it and the method behaves as it always has.
   * @returns {Promise<boolean>} Whether the state was committed.
   */
  async applyVisualState(state = {}, { isCurrent = null } = {}) {
    const superseded = () => typeof isCurrent === 'function' && !isCurrent();
    if (superseded()) return false;

    if (state.style && state.style !== this.activeStyle) {
      this.setStyle(state.style, { applyPreset: false });
    }

    const bloomState = state.bloom || {};
    if (typeof bloomState.intensity === 'number' && this._bloomSlider) {
      const intensity = decodeBloomIntensity(
        bloomState.intensity,
        bloomState.version ?? state.bloomVersion ?? BLOOM_SCALE_VERSION
      );
      this._setBloomIntensity(intensity, { syncShare: false });
    }
    if (typeof bloomState.enabled === 'boolean') {
      this._setBloomEnabled(bloomState.enabled);
    }

    const sharpenState = state.sharpen || {};
    if (typeof sharpenState.intensity === 'number' && this._sharpenSlider) {
      const pct = Math.max(0, Math.min(100, Math.round(sharpenState.intensity)));
      this._sharpenSlider.value = String(pct);
      this._sharpenSliderValue.textContent = `${pct}%`;
      this._applySharpenIntensity(pct / 100);
    }
    if (typeof sharpenState.enabled === 'boolean') {
      this._setSharpenEnabled(sharpenState.enabled);
    }

    const hudState = state.hud || {};
    if (hudState.variant) {
      this._setHudVariant(hudState.variant);
    }
    if (typeof hudState.visible === 'boolean') {
      this.hud.setMode(hudState.visible ? 'on' : 'off');
      this._updateHudButtonState();
    }

    const scopeState = state.scope || {};
    if (typeof scopeState.enabled === 'boolean') {
      setScopeMaskEnabled(scopeState.enabled);
      this._scopeBtn?.classList.toggle('active', scopeState.enabled);
      this._scopeBtn?.setAttribute('aria-pressed', String(scopeState.enabled));
    }
    if (typeof scopeState.featherPct === 'number' && this._scopeFeatherSlider) {
      const pct = Math.max(0, Math.min(100, Math.round(scopeState.featherPct)));
      this._scopeFeatherSlider.value = String(pct);
      if (this._scopeFeatherValue) this._scopeFeatherValue.textContent = `${pct}%`;
      setScopeMaskFeather(pct / 100);
    }
    if (typeof scopeState.intensityPct === 'number' && this._scopeIntensitySlider) {
      const pct = Math.max(0, Math.min(100, Math.round(scopeState.intensityPct)));
      this._scopeIntensitySlider.value = String(pct);
      if (this._scopeIntensityValue) this._scopeIntensityValue.textContent = `${pct}%`;
      setScopeMaskOpacity(pct / 100);
    }

    const detectionState = state.detection || {};
    if (typeof detectionState.density === 'number' && this._detectionDensitySlider) {
      const pct = canonicalizeDensity(detectionState.density);
      this._detectionDensitySlider.value = String(pct);
      if (this._detectionDensityValue) this._detectionDensityValue.textContent = `${pct}%`;
      this._applyDetectionDensityFromUi();
    }
    if (detectionState.allocation) {
      this._setDetectionAllocation(detectionState.allocation, { syncShare: false });
    }
    if (typeof detectionState.fadePct === 'number' && this._detectionFadeSlider) {
      this._detectionFadeSlider.value = String(detectionState.fadePct);
    }
    if (typeof detectionState.outsideOpacityPct === 'number' && this._detectionOpacitySlider) {
      this._detectionOpacitySlider.value = String(detectionState.outsideOpacityPct);
    }
    this._applyDetectionFadeFromUi();
    if (detectionState.mode) {
      this._setDetectionMode(detectionState.mode);
    }

    if (state.mapStack) {
      // The stack switch is itself a MUTATION, not merely a suspension point,
      // so it needs a gate on BOTH sides of the await.
      if (superseded()) return false;
      const stackBefore = this.mapStackController?.getActiveId?.() ?? null;
      const genBefore = this.mapStackController?.getSwitchGeneration?.() ?? null;

      await this._setMapStack(state.mapStack, { syncShare: false });

      if (superseded()) {
        // Superseded DURING the switch, which the pre-check above cannot catch
        // and which has already moved the globe. The controller only
        // invalidates a switch when another setStack() arrives, and a winning
        // state that omits `mapStack` never issues one — every normalized scene
        // shot omits it — so this stale globe would simply stand. Put back what
        // the winner inherited.
        const genAfter = this.mapStackController?.getSwitchGeneration?.() ?? null;
        // _setMapStack issues exactly one setStack(), which advances the
        // generation once, or not at all when the stack was unavailable and
        // nothing was mutated. Anything past that is a NEWER switch whose
        // caller owns the globe now, and reverting would stomp a live intent.
        const globeIsStillOurs = genBefore !== null && genAfter !== null
          && genAfter <= genBefore + 1;
        const landed = this.mapStackController?.getActiveId?.() ?? null;
        if (globeIsStillOurs && stackBefore && landed !== stackBefore) {
          await this._setMapStack(stackBefore, { syncShare: false });
        }
        return false;
      }
      // Everything below is the uniform commit, already past its own gate.
    }

    if (state.styleParams && typeof state.styleParams === 'object') {
      for (const [styleName, params] of Object.entries(state.styleParams)) {
        const stage = this.stages[styleName];
        if (!stage || !params) continue;
        for (const [uniformName, uniformValue] of Object.entries(params)) {
          if (stage.uniforms[uniformName] === undefined) continue;
          stage.uniforms[uniformName] = uniformValue;
        }
      }
      this._updateSliderPanel(this.activeStyle);
    }

    this._syncShareState();
    return true;
  }

  /**
   * Resets the safe-frame overlay to its inactive state on init.
   * @returns {void}
   */
  _initRecordingOverlay() {
    if (!this._safeFrameOverlay || !this._safeFrameBox) return;
    this._safeFrameOverlay.classList.remove('active', 'ratio-9-16', 'ratio-16-9');
  }

  /**
   * Applies recording-friendly post-processing and shader uniform overrides.
   * @param {object} preset
   */
  applyCinematicPreset(preset = {}) {
    const bloomInput = typeof preset.bloom === 'object' ? preset.bloom : { intensity: preset.bloom };
    let decodedBloomIntensity = null;
    if (typeof bloomInput.intensity === 'number') {
      decodedBloomIntensity = decodeBloomIntensity(
        bloomInput.intensity,
        bloomInput.version ?? preset.bloomVersion ?? BLOOM_SCALE_VERSION
      );
      this._setBloomIntensity(decodedBloomIntensity, { syncShare: false });
    }
    if (typeof bloomInput.enabled === 'boolean') {
      this._setBloomEnabled(bloomInput.enabled);
    } else if (typeof bloomInput.intensity === 'number') {
      this._setBloomEnabled((decodedBloomIntensity ?? this._getBloomIntensity()) > 0);
    }

    const sharpenInput = typeof preset.sharpen === 'object' ? preset.sharpen : { enabled: preset.sharpen };
    if (typeof sharpenInput.intensity === 'number' && this._sharpenSlider) {
      const sharpenPct = Math.max(0, Math.min(100, Math.round(sharpenInput.intensity)));
      this._sharpenSlider.value = String(sharpenPct);
      this._sharpenSliderValue.textContent = `${sharpenPct}%`;
      this._applySharpenIntensity(sharpenPct / 100);
    }
    if (typeof sharpenInput.enabled === 'boolean') {
      this._setSharpenEnabled(sharpenInput.enabled);
    } else if (typeof sharpenInput.intensity === 'number') {
      this._setSharpenEnabled(sharpenInput.intensity > 0);
    }

    if (preset.hudVariant) {
      this._setHudVariant(preset.hudVariant);
    }

    if (preset.detectionMode) {
      this._setDetectionMode(preset.detectionMode);
    }
    if (typeof preset.detectionDensity === 'number' && this._detectionDensitySlider) {
      const density = canonicalizeDensity(preset.detectionDensity);
      this._detectionDensitySlider.value = String(density);
      this._detectionDensityValue.textContent = `${density}%`;
      this._applyDetectionDensityFromUi();
    }
    if (preset.detectionAllocation) {
      this._setDetectionAllocation(preset.detectionAllocation, { syncShare: false });
    }

    if (preset.styleParams && typeof preset.styleParams === 'object') {
      for (const [styleName, params] of Object.entries(preset.styleParams)) {
        const stage = this.stages[styleName];
        if (!stage || !params || typeof params !== 'object') continue;
        for (const [uniformName, uniformValue] of Object.entries(params)) {
          if (stage.uniforms[uniformName] === undefined) continue;
          stage.uniforms[uniformName] = uniformValue;
        }
      }

      // Keep slider panel values in sync when updating the active style.
      this._updateSliderPanel(this.activeStyle);
    }

    this._syncShareState();
  }

  /**
   * Enters or exits recording mode. When active, hides UI chrome via a body class,
   * displays a safe-frame composition overlay (16:9 or 9:16), and switches
   * the HUD to the specified mode. Exiting restores the HUD mode and layout
   * variant that were active before recording started.
   * @param {boolean} enabled - Whether to enable recording mode.
   * @param {object} [options]
   * @param {boolean} [options.hidePanels=true] - Hide all panel chrome.
   * @param {string} [options.hudMode='minimal'] - HUD mode while recording ('off'|'minimal'|'full'|'auto').
   * @param {string} [options.safeFrame='16:9'] - Aspect ratio for the safe-frame overlay.
   * @returns {void}
   */
  setRecordingMode(enabled, options = {}) {
    const { hidePanels = true, hudMode = 'minimal', safeFrame = '16:9' } = options;
    this._recordingMode = !!enabled;
    this._recordingConfig = { hidePanels, hudMode, safeFrame };

    document.body.classList.toggle('recording-mode', this._recordingMode && hidePanels);

    if (this._safeFrameOverlay) {
      this._safeFrameOverlay.classList.remove('ratio-9-16', 'ratio-16-9');
      this._safeFrameOverlay.classList.toggle('active', this._recordingMode);
      this._safeFrameOverlay.classList.add(safeFrame === '9:16' ? 'ratio-9-16' : 'ratio-16-9');
    }

    if (this._recordingMode) {
      // Snapshot the user's HUD state once per recording session so exit can
      // restore it (re-entrant calls must not capture mid-recording state).
      if (!this._preRecordingHudState) {
        this._preRecordingHudState = {
          mode: this.hud.getMode(),
          variant: this.hud.getVariant(),
        };
      }
      if (hudMode === 'off') {
        this.hud.setMode('off');
      } else if (hudMode === 'full' || hudMode === 'minimal') {
        this.hud.setMode('on');
        this.hud.setVariant(hudMode === 'minimal' ? 'minimal' : 'tactical');
        if (this._hudLayoutSelect) this._hudLayoutSelect.value = this.hud.getVariant();
      } else {
        this.hud.setMode('auto');
      }
    } else {
      const saved = this._preRecordingHudState;
      this._preRecordingHudState = null;
      if (saved) {
        this.hud.setVariant(saved.variant);
        if (this._hudLayoutSelect) this._hudLayoutSelect.value = this.hud.getVariant();
      }
      this.hud.setMode(saved ? saved.mode : 'auto');
      if (this._safeFrameOverlay) {
        this._safeFrameOverlay.classList.remove('active', 'ratio-9-16', 'ratio-16-9');
      }
    }
    this._hudBtn.classList.toggle('active', this.hud.visible);
    this._syncShareState();
  }

  // ── Parameter Sliders ─────────────────────────

  /**
   * Rebuilds the parameter slider panel for the given style's shader uniforms.
   * Creates a labeled range input for each tunable uniform. Hides the panel
   * for 'normal' mode which has no shader parameters.
   * @param {string} styleName - Style name whose uniforms to display.
   * @returns {void}
   */
  _updateSliderPanel(styleName, { reveal = false } = {}) {
    this._sliderContainer.innerHTML = '';
    const shader = STYLES[styleName];

    if (!shader || !shader.uniforms || styleName === 'normal') {
      this._sliderPanel.classList.remove('active');
      this._scheduleRightPanelLayout();
      return;
    }

    for (const [uName, uMeta] of Object.entries(shader.uniforms)) {
      const row = document.createElement('div');
      row.className = 'param-slider-row';

      const label = document.createElement('span');
      label.className = 'param-label';
      label.textContent = uMeta.label;

      const slider = document.createElement('input');
      slider.type = 'range';
      slider.className = 'param-slider';
      slider.min = uMeta.min;
      slider.max = uMeta.max;
      slider.step = uMeta.max <= 1 ? '0.01' : '0.1';
      slider.value = this.stages[styleName].uniforms[uName];

      const valueDisplay = document.createElement('span');
      valueDisplay.className = 'param-value';
      valueDisplay.textContent = parseFloat(slider.value).toFixed(uMeta.max <= 1 ? 2 : 1);

      slider.addEventListener('input', () => {
        this.shareLinkManager?.claimRestoreLane?.('visual');
        const val = parseFloat(slider.value);
        this.stages[styleName].uniforms[uName] = val;
        valueDisplay.textContent = val.toFixed(uMeta.max <= 1 ? 2 : 1);
        // Uniform writes don't auto-render under the idle governor —
        // without this the slider visibly does nothing until the next
        // camera move (browser finding). (perf wave 2)
        governorRequestRender('style-param-slider');
        this._syncShareState();
      });

      row.appendChild(label);
      row.appendChild(slider);
      row.appendChild(valueDisplay);
      this._sliderContainer.appendChild(row);
    }

    this._sliderPanel.classList.add('active');
    this._scheduleRightPanelLayout();
    if (reveal) this._revealStyleParameters();
  }

  /** Reveal the map-only parameter surface in the standard Display scroll owner. */
  _revealStyleParameters() {
    if (!this._sliderPanel?.classList.contains('active')) return;
    if (this._cockpitDisplayPortalActive) return;
    this._sliderPanel.classList.remove('collapsed');
    this._syncPanelCollapseButton(this._sliderPanel);
    this.setPanelCollapsed('pp-toggles', false, { explicit: true });
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const scrollOwner = this._ppToggles;
      if (!scrollOwner) return;
      const ownerRect = scrollOwner.getBoundingClientRect();
      const panelRect = this._sliderPanel.getBoundingClientRect();
      scrollOwner.scrollTop += panelRect.top - ownerRect.top - 8;
    }));
  }

  // ── Style switching ───────────────────────────

  /**
   * Switches the active visual style. Handles full lifecycle:
   * 1. Crossfades the previous shader stage intensity to 0.
   * 2. Crossfades the new shader stage intensity to 1.
   * 3. Applies style preset defaults (bloom/sharpen/HUD) if applyPreset is true.
   * 4. Updates button highlights, style indicator, slider panel, HUD, and detection overlay.
   * @param {string} styleName - Target style ('normal'|'retro'|'surveillance'|'thermal'|'anime'|'noir'|'snow').
   * @param {object} [options]
   * @param {boolean} [options.applyPreset=true] - Whether to apply STYLE_PRESET_DEFAULTS for the new style.
   * @returns {void}
   */
  setStyle(styleName, {
    applyPreset = true,
    revealParameters = applyPreset,
    restore = false,
  } = {}) {
    if (!restore) this.shareLinkManager?.claimRestoreLane?.('visual');
    if (styleName === this.activeStyle) {
      if (revealParameters && styleName !== 'normal') this._revealStyleParameters();
      return;
    }

    const previousStyle = this.activeStyle;
    this.activeStyle = styleName;
    document.documentElement.dataset.gevStyle = styleName;

    // The celestial optics treatment belongs to the unfiltered globe only.
    // Leaving Normal turns it off; returning merely re-enables the control.
    this.setCelestialRingEnabled(false, { syncShare: false, focus: false });

    // Transition out the previous shader style
    if (previousStyle !== 'normal' && this.stages[previousStyle]) {
      this._startTransition(previousStyle, this.stages[previousStyle].uniforms.intensity, 0.0);
    }

    // Transition in the new shader style
    if (styleName !== 'normal' && this.stages[styleName]) {
      this._startTransition(styleName, this.stages[styleName].uniforms.intensity, 1.0);
    }

    if (applyPreset) {
      this._applyStylePresetDefaults(styleName);
    }

    // Update button UI
    document.querySelectorAll('.style-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.style === styleName);
    });

    // Update style indicator
    const displayNames = { surveillance: 'NVG', thermal: 'FLIR', retro: 'CRT' };
    this._styleIndicator.textContent = displayNames[styleName] || styleName.toUpperCase();
    this._updateStyleMiniStatus(styleName);

    // Update parameter sliders
    this._updateSliderPanel(styleName, { reveal: revealParameters });

    // Notify HUD (color adaptation + auto show/hide)
    this.hud.onStyleChange(styleName);
    this._updateHudButtonState();

    // Sync detection overlay tone to active post-process style
    setDetectionStyle(styleName);
    this._syncIrBoost();
    window.dispatchEvent(new CustomEvent('gev:style-change', {
      detail: { style: styleName },
    }));

    this._syncCockpitInheritedStyle();

    // Notify share link manager
    this.shareLinkManager.onStyleChange(styleName);
    this._syncShareState();
  }

  // ── Shader transitions ────────────────────────

  /**
   * Enqueues a smooth intensity transition for a shader stage. The animation
   * loop interpolates from `fromValue` to `toValue` over TRANSITION_DURATION_MS.
   * @param {string} styleName - Name of the shader stage to transition.
   * @param {number} fromValue - Starting intensity (typically current value).
   * @param {number} toValue - Target intensity (0.0 to fade out, 1.0 to fade in).
   * @returns {void}
   */
  _startTransition(styleName, fromValue, toValue) {
    this.transitions.set(styleName, {
      start: performance.now(),
      from: fromValue,
      to: toValue,
    });
    this._startAnimationLoop();
  }

  /**
   * Sample the manager's layer set and paint the global loading chip.
   * Driven by manager events AND by a ticker, because the underlying state
   * machine is TIME-driven (reveal delay, long-load threshold, terminal
   * dwell) — see _armLoadingFeedbackTicker.
   * @param {number} [now] - performance.now() sample.
   * @returns {void}
   */
  _updateGlobalLoadingFeedback(now = performance.now()) {
    if (!this._globalLoadingStatus) return;
    const summary = aggregateLayerLoading(this._dataManager?.getAll?.() || []);
    this._loadingFeedbackState = reduceLoadingFeedback(
      this._loadingFeedbackState,
      summary,
      now,
      this._loadingFeedbackEvent,
    );
    this._loadingFeedbackEvent = null;
    const presentation = presentGlobalLoadingStatus(
      this._globalStatusNotice,
      this._loadingFeedbackState,
      summary,
      now,
    );
    if (this._globalStatusNotice?.persistent !== true
        && Number.isFinite(this._globalStatusNotice?.hideAt)
        && now >= this._globalStatusNotice.hideAt) {
      this._globalStatusNotice = null;
    }
    // Loading phases and universal notices both have time-driven transitions.
    // Compute this after arbitration: a queued finite notice starts its dwell
    // only on its first visible frame, then keeps the ticker alive to expiry.
    const noticeNeedsTicker = Number.isFinite(this._globalStatusNotice?.hideAt);
    if (this._loadingFeedbackState?.phase !== 'idle' || noticeNeedsTicker) {
      this._armLoadingFeedbackTicker();
    }
    this._globalLoadingStatus.hidden = !presentation;
    if (!presentation) {
      delete this._globalLoadingStatus.dataset.state;
      return;
    }
    this._globalLoadingStatus.dataset.state = presentation.state;
    // Split-flap the LABEL only ("LOADING LIVE DATA" -> "LOAD COMPLETE").
    // setSplitFlapText is a no-op when the text is unchanged, which matters
    // here: this runs on every 60 ms and 500 ms tick. The detail line is the
    // live layer roster inside an ellipsised, width-capped span — flapping a
    // list that churns as layers join would be noise, not delight.
    setSplitFlapText(this._globalLoadingLabel, presentation.label);
    this._globalLoadingDetail.textContent = presentation.detail;
  }

  /** Show a message in the universal top-center status banner. */
  _showGlobalStatusNotice(message, options = {}) {
    const now = performance.now();
    this._globalStatusNotice = createGlobalStatusNotice(message, now, options);
    this._updateGlobalLoadingFeedback(now);
  }

  /**
   * Style animation loop — self-stopping (perf wave 2). Runs only while a
   * crossfade is in flight or an animated (time-uniform) stage is visible,
   * holding continuous scene render for exactly that long. Re-armed by
   * _startTransition and by _setStageIntensity enabling an animated stage.
   * The traffic sync chip no longer rides this loop — it has its own 500 ms
   * interval (see _startTrafficChipTicker).
   */
  _startAnimationLoop() {
    if (this._animFrameId) return; // already running
    const update = () => {
      const now = performance.now();
      const elapsedSec = (Date.now() - this.startTime) / 1000.0;

      // Update transitions — interpolate each active crossfade
      for (const [styleName, transition] of this.transitions) {
        const elapsed = now - transition.start;
        const t = Math.min(elapsed / TRANSITION_DURATION_MS, 1.0);
        // Ease-in-out quadratic: smooth acceleration then deceleration
        const eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
        const value = transition.from + (transition.to - transition.from) * eased;

        this._setStageIntensity(this.stages[styleName], value);

        if (t >= 1.0) {
          this._setStageIntensity(this.stages[styleName], transition.to);
          this.transitions.delete(styleName);
        }
      }

      // Update time uniforms for animated shaders. Zero-intensity stages
      // are disabled (see _initStages — the scope is now the explicit
      // scopeMask canvas), so enabled === visible here; only these keep
      // the loop and its continuous-render hold alive.
      let animatedStageVisible = false;
      for (const [, stage] of this._stageEntries) {
        if (stage.enabled && stage.uniforms.time !== undefined) {
          stage.uniforms.time = elapsedSec;
          // Chain mode keeps zero-intensity stages ENABLED for pass parity —
          // only a stage that is actually VISIBLE keeps the loop (and the
          // continuous-render hold) alive, or a settled CRT session would
          // hold the loop forever via an invisible snow stage.
          if (stage.uniforms.intensity > 0.001) animatedStageVisible = true;
        }
      }

      const needed = this.transitions.size > 0 || animatedStageVisible;
      if (needed) holdContinuousRender('style-anim');
      else releaseContinuousRender('style-anim');
      if (!needed) {
        this._animFrameId = null;
        return; // settled — the next transition/animated stage re-arms us
      }
      this._animFrameId = requestAnimationFrame(update);
    };
    this._animFrameId = requestAnimationFrame(update);
  }

  /**
   * 500 ms DOM ticker for the traffic sync chip (was per-frame). It also
   * polls the loading chip as a safety net: a camera-driven layer can flip
   * its own `stats.loading` without emitting a manager event, and that is
   * the one loading start the event path cannot see.
   */
  _startTrafficChipTicker() {
    if (this._trafficChipTicker) return;
    this._trafficChipTicker = setInterval(() => {
      if (document.hidden) return;
      this._updateTrafficSyncChip();
      this._updateGlobalLoadingFeedback();
    }, 500);
  }

  /**
   * Self-stopping 60 ms ticker for the global loading chip.
   *
   * The chip used to ride the style rAF loop, which perf wave 2 made
   * self-stopping — leaving the chip frozen mid-state whenever no crossfade
   * or animated shader was running (it would never reveal, never cross the
   * long-load threshold, and never dwell out). Its reducer
   * (src/loadingFeedback.js) is time-driven, so it needs real ticks; it is
   * also pure DOM, so it takes NO governor hold and requests no render.
   * Armed by _updateGlobalLoadingFeedback whenever loading leaves idle or a
   * universal notice begins, and stops once both have settled.
   * (rebase 2026-08-16: main's loading chip vs wave 2's stopped loop)
   * @returns {void}
   */
  _armLoadingFeedbackTicker() {
    // Never arm behind a hidden tab: the reducer cannot usefully advance a
    // chip nobody can see, and the old `return` INSIDE the interval left the
    // 60ms timer scheduled for the entire hidden period (a batch completing
    // while hidden could never clear it — the idle check sat behind the
    // hidden guard). visibilitychange resamples and re-arms on return.
    if (this._loadingFeedbackTicker || document.hidden) return;
    this._loadingFeedbackTicker = setInterval(() => {
      if (document.hidden) {
        this._stopLoadingFeedbackTicker();
        return;
      }
      const now = performance.now();
      this._lastLoadingFeedbackUpdateAt = now;
      this._updateGlobalLoadingFeedback(now);
      const noticeNeedsTicker = Number.isFinite(this._globalStatusNotice?.hideAt);
      if (this._loadingFeedbackState?.phase === 'idle' && !noticeNeedsTicker) {
        this._stopLoadingFeedbackTicker();
      }
    }, 60);
  }

  /** Stop the loading-chip ticker if it is running. Idempotent. */
  _stopLoadingFeedbackTicker() {
    if (!this._loadingFeedbackTicker) return;
    clearInterval(this._loadingFeedbackTicker);
    this._loadingFeedbackTicker = null;
  }

  // ── Location Bar ─────────────────────────────

  /**
   * Initializes the location bar: renders city pills from CITY_POIS, sets up
   * QWERTY keyboard navigation for POI selection, wires the search toggle
   * and geocoding search input.
   * @returns {void}
   */
  _initLocationBar() {
    const QWERTY_KEYS = ['Q', 'W', 'E', 'R', 'T'];

    // Render city pills (no submenu wrappers — POI row is separate)
    for (const [cityId, city] of Object.entries(CITY_POIS)) {
      const pill = document.createElement('button');
      pill.className = 'location-pill';
      pill.dataset.locationId = cityId;
      pill.textContent = city.name;
      pill.addEventListener('click', () => this._onCityPillClick(cityId));
      this._locationPills.appendChild(pill);
    }

    // QWERTY keyboard navigation for POIs
    this._poiKeydownHandler = (e) => {
      if (!this._expandedCityId) return;
      // Bail while a form control is focused so POI hotkeys don't fire from a
      // <select> dropdown's type-ahead or while typing in a field (M9).
      const isFormControl = e.target?.matches?.('select, input, textarea')
        || e.target === this._locationSearch;
      if (isFormControl) return;

      const keyIndex = QWERTY_KEYS.indexOf(e.key.toUpperCase());
      if (keyIndex === -1) return;

      const city = CITY_POIS[this._expandedCityId];
      if (city && keyIndex < city.pois.length) {
        this._onPoiClick(this._expandedCityId, keyIndex);
      }
    };
    document.addEventListener('keydown', this._poiKeydownHandler);

    // Search toggle (expand/collapse)
    this._searchToggle.addEventListener('click', () => {
      this._locationSearch.classList.toggle('expanded');
      if (this._locationSearch.classList.contains('expanded')) {
        this._locationSearch.focus();
      }
    });

    // Search submit on Enter
    this._locationSearch.addEventListener('keydown', async (e) => {
      if (e.key === 'Enter') {
        const query = this._locationSearch.value.trim();
        if (!query) return;
        const generation = this._beginDeferredNavigation('location');
        if (generation === false) {
          this._locationSearch.classList.remove('searching');
          this._locationSearch.blur();
          return;
        }
        this._activeLocationSearchGeneration = generation;
        this._locationSearch.classList.add('searching');
        try {
          const destination = await searchAndFlyTo(this.viewer, query, {
            beforeFly: () => this._reassertNavigationHandoff(generation),
          });
          if (this._disposed || generation !== this._navigationGeneration) return;
          if (destination?.cancelled) {
            // Authority changed while the lookup was resolving; remain inert.
          } else if (destination) {
            // The ACTIVE STYLE indicator reports the STYLE and nothing else.
            // Writing the searched city here made the top-right corner read
            // "ACTIVE STYLE / TOKYO"; where the camera is belongs to the
            // LOCATION panel's own readout, which is updated below.
            //
            // Set before _setActiveLocation(null) so its own mini-status
            // refresh already sees the destination — the readout never blinks
            // through "Location: --" on the way to the searched place.
            this._searchedLocationLabel = destination.label || query;
            this._setActiveLocation(null);
            this._currentPoi = null;
            this._collapsePOIRow();
            this._updateLocationMiniStatus();
          } else {
            this._showToast('Location not found');
          }
        } catch (err) {
          console.error('[Search] Geocoding failed:', err);
          if (this._disposed || generation !== this._navigationGeneration) return;
          this._showToast('Search failed');
        } finally {
          this._settleLocationSearchUi(generation);
        }
      }
    });
  }

  /**
   * Signals the start of an inter-city world jump: notifies the traffic layer
   * to pause tile fetching and suspends detection overlays to prevent stale
   * rendering during the flight.
   * @returns {void}
   */
  _beginWorldJumpTransition() {
    clearTimeout(this._trafficTransitionTimer);
    trafficLayer.beginWorldJump?.();
    suspendDetection('intercity');
  }

  /**
   * Signals the end of an inter-city world jump: resumes traffic tile fetching,
   * resumes detection overlays, and forces a traffic sync chip update.
   * @returns {void}
   */
  _endWorldJumpTransition() {
    clearTimeout(this._trafficTransitionTimer);
    trafficLayer.endWorldJump?.();
    resumeDetection();
    this._updateTrafficSyncChip(true);
  }

  /**
   * Wraps a fly-to action with world-jump transition hooks when the target
   * city differs from the current one. Applies begin/end transition signals
   * with a 5.2s safety timeout to guarantee cleanup if the flight callback
   * never fires onComplete.
   * @param {boolean} cityChanged - Whether the destination is in a different city.
   * @param {function} flyAction - Callback receiving `{onStart, onComplete}` hooks; should return a result with targetPosition.
   * @returns {*} Return value from flyAction.
   */
  _flyWithTransition(cityChanged, flyAction) {
    return this._runExplicitNavigation('location', () => {
      if (!cityChanged) return flyAction({});
      let completed = false;
      const finalize = () => {
        if (completed) return;
        completed = true;
        this._endWorldJumpTransition();
      };
      const result = flyAction({
        onStart: () => this._beginWorldJumpTransition(),
        onComplete: finalize,
      });
      this._trafficTransitionTimer = window.setTimeout(finalize, 5200);
      return result;
    });
  }

  /**
   * Release camera ownership when a resolved Location destination starts.
   * Contact mode and its selected subject remain intact so FOCUS can return to
   * that subject after the user finishes inspecting the destination.
   * @returns {boolean} Whether a Contact subject remains selected.
   */
  beginLocationNavigation() {
    this._stampNavigation();
    this.cockpitView?.exit({ restoreTracking: false });
    return this._releaseFollowCamera({ preserveVesselSelection: false });
  }

  /**
   * Handles a city pill click: toggles POI row collapse if same city,
   * otherwise expands the POI row, flies to the city's first POI, and
   * tracks the target position for orbit mode.
   * @param {string} cityId - Identifier of the clicked city.
   * @returns {void}
   */
  _onCityPillClick(cityId) {
    if (this._expandedCityId === cityId) {
      // Same city clicked again — toggle collapse
      this._collapsePOIRow();
      return;
    }

    const isCityChanged = this._activeLocationId && this._activeLocationId !== cityId;
    const result = this._flyWithTransition(!!isCityChanged, (hooks) => flyToPresetLocation(this.viewer, cityId, hooks));
    if (result === false) return;
    this._expandPOIRow(cityId);
    this._setActiveLocation(cityId);
    this._activePoiIndex = 0;
    this._updatePoiHighlight();

    // Track current target + POI for orbit
    if (result) {
      this._currentTarget = result.targetPosition;
      this._currentPoi = CITY_POIS[cityId].pois[0];
    }
    this._updateLocationMiniStatus();
  }

  /**
   * Handles a POI pill click: stops orbit, flies to the POI, highlights it,
   * and saves the target position for future orbit activation.
   * @param {string} cityId - Parent city identifier.
   * @param {number} poiIndex - Index of the POI within the city's pois array.
   * @returns {void}
   */
  _onPoiClick(cityId, poiIndex) {
    const isCityChanged = this._activeLocationId && this._activeLocationId !== cityId;
    const result = this._flyWithTransition(!!isCityChanged, (hooks) => flyToPOI(this.viewer, cityId, poiIndex, hooks));
    if (result === false) return;
    this._setActiveLocation(cityId);
    this._activePoiIndex = poiIndex;
    this._updatePoiHighlight();

    // Track current target + POI for orbit
    if (result) {
      this._currentTarget = result.targetPosition;
      this._currentPoi = CITY_POIS[cityId].pois[poiIndex];
    }
    this._updateLocationMiniStatus();
  }

  /**
   * Builds and shows the POI pill row for a city. Each pill displays a
   * QWERTY keyboard shortcut key and the POI name.
   * @param {string} cityId - City whose POIs to render.
   * @returns {void}
   */
  _expandPOIRow(cityId) {
    const QWERTY_KEYS = ['Q', 'W', 'E', 'R', 'T'];
    const city = CITY_POIS[cityId];
    if (!city) return;

    this._expandedCityId = cityId;

    // Build POI pill buttons
    this._poiRow.innerHTML = '';
    city.pois.forEach((poi, idx) => {
      const pill = document.createElement('button');
      pill.className = 'poi-pill';
      pill.dataset.poiIndex = idx;
      pill.innerHTML = `<span class="poi-pill-key">${QWERTY_KEYS[idx] || idx + 1}</span><span class="poi-pill-name">${poi.name}</span>`;
      pill.addEventListener('click', () => this._onPoiClick(cityId, idx));
      this._poiRow.appendChild(pill);
    });

    // Animate expansion
    requestAnimationFrame(() => {
      this._poiRow.classList.add('expanded');
      this._locationBarDivider.classList.add('visible');
    });
  }

  /**
   * Hides the POI pill row and clears the expanded city state.
   * @returns {void}
   */
  _collapsePOIRow() {
    this._expandedCityId = null;
    this._activePoiIndex = null;
    this._poiRow.classList.remove('expanded');
    this._locationBarDivider.classList.remove('visible');
  }

  /**
   * Highlights the active POI pill and removes highlight from all others.
   * @returns {void}
   */
  _updatePoiHighlight() {
    this._poiRow.querySelectorAll('.poi-pill').forEach(pill => {
      pill.classList.toggle('active', parseInt(pill.dataset.poiIndex) === this._activePoiIndex);
    });
  }

  /**
   * Forget the last free-text search destination and repaint the LOCATION
   * readout. Public so camera owners that fly on their own — scene playback
   * most of all — can invalidate it without reaching into private state.
   * @returns {void}
   */
  clearSearchedLocation() {
    if (this._searchedLocationLabel === null) return;
    this._searchedLocationLabel = null;
    this._updateLocationMiniStatus();
  }

  /**
   * Sets the active city location, highlights its pill, and updates the mini-status readout.
   * @param {string|null} locationId - City identifier, or null to clear.
   * @returns {void}
   */
  _setActiveLocation(locationId) {
    this._activeLocationId = locationId;
    // A preset city is now what the camera is framed on, so any earlier
    // free-text destination has been superseded. Clearing only on a real id
    // leaves the search path's own _setActiveLocation(null) untouched.
    if (locationId) this._searchedLocationLabel = null;
    this._locationPills.querySelectorAll('.location-pill').forEach(pill => {
      pill.classList.toggle('active', pill.dataset.locationId === locationId);
    });
    this._updateLocationMiniStatus();
  }

  /**
   * Updates the collapsed mini-status readout with the current destination:
   * a preset city + POI/landmark, or the last free-text geocode search.
   * @returns {void}
   */
  _updateLocationMiniStatus() {
    if (!this._locationMiniCity || !this._locationMiniPoi) return;
    const lines = locationMiniStatus({
      city: this._activeLocationId ? CITY_POIS[this._activeLocationId] : null,
      currentPoi: this._currentPoi,
      searchedLabel: this._searchedLocationLabel,
    });
    this._locationMiniCity.textContent = lines.city;
    this._locationMiniPoi.textContent = lines.poi;
  }

  /**
   * Updates the collapsed mini-status readout with the active style label.
   * @param {string} [styleName=this.activeStyle] - Style name to display.
   * @returns {void}
   */
  _updateStyleMiniStatus(styleName = this.activeStyle) {
    if (!this._styleMiniValue) return;
    this._styleMiniValue.textContent = STYLE_STATUS_LABELS[styleName] || String(styleName || 'normal').toUpperCase();
  }

  // ── Orbit Mode ──────────────────────────────

  /**
   * Creates the orbit mode indicator DOM element and appends it to the body.
   * @returns {void}
   */
  _initOrbit() {
    // Create orbit indicator element
    this._orbitIndicator = document.createElement('div');
    this._orbitIndicator.id = 'orbit-indicator';
    this._orbitIndicator.innerHTML = '<span class="orbit-icon">&#x21BB;</span> ORBIT';
    document.body.appendChild(this._orbitIndicator);
  }

  /**
   * Toggles the orbit controller around the current POI target. Shows a toast
   * if no target position has been set (user must fly to a POI first).
   * @returns {void}
   */
  _toggleOrbit() {
    if (!this._currentTarget) {
      this._showToast('Fly to a POI first');
      return;
    }

    const isActive = this.orbitController.toggle(this._currentTarget, {
      radius: this._currentPoi?.alt || 500,
      pitch: this._currentPoi?.pitch || -30,
    });

    this._orbitIndicator.classList.toggle('active', isActive);
  }

  /**
   * Stops orbit mode if active and hides the orbit indicator.
   * @returns {void}
   */
  _stopOrbit() {
    if (this.orbitController.active) {
      this.orbitController.stop();
      this._orbitIndicator.classList.remove('active');
    }
  }

  /** Wire the persistent reset control to the same route used by voice. */
  _initResetGlobeButton() {
    this._globeResetHandler = () => { this.resetToGlobeView(); };
    for (const button of [this._resetGlobeBtn, this._cockpitResetGlobeBtn]) {
      button?.addEventListener('click', this._globeResetHandler);
    }
  }

  /** Wire the top-center action that clears only manager-owned data layers. */
  _initClearSelectedLayersButton() {
    if (!this._clearSelectedLayersBtn) return;
    this._clearSelectedLayersHandler = () => { void this.clearSelectedLayers(); };
    this._clearSelectedLayersBtn.addEventListener('click', this._clearSelectedLayersHandler);
  }

  /**
   * Clear every selected data layer without resetting visual, map, HUD, or
   * camera state. A layer may still release camera work it owns as part of its
   * established disable lifecycle.
   * @returns {Promise<object>} Aggregate manager lifecycle truth for the batch.
   */
  clearSelectedLayers() {
    if (this._clearSelectedLayersPromise) return this._clearSelectedLayersPromise;
    if (!this._dataManager?.clearSelectedLayers) {
      return Promise.resolve({ targetIds: [], items: [], clearedIds: [], notClearedIds: [] });
    }
    const generation = ++this._contextModeGeneration;
    const notificationToken = Symbol('clear-selected-layers');
    if (this._contextRestoreState) this._contextRestoreState.cancelled = true;
    this._contextModeChanging = true;
    this._contextMode = null;
    this._contextModeEntering = null;
    this._contextModeEntryIntent = null;
    this._contextModeReplacementIntent = null;
    this._contextSessionSnapshot = null;
    this._contextRestoreState = null;
    this._preservePanelStateDuringLayerClear = true;
    this._syncContextModeButtons();
    this._userFacingContextNotificationTokens.add(notificationToken);
    this._globalContextFlightsBtn && (this._globalContextFlightsBtn.disabled = true);
    this._globalContextMissionsBtn && (this._globalContextMissionsBtn.disabled = true);
    this._clearSelectedLayersBtn.disabled = true;
    this._clearSelectedLayersBtn.setAttribute('aria-label', 'Clearing selected data layers');

    const managerOperation = this._dataManager.clearSelectedLayers({
      origin: 'user',
      notificationToken,
    });
    this._clearSelectedLayersManagerPromise = managerOperation;
    const operation = managerOperation.then((result) => {
      if (result.targetIds.length === 0) {
        this._showToast('No selected data layers');
      } else if (result.notClearedIds.length > 0) {
        this._showToast(`${result.notClearedIds.length} data layer${result.notClearedIds.length === 1 ? '' : 's'} could not be cleared`);
      } else {
        this._showToast(`Cleared ${result.clearedIds.length} data layer${result.clearedIds.length === 1 ? '' : 's'}`);
      }
      return result;
    }).catch((error) => {
      console.warn('[Data] clear selected layers failed', error);
      this._showToast('Selected data layers could not be cleared');
      return {
        targetIds: [],
        items: [],
        clearedIds: [],
        notClearedIds: [],
        error,
      };
    }).finally(() => {
      this._userFacingContextNotificationTokens.delete(notificationToken);
      if (generation === this._contextModeGeneration) {
        this._contextModeChanging = false;
        this._syncContextModeButtons();
        this._globalContextFlightsBtn && (this._globalContextFlightsBtn.disabled = false);
        this._globalContextMissionsBtn && (this._globalContextMissionsBtn.disabled = false);
      }
      this._clearSelectedLayersBtn.disabled = false;
      this._clearSelectedLayersBtn.setAttribute('aria-label', 'Clear selected data layers');
      this._preservePanelStateDuringLayerClear = false;
      this._clearSelectedLayersManagerPromise = null;
      this._clearSelectedLayersPromise = null;
    });
    this._clearSelectedLayersPromise = operation;
    return operation;
  }

  /**
   * Release every camera owner and return to the canonical full-globe frame.
   * Repeated requests adopt the in-flight reset rather than cancelling it.
   * @returns {Promise<object>} Canonical reset result shared with voice.
   */
  resetToGlobeView() {
    if (this._globeResetPromise) return this._globeResetPromise;
    this._stampNavigation();
    interruptCameraMotion('reset-globe');
    this._stopOrbit();
    this.cockpitView?.exit({ restoreTracking: false });
    try {
      militaryAwarenessLayer.releaseCameraOwnership?.({ origin: 'tool' });
    } catch {
      // Keep reset available if Context has not initialized completely.
      try { flightsLayer.stopTracking?.({ origin: 'tool' }); } catch { /* best-effort release */ }
      try { militaryFlightsLayer.stopTracking?.({ origin: 'tool' }); } catch { /* best-effort release */ }
      try { aisLiveVesselsLayer.clearSelection?.(); } catch { /* best-effort release */ }
    }
    try { satellitesLayer.stopTracking?.({ origin: 'tool' }); } catch { /* best-effort release */ }
    try { rocketLaunchesLayer.releaseCameraOwnership?.(); } catch { /* best-effort release */ }
    this.viewer.trackedEntity = undefined;
    this.viewer.camera.cancelFlight();
    this.viewer.camera.lookAtTransform(Cesium.Matrix4.IDENTITY);
    this._beginWorldJumpTransition();

    let resolveReset;
    const resetPromise = new Promise((resolve) => { resolveReset = resolve; });
    this._globeResetPromise = resetPromise;
    let settled = false;
    let timer = null;
    const finish = (cancelled = false) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      this._endWorldJumpTransition();
      const carto = this.viewer.camera.positionCartographic;
      const result = {
        ok: !cancelled,
        action: 'zoom_to_globe',
        cancelled,
        heightKm: Math.round(GLOBE_VIEW.heightM / 1000),
        centeredOn: {
          latitude: Number(Cesium.Math.toDegrees(carto.latitude).toFixed(2)),
          longitude: Number(Cesium.Math.toDegrees(carto.longitude).toFixed(2)),
        },
      };
      this._resetGlobeBtn?.setAttribute('aria-label', 'Reset to full globe view');
      this._cockpitResetGlobeBtn?.setAttribute('aria-label', 'Reset cockpit to full globe view');
      this._globeResetPromise = null;
      resolveReset(result);
    };
    timer = window.setTimeout(() => {
      const height = this.viewer.camera.positionCartographic?.height;
      finish(!Number.isFinite(height) || Math.abs(height - GLOBE_VIEW.heightM) > 1000);
    }, 4200);
    this._resetGlobeBtn?.setAttribute('aria-label', 'Resetting to full globe view');
    this._cockpitResetGlobeBtn?.setAttribute('aria-label', 'Resetting cockpit to full globe view');
    const target = flyToGlobeView(this.viewer, {
      onComplete: () => finish(false),
      onCancel: () => finish(true),
    });
    if (!target) finish(true);
    return resetPromise;
  }

  // ── Share Button ─────────────────────────────

  /**
   * Wires the share button click to copy the current share link to the clipboard.
   * @returns {void}
   */
  _initShareButton() {
    this._shareBtn.addEventListener('click', async () => {
      const success = await this.shareLinkManager.copyLink();
      this._showToast(success ? 'Link copied!' : 'Copy failed');
    });
  }

  /**
   * Displays a temporary toast notification for 2 seconds.
   * @param {string} message - Text to show in the toast.
   * @returns {void}
   */
  _showToast(message) {
    this._toast.textContent = message;
    this._toast.classList.add('visible');
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => {
      this._toast.classList.remove('visible');
    }, 2000);
  }

  // ── HUD Toggle ───────────────────────────────

  /**
   * Wires the HUD toggle button, initializes the default HUD variant to 'tactical',
   * and sets up the detection mode cycle button.
   * @returns {void}
   */
  /**
   * Wires the DISPLAY-rail "3D" toggle to the flights layer's `models3d` param.
   * ON by default in `proximity` mode (owner directive 2026-08-22): the fleet
   * renders as 3D glTF models once the camera is zoomed in past the layer's
   * altitude ceiling, and only the nearest MODEL_MAX in view are admitted, so
   * the default costs nothing at globe scale. `all` is the deliberate opt-in;
   * turning the toggle off returns the fleet to flat billboards. The TRACKED
   * contact is independent of this toggle (see trackedModelRegime.js).
   * @returns {void}
   */
  /** One 3D toggle drives BOTH aircraft layers (commercial + military) so all planes flip together. */
  _setModels3dParams(params, { origin = 'user' } = {}) {
    this._dataManager?.setLayerParams('flights', params, { origin });
    this._dataManager?.setLayerParams('military', params, { origin });
  }

  _syncModels3dFromLayerState(state) {
    const options = state?.options?.flights;
    if (!options) return;
    this._models3dEnabled = options.models3d === true;
    this._models3dMode = options.models3dMode === 'all' ? 'all' : 'proximity';
    this._syncModels3dButtonState();
    this._models3dModeRow?.classList.toggle('visible', this._models3dEnabled);
    for (const button of this._models3dModeBtns || []) {
      if (!button) continue;
      const active = button.dataset.mode === this._models3dMode;
      button.classList.toggle('active', active);
      button.setAttribute('aria-checked', String(active));
    }
    this._layoutRightPanels();
  }

  _initModels3dToggle() {
    if (!this._models3dBtn) return;
    // The Proximity/All mode row is revealed only while 3D is on (mirrors the DETECT slider row).
    const syncModeRow = () => {
      if (this._models3dModeRow) this._models3dModeRow.classList.toggle('visible', this._models3dEnabled);
      this._layoutRightPanels();
    };
    this._models3dBtn.addEventListener('click', () => {
      this._setModels3dEnabled(!this._models3dEnabled);
      syncModeRow();
    });
    for (const btn of this._models3dModeBtns) {
      if (!btn) continue;
      btn.addEventListener('click', () => {
        const mode = btn.dataset.mode === 'all' ? 'all' : 'proximity';
        this._setModels3dMode(mode);
      });
    }
    this._syncModels3dButtonState();
    syncModeRow();
  }

  _setModels3dEnabled(enabled) {
    this._models3dEnabled = !!enabled;
    this._setModels3dParams({ models3d: this._models3dEnabled });
    this._syncModels3dButtonState();
  }

  _setModels3dMode(mode) {
    const normalized = mode === 'all' ? 'all' : 'proximity';
    this._models3dMode = normalized;
    this._setModels3dParams({ models3dMode: normalized });
    for (const button of this._models3dModeBtns) {
      if (!button) continue;
      const active = button.dataset.mode === normalized;
      button.classList.toggle('active', active);
      button.setAttribute('aria-checked', String(active));
    }
    this._syncModels3dButtonState();
  }

  _syncModels3dButtonState() {
    this._models3dBtn?.classList.toggle('active', this._models3dEnabled);
    // The lit/dark state is a colour to a sighted operator and nothing at all to
    // a screen reader without this. It matters more now that the button ships
    // ACTIVE from markup (default-on, 2026-08-22): the very first thing assistive
    // tech reported was an unpressed-looking control over an armed layer.
    // Mirrors #scope-toggle, which has always carried aria-pressed.
    this._models3dBtn?.setAttribute('aria-pressed', String(this._models3dEnabled));
  }

  _initHUDToggle() {
    this._hudBtn.addEventListener('click', () => {
      this.shareLinkManager?.claimRestoreLane?.('visual');
      this.hud.toggle();
      this._updateHudButtonState();
      this._syncShareState();
    });

    if (this._hudLayoutSelect) {
      this._hudLayoutSelect.value = 'tactical';
    }
    this._setHudVariant('tactical');
    this.hud.setMode('on');
    this._updateHudButtonState();

    // Detection toggle button
    this._detectionBtn.addEventListener('click', () => {
      this.shareLinkManager?.claimRestoreLane?.('visual');
      this._detectionUserOverridden = true;
      cycleDetectionMode();
      this._syncShareState();
    });
    this._cockpitDisplayToggleBtn?.addEventListener('click', () => {
      const open = this._cockpitDisplayToggleBtn.getAttribute('aria-expanded') === 'true';
      this._setCockpitDisclosure?.('display', !open);
    });
    this._initCockpitDisplayPortal();
  }

  /**
   * Reuses the production Display controls inside Cockpit without cloning
   * stateful inputs or event listeners. Comment anchors preserve each group's
   * exact home in the standard Display panel for exit and teardown.
   * @returns {void}
   */
  _initCockpitDisplayPortal() {
    const definitions = [
      ['hud', this._hudBtn?.closest('.pp-toggle-group')],
      ['detection', this._detectionBtn?.closest('.pp-toggle-group')],
      ['parameters', this._sliderPanel],
      ['models3d', this._models3dBtn?.closest('.pp-toggle-group')],
    ];
    this._cockpitDisplayPortalRecords = definitions.flatMap(([name, group]) => {
      const slot = this._cockpitDisplayPanel?.querySelector(
        `[data-cockpit-display-slot="${name}"]`,
      );
      if (!group || !slot || !group.parentNode) return [];
      const anchor = document.createComment(`cockpit-display-home:${name}`);
      group.before(anchor);
      return [{ name, group, slot, anchor }];
    });
    this._standardDisplayScrollTop = this._ppToggles?.scrollTop || 0;
    this._cockpitDisplayScrollTop = this._cockpitDisplayPanel?.scrollTop || 0;
    this._standardDisplayScrollHandler = () => {
      if (!this._cockpitDisplayPortalActive) {
        this._standardDisplayScrollTop = this._ppToggles?.scrollTop || 0;
      }
    };
    this._cockpitDisplayScrollHandler = () => {
      if (this._cockpitDisplayPortalActive) {
        this._cockpitDisplayScrollTop = this._cockpitDisplayPanel?.scrollTop || 0;
      }
    };
    this._ppToggles?.addEventListener('scroll', this._standardDisplayScrollHandler, { passive: true });
    this._cockpitDisplayPanel?.addEventListener('scroll', this._cockpitDisplayScrollHandler, { passive: true });
    this._cockpitDisplayModeHandler = (event) => {
      this._setCockpitDisplayPortalActive(event?.detail?.active === true);
    };
    window.addEventListener('gev:cockpit-mode-changed', this._cockpitDisplayModeHandler);
    this._setCockpitDisplayPortalActive(document.body.classList.contains('cockpit-mode'));
  }

  /**
   * Moves the shared HUD, Detection, Parameters, and 3D controls into or out
   * of Cockpit.
   * @param {boolean} active Whether Cockpit owns the Display control groups.
   * @returns {void}
   */
  _setCockpitDisplayPortalActive(active) {
    const nextActive = active === true;
    if (this._cockpitDisplayPortalActive === nextActive) return;
    const focusedRecord = this._cockpitDisplayPortalRecords.find((record) => (
      record.group.contains(document.activeElement)
    ));
    const focusedElement = focusedRecord ? document.activeElement : null;
    this._displayPortalScrollRestoreOwner = nextActive ? 'cockpit' : 'standard';
    this._cockpitDisplayPortalActive = nextActive;
    for (const record of this._cockpitDisplayPortalRecords) {
      if (nextActive) {
        record.slot.append(record.group);
      } else if (record.anchor.parentNode) {
        record.anchor.after(record.group);
      }
    }
    this._cockpitDisplayPanel?.classList.toggle('uses-shared-display-controls', nextActive);
    requestAnimationFrame(() => {
      if (nextActive && this._cockpitDisplayPanel) {
        this._cockpitDisplayPanel.scrollTop = this._cockpitDisplayScrollTop;
      }
      if (!nextActive && this._ppToggles) {
        this._ppToggles.scrollTop = this._standardDisplayScrollTop;
      }
      focusedElement?.focus?.({ preventScroll: true });
      // Portal movement can trigger one more adaptive-layout/clamp pass after
      // the first frame. Reapply the owning surface's saved position once the
      // new layout has fully settled.
      requestAnimationFrame(() => {
        if (nextActive && this._cockpitDisplayPanel) {
          this._cockpitDisplayPanel.scrollTop = this._cockpitDisplayScrollTop;
        }
        if (!nextActive && this._ppToggles) {
          this._ppToggles.scrollTop = this._standardDisplayScrollTop;
        }
        if (this._displayPortalScrollRestoreOwner === (nextActive ? 'cockpit' : 'standard')) {
          this._displayPortalScrollRestoreOwner = null;
        }
      });
    });
    this._layoutRightPanels();
    this.cockpitView?.scheduleContextLayout();
  }

  /**
   * Syncs the HUD toggle button active class and HUD layout row visibility
   * with the current HUD visible state.
   * @returns {void}
   */
  _updateHudButtonState() {
    this._hudBtn.classList.toggle('active', this.hud.visible);
    if (this._hudLayoutRow) {
      this._hudLayoutRow.classList.toggle('visible', this.hud.visible);
    }
    this._scheduleAdaptivePanelLayout({ settle: true });
  }

  /**
   * Updates the detection toggle button label and CSS classes to reflect
   * the current density-derived profile. Also toggles the density and
   * allocation controls together.
   * @param {string} modeLabel - Current detection mode label.
   * @returns {void}
   */
  _updateDetectionButton(modeLabel) {
    const btn = this._detectionBtn;
    const enabled = modeLabel !== 'OFF';
    btn.setAttribute('aria-pressed', String(enabled));
    btn.setAttribute('aria-label', enabled
      ? `Detection overlay: ${String(modeLabel).toLowerCase()}`
      : 'Detection overlay: off');
    btn.classList.remove('active', 'god', 'panoptic');
    if (modeLabel === 'SPARSE') {
      btn.querySelector('.pp-label').textContent = 'SPARSE';
      btn.classList.add('active');
    } else if (modeLabel === 'BALANCED') {
      btn.querySelector('.pp-label').textContent = 'BALANCED';
      btn.classList.add('active');
    } else if (modeLabel === 'DENSE') {
      btn.querySelector('.pp-label').textContent = 'DENSE';
      btn.classList.add('active', 'panoptic');
    } else {
      btn.querySelector('.pp-label').textContent = 'DETECT';
    }

    if (this._detectionSliderRow) {
      this._detectionSliderRow.classList.toggle('visible', modeLabel !== 'OFF');
    }
    if (this._detectionAllocationRow) {
      this._detectionAllocationRow.classList.toggle('visible', modeLabel !== 'OFF');
    }
    if (this._detectionFadeRow) {
      this._detectionFadeRow.classList.toggle('visible', modeLabel !== 'OFF');
    }
    if (this._detectionOpacityRow) {
      this._detectionOpacityRow.classList.toggle('visible', modeLabel !== 'OFF');
    }
    this._layoutRightPanels();
  }

  /**
   * Positions the parameter slider panel directly below the right-rail toggle
   * panel, right-aligned to it. Clamps to viewport bounds to prevent overflow.
   * Runs inside a rAF to batch with other layout reads.
   * @returns {void}
   */
  _layoutRightPanels() {
    this._scheduleRightPanelLayout();
  }

  /**
   * Recalculates the CCTV panel max-height based on its current top position
   * and the window height, enabling internal scroll without viewport overflow.
   *
   * Deliberately left in ui.js rather than moved into panelAdaptiveLayoutMixin.js
   * or a future cctvPanelMixin.js: it's called from both groups plus the
   * constructor, with no single natural owner between them.
   * @returns {void}
   */
  _syncCctvPanelViewport() {
    if (!this._cctvPanel) return;
    const inner = this._cctvPanel.querySelector('.cctv-panel-inner');
    requestAnimationFrame(() => {
      if (this._cctvPanel.parentElement?.id === 'right-context-rail') {
        this._cctvPanel.style.maxHeight = '';
        if (inner) inner.style.maxHeight = '';
        this._scheduleRightPanelLayout();
        return;
      }
      const rect = this._cctvPanel.getBoundingClientRect();
      const availableHeight = Math.max(190, Math.floor(window.innerHeight - rect.top - 12));
      this._cctvPanel.style.maxHeight = `${availableHeight}px`;
      if (inner) {
        inner.style.maxHeight = `${availableHeight}px`;
      }
    });
  }

  /** Whether a share link was used to load the page */
  get hasShareState() {
    return !!this._hasShareState;
  }

  /** Terminal result for the complete initial share restoration. */
  get initialRestorePromise() {
    return this._initialShareRestorePromise || Promise.resolve({ status: 'not-requested' });
  }

  _settleInitialShareRestore(result) {
    if (!this._resolveInitialShareRestore) return;
    const resolve = this._resolveInitialShareRestore;
    this._resolveInitialShareRestore = null;
    resolve(result);
    window.dispatchEvent(new CustomEvent('gev:initial-share-restore-settled', { detail: result }));
  }

  /**
   * Tear down the StyleManager — cancel animation loop, clear intervals,
   * and release resources. Call this before discarding the instance to
   * prevent leaked rAF loops and event listeners.
   * @returns {Promise<void>} Resolves after focused-session state restoration.
   */
  async dispose() {
    if (this._disposed) return;
    this._shareTrackingNoticeGeneration += 1;
    this._shareTrackingAcquiringKey = null;
    this._globalStatusNotice = null;
    if (this._globalLoadingStatus) this._globalLoadingStatus.hidden = true;
    this._disposed = true;
    // Revoke persistence/hash authority before teardown can emit manager changes.
    this._layerStateCoordinator?.destroy();
    this._layerStateCoordinator = null;
    this._layerStateRestorePromise = null;
    clearTimeout(this._initialShareRestoreTimeout);
    this._initialShareRestoreTimeout = null;
    this._settleInitialShareRestore({ status: 'destroyed', share: null, layers: [] });
    if (this._initialShareGestureHandler) {
      this.viewer?.canvas?.removeEventListener('pointerdown', this._initialShareGestureHandler);
      this.viewer?.canvas?.removeEventListener('wheel', this._initialShareGestureHandler);
      this._initialShareGestureHandler = null;
    }
    this.shareLinkManager?.destroy();
    if (this._awarenessSelectedHandler) {
      window.removeEventListener('gev:awareness-subject-selected', this._awarenessSelectedHandler);
      this._awarenessSelectedHandler = null;
    }
    if (this._awarenessClearedHandler) {
      window.removeEventListener('gev:awareness-subject-cleared', this._awarenessClearedHandler);
      this._awarenessClearedHandler = null;
    }
    if (this._mapStackChangeHandler) {
      window.removeEventListener('gev:map-stack-changed', this._mapStackChangeHandler);
      this._mapStackChangeHandler = null;
    }
    // Invalidate any in-flight Context transaction the same way a newer request
    // would. Without this, a reinstatement already past its awaits could
    // re-enable a mode's entry layer and republish `_contextMode` while the
    // rest of teardown is tearing those very layers down.
    this._contextModeGeneration += 1;
    this._stampNavigation();
    // Close camera-entry seams synchronously. Context restoration may await
    // layer work, so leaving these listeners attached until afterward lets a
    // focus event release tracking or start a flight during teardown.
    this._removeCctvRequestFocusListener?.();
    this._removeCctvRequestFocusListener = null;
    this._cctvRequestFocusHandler = null;
    this._removeWorldRequestFocusListener?.();
    this._removeWorldRequestFocusListener = null;
    this._worldRequestFocusHandler = null;
    this._navigationOwnerChangedRemover?.();
    this._navigationOwnerChangedRemover = null;
    this._removeNavigationAuthorityListener?.();
    this._removeNavigationAuthorityListener = null;
    this._contextModeChanging = true;
    this._contextMode = null;
    await this._restoreContextSession();
    // IR boost teardown BEFORE detaching the data manager: restore fog and
    // un-boost both aircraft layers so a surviving viewer or replacement
    // manager doesn't inherit sensor state (review P2, 2026-08-16).
    if (this._irBoostActive) {
      if (this._irFogWasEnabled != null && this.viewer?.scene?.fog) {
        this.viewer.scene.fog.enabled = this._irFogWasEnabled;
      }
      this._dataManager?.setLayerParams('flights', { irBoost: false });
      this._dataManager?.setLayerParams('military', { irBoost: false });
      this._irBoostActive = false;
      this._irFogWasEnabled = null;
    }
    this.cockpitView?.dispose();
    if (this._cockpitDisplayModeHandler) {
      window.removeEventListener('gev:cockpit-mode-changed', this._cockpitDisplayModeHandler);
      this._cockpitDisplayModeHandler = null;
    }
    this._setCockpitDisplayPortalActive(false);
    this._ppToggles?.removeEventListener('scroll', this._standardDisplayScrollHandler);
    this._cockpitDisplayPanel?.removeEventListener('scroll', this._cockpitDisplayScrollHandler);
    this._standardDisplayScrollHandler = null;
    this._cockpitDisplayScrollHandler = null;
    for (const record of this._cockpitDisplayPortalRecords) record.anchor.remove();
    this._cockpitDisplayPortalRecords = [];
    this._dataManagerBeforeDestroyUnsubscribe?.();
    this._dataManagerBeforeDestroyUnsubscribe = null;
    this._dataManagerVisibilityGuardUnsubscribe?.();
    this._dataManagerVisibilityGuardUnsubscribe = null;
    this._dataManagerVisibilityRequestUnsubscribe?.();
    this._dataManagerVisibilityRequestUnsubscribe = null;
    this._dataManagerUnsubscribe?.();
    this._dataManagerUnsubscribe = null;
    if (this._globeResetHandler) {
      this._resetGlobeBtn?.removeEventListener('click', this._globeResetHandler);
      this._cockpitResetGlobeBtn?.removeEventListener('click', this._globeResetHandler);
      this._globeResetHandler = null;
    }
    if (this._clearSelectedLayersBtn && this._clearSelectedLayersHandler) {
      this._clearSelectedLayersBtn.removeEventListener('click', this._clearSelectedLayersHandler);
      this._clearSelectedLayersHandler = null;
    }
    this._cctvUnsubscribe?.();
    this._cctvUnsubscribe = null;
    this._commandDockTrayObserver?.disconnect?.();
    this._commandDockTrayObserver = null;
    this._draggableResizeObserver?.disconnect();
    this._draggableResizeObserver = null;
    if (this._windowResizeHandler) {
      window.removeEventListener('resize', this._windowResizeHandler);
      this._windowResizeHandler = null;
    }
    if (this._loadingVisibilityHandler) {
      document.removeEventListener('visibilitychange', this._loadingVisibilityHandler);
      this._loadingVisibilityHandler = null;
    }
    this._stopLoadingFeedbackTicker();
    if (this._globalKeydownHandler) {
      document.removeEventListener('keydown', this._globalKeydownHandler);
      this._globalKeydownHandler = null;
    }
    if (this._poiKeydownHandler) {
      document.removeEventListener('keydown', this._poiKeydownHandler);
      this._poiKeydownHandler = null;
    }
    // Cancel the rAF animation loop and release its governor hold; also stop
    // the traffic-chip ticker the loop no longer carries. (perf wave 2 fix)
    if (this._animFrameId) {
      cancelAnimationFrame(this._animFrameId);
      this._animFrameId = null;
    }
    releaseContinuousRender('style-anim');
    if (this._trafficChipTicker) {
      clearInterval(this._trafficChipTicker);
      this._trafficChipTicker = null;
    }
    if (this._loadingFeedbackTicker) {
      clearInterval(this._loadingFeedbackTicker);
      this._loadingFeedbackTicker = null;
    }
    if (this._leftStackLayoutFrame !== null) {
      cancelAnimationFrame(this._leftStackLayoutFrame);
      this._leftStackLayoutFrame = null;
    }
    if (this._rightStackLayoutFrame !== null) {
      cancelAnimationFrame(this._rightStackLayoutFrame);
      this._rightStackLayoutFrame = null;
    }
    clearTimeout(this._adaptivePanelSettleTimer);
    this._adaptivePanelSettleTimer = null;
    this._leftStackResizeObserver?.disconnect();
    this._leftStackResizeObserver = null;
    this._leftStackMutationObserver?.disconnect();
    this._leftStackMutationObserver = null;
    this._rightStackResizeObserver?.disconnect();
    this._rightStackResizeObserver = null;
    this._rightStackMutationObserver?.disconnect();
    this._rightStackMutationObserver = null;
    if (this._leftStackHudTransitionHandler) {
      document.getElementById('intel-hud')?.removeEventListener(
        'transitionend',
        this._leftStackHudTransitionHandler,
      );
      this._leftStackHudTransitionHandler = null;
    }
    if (this._rightStackHudTransitionHandler) {
      document.getElementById('intel-hud')?.removeEventListener(
        'transitionend',
        this._rightStackHudTransitionHandler,
      );
      this._rightStackHudTransitionHandler = null;
    }
    if (this._leftStackCockpitModeHandler) {
      window.removeEventListener('gev:cockpit-mode-changed', this._leftStackCockpitModeHandler);
      this._leftStackCockpitModeHandler = null;
    }
    this._radioUnsubscribe?.();
    this._radioUnsubscribe = null;
    this._radioTunerAbort?.abort();
    this._radioTunerAbort = null;
    this._radioTunerBandPinnedForNavigation = false;
    this._radioTunerDragSnapshot = null;
    this._radioTunerPool = [];
    this._radioTunerCameraRemove?.();
    this._radioTunerCameraRemove = null;
    this._refreshRadioTunerBand = null;
    document.getElementById('title-bar')?.classList.remove('radio-broadcasting');
    radioLayer.endTuning();
    if (this._radioSelectedHandler) {
      document.removeEventListener('gev:radio-selected', this._radioSelectedHandler);
      this._radioSelectedHandler = null;
    }
    destroyTrackedReadout();
    destroyDetection();
    destroyWorldOverlay();
    // Clear transitions
    this.transitions.clear();
  }
}

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
