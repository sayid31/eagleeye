// src/auth/accountChrome.js
/**
 * The map's account chrome, driven by `planAccountAccess`: the pending banner,
 * the Admin and Keluar buttons in the top globe-action bar, and the data-layer
 * lock for accounts that are not active yet.
 *
 * @module auth/accountChrome
 */

import { fetchMe, signOutAndLeave } from './authClientApi.js';
import { LAYER_LOCK_REASON, planAccountAccess } from './accountAccessPlan.js';
// Styles: accountChrome.css, imported by src/main.js (keeps this module loadable under node:test).

/**
 * Read `/api/me` and plan what this account may use. A failed read is
 * reported on the console and yields the restricted `unknown` plan.
 * @param {{load?: () => Promise<object>}} [deps]
 * @returns {Promise<import('./accountAccessPlan.js').AccountAccessPlan>}
 */
export async function resolveAccountAccess({ load = fetchMe } = {}) {
  try {
    return planAccountAccess(await load());
  } catch (error) {
    console.warn(`[account] ${error.message}; starting with the keyless basemap only.`);
    return planAccountAccess(null);
  }
}

function actionButton(doc, { id, icon, label, onClick }) {
  const button = doc.createElement('button');
  button.id = id;
  button.type = 'button';
  button.setAttribute('aria-label', label);
  button.title = label;
  const glyph = doc.createElement('span');
  glyph.className = 'material-symbols-outlined';
  glyph.setAttribute('aria-hidden', 'true');
  glyph.textContent = icon;
  button.append(glyph);
  button.addEventListener('click', onClick);
  return button;
}

/**
 * Banner + Admin/Keluar buttons. Safe to call once per page.
 * @param {import('./accountAccessPlan.js').AccountAccessPlan} plan
 * @param {{doc?: Document, signOut?: () => Promise<void>, navigate?: (url: string) => void}} [deps]
 */
export function mountAccountChrome(plan, { doc = document, signOut = signOutAndLeave, navigate = (url) => window.location.assign(url) } = {}) {
  if (plan.banner && !doc.getElementById('account-banner')) {
    const banner = doc.createElement('div');
    banner.id = 'account-banner';
    banner.setAttribute('role', 'status');
    banner.textContent = plan.banner;
    doc.body.append(banner);
  }
  const nav = doc.getElementById('top-center-actions');
  if (!nav) return;
  if (plan.showAdmin && !doc.getElementById('account-admin-btn')) {
    nav.append(actionButton(doc, { id: 'account-admin-btn', icon: 'admin_panel_settings', label: 'Buka konsol admin', onClick: () => navigate('/admin') }));
  }
  if (!doc.getElementById('account-signout-btn')) {
    nav.append(actionButton(doc, { id: 'account-signout-btn', icon: 'logout', label: 'Keluar', onClick: () => { void signOut(); } }));
  }
}

/**
 * Refuse every layer enable (user toggle, saved-state restore, share link,
 * voice, first-run missions) and grey out the toggle list. Disabling stays allowed.
 * @param {{addVisibilityGuard: (guard: Function) => () => void}} dataManager
 * @param {HTMLElement | null} toggleList `#data-toggles`
 * @returns {() => void} Removes the lock.
 */
export function lockDataLayers(dataManager, toggleList) {
  const release = dataManager.addVisibilityGuard((change) => (change.enabled ? LAYER_LOCK_REASON : null));
  toggleList?.classList.add('account-locked');
  toggleList?.setAttribute('aria-disabled', 'true');
  toggleList?.setAttribute('title', LAYER_LOCK_REASON);
  return () => {
    release();
    toggleList?.classList.remove('account-locked');
    toggleList?.removeAttribute('aria-disabled');
    toggleList?.removeAttribute('title');
  };
}
