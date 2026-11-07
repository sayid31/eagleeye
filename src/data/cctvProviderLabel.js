// src/data/cctvProviderLabel.js
/**
 * Display text for CCTV provider strings and camera names. Government-portal
 * packs carry `UNOFFICIAL — <operator> (Internal Demo Only, <LOCATION NOTE>)`
 * as provider and `<name> (<LOCATION NOTE> — Live — Unofficial)` as camera
 * name in config; the UI shows only the operator / plain name (owner ruling
 * 2026-11-07, docs/DECISIONS.md). The config text and the DATA_SOURCES.md
 * disclosure are unchanged. Pure — no DOM.
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

const MARKED_NAME_SUFFIX = /\s*\([^()]*\bUnofficial\)\s*$/i;

/** Longest map label for a camera before it is cut with an ellipsis. */
export const CCTV_MAP_LABEL_MAX = 32;

/**
 * @param {unknown} name Raw camera `name` from config.
 * @returns {string} The name without the pack's `(… — Live — Unofficial)` suffix.
 */
export function cctvCameraName(name) {
  return String(name ?? '').replace(MARKED_NAME_SUFFIX, '').trim();
}

/**
 * Short map callout for a camera (detection overlay): the plain name, cut to
 * CCTV_MAP_LABEL_MAX characters. No "CCTV" prefix: the camera icon and the
 * callout's tier colour already say what it is.
 * @param {{name?: string, id?: string}} camera
 * @returns {string}
 */
export function cctvMapLabel(camera) {
  const name = cctvCameraName(camera?.name) || String(camera?.id ?? '');
  const short = name.length > CCTV_MAP_LABEL_MAX ? `${name.slice(0, CCTV_MAP_LABEL_MAX - 1).trimEnd()}…` : name;
  return short;
}
