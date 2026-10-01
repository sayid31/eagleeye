// Ambient thumbnail cards, hover card and card frame fetch loop.

import { CCTV_CARD_FETCH_BURST_LIMIT, CCTV_FRAME_CANVAS_H, CCTV_FRAME_CANVAS_W, CCTV_OVERLAY_SOURCE_ID, applyFrameResult, cardFetchPolicy, createCctvThumbnailOverlayEntry, createFrameSlot, declutterCctvCards, frameFetchDue, planFrameCachePrune } from './cctvCards.js';
import * as Cesium from 'cesium';
import { horizonOccluder } from './iconOrientation.js';
import { applyEvictionGrace, selectCctvLod, staticFrameRefreshMs } from './cctvLod.js';
import { extractPickedCameraId } from './cctvActivation.js';
import { isVideoFeedType, normalizeFeedType } from './cctvCatalog.js';
import { CARD_FETCH_TICK_MS, CARD_GAP_PX, CARD_VIEW_MARGIN, CCTV_AMBIENT_CARD_DRAIN_CAP, CCTV_OVERLAY_SOURCE_OPTIONS, DEFAULT_CCTV_OVERLAY_HOST, HOVER_PICK_THROTTLE_MS, HOVER_RELEASE_MS } from './cctvConstants.js';
import { haversineKm } from './cctvMath.js';
import { frameUrlFor } from './cctvProjectionFrames.js';
import { S, _cardFetchImages, _cardFetchPendingIds } from './cctvState.js';

/** Test seam: republishes host entries through the real push path, so tests
 * can observe the pristine module default without touching the setter. */
export function _pushAmbientCardEntriesForTest() {
  pushAmbientCardEntries();
}

/** Test seam for exercising real layer lifecycle paths without a DOM host. */
export function _setCctvOverlayHostForTest(host = null) {
  S._cctvOverlayHost = host ? { ...DEFAULT_CCTV_OVERLAY_HOST, ...host } : DEFAULT_CCTV_OVERLAY_HOST;
  S._projectionOverlayOwnerId = null;
}

/**
 * Configures optional CCTV card presentation without changing card density.
 * The active-camera thumbnail defaults OFF, preserving the shipped behavior
 * where the monitor plane is the camera's sole active representation.
 *
 * @param {Object} [options]
 * @param {boolean} [options.activeCameraCardEnabled=false]
 * @returns {{activeCameraCardEnabled:boolean}}
 */
export function setCctvCardPresentationOptions({ activeCameraCardEnabled = false } = {}) {
  S._activeCameraCardEnabled = activeCameraCardEnabled === true;
  if (S._enabled) pushAmbientCardEntries();
  S._viewer?.scene?.requestRender?.();
  return { activeCameraCardEnabled: S._activeCameraCardEnabled };
}

// ---------------------------------------------------------------------------
// Ambient card tier (2026-07-29 design — spec:
// docs/superpowers/specs/2026-07-29-cctv-ambient-cards-design.md)
// ---------------------------------------------------------------------------

/** Returns (creating on demand) the stable frame slot for a camera id. */
function ensureCardFrameSlot(cameraId) {
  let slot = S._cardFrameSlots.get(cameraId);
  if (!slot) {
    slot = createFrameSlot();
    S._cardFrameSlots.set(cameraId, slot);
  }
  return slot;
}

/**
 * Rebuilds the ambient card selection: horizon + in-view projection of the
 * catalog (pure math — no scene queries), the zoom-budgeted nearest-first
 * LOD pick, greedy screen-space declutter, and the eviction-grace pass that
 * keeps budget-edge cards alive across small camera moves (zero-flicker).
 * Runs on camera.moveEnd, enable, activation change, and the one-shot
 * geometry-drain completion — NEVER per frame. The active camera is excluded
 * from the ambient selection/quota. By default its monitor plane is the sole
 * active representation; the optional protected-card path is applied only by
 * `pushAmbientCardEntries`. Camera icons are never touched here (cards
 * annotate markers, they don't replace them).
 */
export function refreshAmbientCards() {
  if (!S._enabled || !S._viewer || S._viewer.isDestroyed() || !S._records.length) {
    S._cctvOverlayHost.setEntries(CCTV_OVERLAY_SOURCE_ID, [], CCTV_OVERLAY_SOURCE_OPTIONS);
    return;
  }
  const scene = S._viewer.scene;
  const carto = S._viewer.camera.positionCartographic;
  const viewerLat = carto ? Cesium.Math.toDegrees(carto.latitude) : 0;
  const viewerLon = carto ? Cesium.Math.toDegrees(carto.longitude) : 0;
  // The active camera is excluded from ambient selection ALWAYS (not just
  // after its async activation settles). It is published separately in the
  // protected lane below, and grace never applies to it.
  const activeId = S._activeCameraId;
  const occluder = horizonOccluder(S._viewer.camera);
  const width = scene.canvas.clientWidth || scene.canvas.width || 0;
  const height = scene.canvas.clientHeight || scene.canvas.height || 0;
  const marginX = width * CARD_VIEW_MARGIN;
  const marginY = height * CARD_VIEW_MARGIN;

  const candidates = [];
  const screenById = new Map();
  for (const record of S._records) {
    const id = record.camera.id;
    if (id === activeId || !record.position) continue;
    let inView = false;
    let sx = NaN;
    let sy = NaN;
    if (occluder.isPointVisible(record.position)) {
      const screen = scene.cartesianToCanvasCoordinates(record.position);
      if (screen && Number.isFinite(screen.x) && Number.isFinite(screen.y)
        && screen.x >= -marginX && screen.x <= width + marginX
        && screen.y >= -marginY && screen.y <= height + marginY) {
        inView = true;
        sx = screen.x;
        sy = screen.y;
        screenById.set(id, { sx, sy });
      }
    }
    candidates.push({
      id,
      distanceKm: haversineKm(viewerLat, viewerLon, record.camera.lat, record.camera.lon),
      inView,
      isVideo: isVideoFeedType(normalizeFeedType(record.camera.feedType)),
      sx,
      sy,
    });
  }

  // Owner finding 4: current card holders rank with the 20% incumbency
  // distance discount, so a small camera move never batch-swaps the ring.
  // Item C: passing the viewport dims + per-candidate screen anchors routes
  // the budget fill through the screen-distribution grid, so periphery
  // cells hold cards instead of everything clustering at screen center.
  const { cardIds, budgets } = selectCctvLod(candidates, {
    cameraHeightM: carto?.height,
    incumbentIds: S._cardIds,
    viewW: width,
    viewH: height,
  });
  // Like the cold-fill burst, card density yields to the staggered geometry
  // drain: painting the raised 20/28/40 budget per frame starves the
  // frame-paced mesh-floor queue on weak GPUs (qa-cctv-v2 N=800 drain-budget
  // regression). During the initial load the budget holds at the low tier;
  // full density arrives the moment the drain completes (which triggers its
  // own refreshAmbientCards pass).
  const cardLimit = S._geoLoading
    ? Math.min(budgets.cardLimit, CCTV_AMBIENT_CARD_DRAIN_CAP)
    : budgets.cardLimit;
  const decluttered = declutterCctvCards(
    cardIds
      .filter((id) => screenById.has(id))
      .slice(0, cardLimit)
      .map((id, index) => ({
        id,
        ...screenById.get(id),
        // Priority carrier, not kilometers: declutter sorts ascending on
        // this field, and the selection's order (distribution + incumbency)
        // must survive — a periphery cell-winner must not be re-outranked
        // by central proximity when two anchors contest the min separation.
        distanceKm: index,
      })),
    { limit: cardLimit }
  );
  // Owner finding 2: grace must never apply to the active camera — drop any
  // lingering grace entry and keep it out of the retained-card baseline.
  if (activeId) {
    S._cardIds.delete(activeId);
    S._cardGraceState.delete(activeId);
  }
  const retention = applyEvictionGrace({
    selectedIds: decluttered,
    builtIds: [...S._cardIds],
    graceState: S._cardGraceState,
    nowMs: Date.now(),
    cardLimit: budgets.cardLimit,
  });
  S._cardIds = new Set(retention.keepIds);
  S._cardGraceState = retention.graceState;

  // Bounded thumbnail LRU: live cards (grace included) never lose their
  // persisted frame — that persistence IS the no-flicker guarantee. The
  // hover card's slot is protected too while the gesture lasts.
  const keepFrames = new Set(S._cardIds);
  if (S._hoverCardId) keepFrames.add(S._hoverCardId);
  if (S._activeCameraCardEnabled && S._activeCameraId) keepFrames.add(S._activeCameraId);
  const drops = planFrameCachePrune(
    [...S._cardFrameSlots].map(([id, slot]) => ({ id, stamp: slot.stamp })),
    keepFrames
  );
  for (const id of drops) S._cardFrameSlots.delete(id);

  pushAmbientCardEntries();
}

/**
 * Builds and publishes the card entry list from the current kept set and the
 * hover-summoned pin. The hover entry is budget-exempt and high-priority. The
 * active camera is absent by default; `activeCameraCardEnabled` retains the
 * migrated protected-publication path as an explicit product option. If the
 * LOD selection adopts the hovered camera it remains a normal budgeted entry
 * that keeps the pin while the gesture lasts.
 */
function pushAmbientCardEntries() {
  const entries = [];
  let rank = 0;
  const push = (id, { pinned = false, active = false } = {}) => {
    const record = S._recordById.get(id);
    if (!record?.position) return;
    entries.push(createCctvThumbnailOverlayEntry({
      id,
      position: record.position,
      gapPx: CARD_GAP_PX,
      title: record.camera.name,
      frameSlot: ensureCardFrameSlot(id),
      rank: rank++,
      pinned,
      active,
    }));
  };
  for (const id of S._cardIds) push(id, { pinned: id === S._hoverCardId });
  if (S._hoverCardId && !S._cardIds.has(S._hoverCardId) && S._hoverCardId !== S._activeCameraId) {
    push(S._hoverCardId, { pinned: true });
  }
  if (S._activeCameraCardEnabled && S._activeCameraId) {
    push(S._activeCameraId, { active: true });
  }
  S._cctvOverlayHost.setEntries(
    CCTV_OVERLAY_SOURCE_ID,
    entries,
    CCTV_OVERLAY_SOURCE_OPTIONS,
  );
}

/**
 * Throttled MOUSE_MOVE hover pass (owner round 2, item B): pointing at a
 * camera icon that has no card summons its card immediately. This is
 * EVENT-DRIVEN picking on a user gesture, not steady-state work — the
 * ≥120 ms throttle caps it at ~8 scene.pick calls/s while the pointer is
 * actually moving (a still pointer costs nothing), so it can never approach
 * per-frame cost. Skipped while the camera is in motion, while ADJUST mode
 * owns the pointer (gizmo drags), and while the layer is disabled.
 * @param {Cesium.Cartesian2} position - Pointer position (CSS px).
 */
export function handleHoverMove(position) {
  if (!S._enabled || S._cameraMoving || S._calibrationMode || !position) return;
  if (!S._viewer || S._viewer.isDestroyed()) return;
  const now = Date.now();
  if (now - S._hoverLastPickAt < HOVER_PICK_THROTTLE_MS) return;
  S._hoverLastPickAt = now;
  let picked = null;
  try {
    picked = S._viewer.scene.pick(position);
  } catch {
    picked = null;
  }
  const cameraId = extractPickedCameraId(picked);
  if (cameraId && cameraId === S._hoverCardId) {
    // Still on the hovered camera — keep the card alive.
    cancelHoverRelease();
    return;
  }
  const record = cameraId ? S._recordById.get(cameraId) : null;
  // Hovering the active camera or a camera that already has a card is a
  // no-op; video feeds stay icon-only until activated (ambient tier is
  // stills-only — same rule as the LOD selection).
  const eligible = !!record
    && cameraId !== S._activeCameraId
    && !S._cardIds.has(cameraId)
    && !isVideoFeedType(normalizeFeedType(record.camera.feedType));
  if (eligible) {
    cancelHoverRelease();
    S._hoverCardId = cameraId;
    // Immediacy: the pinned entry publishes now — chrome may paint before
    // the first frame arrives (documented exception in cctvCards.js).
    pushAmbientCardEntries();
    hoverFetchCardFrame(record);
  } else if (S._hoverCardId) {
    // Pointer left the hovered icon: linger ~1 s, then release.
    scheduleHoverRelease();
  }
}

/** Cancels a pending hover-card release. */
function cancelHoverRelease() {
  if (S._hoverReleaseTimer) {
    clearTimeout(S._hoverReleaseTimer);
    S._hoverReleaseTimer = 0;
  }
}

/**
 * Schedules the hover card's release ~1 s after unhover. On release the pin
 * drops; the card stays only if the LOD selection has adopted the camera
 * (it is then a normal budgeted entry in `_cardIds`).
 */
function scheduleHoverRelease() {
  if (S._hoverReleaseTimer) return;
  S._hoverReleaseTimer = setTimeout(() => {
    S._hoverReleaseTimer = 0;
    S._hoverCardId = null;
    pushAmbientCardEntries();
  }, HOVER_RELEASE_MS);
}

/** Clears the hover-card state (teardown / activation of the hovered camera). */
export function clearHoverCard() {
  cancelHoverRelease();
  S._hoverCardId = null;
  S._hoverLastPickAt = 0;
}

/**
 * Fast-tracked frame fetch for the hover-summoned card: launches
 * immediately, bypassing the pacer's launch-spacing gate (a single
 * user-gesture fetch is fine even during the geometry drain), but still
 * respecting the per-camera failure backoff / freshness check
 * (frameFetchDue), the no-double-fetch pending set, and the burst in-flight
 * cap of 4.
 * @param {Object} record - The hovered camera's record.
 */
function hoverFetchCardFrame(record) {
  const cameraId = record.camera.id;
  if (_cardFetchPendingIds.has(cameraId)) return;
  if (S._cardFetchInFlightCount >= CCTV_CARD_FETCH_BURST_LIMIT) return;
  const slot = ensureCardFrameSlot(cameraId);
  const refreshMs = staticFrameRefreshMs(record.camera);
  if (!frameFetchDue(slot, refreshMs, Date.now())) return;
  fetchCardFrame(record, slot, refreshMs, { userGesture: true });
}

/**
 * Card-frame pacer tick (owner finding 3): launches AT MOST one fetch per
 * tick, with cardFetchPolicy deciding whether a launch is allowed. Cold fill
 * — any selected card still missing its FIRST frame — bursts up to 4
 * in-flight fetches at 250 ms spacing so arriving in a new area populates
 * in a few seconds instead of 16-32 s; once every selected card has a first
 * frame the layer drops back to the salvaged steady-state gate (single
 * flight, one request per second). Priority: frameless cards first in ring
 * order (nearest-first — they're what makes a card appear at all), then the
 * stalest refresh-overdue card by its source cadence (staticFrameRefreshMs).
 * Failures back off per camera (frameFetchDue) instead of hammering a dead
 * source, so a dead upstream never eats the burst slots.
 */
function cardFrameTick() {
  if (!S._enabled || (!S._cardIds.size && !(S._activeCameraCardEnabled && S._activeCameraId))) return;
  const now = Date.now();
  let frameless = null;
  let stalest = null;
  let coldFill = false;
  const consider = (id) => {
    const record = S._recordById.get(id);
    if (!record) return;
    const slot = ensureCardFrameSlot(id);
    if (_cardFetchPendingIds.has(id)) {
      // An in-flight first-frame fetch keeps cold-fill mode active without
      // being re-launchable.
      if (!(slot.stamp > 0)) coldFill = true;
      return;
    }
    const refreshMs = staticFrameRefreshMs(record.camera);
    if (!frameFetchDue(slot, refreshMs, now)) return;
    if (!(slot.stamp > 0)) {
      coldFill = true;
      if (!frameless) frameless = { record, slot, refreshMs };
      return;
    }
    if (!stalest || slot.stamp < stalest.slot.stamp) {
      stalest = { record, slot, refreshMs };
    }
  };
  // The optional protected active card stays outside the 40-card ambient
  // quota and uses the same source-owned pacing/retry/cache lifecycle.
  if (S._activeCameraCardEnabled && S._activeCameraId) consider(S._activeCameraId);
  for (const id of S._cardIds) consider(id);
  const policy = cardFetchPolicy({
    // The cold-fill burst yields to the staggered geometry drain: 4 concurrent
    // image fetch+decodes mid-drain starve the mesh-floor queue on weak GPUs
    // (qa-cctv-v2 drain-budget regression). Steady 1/s trickle still runs;
    // the burst fires the moment the drain completes.
    coldFill: coldFill && !S._geoLoading,
    inFlight: S._cardFetchInFlightCount,
    sinceLastLaunchMs: S._cardLastFetchAt > 0 ? now - S._cardLastFetchAt : Infinity,
  });
  S._cardFetchMode = policy.mode;
  if (!policy.launch) return;
  const pick = frameless || stalest;
  if (pick) fetchCardFrame(pick.record, pick.slot, pick.refreshMs);
}

/**
 * Fetches one paced static frame and settles it into the stable slot via the
 * pure persistence rule (applyFrameResult): success replaces the thumbnail,
 * failure leaves the drawn frame untouched. The frame is downscaled once
 * into a 2x-thumb offscreen canvas; the renderer reads the slot live.
 * @param {Object} record - Camera record.
 * @param {Object} slot - The camera's stable frame slot.
 * @param {number} refreshMs - Source cadence (also keys the frame-URL tick).
 * @param {Object} [options]
 * @param {boolean} [options.userGesture] - Hover fast-track (item B): the
 *   launch bypasses the pacer gate, so its spacing sample would pollute the
 *   pacing telemetry — skip the min-spacing sample only. The launch still
 *   stamps `_cardLastFetchAt`, so the pacer waits a full interval after it.
 */
function fetchCardFrame(record, slot, refreshMs, { userGesture = false } = {}) {
  if (typeof document !== 'undefined' && document.hidden && !userGesture) return;
  // Video/HLS cameras have no still-image endpoint (see getPublicCameraState's
  // frameUrl comment) — ambient cards normally never reach here for them
  // (selectCctvLod filters isVideo), but the protected active-camera lane in
  // cardFrameTick bypasses that filter, so guard here too rather than let a
  // doomed /frame/:id fetch stomp the shared health status back to degraded.
  if (isVideoFeedType(normalizeFeedType(record.camera.feedType))) return;
  const now = Date.now();
  const cameraId = record.camera.id;
  S._cardFetchInFlightCount += 1;
  _cardFetchPendingIds.add(cameraId);
  if (S._cardLastFetchAt > 0 && !userGesture) {
    const spacing = now - S._cardLastFetchAt;
    // NOTE: cold-fill bursts legitimately push this to ~250 ms — read it
    // together with the ambientCards.fetchMode telemetry.
    S._cardMinFetchSpacingMs = S._cardMinFetchSpacingMs == null
      ? spacing
      : Math.min(S._cardMinFetchSpacingMs, spacing);
  }
  S._cardLastFetchAt = now;
  S._cardFetchCount += 1;

  const image = new Image();
  _cardFetchImages.add(image);
  const settle = (ok) => {
    image.onload = null;
    image.onerror = null;
    if (_cardFetchImages.delete(image)) {
      S._cardFetchInFlightCount = Math.max(0, S._cardFetchInFlightCount - 1);
      _cardFetchPendingIds.delete(cameraId);
    }
    let frame = null;
    if (ok) {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = CCTV_FRAME_CANVAS_W;
        canvas.height = CCTV_FRAME_CANVAS_H;
        canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
        frame = canvas;
      } catch {
        frame = null;
      }
    }
    Object.assign(slot, applyFrameResult(slot, { ok: !!frame, frame }, Date.now()));
    S._viewer?.scene?.requestRender?.();
  };
  image.onload = () => settle(true);
  image.onerror = () => settle(false);
  image.src = frameUrlFor(record.camera, refreshMs);
}

/** Starts the card-frame pacer (idempotent; policy-gated per tick). */
export function startCardFrameLoop() {
  if (S._cardFetchTimer) return;
  S._cardFetchTimer = setInterval(cardFrameTick, CARD_FETCH_TICK_MS);
}

/**
 * Hidden-state gate (perf wave 2): detach in-flight card frame decodes when
 * the document hides — a hidden canvas has no reader, and image decode is
 * the expensive half. New fetches are gated at fetchCardFrame; the steady
 * pacer refills naturally on return. Installed once at module scope.
 */
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) return;
    for (const image of _cardFetchImages) {
      image.onload = null;
      image.onerror = null;
      image.removeAttribute('src');
    }
    _cardFetchImages.clear();
    _cardFetchPendingIds.clear();
    S._cardFetchInFlightCount = 0;
  });
}

/** Stops the pacer and detaches all in-flight fetch handlers. */
function stopCardFrameLoop() {
  if (S._cardFetchTimer) {
    clearInterval(S._cardFetchTimer);
    S._cardFetchTimer = 0;
  }
  for (const image of _cardFetchImages) {
    image.onload = null;
    image.onerror = null;
    image.removeAttribute('src');
  }
  _cardFetchImages.clear();
  _cardFetchPendingIds.clear();
  S._cardFetchInFlightCount = 0;
  S._cardFetchMode = 'steady';
}

/**
 * Complete ambient-tier teardown (layer disable/destroy): pacer + in-flight
 * handlers, shared-host source entries, card set, grace state, thumbnail
 * cache, and fetch telemetry. Nothing leaks across a toggle.
 */
export function teardownAmbientCards() {
  stopCardFrameLoop();
  S._cctvOverlayHost.clearSource(CCTV_OVERLAY_SOURCE_ID);
  S._cctvOverlayHost.setVisible(CCTV_OVERLAY_SOURCE_ID, false);
  clearHoverCard();
  S._cameraMoving = false;
  S._cardIds = new Set();
  S._cardGraceState = new Map();
  S._cardFrameSlots = new Map();
  S._cardFetchCount = 0;
  S._cardLastFetchAt = 0;
  S._cardMinFetchSpacingMs = null;
}
