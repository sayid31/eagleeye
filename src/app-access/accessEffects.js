// src/app-access/accessEffects.js
/**
 * What locking each toggle does to the running map. Called by
 * `accessController.js` once per gate — at boot for toggles the account lacks,
 * or mid-session when the server starts refusing one.
 *
 *  - layers  → every layer enable is refused (user, restore, share link,
 *              scene, voice), the toggle list is greyed with a lock on each
 *              switch; mid-session, enabled layers are switched off so their
 *              poll loops stop.
 *  - ai      → the dock mic becomes a locked control; a running GPT-Live
 *              session is stopped and cannot be restarted from this page.
 *  - premium → Google 3D / Cesium ion stacks are locked in the picker, the
 *              map falls back to the keyless basemap, Google geocoding and
 *              Places are off (search uses Nominatim).
 *
 * @module app-access/accessEffects
 */

import { LOCKED_TOOLTIP } from './capabilityDenial.js';
import { createVoiceControl } from '../voice/gevLiveVoiceControlUi.js';
import { DEFAULT_BOOT_STACK } from '../mapStackController.js';

/** Reason the data-layer manager reports when an account without `layers` enables a layer. */
export const LAYER_LOCK_REASON = 'Data layers are not yet allowed by an admin.';
/** Picker tooltip / toast for Google 3D and Cesium ion stacks without `premium`. */
export const PREMIUM_LOCK_REASON = 'Premium map is not yet allowed by an admin';
/** Mic status and detail lines while voice is locked. */
export const VOICE_LOCK_STATUS = 'LOCKED';
export const VOICE_LOCK_DETAIL = 'NOT YET ALLOWED BY ADMIN';

/**
 * Refuse every layer enable and grey out the toggle list. Disabling stays allowed.
 * @param {{addVisibilityGuard: Function, getAll?: Function, setEnabled?: Function}} dataManager
 * @param {HTMLElement | null} toggleList `#data-toggles`
 * @param {{switchOff?: boolean}} [options] `switchOff` also turns enabled layers off (mid-session lock).
 * @returns {() => void} Removes the lock.
 */
export function lockDataLayers(dataManager, toggleList, { switchOff = false } = {}) {
  const release = dataManager.addVisibilityGuard((change) => (change.enabled ? LAYER_LOCK_REASON : null));
  toggleList?.classList.add('account-locked');
  toggleList?.setAttribute('aria-disabled', 'true');
  toggleList?.setAttribute('title', LOCKED_TOOLTIP);
  if (switchOff) {
    for (const layer of dataManager.getAll?.() ?? []) {
      if (!layer.enabled) continue;
      Promise.resolve(dataManager.setEnabled(layer.id, false, { origin: 'programmatic' }))
        .catch((error) => console.warn(`[access] could not switch off ${layer.id}: ${error.message}`));
    }
  }
  return () => {
    release();
    toggleList?.classList.remove('account-locked');
    toggleList?.removeAttribute('aria-disabled');
    toggleList?.removeAttribute('title');
  };
}

/**
 * Stop any GPT-Live session and put a locked mic in the dock in place of the
 * live one: visible, labelled, and clicking it only explains why.
 * @param {{doc?: Document, voice?: {stop: Function} | null, onBlockedClick?: () => void}} [deps]
 * @returns {HTMLElement} The locked tray root.
 */
export function lockVoice({ doc = document, voice = globalThis.window?.__gevVoiceCommands ?? null, onBlockedClick = () => {} } = {}) {
  if (voice && typeof voice.stop === 'function') voice.stop({ removeUi: true });
  if (globalThis.window?.__gevVoiceCommands === voice) globalThis.window.__gevVoiceCommands = null;
  const ui = createVoiceControl({ reset: true });
  ui.root.dataset.locked = 'true';
  ui.root.dataset.status = 'idle';
  ui.root.title = LOCKED_TOOLTIP;
  ui.status.textContent = VOICE_LOCK_STATUS;
  ui.detail.textContent = VOICE_LOCK_DETAIL;
  ui.helpDetail.textContent = `Voice & AI: ${LOCKED_TOOLTIP}`;
  ui.costValue.hidden = true;
  ui.button.setAttribute('aria-disabled', 'true');
  ui.button.setAttribute('aria-label', `Voice controls locked — ${LOCKED_TOOLTIP}`);
  ui.button.title = LOCKED_TOOLTIP;
  const badge = doc.createElement('span');
  badge.className = 'material-symbols-outlined account-lock-badge';
  badge.setAttribute('aria-hidden', 'true');
  badge.textContent = 'lock';
  ui.button.append(badge);
  ui.button.addEventListener('click', onBlockedClick);
  return ui.root;
}

/**
 * Keyless basemap only: Google proxies reported unavailable to every consumer
 * (geocoding, Places, military-site candidates), Google 3D and ion stacks
 * locked in the picker, and — when one is on screen — a switch to the keyless
 * boot stack.
 * @param {{mapStackController?: object | null, win?: object}} [deps]
 * @returns {Promise<void>}
 */
export async function lockPremium({ mapStackController = null, win = globalThis.window } = {}) {
  if (win) win.__GOOGLE_MAPS_PROXY_AVAILABLE__ = false;
  if (!mapStackController) return;
  mapStackController.premiumLockReason = PREMIUM_LOCK_REASON;
  const active = mapStackController.getActiveStack?.();
  const keyed = active && (active.kind === 'photoreal' || active.requiresIon);
  mapStackController.cesiumToken = '';
  if (keyed) {
    await mapStackController.setStack(DEFAULT_BOOT_STACK);
  }
  if (mapStackController.googleTileset) {
    mapStackController.googleTileset.show = false;
    mapStackController.googleTileset = null;
  }
}
