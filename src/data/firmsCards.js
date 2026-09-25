/**
 * @file Pure card-model builders and shared presentation math for the FIRMS
 * fire layer's world-overlay cards (ambient labels + the click-selected
 * detail card) and the FRP/color math the sprite pass also reuses.
 *
 * Extracted from `firmsHeatmap.js` — pure functions, no layer closure state.
 * @module data/firmsCards
 */
import * as Cesium from 'cesium';
import { fireCullPosition, firePosition } from './firmsHorizonCull.js';
import {
  accentForSeverity,
  fireDetectionKey,
  satelliteShortName,
} from './firmsLabels.js';

/** Color stops shared by cell heat fills and detection glow sprites. */
const DETECTION_COLOR_STOPS = [
  { name: 'red', color: Cesium.Color.RED },
  { name: 'orange', color: Cesium.Color.ORANGE },
  { name: 'yellow', color: Cesium.Color.YELLOW },
];

/**
 * Pick a sprite color stop from FRP + confidence, reusing the same
 * yellow → orange → red thresholds as the aggregated heat cells.
 * @param {Object} fire - Detection record.
 * @returns {{name: string, color: {red: number, green: number, blue: number}}}
 */
export function detectionColorStop(fire) {
  const heat = Math.min(1, Math.sqrt(Math.max(0, fire.frp) / 150) * 0.85 + fire.confidence * 0.15);
  if (heat > 0.72) return DETECTION_COLOR_STOPS[0];
  if (heat > 0.42) return DETECTION_COLOR_STOPS[1];
  return DETECTION_COLOR_STOPS[2];
}

/** FRP → core marker pixel size, clamped to 8..28px. */
export function frpPixelSize(frp) {
  return Math.max(8, Math.min(28, Math.round(8 + Math.sqrt(Math.max(0, frp)) * 2)));
}

/** Coordinate line like "30.512°N 75.831°E". */
export function formatLatLon(lat, lon) {
  const latPart = `${Math.abs(lat).toFixed(3)}°${lat >= 0 ? 'N' : 'S'}`;
  const lonPart = `${Math.abs(lon).toFixed(3)}°${lon >= 0 ? 'E' : 'W'}`;
  return `${latPart} ${lonPart}`;
}

export function formatFrp(frp) {
  return frp >= 10 ? frp.toFixed(0) : frp.toFixed(1);
}

/** Millisecond delta → "<1h" / "Xh" / "Xd", or '' for invalid input. */
export function formatAge(deltaMs) {
  if (!Number.isFinite(deltaMs) || deltaMs < 0) return '';
  const hours = deltaMs / 3600000;
  if (hours < 1) return '<1h';
  if (hours < 48) return `${Math.round(hours)}h`;
  return `${Math.round(hours / 24)}d`;
}

/** Normalized 0..1 confidence → low/nominal/high display bucket. */
export function confidenceBucket(confidence) {
  if (confidence >= 0.75) return 'high';
  if (confidence >= 0.45) return 'nominal';
  return 'low';
}

/**
 * Card model for a click-selected fire — the full-detail card, drawn last
 * (on top) and never distance-faded by the overlay.
 * Exported for unit tests.
 * @param {Object} fire - Detection record.
 * @param {number} nowMs - Current epoch milliseconds.
 * @returns {Object} firmsLabels entry.
 */
export function buildSelectedFireCard(fire, nowMs) {
  const meta = [`${confidenceBucket(fire.confidence)} conf`];
  if (fire.acqMs > 0) {
    const age = formatAge(nowMs - fire.acqMs);
    if (age) meta.push(`${age} ago`);
  }
  const sat = satelliteShortName(fire.satellite);
  meta.push(sat ? `${fire.sensor || 'VIIRS'} ${sat}` : (fire.sensor || 'sensor n/a'));
  return {
    id: `selected-fire:${fireDetectionKey(fire)}`,
    actionable: true,
    position: firePosition(fire),
    // Host-side horizon test uses this instead of the render anchor.
    cullPosition: fireCullPosition(fire),
    gapPx: frpPixelSize(fire.frp),
    accent: accentForSeverity(detectionColorStop(fire).name),
    title: `FIRE · ${formatFrp(fire.frp)} MW`,
    details: [
      meta.join(' · '),
      formatLatLon(fire.lat, fire.lon) + (fire.night ? ' · NIGHT' : ''),
    ],
    selected: true,
    priority: Number.MAX_SAFE_INTEGER,
  };
}

/**
 * Card model for an ambient fire detection, e.g. title "▲ 47 MW", detail
 * "high · 14h · N20". Ages are computed against each detection's acquisition
 * time — with the live feed everything reads under 24 h (and a stale cache
 * reads truthfully old). Exported for unit tests.
 * @param {{fire: Object, position: Cesium.Cartesian3}} candidate - Label candidate.
 * @param {number} nowMs - Current epoch milliseconds.
 * @returns {Object} firmsLabels entry.
 */
export function buildFireCard(candidate, nowMs) {
  const fire = candidate.fire;
  const meta = [confidenceBucket(fire.confidence)];
  if (fire.acqMs > 0) {
    const age = formatAge(nowMs - fire.acqMs);
    if (age) meta.push(age);
  }
  const sat = satelliteShortName(fire.satellite) || fire.sensor;
  if (sat) meta.push(sat);
  return {
    id: `fire:${fireDetectionKey(fire)}`,
    actionable: true,
    position: candidate.position,
    cullPosition: candidate.cullPosition || candidate.position,
    gapPx: frpPixelSize(fire.frp),
    accent: accentForSeverity(detectionColorStop(fire).name),
    title: `▲ ${formatFrp(fire.frp)} MW`,
    details: [meta.join(' · ')],
    selected: false,
    priority: Number(fire.frp) || 0,
  };
}

/**
 * Card model for an aggregated heat cell, e.g. title "14 FIRES", detail
 * "max 210 MW · new 3h". Accent comes from the candidate (heat-normalized
 * score is only known at renderCells time). Exported for unit tests.
 * @param {{cell: Object, position: Cesium.Cartesian3, accent: string}} candidate
 * @param {number} nowMs - Current epoch milliseconds.
 * @returns {Object} firmsLabels entry.
 */
export function buildCellCard(candidate, nowMs) {
  const cell = candidate.cell;
  const noun = cell.count === 1 ? 'FIRE' : 'FIRES';
  const parts = [`max ${formatFrp(cell.maxFrp)} MW`];
  if (cell.newestAcqMs > 0) {
    const age = formatAge(nowMs - cell.newestAcqMs);
    if (age) parts.push(`new ${age}`);
  }
  return {
    id: `cell:${cell.latCell ?? 'x'}:${cell.lonCell ?? 'x'}`,
    position: candidate.position,
    cullPosition: candidate.cullPosition || candidate.position,
    gapPx: 10,
    accent: candidate.accent || accentForSeverity('yellow'),
    title: `${cell.count} ${noun}`,
    details: [parts.join(' · ')],
    selected: false,
    priority: Number(cell.maxFrp) || 0,
  };
}

/**
 * Add the host-owned layout/fade/collision fields to a source-formatted FIRMS
 * card. Selected fires share the collision domain so their protected rect
 * excludes ambient cards, but bypass both the 18-card cohort and distance fade.
 * @param {Object} card Source-formatted card.
 * @param {number} fadeDistance Current LOD fade distance in metres.
 * @returns {Object}
 */
export function applyFirmsOverlayPolicy(card, fadeDistance) {
  const selected = card?.selected === true;
  const rawGap = Number(card?.gapPx) || 10;
  const gapPx = Math.max(12, rawGap + 8);
  return {
    ...card,
    variant: selected ? 'selected' : 'card',
    protected: selected,
    collisionGroup: 'ambient-card',
    cardStyle: 'tactical',
    gapPx,
    leaderOffsetPx: Math.max(2, gapPx - 6),
    verticalOnly: true,
    viewportMargin: 4,
    maxDistance: selected ? Number.POSITIVE_INFINITY : fadeDistance,
    distanceFadeStartRatio: 0.7,
    edgeFade: 'keyhole',
    horizonCull: true,
    terrainOcclusion: false,
    // Aggregate cells omit actionable because they do not identify one fire.
    interactive: card?.actionable === true,
  };
}
