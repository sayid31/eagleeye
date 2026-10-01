// Moved out of militaryAwareness.js (militaryAwarenessConstants).

import * as Cesium from 'cesium';

export const AIRCRAFT_DEPENDENCIES = ['flights', 'military'];

const DEFERRED_DEPENDENCIES = ['ais-live-vessels', 'military-installations'];

export const DEPENDENCIES = [...AIRCRAFT_DEPENDENCIES, ...DEFERRED_DEPENDENCIES];

export const AWARENESS_PAGE_ROTATE_MS = 10000;

export const AWARENESS_PAGE_SIZE = 3;

export const AWARENESS_MAX_EXAMPLES = 10;

// Navigation walks the whole 250 km cohort, not the ten rows the panel shows,
// so these caps sit far above any realistic in-range population rather than at
// the display limit. They are still FINITE: an unbounded materialization would
// let a pathological feed sort an eleven-thousand-contact array on every
// refresh. Truthfulness does not depend on them — `summarizeAwarenessCohort`
// derives `count` from the full in-range set before any slice.
export const AWARENESS_QUERY_LIMIT = 20000;

export const AWARENESS_MAX_NAVIGATION_EXAMPLES = 10000;

export const CONTEXT_RIM_HEIGHT_M = 2500;

export const VESSEL_FOCUS_RADIUS_M = 3000;

export const DIRECTION_SCRATCH = Array.from({ length: 3 }, () => new Cesium.Cartesian3());

export const SUBJECT_CARTOGRAPHIC_SCRATCH = new Cesium.Cartographic();

export const TARGET_CARTOGRAPHIC_SCRATCH = Array.from({ length: 3 }, () => new Cesium.Cartographic());

export const SOURCE_LABEL = {
  flights: 'OpenSky',
  military: 'adsb.lol',
  'ais-live-vessels': 'AISStream',
  'military-installations': 'OpenStreetMap',
};

/**
 * Whether a refresh tick could confirm the subject in its source collection.
 * UNCHECKED means the tick did not look — it must never change the verdict.
 */
export const SUBJECT_PRESENCE = Object.freeze({
  LIVE: 'live',
  MISSING: 'missing',
  UNCHECKED: 'unchecked',
});

export const state = {
  viewer: null,
  dataManager: null,
  enabled: false,
  // Set once a refresh observes the subject gone from a still-reporting source.
  // The Contact readout turns this into its CONTACT LOST hold state.
  subjectMissing: false,
  // The dedicated Context chooser exposes a passive shell. Operational source
  // layers activate only after Contacts is explicitly selected.
  passive: true,
  ownedDependencies: new Set(),
  subject: null,
  results: null,
  visual: null,
  panel: null,
  panelOwned: false,
  subjectListener: null,
  contextListener: null,
  clearListener: null,
  subjectClearListener: null,
  runtimeListenersAttached: false,
  preRenderRemover: null,
  panelClickListener: null,
  directionRoot: null,
  compassRing: null,
  compassLabels: [],
  compassHeading: null,
  directionMarkers: [],
  navigationHistory: [],
  navigationVisited: new Set(),
  navigationIndex: -1,
  suppressedHistoryKey: null,
  pendingSelectionKey: null,
  lastSubjectRefreshMs: 0,
  /** Camera-pose signature observed on the previous rendered frame. */
  lastCameraPoseSig: '',
  /** When the pose signature last changed bins (hysteresis anchor). */
  lastCameraPoseChangeMs: 0,
  /** Whether the view currently counts as moving (hysteretic, not per-frame). */
  cameraMoving: false,
  lastEvaluatedPosition: null,
  sourceRevision: '',
  panelMarkup: '',
  directionFrame: null,
  lastDirectionUpdateMs: 0,
  activationId: 0,
  autoFocusAttempted: false,
  autoFocusRetryPending: false,
  pageTimer: null,
  cohortPages: new Map(),
};
