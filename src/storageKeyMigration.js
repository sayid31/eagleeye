// One-time, boot-time migration of the older `godsEyeView.<feature>.<field>`
// localStorage key convention onto the newer `gev:<feature>:<version>`
// convention already used by gev:detection-allocation:v1,
// gev:first-run-mission:v1, and gev:layer-state:v2 (see EagleEye View
// rebrand — the `godsEyeView.*` prefix is a leftover of the app's former
// name and never gets written again after this file ships; this module
// exists solely to carry a returning user's existing values forward without
// data loss, not as a general-purpose storage utility).
//
// Idempotent by construction: never overwrites an already-populated new
// key with a stale old value, so calling this twice (or racing two tabs on
// first boot) is always safe — the second pass just finds the old key
// already gone.

/**
 * Returns the real `window.localStorage`, or `null` if storage is
 * unavailable (private browsing, disabled storage, non-browser test
 * context). Never throws.
 * @returns {Storage | null}
 */
function safeLocalStorage() {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}

/**
 * Copies a single legacy key to its new name, then removes the legacy key.
 * No-op if the old key is absent, if the new key already holds a value
 * (never clobber live new-era data with a stale copy), or if storage throws
 * (e.g. a `SecurityError` from a disabled/blocked storage backend).
 * @param {string} oldKey - legacy `godsEyeView.*` key.
 * @param {string} newKey - new `gev:*` key.
 * @param {Storage | object | null} [storage] - defaults to real localStorage; injectable for tests.
 * @returns {void}
 */
export function migrateStorageKey(oldKey, newKey, storage = safeLocalStorage()) {
  if (!storage) return;
  try {
    const oldValue = storage.getItem(oldKey);
    if (oldValue === null || oldValue === undefined) return;
    if (storage.getItem(newKey) !== null) return;
    storage.setItem(newKey, oldValue);
    storage.removeItem(oldKey);
  } catch {
    /* best effort — storage disabled or hostile, leave both keys as-is */
  }
}

/**
 * Prefix-scan variant for templated per-entity keys (e.g. one key per panel
 * id). Enumerates every key currently in storage, and for each one starting
 * with `oldPrefix`, migrates it to `newPrefix + <suffix>` where `<suffix>`
 * is whatever followed `oldPrefix` in the original key — preserving the
 * varying id without needing to know the full set of ids in advance.
 * Same "never overwrite" and "swallow storage errors" guarantees as
 * {@link migrateStorageKey}.
 * @param {string} oldPrefix - legacy key prefix, e.g. `'godsEyeView.v8.panelPos.'`.
 * @param {string} newPrefix - new key prefix, e.g. `'gev:panel-pos:v8:'`.
 * @param {Storage | object | null} [storage] - defaults to real localStorage; injectable for tests.
 * @returns {void}
 */
export function migrateStorageKeyPrefix(oldPrefix, newPrefix, storage = safeLocalStorage()) {
  if (!storage) return;
  let keys;
  try {
    keys = Object.keys(storage);
  } catch {
    return;
  }
  for (const oldKey of keys) {
    if (!oldKey.startsWith(oldPrefix)) continue;
    const suffix = oldKey.slice(oldPrefix.length);
    migrateStorageKey(oldKey, `${newPrefix}${suffix}`, storage);
  }
}

// The complete set of legacy-key migrations this rebrand needs. Fixed keys
// use migrateStorageKey; the two per-panel-id keys use the prefix variant.
const FIXED_KEY_MIGRATIONS = [
  ['godsEyeView.cockpitWeatherEffects.enabled', 'gev:cockpit-weather-effects:enabled'],
  ['godsEyeView.sceneProject.v2', 'gev:scene-project:v2'],
  ['godsEyeView.voiceCost.tier', 'gev:voice-cost:tier'],
  ['godsEyeView.voiceCost.limits', 'gev:voice-cost:limits'],
  ['godsEyeView.cctv.calibration.v2', 'gev:cctv-calibration:v2'],
  ['godsEyeView.v8.layoutResetNotified', 'gev:layout-reset-notified:v8'],
];

const PREFIX_KEY_MIGRATIONS = [
  ['godsEyeView.v8.panelPos.', 'gev:panel-pos:v8:'],
  ['godsEyeView.v6.panelCollapsed.', 'gev:panel-collapsed:v6:'],
];

// Note: godsEyeView.cctv.calibration.v1 is intentionally excluded — it is
// already-dead data per an explicit owner decision (see src/data/cctv.js,
// "v1 key is retired dead data ... WIPE CLEAN, no legacy import"), so there
// is nothing to preserve for it.

/**
 * Runs every legacy-key migration exactly once. Safe to call on every boot
 * — each individual migration is a no-op once its legacy key is gone.
 * @param {Storage | object | null} [storage] - defaults to real localStorage; injectable for tests.
 * @returns {void}
 */
export function runStorageKeyMigrations(storage = safeLocalStorage()) {
  if (!storage) return;
  for (const [oldKey, newKey] of FIXED_KEY_MIGRATIONS) migrateStorageKey(oldKey, newKey, storage);
  for (const [oldPrefix, newPrefix] of PREFIX_KEY_MIGRATIONS) migrateStorageKeyPrefix(oldPrefix, newPrefix, storage);
}
