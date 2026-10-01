// Moved out of worldOverlay.js (worldOverlayCoreState).

import * as Cesium from 'cesium';
import { getUiOcclusionRects } from './worldOverlayOccluder.js';

export const _accessibleActivatorByKey = new Map();

/** @type {Map<string, object>} Source-owned painters hosted in fixed lanes. */
export const _customPaintLanes = new Map();

/** @type {Array<object>} Stable registration order for custom painters. */
export const _customPaintLaneList = [];

/** @type {Map<string, object>} */
export const _records = new Map();

export const _scratchViewProjection = new Cesium.Matrix4();

export const _viewProjectionScalars = {};

// Owned by worldOverlayOccluder.js; captured once by reference since it is
// never reallocated (pooled, allocation-free per frame).
export const _uiOcclusionRects = getUiOcclusionRects();

/** Shared, allocation-free frame contract passed to custom paint lanes. */
export const _customPaintFrame = {
  canvas: null,
  surface: null,
  ctx: null,
  width: 0,
  height: 0,
  dpr: 1,
  timestamp: 0,
  viewProjectionMatrix: _scratchViewProjection,
  viewProjection: _viewProjectionScalars,
  cameraPosition: null,
  occluder: null,
  keyhole: null,
  uiRects: _uiOcclusionRects,
  uiRectCount: 0,
  layoutRevision: 0,
};

export const _paintQueue = [];

export const _paintItemPool = [];

export const _paintRectPool = [];

export const _paintRectByKey = new Map();

export const _hitRects = [];

export const _paintedSourceKeys = [];

/** Mutable layer state (formerly module-private `let` variables of worldOverlay.js). */
export const S = {
  /** @typedef {{x:number,y:number,w:number,h:number}} OverlayRect */
  /**
  * @typedef {object} WorldOverlayEntry
  * @property {string} id Stable identity within the source.
  * @property {string} source Owning source id.
  * @property {Cesium.Cartesian3|function():Cesium.Cartesian3} position
  * @property {'label'|'track'|'card'|'thumbnail'|'selected'|'tracked'} variant
  * @property {string} [accessibilityLabel] Accessible name for an actionable card.
  * @property {function():*} [activate] Keyboard/assistive activation callback.
  */
  /**
  * @typedef {object} WorldOverlaySourceOptions
  * @property {boolean} [visible=true]
  * @property {boolean} [hideInCockpit=false]
  * @property {number} [alpha=1]
  * @property {number} [cohortLimit=256] Ambient surplus retained per domain.
  * @property {number} [collisionCapacity=96] Shared domain paint budget.
  * @property {boolean} [moving=false] Enables bounded interval re-solves.
  * @property {number} [solveIntervalMs=125]
  */

  /** @type {Cesium.Viewer|null} */
  _viewer: null,
  /** @type {HTMLElement|null} */
  _root: null,
  /** @type {HTMLCanvasElement|null} */
  _canvas: null,
  /** @type {CanvasRenderingContext2D|null} */
  _ctx: null,
  /** @type {HTMLElement|null} Focusable mirror of painted actionable cards. */
  _accessibilityRoot: null,
  /** @type {HTMLElement|null} */
  _accessibilityList: null,
  /** @type {HTMLElement|null} */
  _accessibilityStatus: null,
  _accessibilitySignature: '',
  /** @type {HTMLCanvasElement|null} Host-owned detection blend-isolation surface. */
  _detectionSurface: null,
  /** @type {CanvasRenderingContext2D|null} */
  _detectionCtx: null,
  /** @type {Function|null} */
  _removePostRender: null,
  /** @type {Function|null} */
  _removeMoveEnd: null,
  _cockpitModeHandler: null,
  _cockpitActive: false,
  /**
  * Set by `destroyWorldOverlay` when it actually tore a host down, and cleared
  * by `initWorldOverlay`. A torn-down host must not be resurrected by a late
  * source callback, so every mutating export short-circuits while this is true.
  * Destroying before the first init leaves it false, so pre-init buffering
  * keeps working.
  */
  _destroyed: false,
  _resizeDirty: true,
  _occludersDirty: true,
  _solveDirty: true,
  _canvasNeedsClear: true,
  _detectionSurfaceNeedsClear: true,
  _canvasWidth: 0,
  _canvasHeight: 0,
  _canvasDpr: 1,
  /**
  * Monotonic per-frame identity. Pooled candidate/rectangle records carry the
  * stamp of the frame that last published them, which replaces the per-frame
  * `Map.clear()` + refill cycle that reallocated a hash table every frame.
  */
  _frameStamp: 0,
  _occluder: null,
  _occluderCameraX: Number.NaN,
  _occluderCameraY: Number.NaN,
  _occluderCameraZ: Number.NaN,
  /** Cached keyhole geometry, versioned by both its box and shared tuning. */
  _keyhole: null,
  _keyholeWidth: -1,
  _keyholeHeight: -1,
  _keyholeFadeRatio: Number.NaN,
  _keyholeOutsideOpacity: Number.NaN,
  _layoutRevision: 0,
  // Live lengths of the pooled frame buffers. Pool arrays are never truncated
  // per frame, so their backing stores survive instead of being re-grown.
  _paintCount: 0,
  _paintRectCount: 0,
  _hitRectCount: 0,
  _detectionSurfacePrepared: false,
};
