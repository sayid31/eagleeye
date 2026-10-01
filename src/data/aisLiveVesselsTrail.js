// Moved out of aisLiveVessels.js (aisLiveVesselsTrail).

import { vesselDatumHeightM } from './aisVesselRecords.js';
import * as Cesium from 'cesium';
import { createTrail } from './trailRenderer.js';
import { TRAIL_COLOR, TRAIL_HEIGHT_M, TRAIL_MAX_POINTS, TRAIL_MIN_MOVE_M, VESSEL_LIFT_M, state } from './aisLiveVesselsConstants.js';
import { currentGeoidN } from './aisLiveVesselsSession.js';

/**
 * Build a slightly lifted trail vertex for a vessel record — raised
 * TRAIL_HEIGHT_M above the sea surface (geoid, same datum as the anchor)
 * to avoid z-fighting.
 * @param {Object} record - Vessel record with lat/lon.
 * @returns {Cesium.Cartesian3|null} Lifted position, or null without a fix.
 */
function vesselTrailPosition(record) {
  if (!Number.isFinite(record?.lat) || !Number.isFinite(record?.lon)) return null;
  const heightM = vesselDatumHeightM(currentGeoidN(record.lat, record.lon), TRAIL_HEIGHT_M);
  return Cesium.Cartesian3.fromDegrees(record.lon, record.lat, heightM);
}

/**
 * One-shot datum re-lift when the geoid grid warms mid-session: the first
 * refresh can land before ensureGeoidReady() resolves (anchors at N = 0) and
 * the next refresh is up to REFRESH_MS out — re-derive every record's
 * position in place so chevrons/labels snap to the sea surface as soon as N
 * is known. (A selected-vessel trail cannot exist that early — selection
 * needs a rendered pick — so trail vertices are not revisited.)
 */
export function refloorVesselRecords() {
  if (!state.vesselRecords.length) return;
  for (const record of state.vesselRecords) {
    if (!Number.isFinite(record.lat) || !Number.isFinite(record.lon)) continue;
    const heightM = vesselDatumHeightM(currentGeoidN(record.lat, record.lon), VESSEL_LIFT_M);
    record.position = Cesium.Cartesian3.fromDegrees(record.lon, record.lat, heightM);
    if (record.billboard) record.billboard.position = record.position;
  }
}

/**
 * Start (or restart) the selected vessel's trail: seed with the current
 * position, render, then fire-and-forget the server ring-buffer backfill.
 * @param {Object} record - Freshly selected vessel record.
 */
export function startSelectedVesselTrail(record) {
  state.trailBackfillToken += 1;
  state.trailMmsi = record.mmsi;
  state.trailPositions = [];
  const current = vesselTrailPosition(record);
  if (current) state.trailPositions.push(current);
  if (!state.trail && state.viewer) {
    state.trail = createTrail(state.viewer, { color: TRAIL_COLOR, width: 2.5 });
  }
  if (state.trail) state.trail.setPositions(state.trailPositions);
  backfillVesselTrail(record.mmsi, state.trailBackfillToken);
}

/**
 * Fire-and-forget backfill from the server-side per-MMSI ring buffer
 * (PRD F3 — "recent path" since server boot, not voyage history). Older
 * samples are spliced AHEAD of the live accumulation, capped at
 * TRAIL_MAX_POINTS (newest kept). Any failure (404/timeout/malformed)
 * silently keeps the live-only trail.
 * @param {string} mmsi - MMSI of the selected vessel.
 * @param {number} token - Backfill token captured at request time.
 * @returns {Promise<void>}
 */
async function backfillVesselTrail(mmsi, token) {
  let samples = null;
  try {
    const response = await fetch('/api/ais-live/track?mmsi=' + encodeURIComponent(mmsi), {
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) return;
    const payload = await response.json();
    samples = Array.isArray(payload?.samples) ? payload.samples : null;
  } catch {
    return; // silent — keep the live-accumulated trail
  }
  if (!samples || token !== state.trailBackfillToken) return;
  if (state.trailMmsi !== mmsi) return;

  const older = [];
  for (const sample of samples) {
    const lat = Number(sample?.lat);
    const lon = Number(sample?.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    // Per-sample N (≤ TRAIL_MAX_POINTS lookups) — same sea-surface datum as
    // the live vertices so the spliced trail is height-continuous.
    const heightM = vesselDatumHeightM(currentGeoidN(lat, lon), TRAIL_HEIGHT_M);
    older.push(Cesium.Cartesian3.fromDegrees(lon, lat, heightM));
  }
  if (!older.length) return;

  state.trailPositions = older.concat(state.trailPositions);
  if (state.trailPositions.length > TRAIL_MAX_POINTS) {
    state.trailPositions = state.trailPositions.slice(state.trailPositions.length - TRAIL_MAX_POINTS);
  }
  if (state.trail) state.trail.setPositions(state.trailPositions);
}

/**
 * Append the selected vessel's refreshed position to its trail when it has
 * moved more than TRAIL_MIN_MOVE_M from the last trail vertex.
 * @param {Object} record - Selected vessel record after an in-place update.
 */
export function appendSelectedVesselTrailFix(record) {
  if (!state.trail) return;
  const next = vesselTrailPosition(record);
  if (!next) return;
  const last = state.trailPositions[state.trailPositions.length - 1];
  if (last && Cesium.Cartesian3.distance(last, next) <= TRAIL_MIN_MOVE_M) return;
  state.trailPositions.push(next);
  if (state.trailPositions.length > TRAIL_MAX_POINTS) state.trailPositions.shift();
  state.trail.setPositions(state.trailPositions);
}

/**
 * Clear the rendered trail and accumulation; invalidate pending backfills.
 */
export function clearSelectedVesselTrail() {
  state.trailBackfillToken += 1;
  state.trailMmsi = null;
  state.trailPositions = [];
  if (state.trail) state.trail.clear();
}

/**
 * Destroy the trail primitive entirely (layer disable/teardown).
 */
export function destroySelectedVesselTrail() {
  clearSelectedVesselTrail();
  if (state.trail) {
    state.trail.destroy();
    state.trail = null;
  }
}
