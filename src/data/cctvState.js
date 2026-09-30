// Shared mutable state of the CCTV layer. The former module-private `let` variables of cctv.js live as
// properties of the single exported object `S`; the const containers are exported directly.

import * as Cesium from 'cesium';
import { DEFAULT_CCTV_OVERLAY_HOST } from './cctvConstants.js';

export const _scratchFocusScreen = new Cesium.Cartesian2();

/** @type {Set<HTMLImageElement>} in-flight fetches, detached on teardown. */
export const _cardFetchImages = new Set();

/** @type {Set<string>} camera ids with an in-flight fetch (no double-fetch). */
export const _cardFetchPendingIds = new Set();

/** Mutable layer state (formerly module-private `let` variables of cctv.js). */
export const S = {
  // ---------------------------------------------------------------------------
  // Module-scoped mutable state
  // ---------------------------------------------------------------------------
  _viewer: null,
  _billboards: null,
  _records: [],
  _recordById: new Map(),
  _coverageEntities: [],
  _projectionEntities: [],
  _enabled: false,
  _activeCameraId: null,
  _coverageMode: 'on', // 'off' | 'on' (wireframes) | 'viewshed' (color-coded volumes)
  _showProjection: true,
  _autoHop: false,
  // An explicit empty-space deselect keeps AUTO HOP configured but prevents its
  // timer from silently choosing a replacement. A later explicit activation or
  // AUTO HOP toggle-on releases the hold.
  _autoHopSuspended: false,
  _autoHopSec: 18,
  _lastHopAt: 0,
  _lastViewContext: '',
  _clickHandler: null,
  _count: 0,
  _lastUpdate: null,
  _lastHealthSyncAt: 0,
  _lastError: null,
  _healthById: new Map(),
  _calibrationById: new Map(),
  _listeners: new Set(),
  _projectionRaf: 0,
  _removeFocusAppearListener: null,
  _lastFocusStyleAt: 0,
  /** Icons whose animated emphasis remains outside the 1.0 deadband. */
  _activeFocusStyleCount: 0,
  // Staggered geometry-load queue state (see startGeometryLoadQueue).
  _geoQueue: [],
  _geoQueueTimer: 0,
  _geoLoading: false,
  _geoLoadTotal: 0,
  _geoLoadDone: 0,
  _geoProgressNotifier: null,
  // One-shot completion latch for shared floor resolution: the enable-time queue
  // can drain while DEM cells or 3D tiles are still loading. The first update()
  // tick that sees projectionTilesReady() re-enqueues unresolved records ONCE;
  // shared mesh cells remain one-shot and idle ticks stay sample-free. Reset by
  // startGeometryLoadQueue so each enable-time drain gets its own completion pass.
  _tilesReadyReenqueued: false,
  // Calibration ADJUST mode (viewshed/gizmo design §3c): while true, the active
  // camera renders the direct-manipulation gizmo. Reset on layer disable.
  _calibrationMode: false,
  _gizmo: null,
  _lastTransientNotifyAt: 0,
  // Cached handle on the active Google Photorealistic 3D Tileset, discovered
  // lazily from scene.primitives. Shared mesh-floor sampling is gated on its
  // tilesLoaded flag so a coarse-LOD miss is never baked in. Cleared when the
  // tileset is destroyed / the layer tears down.
  _activeTileset: null,
  // Task 5: last surface regime the record geometry was recomputed for. The
  // map-stack change listener compares the CURRENT regime (derived live from
  // scene.globe.show) against this so bing→osm switches (same 'terrain-globe'
  // regime) don't trigger a pointless full-catalog rewrite.
  _lastAppliedRegime: null,
  // Task 5: window listener handle for the 'gev:map-stack-changed' CustomEvent
  // main.js dispatches from MapStackController's onChange (removed in destroy).
  _mapStackListener: null,
  // Field-test fix (2026-07-06): camera.moveEnd handle for the horizon-culling
  // pass (removed in destroy). Event-driven only — never a per-frame loop, so
  // the zero-steady-state-work invariant holds.
  _horizonCullListener: null,
  // Ambient card tier state (2026-07-29 design). The card set is rebuilt only
  // on moveEnd/enable/activation (refreshAmbientCards); frame slots are STABLE
  // objects shared with the overlay host so landed frames appear without an
  // entry rebuild.
  _cardIds: new Set(),
  /** @type {Map<string,{misses:number,since:number}>} */
  _cardGraceState: new Map(),
  /** @type {Map<string,{frame:*, stamp:number, failCount:number, lastAttemptAt:number}>} */
  _cardFrameSlots: new Map(),
  _cardFetchTimer: 0,
  /** In-flight card-frame fetch count (burst allows up to 4, steady is 1). */
  _cardFetchInFlightCount: 0,
  _cardFetchCount: 0,
  _cardLastFetchAt: 0,
  _cardMinFetchSpacingMs: null,
  /** Pacer mode telemetry: 'burst' during cold fill, 'steady' after. */
  _cardFetchMode: 'steady',
  _cctvOverlayHost: DEFAULT_CCTV_OVERLAY_HOST,
  _projectionOverlayOwnerId: null,
  /**
  * Product presentation option. Shipped behavior keeps the active camera's
  * thumbnail absent because its monitor plane is the active representation.
  */
  _activeCameraCardEnabled: false,
  /** Camera id currently holding the hover-summoned pinned card (or null). */
  _hoverCardId: null,
  _hoverReleaseTimer: 0,
  _hoverLastPickAt: 0,
  // True between camera.moveStart and moveEnd — hover picking pauses while the
  // camera is in motion (picks during a flight would fight the reselection).
  _cameraMoving: false,
  _moveStartListener: null,
};
