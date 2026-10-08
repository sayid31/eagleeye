// Immutable module constants (endpoints, intervals, colors, seeds-independent tables) moved out of cctv.js.

import * as Cesium from 'cesium';
import { CCTV_CARD_FETCH_BURST_SPACING_MS } from './cctvCards.js';
import { CCTV_AMBIENT_CARD_MAX } from './cctvLod.js';
import { clearOverlaySource, hitTestWorldOverlay, setOverlayEntries, setOverlaySourceVisible } from '../overlays/worldOverlay.js';

// ---------------------------------------------------------------------------
// API endpoints
// ---------------------------------------------------------------------------
export const FRAME_ENDPOINT = '/api/cctv/frame';

export const SOURCE_ENDPOINT = '/api/cctv/sources';

export const HEALTH_ENDPOINT = '/api/cctv/health';

export const MEDIA_ENDPOINT = '/api/cctv/media';

// ---------------------------------------------------------------------------
// Timing and geometry constants
// ---------------------------------------------------------------------------
export const DEFAULT_UPDATE_INTERVAL_MS = 10000;

export const MIN_AUTO_HOP_SEC = 8;

export const MAX_AUTO_HOP_SEC = 90;

export const HEALTH_SYNC_INTERVAL_MS = 7000;

export const ACTIVE_FRAME_REFRESH_MS = 10000;

export const IDLE_FRAME_REFRESH_MS = 60000;

export const PROJECTION_ACTIVE_REFRESH_MS = 10000;

export const PROJECTION_IDLE_REFRESH_MS = 60000;

export const PROJECTION_CANVAS_WIDTH = 1920;

export const PROJECTION_CANVAS_HEIGHT = 1080;

// Downsample grid for the unchanged-frame signature (drawProjectionFrame).
// 64x36 keeps the 16:9 aspect and reads ~9 KB per check versus the 8.3 MB a
// full-resolution compare would touch.
export const FRAME_SIGNATURE_W = 64;

export const FRAME_SIGNATURE_H = 36;

export const COVERAGE_NEIGHBOR_LIMIT = 14;

export const COVERAGE_NEIGHBOR_RADIUS_KM = 1.8;

// Staggered geometry/frame loading: ground-sampled coverage geometry is
// refined in small batches (active camera first, then nearest-to-viewer) so
// enabling the layer never raycasts every camera in a single frame.
export const GEO_LOAD_BATCH_SIZE = 4;

export const GEO_LOAD_BATCH_DELAY_MS = 120;

export const GEO_TRACKING_BATCH_SIZE = 2;

export const GEO_TRACKING_BATCH_DELAY_MS = 250;

export const GEO_PROGRESS_NOTIFY_INTERVAL_MS = 300;

export const GEO_PROGRESS_NOTIFY_BATCH_LIMIT = 10;

// Throttle for placeholder repaints — the projection RAF loop must not
// re-fill a 1080p canvas on every frame while a feed image is still loading.
export const PLACEHOLDER_REPAINT_MS = 750;

// v1 key is retired dead data (owner decision #3, §9.3 — WIPE CLEAN, no
// legacy import): kept here only as a documented constant so nothing ever
// re-reads it by accident. Exported for the unit suite's "v1 is ignored"
// assertion; there is NO read path for this key anywhere in the module.
export const CCTV_CALIBRATION_STORAGE_KEY_V1 = 'gev:cctv-calibration:v1';

/** v2 store key. Entries: { values: <7-field calibration offsets>, source: 'manual', savedAt: <epoch ms> }. */
export const CCTV_CALIBRATION_STORAGE_KEY_V2 = 'gev:cctv-calibration:v2';

// H5: throttle for double-buffered canvas texture swaps (<=1Hz; each swap is a
// full 1080p texture re-upload because Cesium re-uploads only on a NEW image
// object reference).
export const PROJECTION_TEXTURE_SWAP_MS = 1000;

// Video-feed double-buffer swap rate (2026-09-22 fix — see
// refreshProjectionTextures docstring). Since the 2026-09-28 proxy-video fix
// (createProjectionProxyVideo), this only drives the FALLBACK path — used
// when canvas.captureStream is unavailable and the plane still double-buffers
// the canvas directly. Matches the 12fps budget getActiveProjectionMirrorStream
// already uses for this same canvas via captureStream(12): plenty smooth for a
// monitor plane whose upstream is already limited by ~7.5s HLS segment
// cadence, with no per-frame dependency on the video's decoded resolution
// staying constant.
export const PROJECTION_VIDEO_SWAP_MS = Math.round(1000 / 12);

export const PROJECTION_VERT_ASPECT = PROJECTION_CANVAS_WIDTH / PROJECTION_CANVAS_HEIGHT;

// V2 frustum geometry (design §2a/§6): the far-cap center + corners never sink
// below groundAlt + this clearance, so a fabricated pitch (-24°) cannot bury
// the monitor plane in the 3D tiles. Exported for the unit suite.
export const FRUSTUM_GROUND_CLEARANCE_M = 2;

// §9.1 activation obstruction probe: clamp the plane's effective range to just
// short of the first pickFromRay hit along the frustum axis, with a floor so a
// point-blank obstruction never collapses the frustum to zero. The floor is
// the old H6 monitor's 8-15 m distance band: small enough that a pitched-down
// camera whose axis meets the street ~25 m out still clamps SHORT of the hit
// (a larger floor would push the plane back through the obstruction).
export const PROBE_CLEARANCE_M = 4;

export const PROBE_MIN_RANGE_M = 12;

// Bounded wait for the enable-time ground-prior batch: warm proxy disk cache
// resolves in milliseconds; a cold/slow upstream must never hang layer init,
// so past this budget init proceeds on catalog fallbacks and the batch applies
// post-hoc (applyLateGroundPriors) when it lands.
export const GROUND_PRIOR_INIT_WAIT_MS = 8000;

/** Default calibration offsets — all zeroed, range scale 1x. */
export const DEFAULT_CAMERA_CALIBRATION = Object.freeze({
  offsetNorthM: 0,
  offsetEastM: 0,
  headingDeg: 0,
  pitchDeg: 0,
  fovDeg: 0,
  rangeScale: 1,
  heightM: 0,
});

/** Base64-encoded SVG camera icon for billboard rendering. */
export const CAMERA_ICON = (() => {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 36 36">
    <defs>
      <linearGradient id="lens" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#c9f6ff"/>
        <stop offset="45%" stop-color="#6fd9ff"/>
        <stop offset="100%" stop-color="#1a5f78"/>
      </linearGradient>
    </defs>
    <g transform="translate(4 6)">
      <rect x="0" y="8" width="20" height="9" rx="2.5" fill="#0e1720" stroke="#75e7ff" stroke-width="1.2"/>
      <rect x="17" y="10" width="10" height="5" rx="1.5" fill="#132433" stroke="#75e7ff" stroke-width="1"/>
      <circle cx="24" cy="12.5" r="3.1" fill="url(#lens)" stroke="#dbfbff" stroke-width="0.8"/>
      <rect x="6.4" y="17" width="4.2" height="8.5" rx="1.2" fill="#10212d" stroke="#75e7ff" stroke-width="1"/>
      <rect x="4.2" y="24" width="8.6" height="2.5" rx="1.1" fill="#0b151d" stroke="#4ecde7" stroke-width="0.8"/>
    </g>
  </svg>`;
  return 'data:image/svg+xml;base64,' + btoa(svg);
})();

// ---------------------------------------------------------------------------
// Visual style constants
// ---------------------------------------------------------------------------
export const IDLE_CAMERA_COLOR = Cesium.Color.fromCssColorString('#6be8ff').withAlpha(0.88);

export const ACTIVE_CAMERA_COLOR = Cesium.Color.fromCssColorString('#ffd97a').withAlpha(0.95);

export const IDLE_COVERAGE_COLOR = Cesium.Color.fromCssColorString('#2fe0ff').withAlpha(0.24);

export const IDLE_COVERAGE_CENTER_MUTED = Cesium.Color.fromCssColorString('#2fe0ff').withAlpha(0.2);

export const IDLE_COVERAGE_EDGE_MUTED = Cesium.Color.fromCssColorString('#2fe0ff').withAlpha(0.18);

export const ACTIVE_COVERAGE_EDGE = Cesium.Color.fromCssColorString('#8dff87').withAlpha(0.58);

export const ACTIVE_COVERAGE_CENTER = Cesium.Color.fromCssColorString('#d7ff8d').withAlpha(0.82);

// H6: dimmer depth-fail materials let the active frustum wireframe read
// through buildings while in monitor fallback mode.
export const ACTIVE_COVERAGE_EDGE_DEPTHFAIL = Cesium.Color.fromCssColorString('#8dff87').withAlpha(0.18);

export const ACTIVE_COVERAGE_CENTER_DEPTHFAIL = Cesium.Color.fromCssColorString('#d7ff8d').withAlpha(0.26);

export const PLANE_OUTLINE_COLOR = Cesium.Color.fromCssColorString('#6be8ff').withAlpha(0.55);

/**
 * Card budget while the staggered geometry drain is running — the raised
 * 20/28/40 tiers resume when loading completes (see refreshAmbientCards).
 */
export const CCTV_AMBIENT_CARD_DRAIN_CAP = 16;

// Global static-frame pacing (owner finding 3): the pacer ticks at the burst
// spacing (250 ms) but cardFetchPolicy gates launches — cold fill (selected
// cards still missing their FIRST frame) allows up to 4 in-flight fetches at
// 250 ms spacing; steady state keeps the salvaged Part C gate of at most one
// request per second with an in-flight fetch blocking the tick, so slow
// responses only lower the rate.
export const CARD_FETCH_TICK_MS = CCTV_CARD_FETCH_BURST_SPACING_MS;

// In-view margin so cards whose anchors sit just beyond an edge don't churn
// while the operator makes minor camera adjustments (Part C recordIsInView).
export const CARD_VIEW_MARGIN = 0.06;

/** Card leader gap: clears the 24px icon (12px half + breathing room). */
export const CARD_GAP_PX = 16;

export const CCTV_OVERLAY_SOURCE_OPTIONS = Object.freeze({
  cohortLimit: CCTV_AMBIENT_CARD_MAX,
  collisionCapacity: CCTV_AMBIENT_CARD_MAX,
  moving: true,
  solveIntervalMs: 125,
});

export const CCTV_PROJECTION_OVERLAY_SOURCE_ID = 'cctv-projection';

export const CCTV_PROJECTION_OVERLAY_SOURCE_OPTIONS = Object.freeze({
  cohortLimit: 1,
  collisionCapacity: 0,
  moving: false,
});

export const DEFAULT_CCTV_OVERLAY_HOST = Object.freeze({
  clearSource: clearOverlaySource,
  hitTest: hitTestWorldOverlay,
  setEntries: setOverlayEntries,
  setVisible: setOverlaySourceVisible,
});

// Hover-summoned card (owner round 2, item B): pointing at a cardless camera
// icon shows its card immediately as a PINNED entry (budget-exempt, top
// draw-pass declutter priority).
/** Min spacing between hover scene.pick calls (event-driven, user gesture). */
export const HOVER_PICK_THROTTLE_MS = 120;

/** How long the hover card lingers after the pointer leaves the icon. */
export const HOVER_RELEASE_MS = 1_000;

// Wireframe-only z-fighting guard: the 4 corner rays terminate exactly on the
// far-cap plane (weld invariant locked by the "corner/plane coincidence"
// test), and per computeFrustumGeometry's own doc comment the BOTTOM pair may
// sit below groundAlt — right where the ray crosses close to (or through)
// terrain/3D-tile geometry along most of its length, not just at the
// endpoint. On GPUs with lower depth-buffer precision (integrated laptop
// GPUs; not reproducible on this session's iMac) that near-coincident depth
// flickers per frame. Same fix family already used for vessel trails
// (VESSEL_LIFT_M, src/data/aisLiveVessels.js) and ground-floor clamps
// (GROUND_FLOOR_LIFT_M, src/data/groundFloor.js): lift the corner/mount
// vertices a small constant distance along the local surface normal.
// The viewshed FILL VOLUME (createFrustumVolumePrimitive) is built from
// these same lifted corners on purpose — it's a solid surface with the same
// terrain-coincidence exposure as the wireframe, and it must stay welded to
// the wireframe it accompanies (frustumVolumeGeometryData's own doc:
// "the same 5 Cartesians the wireframe draws"), so lifting one without the
// other would separate them visibly instead of just moving both off the
// ground together. Only capCenter is left unlifted: it drives the monitor
// PLANE (an opaque textured rectangle, not a thin line/volume skin, so it
// isn't exposed to this failure mode) and the geometric coincidence tests
// assert plane/corner alignment against the true unlifted geometry.
export const WIREFRAME_ZFIGHT_LIFT_M = 0.75;

// Bounds on hls.js's own bounded internal retries (see below) before we give
// up and tear the player down entirely. These unofficial upstreams (measured
// 2026-09-14: segment fetch time through our proxy ranged 1-14s against a
// ~7.5s segment duration, i.e. sometimes slower than real-time) throw
// transient fatal network/media errors under normal operation, not just on
// a genuine outage — destroying the player on the first one (the prior
// behavior) meant a single slow segment could permanently freeze the plane
// until the camera was reselected. A handful of retries absorbs that without
// retrying forever against a camera that's actually gone.
export const HLS_MAX_NETWORK_ERROR_RECOVERIES = 5;

export const HLS_MAX_MEDIA_ERROR_RECOVERIES = 3;

// A tab hidden at least this long gets its active HLS feed restarted on return
// (cctvHlsVisibility.js). Set above the shortest measured upstream live window
// (~7.5 s, Surabaya) so a hide long enough to outlive the playlist always
// reloads, while a quick tab flick does not cost a rebuffer.
export const HLS_RELOAD_AFTER_HIDDEN_MS = 10_000;

// Self-healing HLS player (cctvHlsSelfHeal.js). Once hls.js's own bounded
// recoveries above are spent the player is rebuilt from scratch instead of
// being left dead until the camera is reselected, with exponential backoff so
// a camera that is really down is probed gently. A camera the proxy already
// reports as offline is probed even more slowly.
export const HLS_REATTACH_BASE_DELAY_MS = 2_000;
export const HLS_REATTACH_MAX_DELAY_MS = 30_000;
export const HLS_REATTACH_OFFLINE_MAX_DELAY_MS = 120_000;

// A playing feed that buffers no fragment and advances no playhead for this
// long is treated as stalled. Above the slowest measured segment fetch through
// the proxy (14 s, 2026-09-14) plus one 10 s target duration of slack.
export const HLS_STALL_RESTART_MS = 25_000;
export const HLS_STALL_CHECK_MS = 5_000;

// Above the slowest measured segment fetch through the proxy (14 s, 2026-09-14)
// so a slow but working feed is not rebuilt in a loop.
// A feed that has been connecting or recovering this long without a single
// fragment reaching the buffer is reported as "no data from source" and the
// player is rebuilt. Covers sources that answer 200 with an empty playlist
// (jmlive.jasamarga.com, measured 2026-10-08), where hls.js / the native player
// can sit waiting without ever raising an error.
export const HLS_CONNECT_TIMEOUT_MS = 20_000;
