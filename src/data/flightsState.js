// Moved out of flights.js (flightsState).

import * as Cesium from 'cesium';

/** Per-class model spec. Hangar-fleet classes (CLASS_MODEL_REAL) ship GLBs
 *  vertex-baked to real-world METERS in the airplane.glb axis convention, so
 *  they render at scale 1 with their own measured belly lift and bounding
 *  radius. Every other class keeps the shared-airplane.glb formula
 *  (MODEL_SCALE × CLASS_SCALE_3D). nativeRadiusM is PER SCALE UNIT — pixel-cap
 *  math multiplies it by `scale`, so world radius = nativeRadiusM × scale in
 *  both branches. The code-side MIX tint dominates every existing asset so
 *  class silhouettes stay light without modifying third-party GLBs/textures. */
/*  Specs are static per class, and the detection weld now asks for one per
 *  MODELED contact per frame (up to the fleet cap) on top of the 12 Hz fleet
 *  pass — so this is memoized, as militaryFlights.js already does. */
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

/** DEV-only explicit-position contacts used by qa-focus-evidence.mjs. */
export const _focusEvidenceIds = new Set();

/** @type {Map<string, number>} icao24 -> geoid undulation N (m), cached (negligible drift per-aircraft). */
export const _geoidNCache = new Map();

export const _activeUpdateControllers = new Set();

// ---------------------------------------------------------------------------
// Scratch (reusable) variables — avoid per-frame heap allocation
// ---------------------------------------------------------------------------

export const _scratchCarto = new Cesium.Cartographic();

export const _scratchFleetPos = new Cesium.Cartesian3();

export const _scratchDrRaw = new Cesium.Cartesian3();

export const _trackedPosHolder = new Cesium.Cartesian3();

/** Scratch for _startTrail's seed-render-time cutoff (outside deadReckoning.js's
 *  own internal scratch of the same name — that one is private to the engine). */
export const _scratchTrailSeedTime = new Cesium.JulianDate();

/** Per-aircraft smoothed display course — the SINGLE source of truth for the
 *  nose direction an aircraft displays. The fleet pass reads/writes it at
 *  tick cadence for untracked planes; _trackedDisplayCourse reads/writes the
 *  SAME entry per frame for the tracked plane (the fleet pass skips the
 *  tracked icao, so exactly one writer owns an entry at a time). Sharing the
 *  entry — including its slew state — is what makes the tracked↔fleet
 *  handoff seamless (2026-07-03 field fix: separate states froze the fleet
 *  entry while tracked, so clicking / un-clicking a 65 kt helicopter FLIPPED
 *  its nose — "looks like it's going in reverse"). */
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

/** @type {Cesium.Cartographic} Scratch for the grounded display-floor read. */
export const _scratchDisplayCarto = new Cesium.Cartographic();

/** @type {Map<string, {cell: {lat: number, lon: number}, effectiveM: number|null,
 *  in: Cesium.Cartesian3, out: Cesium.Cartesian3|null, heldM: number|null,
 *  heldCell: {lat: number, lon: number}|null,
 *  heldTier: 'own'|'neighbor'|null, heldActive: boolean, seeded: boolean,
 *  probeMs: number|null, retiredMs: number|null,
 *  easedM: number|null, easeMs: number|null}>} Per-grounded-contact
 *  display-floor state: the cell it is currently reading (boundary hysteresis),
 *  the last input position and the effective floor that produced the cached
 *  output (rebuild skip), the last floor that actually RESOLVED for it plus the
 *  tier it came from (the hold, below), whether that floor is a REHYDRATED SEED
 *  rather than something measured while the contact stood here (`seeded` — it
 *  ranks below live evidence), and the value the downward ease is currently
 *  displaying while it approaches a lower floor.
 *  Dropped with the contact, and whenever it stops being a grounded billboard. */
export const _displayFloorState = new Map();

/** @type {Cesium.Cartographic} Scratch for the corridor's display-end read. */
export const _scratchCorridorCarto = new Cesium.Cartographic();

/** @type {Cesium.Cartesian3} Scratch for the corridor's dead-reckon probe. */
export const _scratchCorridorPos = new Cesium.Cartesian3();

/** Mutable layer state (formerly module-private `let` variables of flights.js). */
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
  // Module-level state: billboard collection and per-aircraft lookup maps
  // ---------------------------------------------------------------------------

  /** @type {Cesium.BillboardCollection|null} */
  _billboardCollection: null,
  /** @type {Map<string, Cesium.Billboard>} icao24 -> billboard primitive */
  _billboards: new Map(),
  /** Stable lightweight records reused by the detection overlay between polls. */
  _detectionObjects: new Map(),
  /** @type {Map<string, {callsign:string, altitude:number, velocity:number, true_track:number}>} */
  _flightData: new Map(),
  /** @type {Map<string, Array<{time:Cesium.JulianDate, position:Cesium.Cartesian3}>>} */
  _positionHistory: new Map(),
  /** @type {boolean} True once ensureGeoidReady() has resolved (awaited once at enable()) */
  _geoidReady: false,
  /** @type {number} Current number of visible aircraft */
  _count: 0,
  /** @type {number|null} Epoch ms of last successful API update */
  _lastUpdate: null,
  /** @type {boolean} True while in a backoff/cooldown window */
  _backoff: false,
  /** @type {number} Epoch ms — earliest time the next fetch is allowed */
  _retryAt: 0,
  /** @type {string|null} Human-readable error string shown in stats chip */
  _lastError: null,
  /** @type {number|null} HTTP status of the most recent API response */
  _lastStatus: null,
  /** @type {string} Source used by the latest successful snapshot. */
  _lastSource: 'OpenSky Network',
  /** @type {string} Completeness boundary for the latest successful snapshot. */
  _lastCoverage: 'worldwide upstream snapshot',
  // ---------------------------------------------------------------------------
  // Click-to-track state
  // ---------------------------------------------------------------------------

  /** @type {string|null} ICAO24 of the currently tracked aircraft */
  _trackedIcao: null,
  _pendingTrackingRestore: null,
  _trackingIntentGeneration: 0,
  _trackingRefreshEpoch: 0,
  _lastTrackingRefreshOutcome: {
  epoch: 0,
  status: 'unavailable',
  ids: new Set(),
  source: 'OpenSky Network',
  coverage: null,
},
  /** @type {Cesium.Entity|null} Entity used for camera tracking */
  _trackedEntity: null,
  /** Disposes the single active tracked-camera framing owner. */
  _trackedCameraFrameStop: null,
  /** @type {Cesium.Model|null} Standalone 3D model for the tracked aircraft. Deliberately NOT a
  *  graphic on _trackedEntity: viewer.trackedEntity derives the follow-camera from the entity's
  *  bounding sphere, and a model graphic reports PENDING until its glTF loads — which stalls (or, on
  *  3D-toggle, freezes) the centering. A pure-billboard entity always supplies a ready sphere; the
  *  model rides in _modelCollection and is driven per-frame, fully decoupled from the camera. */
  _trackedModel: null,
  /** Bumped on untrack/teardown so an in-flight tracked-model load resolves into a no-op. */
  _trackedModelGen: 0,
  _trackedModelLoading: false,
  /** @type {Cesium.ScreenSpaceEventHandler|null} Click handler on the scene canvas */
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
  /** @type {Cesium.Entity|null} Cheap 2-point head segment bridging the last fix to the LIVE
  *  dead-reckoned icon, updated per frame via a CallbackProperty — so the trail head stays
  *  glued to the 12 Hz icon without rebuilding the 400-point trail primitive every frame. */
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
  /** @type {(() => void)|null} militaryRegistry active-transition unsubscribe (M2 handoff sweep) */
  _milActiveChangeUnsub: null,
  // ---------------------------------------------------------------------------
  // Per-frame cache for the tracked entity's dead-reckoned position.
  // The position, alignedAxis, and rotation CallbackProperties all fire each
  // render frame; caching avoids running _dr.deadReckon three times.
  // ---------------------------------------------------------------------------

  /** @type {Cesium.Cartesian3|null} */
  _cachedDRPosition: null,
  /** @type {number} Frame number for which _cachedDRPosition is valid */
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
  /** @type {number} Poll counter handed to the corridor allocator: it rotates
  *  runs of EQUALLY needy contacts so a tie larger than the budget cycles across
  *  polls instead of the same prefix winning forever. */
  _corridorEpoch: 0,
};
