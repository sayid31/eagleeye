// Moved out of aisLiveVessels.js (aisLiveVesselsRecords).

import * as Cesium from 'cesium';
import { registerSpriteCollection } from './spriteOrder.js';
import { governorRequestRender } from '../renderGovernor.js';
import { forgetSpriteFocus } from './focusDeemphasis.js';
import { vesselDatumHeightM } from './aisVesselRecords.js';
import { vesselTypeCss } from './vesselLabels.js';
import { DEFAULT_ACTIVE_LABELS, DEFAULT_RENDER_ROWS, SELECTED_PIN_REFRESHES, VESSEL_LIFT_M, shipIconCache, state } from './aisLiveVesselsConstants.js';
import { clearVesselInspection, registerSelectedContext, updateSelectedVesselHud } from './aisLiveVesselsInteraction.js';
import { currentGeoidN } from './aisLiveVesselsSession.js';
import { appendSelectedVesselTrailFix, clearSelectedVesselTrail } from './aisLiveVesselsTrail.js';
import { isVisible, makeOccluder, updateVisibility } from './aisLiveVesselsVisibility.js';

export function renderRowLimit() {
  const configured = Number(import.meta.env?.VITE_AIS_LIVE_MAX_ROWS);
  if (Number.isFinite(configured) && configured > 0) {
    return Math.max(500, Math.min(50000, Math.round(configured)));
  }
  return DEFAULT_RENDER_ROWS;
}

export function labelRowLimit() {
  const configured = Number(import.meta.env?.VITE_AIS_LIVE_LABEL_MAX_ROWS);
  if (Number.isFinite(configured) && configured >= 0) {
    return Math.max(0, Math.min(renderRowLimit(), Math.round(configured)));
  }
  return Math.min(DEFAULT_ACTIVE_LABELS, renderRowLimit());
}

export function ensureCollections(viewer) {
  if (!viewer || state.billboardCollection) return;
  state.billboardCollection = new Cesium.BillboardCollection({
    blendOption: Cesium.BlendOption.TRANSLUCENT,
  });
  state.billboardCollection.show = state.enabled;
  viewer.scene.primitives.add(state.billboardCollection);
  registerSpriteCollection('ais', state.billboardCollection);
}

/**
 * Reconcile the incoming AIS rows against the MMSI-keyed record map.
 * Existing records are updated in place (position/heading/label) so identity
 * and selection survive refreshes; new vessels are added; vanished vessels are
 * removed — except the selected vessel, which is pinned for up to
 * SELECTED_PIN_REFRESHES consecutive misses with a stale HUD readout.
 * Rows without an MMSI are rendered unkeyed and rebuilt fresh each refresh.
 * @param {Cesium.Viewer} viewer - The Cesium viewer instance.
 * @param {Array<Object>} rows - Raw AIS rows from the live API.
 */
export function reconcileVessels(viewer, rows) {
  ensureCollections(viewer);

  // Unkeyed (no-MMSI) records cannot be diffed — drop and rebuild them.
  for (const record of state.unkeyedRecords) {
    removeRecordPrimitives(record);
  }
  state.unkeyedRecords = [];

  const occluder = makeOccluder();
  const seen = new Set();
  for (let index = 0; index < rows.length; index += 1) {
    const next = normalizeVessel(rows[index]);
    if (!next) continue;

    if (!next.mmsi) {
      addRecordPrimitives(next, occluder);
      state.unkeyedRecords.push(next);
      continue;
    }
    if (seen.has(next.mmsi)) continue; // defensive: dedupe payload rows
    seen.add(next.mmsi);

    const existing = state.vesselMap.get(next.mmsi);
    if (existing) {
      updateRecordInPlace(existing, next);
    } else {
      addRecordPrimitives(next, occluder);
      state.vesselMap.set(next.mmsi, next);
    }
  }

  // Remove vanished vessels, pinning the selected one for a few refreshes.
  for (const [mmsi, record] of state.vesselMap) {
    if (seen.has(mmsi)) continue;
    if (record === state.selectedRecord) {
      record.missedRefreshes = (record.missedRefreshes || 0) + 1;
      if (record.missedRefreshes <= SELECTED_PIN_REFRESHES) {
        updateSelectedVesselHud(record); // re-render with STALE marker
        continue;
      }
      // Aged out of the feed after exhausting its pin — not a deselect.
      clearVesselInspection({ evicted: true });
    }
    removeRecordPrimitives(record);
    state.vesselMap.delete(mmsi);
    // Defensive lifecycle closure: a trail may outlive selection state during
    // asynchronous handoff/refresh ordering, but never its owning record.
    if (state.trailMmsi === mmsi) clearSelectedVesselTrail();
  }

  state.vesselRecords = [...state.vesselMap.values(), ...state.unkeyedRecords];
  state.lastVisibilityUpdate = 0;
  updateVisibility(true);
  // A poll landing while idle (hold released, nothing focused) still needs
  // one frame to paint the billboard show/hide/rotation changes just applied
  // above — updateVisibility() ran the computation regardless of render mode,
  // but the canvas won't reflect it until an actual frame is requested.
  governorRequestRender('ais-vessels-poll');
}

/**
 * Create the billboard primitive for a freshly added vessel record. Map labels
 * are canvas cards (vesselLabels.js) rebuilt by the declutter pass — no
 * per-record label primitive exists anymore.
 * @param {Object} record - Normalized vessel record.
 * @param {Cesium.EllipsoidalOccluder|null} occluder - Horizon occluder for initial visibility.
 */
function addRecordPrimitives(record, occluder) {
  const visible = state.enabled && isVisible(record.surfacePosition, occluder);
  record.billboard = state.billboardCollection.add({
    position: record.position,
    show: visible,
    image: shipIcon(record, false),
    scale: shipScale(record),
    // Screen-projected rotation lands on the next visibility/rotation pass.
    rotation: 0,
    alignedAxis: Cesium.Cartesian3.ZERO,
    horizontalOrigin: Cesium.HorizontalOrigin.CENTER,
    verticalOrigin: Cesium.VerticalOrigin.CENTER,
    // Locked height-datum principle #2: contacts are ALWAYS visible —
    // depth-test-free sprites; the EllipsoidalOccluder handles the far side.
    // (The tile sea mesh ≠ the geoid exactly, so a depth-tested chevron at
    // the geoid still clips out behind local tide/mesh noise.)
    disableDepthTestDistance: Number.POSITIVE_INFINITY,
    id: record,
  });
}

/**
 * Update an existing record (and its primitives) from a freshly normalized row,
 * preserving object identity so selection and the click-pick id stay valid.
 * Billboard image is only reassigned when the resolved icon actually changes
 * (type recolor) to avoid thousands of redundant texture lookups per refresh.
 * @param {Object} record - Existing vessel record in state.vesselMap.
 * @param {Object} next - Freshly normalized record for the same MMSI.
 */
function updateRecordInPlace(record, next) {
  const selected = record === state.selectedRecord;
  const prevIcon = shipIcon(record, selected);

  record.lat = next.lat;
  record.lon = next.lon;
  record.name = next.name;
  record.imo = next.imo;
  record.type = next.type;
  record.destination = next.destination;
  record.speed = next.speed;
  record.course = next.course;
  record.heading = next.heading;
  record.lastPositionUtc = next.lastPositionUtc;
  record.lastPositionEpoch = next.lastPositionEpoch;
  record.position = next.position;
  record.surfacePosition = next.surfacePosition;
  record.normal = next.normal;
  record.missedRefreshes = 0;

  if (record.billboard) {
    record.billboard.position = record.position;
    // Rotation is owned by the projected-rotation pass (updateVisibility).
    record.billboard.scale = shipScale(record) * (selected ? 1.2 : 1);
    const nextIcon = shipIcon(record, selected);
    if (nextIcon !== prevIcon) {
      record.billboard.image = nextIcon;
    }
  }
  if (record.mmsi === state.trailMmsi) {
    appendSelectedVesselTrailFix(record);
  }
  if (selected) {
    updateSelectedVesselHud(record);
    registerSelectedContext(record);
  }
}

/**
 * Remove a record's billboard primitive from its collection.
 * @param {Object} record - Vessel record to tear down.
 */
function removeRecordPrimitives(record) {
  if (!record) return;
  if (record.billboard && state.billboardCollection) {
    forgetSpriteFocus(record.billboard);
    state.billboardCollection.remove(record.billboard);
  }
  record.billboard = null;
}

function normalizeVessel(row) {
  const lat = Number(row.lat);
  const lon = Number(row.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  // Vertical datum: anchor at the SEA SURFACE (geoid, h = N + lift), not the
  // ellipsoid — at height 0 everything that projects record.position (clicks,
  // detection brackets, cards, getNearby) points up to ~45 m under the water.
  const heightM = vesselDatumHeightM(currentGeoidN(lat, lon), VESSEL_LIFT_M);
  const position = Cesium.Cartesian3.fromDegrees(lon, lat, heightM);
  // Surface normal at this position — used as alignedAxis so billboard
  // rotation operates in the local tangent plane (true world heading)
  const normal = Cesium.Ellipsoid.WGS84.geodeticSurfaceNormal(position, new Cesium.Cartesian3());
  return {
    lat,
    lon,
    name: String(row.name || row.input_name || row.mmsi || row.input_identifier || 'VESSEL'),
    mmsi: String(row.mmsi || row.input_identifier || '').trim(),
    imo: String(row.imo || ''),
    type: String(row.type_specific || row.type || ''),
    destination: String(row.destination || ''),
    speed: finiteNumber(row.speed),
    course: finiteNumber(row.course),
    heading: finiteNumber(row.heading),
    lastPositionUtc: String(row.last_position_UTC || ''),
    lastPositionEpoch: finiteNumber(row.last_position_epoch),
    position,
    // Ellipsoid-surface point (height 0) — feeds ONLY the horizon occluder,
    // which tests against the WGS84 ellipsoid; keep it off the sea datum.
    surfacePosition: Cesium.Cartesian3.fromDegrees(lon, lat, 0),
    normal,
    missedRefreshes: 0,
    billboard: null,
  };
}

function finiteNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function shipScale(record) {
  const speed = Number(record.speed || 0);
  if (speed >= 18) return 0.78;
  if (speed >= 8) return 0.68;
  return 0.6;
}

/**
 * Best available real-world direction of travel for a vessel, degrees
 * clockwise from north (true heading preferred, course-over-ground fallback).
 * Screen rotation is computed from this by the shared projected-rotation
 * pass in updateVisibility — never directly from the compass value.
 * @param {Object} record - Vessel record.
 * @returns {number} Course in degrees (0 when unknown).
 */
export function vesselCourseDeg(record) {
  const direction = record.heading ?? record.course;
  return Number.isFinite(direction) ? direction : 0;
}

/**
 * Build (and cache) a chevron/delta-wing SVG data URL tinted for the vessel.
 * The shape points north (up) so billboard rotation maps directly to heading.
 * One icon is generated per color+variant and reused across all billboards.
 * @param {Object} record - Vessel record (drives per-type tint).
 * @param {boolean} selected - True for the white/brighter selected variant.
 * @returns {string} SVG data URL.
 */
export function shipIcon(record, selected) {
  const cssColor = selected ? '#ffffff' : vesselTypeCss(record.type);
  const key = `${cssColor}:${selected ? 'selected' : 'normal'}`;
  if (shipIconCache.has(key)) return shipIconCache.get(key);

  const stroke = selected ? 'rgba(6,26,32,0.95)' : 'rgba(4,18,24,0.9)';
  const strokeWidth = selected ? 1.1 : 0.7;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
    <g transform="translate(16,16)">
      <path d="M0,-14 L11,10 L4,7 L0,14 L-4,7 L-11,10 Z" fill="${cssColor}" stroke="${stroke}" stroke-width="${strokeWidth}" stroke-linejoin="round"/>
    </g>
  </svg>`;
  const icon = 'data:image/svg+xml;base64,' + btoa(svg);
  shipIconCache.set(key, icon);
  return icon;
}

export function installRuntime(viewer) {
  if (state.preRenderRemover || !viewer) return;
  state.preRenderRemover = viewer.scene.preRender.addEventListener(() => updateVisibility());
}
