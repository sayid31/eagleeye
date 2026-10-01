// Moved out of satellites.js (satellitesState).

import * as Cesium from 'cesium';
import { DEFAULT_OVERLAY_HOST } from './satellitesConstants.js';

export const _activeUpdateControllers = new Set();

export const _scratchFocusScreen = new Cesium.Cartesian2();

export const _trackedFrameCartesian = new Cesium.Cartesian3();

// Scratch variables
export const _scratchCartesian = new Cesium.Cartesian3();

export const _scratchRingRotation = new Cesium.Matrix3();

/** Frustum-visibility scratch bounding sphere (radius is irrelevant — a point test). */
export const _scratchOnScreenBS = new Cesium.BoundingSphere(new Cesium.Cartesian3(), 1.0);

/** Mutable layer state (formerly module-private `let` variables of satellites.js). */
export const S = {
  _overlayHost: DEFAULT_OVERLAY_HOST,
  // Satellite catalog: { noradId → { name, satrec, group } }
  _catalog: new Map(),
  _pointCollection: null,
  _points: new Map(),          // noradId → point primitive
  /** Stable lightweight records reused by the detection overlay between updates. */
  _detectionObjects: new Map(),
  // noradId → { primitive, gmstAtBake }
  // primitive is a one-instance Cesium.Primitive holding the ring baked in ECEF
  // at gmstAtBake; the preRender tick re-aligns it to current GMST by updating
  // its modelMatrix (rigid Z-rotation — no geometry rebuild, WS-D1).
  _orbitPaths: new Map(),
  _count: 0,
  _lastUpdate: null,
  /** @type {string|null} Surfaced feed error (e.g. CelesTrak outage) for the layer chip. */
  _lastError: null,
  _denseLoadController: null,
  _viewer: null,
  _preRenderListener: null,
  /**
  * Wall-clock fallback for the on-screen scan (see syncSatellitesRenderHold).
  * `scene.preRender` — and therefore `_preRenderTick` — only fires while
  * something is ALREADY forcing a render (a hold, camera motion, a pending
  * request); Cesium's own `Scene.render()` skips raising `preRender` whenever
  * `shouldRender` is false. Once this layer drops its own hold and the camera
  * parks, preRender stops firing entirely — nothing would ever re-run the
  * on-screen scan that could re-acquire it, so an orbiting satellite drifting
  * into frustum over a static camera would stay frozen forever. This interval
  * is the one thing that keeps ticking regardless of render mode (mirrors
  * radio.js's `_horizonTimer` solving the identical problem for its own
  * horizon-occlusion scan).
  * @type {ReturnType<typeof setInterval>|null}
  */
  _watchdogTimer: null,
  _lastPropagation: 0,
  _lastRingRotation: 0,
  _lastFocusUpdate: 0,
  /** Points whose animated emphasis remains outside the 1.0 deadband. */
  _activeFocusCount: 0,
  _enabled: false,
  // Click-to-track state
  _trackedNorad: null,
  _pendingTrackingRestore: null,
  _trackingIntentGeneration: 0,
  _trackingRefreshEpoch: 0,
  _lastTrackingRefreshOutcome: {
  epoch: 0,
  status: 'unavailable',
  failedGroups: [],
},
  _trackedEntity: null,
  _clickHandler: null,
  /** @type {Cesium.Event.RemoveCallback|null} trackedEntityChanged listener disposer (cross-layer untrack) */
  _trackedEntityChangedRemove: null,
  // Runtime params (DataLayerManager.setLayerParams path)
  _params: { catalog: 'core', showPoints: true, showOrbits: true }, // 'core' | 'dense'
  _denseIds: [],      // norad ids of dense extras, round-robin order
  _denseCursor: 0,    // next dense id to re-propagate
  _denseLoadToken: 0, // invalidates in-flight dense loads on mode flip/reload
  _denseLoadPromise: null,
  /**
  * Dense-load lifecycle: 'idle' → 'loading' → 'ready' | 'failed'.
  * The catalog param flips synchronously but the Starlink shell arrives over
  * seconds and can fail outright (CelesTrak 502s this feed regularly), so the
  * row chip reports THIS, not the param. An active chip must mean dense points
  * are actually on screen.
  */
  _denseStatus: 'idle',
  /** @type {string|null} Why the last dense load failed, for the chip tooltip. */
  _denseError: null,
  /** Bumped on every bulk catalog mutation; keys the row-legend tally cache. */
  _catalogRevision: 0,
  _classTallyCache: { revision: -1, counts: null },
  /** @type {(() => void)|null} Manager callback: "this layer's row controls changed". */
  _rowControlsListener: null,
  /** @type {Set<number>} NORAD ids co-located with the tracked satellite. */
  _dockedCompanions: new Set(),
  _lastDockedScanMs: Number.NEGATIVE_INFINITY,
  // Per-frame cache for the tracked satellite (WS-D2): dot, host readout, camera, and
  // getTrackedInfo all read one SGP4 sample per rendered frame, keyed on
  // scene.frameState.frameNumber, so they never diverge in epoch.
  _trackedFrameNumber: -1,
  _trackedFrameGeo: null, // { longitude, latitude, altitude } or null
  /** Optional deterministic clock used only by the production-frame test seam. */
  _trackedFrameNowForTest: null,
  /**
  * Cached across `_propagateAll()`'s 1 Hz cadence (see syncSatellitesRenderHold):
  * whether at least one on-screen point is currently orbiting into view. Read
  * every frame by `_preRenderTick()` at near-zero cost — recomputing it there
  * would repeat a horizon+frustum test per satellite every vsync instead of
  * once a second.
  */
  _anyPointOnScreen: true, // fail toward continuous until the first scan completes
  /** Update the explicit model only when the rounded altitude line changes. */
  /** Epoch of the last shared-context refresh for the tracked satellite. */
  _contextRefreshedAtMs: 0,
};
