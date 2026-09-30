// Moved out of militaryFlights.js (militaryFlightsState).

import * as Cesium from 'cesium';

/** Per-class model spec for THIS layer (2026-08-16, owner playtest ask:
 *  military contacts should read as their WEIGHT CLASS, always in this layer's
 *  amber). Real Hangar GLBs serve the classes they cover (meters, nose −X →
 *  180° offset); airliner/quadjet/glider get the shared 747 silhouette
 *  (airplane.glb — C-5M/RC-135-style heavies stop rendering as bizjets);
 *  fastjet and unknown keep jet.glb with the same 180° offset. The MIX tint stays
 *  dominant everywhere — military is amber, tracked is TRACKED_ICON_COLOR,
 *  and the tint must dominate any livery (owner: "stays yellow"). Specs are
 *  static per class — memoized (the fleet pass asks at 12 Hz per model). */
export const _specCache = new Map();

/** @type {Map<string, Cesium.Model>} icao24 → model */
export const _models = new Map();

/** @type {Set<string>} icao24 currently loading (async) */
export const _modelPending = new Set();

/** @type {Map<string, number>} icao24 → load generation; bumped on release to invalidate
 *  an in-flight load (so a track/untrack/remove during fromGltfAsync can't add a stale model). */
export const _modelGen = new Map();

export const _scratchModelBS = new Cesium.BoundingSphere(new Cesium.Cartesian3(), 1.0); // frustum-visibility test

/** Last limb taper per billboard, retained across class/ground/cockpit repaints. */
export const _billboardLimbScale = new WeakMap();

export const _activeUpdateControllers = new Set();

/** @type {Map<string, number>} icao24 -> geoid undulation N (m), cached (negligible drift per-aircraft). */
export const _geoidNCache = new Map();

// -- Scratch variables (reused each frame to avoid GC pressure) --
export const _scratchCarto = new Cesium.Cartographic();

export const _scratchFleetPos = new Cesium.Cartesian3();

export const _scratchDrRaw = new Cesium.Cartesian3();

export const _trackedPosHolder = new Cesium.Cartesian3();

/** Scratch for _startTrail's seed-render-time cutoff (outside deadReckoning.js's
 *  own internal scratch of the same name — that one is private to the engine). */
export const _scratchTrailSeedTime = new Cesium.JulianDate();

/** Per-aircraft smoothed display course — the SINGLE source of truth for the
 *  nose direction an aircraft displays (mirror of flights.js, 2026-07-03
 *  field fix). The fleet pass reads/writes it at tick cadence for untracked
 *  planes; _trackedDisplayCourse reads/writes the SAME entry per frame for
 *  the tracked plane (the fleet pass skips the tracked icao, so exactly one
 *  writer owns an entry at a time). Sharing the entry — including its slew
 *  state — keeps the tracked↔fleet handoff seamless (separate states froze
 *  the fleet entry while tracked → nose flip on click / click-away). */
export const _displayCourse = new Map();

export const _drCorrection = new Cesium.Cartesian3(0, 0, 0);

export const _drPrevRaw = new Cesium.Cartesian3();

export const _drPrevDisplay = new Cesium.Cartesian3();

/** @type {Cesium.Cartesian3} Scratch for the tracked model's rendered translation. */
export const _trackedVisualPos = new Cesium.Cartesian3();

export const _trackedTrailPos = new Cesium.Cartesian3();

/** Scratch for the tracked model's world-space origin (the envelope centre). */
export const _scratchTrailClip = new Cesium.Cartesian3();

/** Scratch for the shortened trail-head start. Owned by the head-segment
 *  callback alone, so nothing else can overwrite it mid-frame. */
export const _scratchTrailHead = new Cesium.Cartesian3();

/** @type {Cesium.Cartographic} Scratch for _trailFloorPosition (per-frame safe). */
export const _scratchTrailCarto = new Cesium.Cartographic();

/** Mutable layer state (formerly module-private `let` variables of militaryFlights.js). */
export const S = {
  /** @type {Cesium.PrimitiveCollection|null} */
  _modelCollection: null,
  /** Lifecycle epoch; bumped on destroy so an in-flight load from a PREVIOUS init can't settle
  *  against a new lifecycle's globals (which destroy cleared). Captured by _ensureModel. */
  _modelEpoch: 0,
  /** DEFAULT-ON in PROXIMITY (owner directive 2026-08-22). A fresh boot never runs
  *  layer-state restoration, so this initializer — not the codec — is what the app
  *  actually starts with; it must stay in lockstep with the `models3d` default in
  *  `layerState.js` and `this._models3dEnabled` in ui.js, or the DISPLAY rail would
  *  light a button the layer has not armed. */
  _models3dEnabled: true,
  _models3dMode: 'proximity', // 'proximity' = nearest MODEL_MAX in view; 'all' = every in-view plane (≤ MODEL_MAX_ALL)
  _lastModelCapWarnMs: 0, // throttle the "more planes in view than the cap" console notice
  // The tracked entity's billboard goes transparent (rather than hidden) once the model takes
  // over, so it keeps supplying a bounding sphere for follow-camera framing. We only drop its
  // alpha after the GLB is preloaded so the model is ready to render the instant the billboard
  // fades — no gap, no double-image. Preloaded once at init; the instance is retained (not
  // destroyed) purely to keep Cesium's glTF cache warm for fast tracked-model instantiation.
  _planeModelLoaded: false,
  /** @type {Cesium.Model|null} retained preload that keeps the glTF cache warm */
  _preloadModel: null,
  // ---------------------------------------------------------------------------
  // Module-level state
  // ---------------------------------------------------------------------------

  /** @type {Cesium.BillboardCollection|null} Single GPU-batched collection for all aircraft */
  _billboardCollection: null,
  /** @type {Map<string, Cesium.Billboard>} ICAO hex -> billboard primitive */
  _billboards: new Map(),
  /** Stable lightweight records reused by the detection overlay between polls. */
  _detectionObjects: new Map(),
  /** @type {Map<string, Object>} ICAO hex -> flight metadata (callsign, type, registration, operator, altitudeFt, speedMps, track) */
  _flightData: new Map(),
  /** @type {Map<string, Array<{time: Cesium.JulianDate, position: Cesium.Cartesian3}>>} ICAO hex -> recent position samples for dead reckoning */
  _positionHistory: new Map(),
  /** @type {number} Current number of visible aircraft */
  _count: 0,
  /** @type {number|null} Epoch ms of last successful API update */
  _lastUpdate: null,
  /** @type {boolean} True when in error-backoff mode */
  _backoff: false,
  /** @type {number} Epoch ms after which the next retry is allowed */
  _retryAt: 0,
  /** @type {string|null} Human-readable description of the last error */
  _lastError: null,
  /** @type {number|null} HTTP status code from the last API response */
  _lastStatus: null,
  /** @type {boolean} True once ensureGeoidReady() has resolved (awaited once at enable()). Mirror of flights.js. */
  _geoidReady: false,
  // -- Click-to-track state --
  /** @type {string|null} ICAO hex of the currently tracked aircraft */
  _trackedIcao: null,
  _pendingTrackingRestore: null,
  _trackingIntentGeneration: 0,
  _trackingRefreshEpoch: 0,
  _lastTrackingRefreshOutcome: {
  epoch: 0,
  status: 'unavailable',
  ids: new Set(),
  source: 'adsb.lol',
},
  /** @type {Cesium.Entity|null} Entity created for the tracked aircraft (camera follows this) */
  _trackedEntity: null,
  /** Disposes the single active tracked-camera framing owner. */
  _trackedCameraFrameStop: null,
  /** @type {Cesium.Model|null} Standalone 3D model for the tracked aircraft — NOT a graphic on
  *  _trackedEntity, so viewer.trackedEntity's follow-camera always has a ready bounding sphere
  *  (a model graphic reports PENDING until loaded, which freezes the centering on 3D-toggle). */
  _trackedModel: null,
  _trackedModelGen: 0,
  _trackedModelLoading: false,
  /** @type {Cesium.ScreenSpaceEventHandler|null} Click handler for selecting aircraft */
  _clickHandler: null,
  /** @type {Cesium.Viewer|null} Cached viewer reference */
  _viewer: null,
  /** Cockpit presentation switches ambient AIR contacts between near aircraft and far dots. */
  _cockpitContactMode: false,
  /** AIR contacts inside the selected Display range; independent from model admission/load/cap. */
  _cockpitNearContacts: new Set(),
  /** Normalized ICAO24 of the active Cockpit subject, omitted from detection candidates. */
  _cockpitSubjectId: null,
  /** @type {((event: CustomEvent) => void)|null} */
  _cockpitModeListener: null,
  /** @type {{setPositions: Function, clear: Function, destroy: Function}|null} Shared fading-trail renderer */
  _trail: null,
  /** @type {Cesium.Entity|null} Per-frame head segment: last body point → live icon */
  _trailHeadEntity: null,
  /** @type {number} Uniquifier for head-segment entity ids (Cesium requires unique ids). */
  _trailHeadSeq: 0,
  /** @type {Cesium.Cartesian3[]} Chronological tracked-aircraft fixes (oldest first) */
  _trailPositions: [],
  /** @type {number} Monotonic token — invalidates in-flight backfill responses */
  _trailBackfillToken: 0,
  /** @type {Map<string, number>} icao24 -> consecutive missed polls */
  _missingPolls: new Map(),
  /** @type {number} Epoch ms of the last fleet dead-reckoning pass */
  _lastFleetTickMs: 0,
  /** @type {string} Camera pose signature at the last rotation pass */
  _lastCamPoseSig: '',
  /** @type {number} Epoch ms of the last full rotation pass */
  _lastRotPassMs: 0,
  /** @type {number} Last computed rotation for the tracked entity (radians) */
  _lastTrackedRotation: 0,
  /** @type {Cesium.Event.RemoveCallback|null} preRender listener disposer */
  _preRenderRemove: null,
  _trackedModelPreUpdateRemove: null,
  /** @type {Cesium.Event.RemoveCallback|null} camera.moveEnd listener disposer (arrival rotation pass) */
  _moveEndRemove: null,
  /** @type {Cesium.Event.RemoveCallback|null} trackedEntityChanged listener disposer (cross-layer untrack) */
  _trackedEntityChangedRemove: null,
  // -- Per-frame dead-reckoning cache for the tracked entity --
  /** @type {Cesium.Cartesian3|null} Cached DR position for the current render frame */
  _cachedDRPosition: null,
  /** @type {number} Frame number the cache was last populated for */
  _cachedDRFrame: -1,
  /** Frame-cached course for the tracked aircraft (sibling of _cachedDRPosition). */
  _cachedDRCourse: null,
  /** Frame-cached siblings of _cachedDRCourse (same discipline). */
  _cachedDRSpeedMps: null,
  _cachedDRHold: false,
  /** Wall-clock of the tracked course limiter's last advance (dt source only —
  *  the course VALUE lives in the shared per-icao _displayCourse map below). */
  _trackedCourseMs: 0,
  _drCorrectionStartMs: 0,
  _drPrevMs: 0,
  _drReconcileValid: false,
  /** @type {string|null} icao the reconciliation state currently belongs to */
  _drReconcileIcao: null,
  /** Hysteresis latch for the tracked contact's zoom regime, plus the selection it
  *  belongs to. Scoped per selection so a NEW target re-evaluates against the ENTER
  *  ceiling instead of inheriting the previous target's looser EXIT band. */
  _trackedZoomLatched: false,
  _trackedZoomLatchIcao: null,
  _trackedModelFailIcao: null,
  _trackedModelFailCount: 0,
  _trackedModelRetryAtMs: 0,
};
