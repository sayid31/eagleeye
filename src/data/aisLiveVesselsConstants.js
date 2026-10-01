// Moved out of aisLiveVessels.js (aisLiveVesselsConstants).

import { VESSEL_LABEL_GRID_PX } from './vesselLabels.js';
import { clearOverlaySource, hitTestWorldOverlay, setOverlayEntries, setOverlaySourceVisible } from '../overlays/worldOverlay.js';

export const FOCUS_EVIDENCE_DEV = import.meta.env?.DEV === true;

export const DEFAULT_API_URL = '/api/ais-live';

export const DEFAULT_RENDER_ROWS = 12000;

export const DEFAULT_ACTIVE_LABELS = 900;

export const REFRESH_MS = 60000;

/** Bounded wait for the first accepted vessel position in one enabled session. */
export const AIS_FIRST_CONNECT_GRACE_MS = 30000;

export const AIS_FIRST_CONNECT_LABEL = 'awaiting first AIS position…';

export const VISIBILITY_UPDATE_MS = 800;

/** Focus alpha alone samples faster inside the existing preRender pass. */
export const FOCUS_UPDATE_MS = 80;

export const LABEL_GRID_PX = VESSEL_LABEL_GRID_PX;

/**
 * Minimum screen-space separation between accepted vessel cards (matches the
 * FIRMS card declutter). The 118px grid alone under-spaces the wider canvas
 * cards; the greedy pass below enforces true card-scale spacing.
 */
export const CARD_MIN_SEP_PX = 150;

/** Number of consecutive refreshes a selected-but-vanished vessel is retained. */
export const SELECTED_PIN_REFRESHES = 3;

/** Trail hue for the selected vessel (PRD F4, pinned to the AIS teal-green family). */
export const TRAIL_COLOR = '#39ffd5';

/** Slight lift (m) for trail vertices to avoid sea-surface z-fighting. */
export const TRAIL_HEIGHT_M = 3;

/**
 * Lift (m) above the local sea surface (geoid) for vessel anchors — locked
 * height-datum principle #1: never below the visible surface, slightly above
 * is always fine (clears tide/mesh noise in the photoreal sea mesh).
 */
export const VESSEL_LIFT_M = 3;

/** Combined cap on trail vertices (server backfill + live accumulation). */
export const TRAIL_MAX_POINTS = 400;

/** Minimum movement (m) before a reconcile refresh appends a new trail point. */
export const TRAIL_MIN_MOVE_M = 25;

export const DEFAULT_VESSEL_OVERLAY_HOST = Object.freeze({
  setEntries: setOverlayEntries,
  setVisible: setOverlaySourceVisible,
  clearSource: clearOverlaySource,
  hitTest: hitTestWorldOverlay,
});

export const DEFAULT_AIS_RUNTIME = Object.freeze({
  now: () => Date.now(),
  setTimeout: (callback, delayMs) => setTimeout(callback, delayMs),
  clearTimeout: (timer) => clearTimeout(timer),
});

/** @type {Map<string, string>} `${cssColor}:${variant}` -> chevron SVG data URL */
export const shipIconCache = new Map();

export const state = {
  viewer: null,
  enabled: false,
  loading: false,
  loaded: false,
  stale: false,
  error: null,
  loadingLabel: '',
  lastUpdate: null,
  count: 0,
  newestPositionAt: null,
  transportStatus: null,
  /** Server epoch-ms of the next reconnect attempt while the feed is degraded. */
  nextAttemptAt: null,
  lastMessageAt: null,
  rawRowCount: 0,
  acceptedRowCount: 0,
  /** Monotonic enable/reset owner for requests and first-connect timers. */
  sessionId: 0,
  /** @type {'idle'|'loading'|'ready'|'unavailable'} */
  firstConnectPhase: 'idle',
  firstConnectStartedAt: null,
  firstConnectDeadline: null,
  firstConnectTimer: null,
  abort: null,
  billboardCollection: null,
  /** @type {Array<Object>} Flat render list: keyed records + unkeyed records */
  vesselRecords: [],
  /** @type {Map<string, Object>} MMSI -> vessel record (identity across refreshes) */
  vesselMap: new Map(),
  /** @type {Array<Object>} Records with no MMSI — rebuilt fresh each refresh */
  unkeyedRecords: [],
  clickHandler: null,
  /** Exact EventTarget currently holding the Escape listener. */
  keyTarget: null,
  /** Exact callback registered on keyTarget. */
  keydownHandler: null,
  /** Cesium trackedEntityChanged listener disposer. */
  trackedEntityRemover: null,
  /** Test-only factory used to exercise enable-time interaction installation. */
  interactionHandlerFactory: null,
  /** Test-only key target paired with interactionHandlerFactory. */
  interactionKeyTarget: null,
  preRenderRemover: null,
  lastVisibilityUpdate: 0,
  lastFocusUpdate: 0,
  /** Sprites whose animated emphasis remains outside the 1.0 deadband. */
  activeFocusCount: 0,
  activeLabelCount: 0,
  selectedRecord: null,
  /** @type {{setPositions: Function, clear: Function, destroy: Function}|null} Selected-vessel fading trail */
  trail: null,
  /** @type {Cesium.Cartesian3[]} Chronological trail vertices (oldest first) */
  trailPositions: [],
  /** @type {string|null} MMSI that owns the active selected-vessel trail. */
  trailMmsi: null,
  /** @type {number} Monotonic token — invalidates in-flight backfill responses */
  trailBackfillToken: 0,
};
