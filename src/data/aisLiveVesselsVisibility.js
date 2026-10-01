// Moved out of aisLiveVessels.js (aisLiveVesselsVisibility).

import { advanceSpriteFocus, focusAlphaNeedsWrite, focusNowMs, focusPassIsNeeded, getFocusTarget } from './focusDeemphasis.js';
import { holdContinuousRender, releaseContinuousRender } from '../renderGovernor.js';
import { cameraPoseSignature, screenProjectedRotation } from './iconOrientation.js';
import * as Cesium from 'cesium';
import { buildSelectedVesselCard, buildVesselCard, cardScreenSeparated, labelPriority } from './aisVesselCards.js';
import { VESSEL_CARD_FADE_DISTANCE_M, VESSEL_OVERLAY_SOURCE_ID, applyVesselOverlayPolicy, vesselOverlayCohortLimit } from './vesselLabels.js';
import { CARD_MIN_SEP_PX, FOCUS_UPDATE_MS, LABEL_GRID_PX, VISIBILITY_UPDATE_MS, state } from './aisLiveVesselsConstants.js';
import { selectAndFocusVessel } from './aisLiveVesselsInteraction.js';
import { labelRowLimit, vesselCourseDeg } from './aisLiveVesselsRecords.js';
import { S, _scratchFocusScreen } from './aisLiveVesselsState.js';

/**
 * Whether AIS needs the render loop held open. Billboards don't animate
 * between polls (no dead-reckoning — positions are written directly from the
 * latest fix and held static until the next poll), so the only genuine
 * per-frame need is a focus/de-emphasis transition in flight.
 * @param {{focusTarget: *, activeFocusCount: number}} input
 * @returns {boolean}
 */
export function aisNeedsContinuousRender({ focusTarget, activeFocusCount }) {
  return focusPassIsNeeded(focusTarget, activeFocusCount);
}

/**
 * Sync the continuous-render hold to current need (perf wave 3). Called
 * every updateVisibility() tick rather than held for the layer's whole
 * enabled lifetime — see aisNeedsContinuousRender().
 */
export function syncAisRenderHold() {
  if (state.enabled && aisNeedsContinuousRender({
    focusTarget: getFocusTarget(),
    activeFocusCount: state.activeFocusCount,
  })) {
    holdContinuousRender('ais-vessels');
  } else {
    releaseContinuousRender('ais-vessels');
  }
}

export function updateVisibility(force = false) {
  if (!state.enabled) return;
  syncAisRenderHold();
  const now = focusNowMs(performance.now());
  const focusTarget = getFocusTarget();
  const regularPass = force || now - state.lastVisibilityUpdate >= VISIBILITY_UPDATE_MS;
  const focusPass = focusPassIsNeeded(focusTarget, state.activeFocusCount)
    && (force || now - state.lastFocusUpdate >= FOCUS_UPDATE_MS);
  if (!regularPass && !focusPass) return;
  if (regularPass) state.lastVisibilityUpdate = now;
  if (focusPass) state.lastFocusUpdate = now;
  if (!state.vesselRecords.length) {
    // No records — flush any lingering card entries (vanished-feed case).
    if (regularPass) updateClusteredLabels([]);
    if (focusPass) state.activeFocusCount = 0;
    return;
  }

  const scene = state.viewer?.scene;
  const camera = state.viewer?.camera;
  if (regularPass) {
    // Candidate construction stays on the original 800 ms selector cadence.
    // The 80 ms focus-only pass below never allocates label candidates.
    const poseSig = camera ? cameraPoseSignature(camera) : '';
    const doRotations = force || poseSig !== S._lastCamPoseSig;
    if (doRotations) S._lastCamPoseSig = poseSig;
    const occluder = makeOccluder();
    const labelCandidates = [];
    for (const record of state.vesselRecords) {
      const visible = isVisible(record.surfacePosition, occluder);
      if (record.billboard) {
        record.billboard.show = visible;
        if (visible && doRotations && scene) {
          const rot = screenProjectedRotation(
            scene, record.position, vesselCourseDeg(record), record.billboard.rotation
          );
          if (rot !== null && Math.abs(rot - record.billboard.rotation) > 0.002) {
            record.billboard.rotation = rot;
          }
        }
      }
      if (visible) labelCandidates.push(record);
    }
    updateClusteredLabels(labelCandidates);
  }
  if (focusPass && scene && camera) {
    const result = applyVesselFocusDeemphasis({
      records: state.vesselRecords,
      target: focusTarget,
      previousActiveCount: state.activeFocusCount,
      nowMs: now,
      screenPositionFor: (position) => (
        Cesium.SceneTransforms.worldToWindowCoordinates(scene, position, _scratchFocusScreen)
      ),
      cameraDistanceFor: (position) => Cesium.Cartesian3.distance(camera.positionWC, position),
    });
    state.activeFocusCount = result.activeCount;
  }
}

/**
 * Apply focus alpha to vessel sprites. Kept as a production wire seam so the
 * animation/deadband contract can be tested without constructing WebGL.
 * @param {object} input
 * @returns {{writes:number,transitioning:boolean,activeCount:number,ran:boolean}}
 */
export function applyVesselFocusDeemphasis({
  records,
  target,
  previousActiveCount = 0,
  nowMs,
  screenPositionFor,
  cameraDistanceFor,
  params,
}) {
  if (!focusPassIsNeeded(target, previousActiveCount)) {
    return { writes: 0, transitioning: false, activeCount: 0, ran: false };
  }
  let writes = 0;
  let transitioning = false;
  let activeCount = 0;
  for (const record of records || []) {
    const bb = record?.billboard;
    const position = bb?.position || record?.position;
    if (!bb || !position) continue;
    const focus = advanceSpriteFocus(bb, {
      // Hidden/far-side sprites still finish any pending release so the active
      // count remains truthful and they cannot reappear with stale dim alpha.
      screenPosition: bb.show === false ? null : screenPositionFor(position),
      cameraDistance: cameraDistanceFor(position),
      nowMs,
      target,
      params,
      // Vessel artwork is 32 px before billboard scale. Including the
      // ambient chevron's own rendered extent prevents edge-overlap misses.
      spriteHalfWidthPx: (bb.width || 32) * (bb.scale || 1) * 0.5,
      spriteHalfHeightPx: (bb.height || 32) * (bb.scale || 1) * 0.5,
    });
    transitioning ||= focus.transitioning;
    if (focus.active) activeCount += 1;
    if (focusAlphaNeedsWrite(bb.color?.alpha, focus.factor, params)) {
      // Narrow always-visible amendment: the ship chevron remains present at
      // the non-zero floor while it competes with the tracked target. Preserve
      // the billboard's existing base RGB, matching the other layer patterns,
      // rather than repainting every chevron from a hard-coded WHITE base.
      const baseColor = bb.color || Cesium.Color.WHITE;
      bb.color = baseColor.withAlpha(focus.factor);
      writes += 1;
    }
  }
  return { writes, transitioning, activeCount, ran: true };
}

export function makeOccluder() {
  const cameraPosition = state.viewer?.camera?.positionWC;
  if (!cameraPosition) return null;
  return new Cesium.EllipsoidalOccluder(Cesium.Ellipsoid.WGS84, cameraPosition);
}

export function isVisible(surfacePosition, occluder) {
  if (!surfacePosition || !occluder) return true;
  return occluder.isPointVisible(surfacePosition);
}

/**
 * Source selector for the shared world-overlay pipeline: the
 * grid declutter picks which vessels get cards — one winner per screen-space
 * grid cell, priority-ranked, capped — and publishes presentation entries to
 * the host, which owns projection, final placement, fade and paint. Runs on the
 * throttled visibility pass and forced refreshes, never per frame. The
 * selected vessel always gets its full-detail card, even when horizon-culled
 * from the ambient candidates; its protected entry bypasses ambient quotas.
 * @param {Array<Object>} records - Horizon-visible vessel records.
 */
export function updateClusteredLabels(records) {
  const viewer = state.viewer;
  const scene = viewer?.scene;
  const selected = state.selectedRecord;
  const entries = selected ? [buildSelectedVesselCard(selected)] : [];
  const maxLabels = labelRowLimit();

  if (!scene || !records.length || maxLabels <= 0) {
    state.activeLabelCount = entries.length;
    publishVesselOverlayEntries(entries);
    return;
  }

  const cells = new Map();
  for (const record of records) {
    if (record === selected) continue;
    const screen = Cesium.SceneTransforms.worldToWindowCoordinates(scene, record.position);
    if (!screen) continue;
    const key = `${Math.floor(screen.x / LABEL_GRID_PX)}:${Math.floor(screen.y / LABEL_GRID_PX)}`;
    const candidate = { record, score: labelPriority(record, selected), x: screen.x, y: screen.y };
    const existing = cells.get(key);
    if (!existing || candidate.score > existing.score) {
      cells.set(key, candidate);
    }
  }

  // Greedy min-separation pass over the priority-ranked cell winners: the
  // selected card's anchor seeds the accepted set so ambient cards keep clear.
  const accepted = [];
  if (selected) {
    const screen = Cesium.SceneTransforms.worldToWindowCoordinates(
      scene, selected.billboard?.position || selected.position
    );
    if (screen) accepted.push({ x: screen.x, y: screen.y });
  }
  const ranked = [...cells.values()].sort((a, b) => b.score - a.score);
  for (const candidate of ranked) {
    if (entries.length >= maxLabels) break;
    if (!cardScreenSeparated(accepted, candidate, CARD_MIN_SEP_PX)) continue;
    accepted.push({ x: candidate.x, y: candidate.y });
    entries.push(buildVesselCard(candidate.record));
  }
  state.activeLabelCount = entries.length;
  publishVesselOverlayEntries(entries);
}

/**
 * Publish a complete, bounded source snapshot to the shared host. The source
 * selector remains authoritative for the 118 px grid and 150 px separation;
 * the host then composes this demand with sibling ambient-card sources.
 * @param {Object[]} entries Formatted vessel card entries.
 */
function publishVesselOverlayEntries(entries) {
  const canvas = state.viewer?.scene?.canvas || state.viewer?.canvas;
  const width = Number(canvas?.clientWidth) || 0;
  const height = Number(canvas?.clientHeight) || 0;
  const ambientLimit = vesselOverlayCohortLimit(width, height, labelRowLimit());
  S._vesselOverlayHost.setEntries(
    VESSEL_OVERLAY_SOURCE_ID,
    entries.map((entry) => {
      const card = applyVesselOverlayPolicy(entry, VESSEL_CARD_FADE_DISTANCE_M);
      if (!card.interactive) return card;
      const mmsi = String(card.id || '').startsWith('vessel:')
        ? card.id.slice('vessel:'.length)
        : '';
      return {
        ...card,
        accessibilityLabel: `Focus vessel ${card.title}, MMSI ${mmsi}`,
        activate: () => {
          const record = state.vesselMap.get(mmsi);
          if (!record) return false;
          selectAndFocusVessel(record);
          return true;
        },
      };
    }),
    {
      cohortLimit: Math.max(1, ambientLimit),
      collisionCapacity: ambientLimit,
      moving: false,
    },
  );
}

// trimHudValue, buildVesselCard, buildSelectedVesselCard, cardScreenSeparated,
// displayVesselName, formatSpeed, formatHeading, formatPositionTime now live
// in ./aisVesselCards.js (Wave 2 split #20) and are imported/re-exported
// above. vesselOverlayEntryId/vesselTypeShort moved with them (only used by
// the two card builders).

export function setVisible(show) {
  if (state.billboardCollection) {
    state.billboardCollection.show = show;
  }
  S._vesselOverlayHost.setVisible(VESSEL_OVERLAY_SOURCE_ID, show);
}
