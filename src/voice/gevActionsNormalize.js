// Moved out of gevActions.js (gevActionsNormalize).

import { contextModeWord } from '../contextModePolicy.js';
import { TR3B_CLASS } from '../data/tr3bRegistry.js';
import { CITY_POIS } from '../locations.js';
import { ALLOWED_STYLES, CITY_ALIASES, COCKPIT_ACTION_ALIASES, COCKPIT_TARGET_LAYERS, COMPASS_16, CONTEXT_MODE_ALIASES, CONTEXT_MODE_RESULT_FIELDS, LAYER_ALIASES, NESTED_CONTEXT_RESULT_FIELDS, PANEL_ALIASES, PANEL_IDS, STACK_ALIASES } from './gevActionsConstants.js';

/**
 * Report a context-mode payload in the tools' own vocabulary.
 *
 * `set_context_mode` accepts 'contacts' while the mode's internal id is
 * 'flights'. Reporting the internal id back made the model read
 * `mode:'flights'` as "Contacts is off" and refuse to answer from the Contacts
 * window counts sitting in the very same payload (owner field session
 * 2026-08-21). Secondary fields and nested transition/rollback results are
 * translated too — one leaked internal id is enough to recreate the confusion,
 * and a rollback result is exactly what the model reads when something went
 * wrong. Each internal id is kept alongside as `<field>Internal` for anything
 * reasoning about layers.
 * @param {object|null|undefined} state Any payload carrying context-mode fields.
 * @returns {object|null|undefined} The same payload, modes translated.
 */
export function withContextModeVocabulary(state) {
  if (!state || typeof state !== 'object') return state;
  let out = state;
  const mutable = () => {
    if (out === state) out = { ...state };
    return out;
  };
  for (const { field, emptyAs } of CONTEXT_MODE_RESULT_FIELDS) {
    if (!(field in state)) continue;
    const internal = state[field] ?? null;
    const target = mutable();
    target[field] = contextModeWord(internal, { emptyAs });
    target[`${field}Internal`] = internal;
  }
  for (const field of NESTED_CONTEXT_RESULT_FIELDS) {
    const nested = state[field];
    if (!nested || typeof nested !== 'object') continue;
    const translated = withContextModeVocabulary(nested);
    if (translated !== nested) mutable()[field] = translated;
  }
  return out;
}

export function clampStr(value, max) {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  return trimmed.length > max ? trimmed.slice(0, max) : trimmed;
}

export function normalizeStackId(value) {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return null;
  return STACK_ALIASES.get(raw) || null;
}

/**
 * Spoken name for a tracked entity descriptor.
 *
 * Aircraft follow the flight layers' label convention — callsign →
 * registration → icao24 — so the narrated name matches the readout and the
 * detection card instead of speaking a raw hex at a contact the UI is calling
 * `N123AB`. Vessels and satellites carry no `registration`, so that link
 * simply falls through to their own name/mmsi/noradId links.
 * @param {object} found - Layer descriptor from `findByQuery`.
 * @param {string} query - The spoken query, used as the last resort.
 * @returns {string} A non-empty display name.
 */
export function formatTrackedEntityLabel(found, query = '') {
  const text = (v) => String(v ?? '').trim();
  return text(found?.callsign)
    || text(found?.registration)
    || text(found?.name)
    || text(found?.icao24)
    || text(found?.mmsi)
    || text(found?.noradId)
    || String(query);
}

export function compassDir(azDeg) {
  return COMPASS_16[Math.round(((((azDeg % 360) + 360) % 360)) / 22.5) % 16];
}

export function normalizePanelId(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  if (PANEL_IDS.has(raw)) return raw;
  return PANEL_ALIASES.get(raw.toLowerCase()) || null;
}

export function normalizeLayerId(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  if (LAYER_ALIASES.has(raw.toLowerCase())) return LAYER_ALIASES.get(raw.toLowerCase());
  return raw;
}

export function normalizeCockpitTargetLayer(value) {
  const layerId = normalizeLayerId(value);
  if (!layerId || !COCKPIT_TARGET_LAYERS.has(layerId)) return null;
  return layerId;
}

export function normalizeCockpitNavigationHints(rawAction) {
  const raw = String(rawAction || '').trim().toLowerCase();
  if (!raw) return {};

  const targetLayer = raw.includes('vessel') || raw.includes('ship') || raw.includes('ais')
    ? 'ais-live-vessels'
    : raw.includes('installation') || raw.includes('facility') || raw.includes('base')
      ? 'military-installations'
      : raw.includes('military')
        ? 'military'
        : null;

  const aircraftClass = raw.includes('helicopter') || raw.includes('helo') || raw.includes('chopper')
    ? 'helicopter'
    : null;

  return {
    targetLayer,
    aircraftClass,
  };
}

/**
 * Normalize a spoken/typed aircraft-class filter to the class id the analyst
 * records carry.
 *
 * Every real `classifyAircraft()` id is a single unpunctuated word, so callers
 * already say them exactly and a plain lower-case is enough. The one exception
 * is the TR-3B Easter egg (`tr3b`): people write and say it hyphenated, so
 * "TR-3B" / "tr 3b" / "tr 3 b" would otherwise reach the analyst as a value no
 * record matches. Collapsing spaces and hyphens and comparing against THAT ONE
 * id keeps this surgical — no general alias table, and no other class id
 * collapses to `tr3b`, so nothing else can be caught by it.
 *
 * App-side only: the voice tool schema and the model instructions are
 * untouched, so this costs no prompt-cache churn.
 * @param {*} value Raw class filter from the tool call or an utterance hint.
 * @returns {string|null} Class id, or null when nothing was supplied.
 */
export function normalizeAircraftClassFilter(value) {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return null;
  return raw.replace(/[\s-]+/g, '') === TR3B_CLASS ? TR3B_CLASS : raw;
}

export function normalizeContextMode(value) {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return null;
  return CONTEXT_MODE_ALIASES.get(raw) || null;
}

export function normalizeCockpitAction(value) {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return null;

  const direct = COCKPIT_ACTION_ALIASES.get(raw);
  if (direct) return direct;

  const normalized = raw
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
  const directNormalized = COCKPIT_ACTION_ALIASES.get(normalized);
  if (directNormalized) return directNormalized;

  if (/\bprevious\b|\bprev\b/.test(normalized)) return 'previous';
  if (/\bstatus\b|\bstate\b/.test(normalized)) return 'status';
  if (/\bexit\b|\bleave\b|\bquit\b/.test(normalized)) return 'exit';
  if (/\benter\b|\bopen\b|\bstart\b/.test(normalized)) return 'enter';
  if (/\bnext\b|\bclosest\b|\bnearby\b|\bnearest\b/.test(normalized)) return 'next';

  return null;
}

export function normalizeStyle(value) {
  const raw = String(value || '').trim().toLowerCase();
  if (raw === 'filter off' || raw === 'off' || raw === 'default') return 'normal';
  if (raw === 'night vision' || raw === 'nvg') return 'surveillance';
  if (raw === 'flir') return 'thermal';
  if (ALLOWED_STYLES.has(raw)) return raw;
  return null;
}

/**
 * Resolve a free-text location/city query to a known CITY_POIS id.
 * Exported for gevRadioActions.js's knownRadioLocation (moved there) — the
 * flyToRequestedLocation call site below stays in this file and imports it
 * back, same split-import shape as readLayerLifecycleSummary.
 * @param {string} value Raw location/city query text.
 * @returns {string|null} A CITY_POIS key, or null if unrecognized.
 */
export function normalizeLocationId(value) {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return null;
  if (CITY_POIS[raw]) return raw;
  if (CITY_ALIASES.has(raw)) return CITY_ALIASES.get(raw);
  return null;
}

export function cleanText(value) {
  if (value == null || typeof value === 'object') return '';
  const text = String(value).trim();
  if (!text || text === 'undefined' || text === 'null') return '';
  return text.length > 180 ? `${text.slice(0, 177)}...` : text;
}

export function layerTitle(layerId) {
  if (layerId === 'local-datacenters') return 'Datacenter';
  if (layerId === 'local-dams') return 'Dam';
  if (layerId === 'telegeography-submarine-cables') return 'Submarine Cable';
  if (layerId === 'local-firms') return 'Active Fire';
  return layerId || 'Entity';
}

export function clampNumber(value, min, max, fallback) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(min, Math.min(max, numeric));
}
