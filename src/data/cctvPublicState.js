// Public camera state, UI state snapshot and listener notification.

import { CCTV_AMBIENT_CARD_MAX } from './cctvLod.js';
import { deriveCalBadge, normalizeCalibration } from './cctvCalibrationStore.js';
import { currentViewContext, isVideoFeedType, normalizeFeedType } from './cctvCatalog.js';
import { ACTIVE_FRAME_REFRESH_MS, HEALTH_ENDPOINT, HEALTH_SYNC_INTERVAL_MS, IDLE_FRAME_REFRESH_MS } from './cctvConstants.js';
import { coverageNeighborCount, getActiveRecord } from './cctvCoverage.js';
import { safeNumber, sectorAreaKm2 } from './cctvMath.js';
import { frameUrlFor, mediaUrlFor } from './cctvProjectionFrames.js';
import { S } from './cctvState.js';

/**
 * Builds a single-line summary string for the active camera, including city,
 * heading, FOV, coverage area, overlap count, projection mode, alignment
 * confidence, source type, and view context.
 * @returns {string} Summary text separated by mid-dots.
 */
function buildSummaryText() {
  const active = getActiveRecord();
  if (!active) {
    return S._records.length
      ? `${S._records.length} CAMERAS STANDING BY · NO CAMERA SELECTED · CLICK A CAMERA TO ACTIVATE`
      : 'No cameras available in catalog.';
  }

  const area = sectorAreaKm2(active.camera.rangeM, active.camera.fovDeg);
  const overlapCount = coverageNeighborCount(active);
  const viewKey = currentViewContext();
  const viewBand = viewKey.split(':')[0] || 'global';
  const health = S._healthById.get(active.camera.id) || null;
  const calBadge = deriveCalBadge(active.camera);

  return [
    `${active.camera.city.toUpperCase()} CCTV`,
    `${active.camera.name.toUpperCase()}`,
    `HDG ${Math.round(active.camera.headingDeg)}°`,
    `FOV ${Math.round(active.camera.fovDeg)}°`,
    `COVERAGE ${area.toFixed(2)}km²`,
    overlapCount > 0 ? `OVERLAP ${overlapCount} cams` : 'ISOLATED VIEW',
    `PROJ ${S._showProjection ? 'MONITOR' : 'OFF'}`,
    S._coverageMode === 'viewshed' ? 'VIEWSHED' : null,
    `CAL ${calBadge.replace('-', ' ').toUpperCase()}`,
    health?.sourceKind ? `SRC ${String(health.sourceKind).toUpperCase()}` : `SRC ${String(active.camera.feedType || 'image').toUpperCase()}`,
    `${viewBand.toUpperCase()} CONTEXT`,
  ].filter(Boolean).join(' · ');
}

/**
 * Builds a public-facing camera state object for UI consumption.
 * Includes all pose, calibration, CAL badge, projection, and feed metadata.
 * @param {Object} record - Camera record.
 * @param {string|null} [activeId=null] - Active camera ID for the `active` flag.
 * @returns {Object} Public camera state.
 */
function getPublicCameraState(record, activeId = null) {
  const resolvedActiveId = activeId || getActiveRecord()?.camera.id || null;
  const camera = record.camera;
  const health = S._healthById.get(camera.id) || null;
  const isActive = camera.id === resolvedActiveId;
  const refreshMs = isActive ? ACTIVE_FRAME_REFRESH_MS : IDLE_FRAME_REFRESH_MS;
  const isVideo = isVideoFeedType(normalizeFeedType(camera.feedType));
  return {
    id: camera.id,
    name: camera.name,
    city: camera.city,
    provider: camera.provider,
    lat: camera.lat,
    lon: camera.lon,
    headingDeg: camera.headingDeg,
    pitchDeg: camera.pitchDeg,
    fovDeg: camera.fovDeg,
    rangeM: camera.rangeM,
    elevationM: camera.absoluteHeightM,
    mountHeightM: camera.mountHeightM,
    active: isActive,
    feedType: camera.feedType,
    sourceKind: health?.sourceKind || camera.sourceKind || (camera.feedConfigured ? 'configured' : 'seed'),
    sourceStatus: health?.status || 'unknown',
    sourceMessage: health?.message || '',
    sourceLabel: health?.label || camera.provider || '',
    // What the hls.js player is really doing (connecting/live/recovering/
    // retrying/unavailable); null for image and native-HLS feeds. Health "ok"
    // only proves the playlist is reachable, not that video is decoding.
    playbackState: record.projection?.playback?.state || null,
    playbackReason: record.projection?.playback?.reason || null,
    calibration: { ...normalizeCalibration(camera.calibration) },
    // Save-gated persistence (design §3e): true while the live pose carries
    // edits that have not been SAVEd (or RESET). Drives the CAL · EDITED chip.
    calDirty: !!record.calDirty,
    // Deterministic QA seam: counts commit-grade anchor resolutions (E/N drag
    // release, numeric E/N edit, or reset), never transient gizmo moves.
    groundResolveCount: record.calibrationGroundResolveCount || 0,
    // Per-record QA seam for proving transient gizmo moves never enter the
    // shared mesh-floor sampler while unrelated catalog cells finish.
    groundMeshSampleRequestCount: record.groundMeshSampleRequestCount || 0,
    // Datum QA seam: expose the immutable Re:Earth ellipsoidal prior
    // separately from the currently applied frustum ground. Google-3D may
    // legitimately refine the latter to the rendered mesh, so callers must
    // not infer the prior by subtracting mount height from live geometry.
    groundPriorM: Number.isFinite(record.groundPrior?.ellipsoid)
      ? record.groundPrior.ellipsoid
      : null,
    intrinsics: camera.intrinsics ? { ...camera.intrinsics } : null,
    extrinsics: camera.extrinsics ? { ...camera.extrinsics } : null,
    anchor: camera.anchor ? { ...camera.anchor } : null,
    // Panel-only trust signal (design §3b, amended by LOCKED §9.2/§9.3): no
    // in-world rendering reads this, no score-based quality math backs it.
    calBadge: deriveCalBadge(camera),
    poseSource: camera.poseSource || null,
    basePose: camera.basePose ? { ...camera.basePose } : null,
    // Video/HLS cameras have no still-image candidate server-side (their
    // `url` is a manifest/video, not a JPEG) — the /frame/:id endpoint always
    // falls through to a Street View/synthetic fallback for them, which
    // unconditionally overwrites the shared per-camera health status to
    // 'degraded' even while the live stream (mediaUrl) is healthy. Omitting
    // frameUrl here stops the panel's still-image preview (_cctvFrame in
    // cctvPanelMixin.js) from polling /frame/:id for these cameras at all —
    // their live view is the mediaUrl-driven monitor plane instead.
    frameUrl: isVideo ? null : frameUrlFor(camera, refreshMs),
    mediaUrl: mediaUrlFor(camera),
    // Lets the panel (cctvPanelMixin.js) pick the <video>-mirror path over
    // the frameUrl/<img> path without re-deriving feed-type logic itself.
    isVideo,
  };
}

/**
 * Assembles the full UI state payload containing layer toggles, camera list,
 * active camera details, summary text, and error state.
 * @returns {Object} Complete UI state for subscribers.
 */
export function uiState() {
  const active = getActiveRecord();
  const activeId = active?.camera.id || null;
  const payload = {
    enabled: S._enabled,
    // Compat boolean + the full tri-state (viewshed design §3b).
    showCoverage: S._coverageMode !== 'off',
    coverageMode: S._coverageMode,
    showProjection: S._showProjection,
    calibrationMode: S._calibrationMode,
    autoHop: S._autoHop,
    autoHopSuspended: S._autoHopSuspended,
    autoHopSec: S._autoHopSec,
    count: S._count,
    lastUpdate: S._lastUpdate,
    error: S._lastError,
    loading: {
      active: S._geoLoading,
      loaded: Math.min(S._geoLoadDone, S._geoLoadTotal),
      total: S._geoLoadTotal,
    },
    // Ambient card tier telemetry (QA harnesses assert the fetch pacing —
    // minFrameFetchSpacingMs reads together with fetchMode: cold-fill bursts
    // legitimately reach ~250 ms, steady state stays >=1000 ms).
    ambientCards: {
      count: S._cardIds.size,
      limit: CCTV_AMBIENT_CARD_MAX,
      frameFetches: S._cardFetchCount,
      minFrameFetchSpacingMs: S._cardMinFetchSpacingMs,
      fetchMode: S._cardFetchMode,
      fetchesInFlight: S._cardFetchInFlightCount,
      // Item B QA seam: the hover-summoned pinned card, if any.
      hoverId: S._hoverCardId,
    },
    activeCameraId: activeId,
    activeCamera: active ? getPublicCameraState(active, activeId) : null,
    cameras: S._records.map((record) => getPublicCameraState(record, activeId)),
    summary: buildSummaryText(),
  };
  return payload;
}

/** Dispatches the current UI state to all registered subscriber callbacks. */
export function notifyListeners() {
  const payload = uiState();
  for (const callback of S._listeners) {
    try {
      callback(payload);
    } catch (error) {
      console.warn('[Data:CCTV] listener error:', error);
    }
  }
}

/**
 * Throttled notifyListeners for transient (mid-drag) calibration patches —
 * the panel re-render is DOM-heavy, so live gizmo drags publish state at
 * ≤10 Hz while the in-world geometry still tracks every processed move.
 */
export function notifyListenersThrottled() {
  const now = Date.now();
  if (now - S._lastTransientNotifyAt < 100) return;
  S._lastTransientNotifyAt = now;
  notifyListeners();
}

/**
 * Test-only seam for getPublicCameraState: builds a minimal fake `record`
 * from a raw camera object (as buildCatalogFromSources would produce) and
 * returns its public state, without requiring a live Cesium viewer/catalog.
 * @see getPublicCameraState
 */
export function _getPublicCameraStateForTest(camera, activeId = null) {
  return getPublicCameraState({ camera, calDirty: false }, activeId);
}

/**
 * Fetches per-camera health status from the backend and updates _healthById.
 * Rate-limited to HEALTH_SYNC_INTERVAL_MS unless forced.
 * @param {boolean} [force=false] - Bypass the interval check.
 */
export async function syncHealthState(force = false) {
  const now = Date.now();
  if (!force && now - S._lastHealthSyncAt < HEALTH_SYNC_INTERVAL_MS) return;
  S._lastHealthSyncAt = now;

  try {
    const resp = await fetch(HEALTH_ENDPOINT, { cache: 'no-store' });
    if (!resp.ok) return;
    const data = await resp.json();
    const rows = Array.isArray(data?.cameras) ? data.cameras : [];
    const next = new Map();
    for (const row of rows) {
      const id = String(row?.id || '').trim();
      if (!id) continue;
      next.set(id, {
        status: String(row.status || '').toLowerCase() || 'unknown',
        sourceKind: String(row.sourceKind || row.feedType || '').toLowerCase(),
        label: String(row.label || row.provider || ''),
        message: String(row.message || ''),
        updatedAt: safeNumber(row.updatedAt, now),
      });
    }
    S._healthById = next;
  } catch {
    // keep previous health map
  }
}
