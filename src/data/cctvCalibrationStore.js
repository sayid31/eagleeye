// Per-camera calibration normalization, localStorage store (v2) and calibration patch application.

import { CCTV_CALIBRATION_STORAGE_KEY_V2, DEFAULT_CAMERA_CALIBRATION } from './cctvConstants.js';
import { applyFrustumGeometry, ensureCameraPose } from './cctvGeometry.js';
import { groundAltFor, resolveCommittedGroundAnchor } from './cctvGround.js';
import { clamp, quantize, safeNumber } from './cctvMath.js';
import { refreshProjectionImage } from './cctvProjectionFrames.js';
import { notifyListenersThrottled } from './cctvPublicState.js';
import { S } from './cctvState.js';

/**
 * Returns whether a calibration patch moves the camera's ground anchor.
 * Rotational, optical, range, and manual-height edits preserve the existing
 * ground reference; only north/east translation needs a new floor.
 * @param {Object|null|undefined} patch
 * @returns {boolean}
 */
export function calibrationPatchMovesAnchor(patch) {
  if (!patch || typeof patch !== 'object') return false;
  return Object.prototype.hasOwnProperty.call(patch, 'offsetNorthM') ||
    Object.prototype.hasOwnProperty.call(patch, 'offsetEastM');
}

/**
 * Sanitizes and clamps a calibration object to valid ranges.
 * Missing or non-finite fields fall back to defaults.
 * @param {Object} [value={}] - Raw calibration values.
 * @returns {{ offsetNorthM: number, offsetEastM: number, headingDeg: number, pitchDeg: number, fovDeg: number, rangeScale: number, heightM: number }}
 */
export function normalizeCalibration(value = {}) {
  const raw = value && typeof value === 'object' ? value : {};
  return {
    offsetNorthM: quantize(clamp(safeNumber(raw.offsetNorthM, 0), -900, 900), 0.1),
    offsetEastM: quantize(clamp(safeNumber(raw.offsetEastM, 0), -900, 900), 0.1),
    headingDeg: quantize(clamp(safeNumber(raw.headingDeg, 0), -180, 180), 0.1),
    pitchDeg: quantize(clamp(safeNumber(raw.pitchDeg, 0), -45, 45), 0.1),
    fovDeg: quantize(clamp(safeNumber(raw.fovDeg, 0), -50, 50), 0.1),
    rangeScale: quantize(clamp(safeNumber(raw.rangeScale, 1), 0.35, 3.0), 0.01),
    heightM: quantize(clamp(safeNumber(raw.heightM, 0), -120, 240), 0.1),
  };
}

/**
 * Returns true if the given calibration is effectively the default (all offsets near zero).
 * @param {Object} calibration
 * @returns {boolean}
 */
export function isDefaultCalibration(calibration) {
  const probe = normalizeCalibration(calibration);
  return Object.keys(DEFAULT_CAMERA_CALIBRATION).every((key) => Math.abs(probe[key] - DEFAULT_CAMERA_CALIBRATION[key]) < 0.0001);
}

/**
 * Normalizes a coverage-mode request (viewshed design §3b). Accepts the three
 * mode strings plus booleans for `setParams({showCoverage})` back-compat
 * (true → 'on', false → 'off'); anything else keeps the current mode.
 * @param {*} value - Requested mode ('off'|'on'|'viewshed') or boolean.
 * @param {'off'|'on'|'viewshed'} current - Mode to keep when the request is invalid.
 * @returns {'off'|'on'|'viewshed'}
 */
export function normalizeCoverageMode(value, current) {
  if (value === true) return 'on';
  if (value === false) return 'off';
  if (value === 'off' || value === 'on' || value === 'viewshed') return value;
  return current;
}

/**
 * Returns `window.localStorage` when it is safely accessible, else null.
 * Split out so store IO can be exercised under plain node:test with an
 * injected storage-like object (getItem/setItem/removeItem) instead.
 * @returns {Storage|null}
 */
function safeWindowLocalStorage() {
  if (typeof window === 'undefined') return null;
  try {
    // NB: the window.localStorage property ACCESS itself throws SecurityError
    // under "block all cookies", so it has to live inside the try (M11).
    return window.localStorage || null;
  } catch {
    return null;
  }
}

/**
 * Loads all persisted per-camera calibration overrides from the v2 store.
 *
 * v2 entries carry provenance: `{ values: <7-field offsets>, source: 'manual',
 * savedAt: <epoch ms> }`. The v1 key (`CCTV_CALIBRATION_STORAGE_KEY_V1`) is
 * NEVER read here — owner decision #3 (§9.3): wipe clean, no legacy import.
 *
 * @param {{getItem:function}|null} [storage] - Injectable storage (defaults
 *   to `window.localStorage`); lets the unit suite test this pure of a DOM.
 * @returns {Map<string, {values:Object, source:string, savedAt:number}>}
 */
export function readCalibrationStoreV2(storage = safeWindowLocalStorage()) {
  const map = new Map();
  if (!storage) return map;
  try {
    const raw = storage.getItem(CCTV_CALIBRATION_STORAGE_KEY_V2);
    if (!raw) return map;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return map;
    for (const [cameraId, entry] of Object.entries(parsed)) {
      if (!cameraId || !entry || typeof entry !== 'object') continue;
      if (!entry.values || typeof entry.values !== 'object') continue;
      // 'manual' is the only provenance v2 knows (§9.3 killed 'legacy'); a
      // malformed/foreign source string still normalizes to 'manual' rather
      // than surfacing an unrecognized value into the badge logic.
      map.set(cameraId, {
        values: normalizeCalibration(entry.values),
        source: 'manual',
        savedAt: safeNumber(entry.savedAt, 0),
      });
    }
    return map;
  } catch {
    return map;
  }
}

/**
 * Persists a calibration map to the v2 store.
 * @param {Map<string, {values:Object, source:string, savedAt:number}>} map
 * @param {{setItem:function}|null} [storage] - Injectable storage (defaults
 *   to `window.localStorage`).
 */
export function writeCalibrationStoreV2(map, storage = safeWindowLocalStorage()) {
  if (!storage) return;
  try {
    const payload = {};
    for (const [cameraId, entry] of map.entries()) {
      payload[cameraId] = {
        values: normalizeCalibration(entry.values),
        source: 'manual',
        savedAt: safeNumber(entry.savedAt, Date.now()),
      };
    }
    storage.setItem(CCTV_CALIBRATION_STORAGE_KEY_V2, JSON.stringify(payload));
  } catch {
    // storage unavailable
  }
}

/**
 * Loads the v2 calibration store. `_calibrationById` holds these entries
 * directly (`{values, source:'manual', savedAt}`) — never bare offset values
 * — so it round-trips straight back through `writeCalibrationStoreV2`.
 * @returns {Map<string, {values:Object, source:string, savedAt:number}>}
 */
export function loadCalibrationStore() {
  return readCalibrationStoreV2();
}

/** Persists the in-memory calibration entries (values + provenance) to the v2 store. */
export function saveCalibrationStore() {
  writeCalibrationStoreV2(S._calibrationById);
}

/**
 * Derives the panel CAL badge state for a camera (design §3b, as amended by
 * the LOCKED §9.2 — panel-only, no in-world tint).
 *
 * Three states:
 *  - 'calibrated' — a human explicitly saved a v2 calibration (`source:'manual'`).
 *  - 'curated'    — no manual save, but the catalog entry was hand-authored
 *                   (`poseSource:'curated'`, file/env sources only).
 *  - 'raw-prior'  — everything else (all Austin Open Data today).
 *
 * Pure — no scoring math, no raycasts. `confidenceFromScore` and score-based
 * quality seeding are retired; this replaces them.
 * @param {{calSource?: string|null, poseSource?: string|null}} camera
 * @returns {'calibrated'|'curated'|'raw-prior'}
 */
export function deriveCalBadge(camera) {
  if (camera?.calSource === 'manual') return 'calibrated';
  if (camera?.poseSource === 'curated') return 'curated';
  return 'raw-prior';
}

/**
 * Applies a calibration patch to a record's IN-MEMORY pose (save-gated
 * persistence, design §3e: no localStorage write here — only the explicit
 * `calibration.save` action persists).
 *
 * Transient grade (gizmo mid-drag): recompute pose + frustum geometry only
 * (the cheap v2 path) with throttled notify — no ground re-arm, no frame
 * re-fetch, no store touch.
 * Commit grade (drag end, numeric entry, voice): only an E/N anchor move
 * resolves a new shared floor; all other edits keep the frozen reference.
 *
 * @param {Object} record - Camera record.
 * @param {Object} patch - Partial 7-field calibration (absolute offset values).
 * @param {{transient?: boolean}} [options]
 * @returns {boolean} True when the patch applied.
 */
export function applyCalibrationPatch(record, patch, options = {}) {
  if (!record || !patch || typeof patch !== 'object') return false;
  record.camera.calibration = normalizeCalibration({
    ...record.camera.calibration,
    ...patch,
  });
  ensureCameraPose(record.camera);
  // §9.1: touching range takes manual control — clear the activation clamp.
  if ('rangeScale' in patch) {
    record.probeClampRangeM = null;
  }
  const anchorMoved = calibrationPatchMovesAnchor(patch);
  if (options.transient === true && anchorMoved) {
    record.calibrationAnchorDirty = true;
  }
  record.calDirty = true;
  if (options.transient === true) {
    applyFrustumGeometry(record, groundAltFor(record));
    notifyListenersThrottled();
    return true;
  }
  if (anchorMoved) {
    resolveCommittedGroundAnchor(record);
  } else {
    applyFrustumGeometry(record, groundAltFor(record));
  }
  refreshProjectionImage(record, true);
  return true;
}
