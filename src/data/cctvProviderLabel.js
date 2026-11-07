// src/data/cctvProviderLabel.js
/**
 * Display text for a CCTV provider string. Government-portal packs carry
 * `UNOFFICIAL — <operator> (Internal Demo Only, <LOCATION NOTE>)` in config;
 * the panel shows only the operator and the location note, in Indonesian
 * (owner ruling 2026-11-07, docs/DECISIONS.md). The config text and the
 * DATA_SOURCES.md disclosure are unchanged. Pure — no DOM.
 *
 * @module data/cctvProviderLabel
 */

const MARKED_PROVIDER = /^UNOFFICIAL\s*[—-]\s*(.+?)\s*\(Internal Demo Only(?:,\s*([^)]*))?\)\s*$/i;

/** How precise the camera position is, as the pack's provider string states it. */
const LOCATION_NOTES = Object.freeze({
  'APPROX. LOCATION': 'lokasi perkiraan',
  'APPROXIMATE LOCATION': 'lokasi perkiraan',
  'SOURCE-PUBLISHED LOCATION': 'lokasi dari sumber',
  'CITY-LEVEL ONLY': 'hanya tingkat kota',
});

/**
 * @param {unknown} provider Raw `provider` (or source label) of a camera.
 * @returns {string} Operator name, plus the location note when the pack has one.
 */
export function cctvProviderDisplay(provider) {
  const text = String(provider ?? '').trim();
  const match = MARKED_PROVIDER.exec(text);
  if (!match) return text;
  const rawNote = match[2]?.trim();
  if (!rawNote) return match[1];
  return `${match[1]} (${LOCATION_NOTES[rawNote.toUpperCase()] ?? rawNote.toLowerCase()})`;
}
