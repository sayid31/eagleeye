// src/data/aisVesselCards.js
// Pure vessel-card presentation helpers extracted from aisLiveVessels.js
// (Wave 2 split #20). Several of these are called back from
// aisLiveVessels.js's stateful HUD/context functions (updateSelectedVesselHud,
// registerSelectedContext) and from the live label-declutter pass
// (updateClusteredLabels) — that back-edge import is expected, not a smell:
// those callers are stateful/DOM-touching and must stay behind.

import { accentForVesselType, normalizeVesselType } from './vesselLabels.js';

/** Truncate a HUD/card value to maxLength, falling back to '--'. */
export function trimHudValue(value, maxLength) {
  const text = String(value || '--').trim() || '--';
  return text.length > maxLength ? `${text.slice(0, maxLength - 3)}...` : text;
}

export function displayVesselName(record) {
  const name = String(record.name || '').trim();
  if (name && name !== 'VESSEL' && name !== record.mmsi) return name;
  return record.mmsi ? `MMSI ${record.mmsi}` : 'KAPAL';
}

export function formatSpeed(speed) {
  return speed === null ? '--KT' : `${speed.toFixed(1)}KT`;
}

export function formatHeading(heading) {
  return Number.isFinite(heading) ? `${Math.round(heading)}DEG` : '--DEG';
}

export function formatPositionTime(record) {
  if (!record.lastPositionUtc) return 'POS: LIVE';
  const date = new Date(record.lastPositionUtc);
  if (Number.isNaN(date.getTime())) return 'POS: LIVE';
  return `POS: ${date.toISOString().slice(11, 19)}Z`;
}

function hasUsefulName(record) {
  const text = String(record.name || '').trim();
  return Boolean(text && text !== 'VESSEL' && !/^MMSI\s*\d+$/i.test(text) && text !== record.mmsi);
}

export function labelPriority(record, selected) {
  if (record === selected) return 100000;
  let score = 0;
  if (hasUsefulName(record)) score += 1000;
  if (record.speed !== null) score += Math.min(400, Math.max(0, record.speed) * 20);
  if (record.heading !== null || record.course !== null) score += 80;
  if (record.type) score += 40;
  return score;
}

/** Stable overlay identity for MMSI-keyed and source-retained unkeyed rows. */
function vesselOverlayEntryId(record) {
  const mmsi = String(record?.mmsi || '').trim();
  if (mmsi) return `vessel:${mmsi}`;
  const name = String(record?.name || 'VESSEL').trim() || 'VESSEL';
  const lat = Number.isFinite(record?.lat) ? record.lat.toFixed(5) : 'x';
  const lon = Number.isFinite(record?.lon) ? record.lon.toFixed(5) : 'x';
  return `vessel:unkeyed:${name}:${lat}:${lon}`;
}

/** Uppercased, card-width-bounded AIS type (empty string when unknown). */
function vesselTypeShort(record) {
  return normalizeVesselType(record.type).toUpperCase().slice(0, 14);
}

/**
 * Card model for an ambient (decluttered-in) vessel — name title plus one
 * compact type/speed/heading detail line, anchored at the record's current
 * rendered position (height-datum caveat: no datum work here). Pure —
 * exported for unit tests.
 * @param {Object} record - Vessel record.
 * @returns {Object} vesselLabels entry.
 */
export function buildVesselCard(record) {
  const parts = [];
  const type = vesselTypeShort(record);
  if (type) parts.push(type);
  if (record.speed !== null && record.speed !== undefined) parts.push(formatSpeed(record.speed));
  const direction = record.heading ?? record.course;
  if (Number.isFinite(direction)) parts.push(`${Math.round(direction)}°`);
  return {
    id: vesselOverlayEntryId(record),
    actionable: Boolean(record?.mmsi),
    position: record.billboard?.position || record.position,
    gapPx: 10,
    accent: accentForVesselType(record.type),
    title: trimHudValue(displayVesselName(record), 26),
    details: parts.length ? [parts.join(' · ')] : [],
    selected: false,
    priority: labelPriority(record, null),
  };
}

/**
 * Card model for the click-selected vessel — the full-detail card, drawn last
 * (on top) and never distance-faded by the overlay. Pinned-but-vanished
 * vessels carry a STALE marker (mirrors the HUD readout). Pure — exported
 * for unit tests.
 * @param {Object} record - Selected vessel record.
 * @returns {Object} vesselLabels entry.
 */
export function buildSelectedVesselCard(record) {
  const direction = record.heading ?? record.course;
  const details = [[
    vesselTypeShort(record) || 'KAPAL',
    formatSpeed(record.speed),
    Number.isFinite(direction) ? `${Math.round(direction)}°` : '--°',
  ].join(' · ')];
  const destination = String(record.destination || '').trim();
  if (destination) details.push(`→ ${trimHudValue(destination, 24)}`);
  const stale = (record.missedRefreshes || 0) > 0;
  details.push(`MMSI ${record.mmsi || '--'} · ${formatPositionTime(record)}${stale ? ' · USANG' : ''}`);
  return {
    id: vesselOverlayEntryId(record),
    actionable: Boolean(record?.mmsi),
    position: record.billboard?.position || record.position,
    gapPx: 12,
    accent: accentForVesselType(record.type),
    title: trimHudValue(displayVesselName(record), 32),
    details,
    selected: true,
    priority: 100000,
  };
}

/**
 * True when `screen` is at least `minSepPx` away from every accepted screen
 * position (greedy card-declutter accept test, mirroring the FIRMS pass).
 * Exported for unit tests.
 * @param {Array<{x: number, y: number}>} accepted - Accepted card positions.
 * @param {{x: number, y: number}} screen - Candidate window coordinates.
 * @param {number} minSepPx - Minimum separation in pixels.
 * @returns {boolean}
 */
export function cardScreenSeparated(accepted, screen, minSepPx) {
  const minSq = minSepPx * minSepPx;
  for (let i = 0; i < accepted.length; i += 1) {
    const dx = screen.x - accepted[i].x;
    const dy = screen.y - accepted[i].y;
    if (dx * dx + dy * dy < minSq) return false;
  }
  return true;
}
