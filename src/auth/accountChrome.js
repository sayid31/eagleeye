// src/auth/accountChrome.js
/**
 * The map's account chrome, driven by `planAccountAccess`: the access banner,
 * the console (Admin/Dev) and Keluar buttons in the top globe-action bar, and
 * the capability locks (src/app-access/) — toggles the account lacks at boot,
 * and toggles the server starts refusing mid-session.
 *
 * main.js calls, in order: `resolveAccountAccess()` → `mountAccountChrome(plan)`
 * (before anything fetches) → `applyAccountLocks(plan, handles)` (once the data
 * manager exists, before any layer registration/restore).
 *
 * @module auth/accountChrome
 */

import { fetchMe, signOutAndLeave } from './authClientApi.js';
import { planAccountAccess } from './accountAccessPlan.js';
import { createAccessController } from '../app-access/accessController.js';
import { installCapabilityFetchGuard } from '../app-access/capabilityFetchGuard.js';
import { bannerDismissStore, renderAccessBanner } from '../app-access/accessBanner.js';
import { lockDataLayers, lockPremium, lockVoice } from '../app-access/accessEffects.js';
import { CAPABILITY_LABELS, LOCKED_TOOLTIP } from '../app-access/capabilityDenial.js';
// Styles: accountChrome.css, imported by src/main.js (keeps this module loadable under node:test).

/** How long an access toast stays up. */
export const ACCESS_TOAST_MS = 4000;

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

let toastTimer = null;
function showToast(doc, message) {
  const toast = doc.getElementById('toast');
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('visible'), ACCESS_TOAST_MS);
}

/**
 * The lock controller wired to this page: banner in `doc`, effects on the
 * running map, the fetch guard on `win.fetch`.
 * @param {import('./accountAccessPlan.js').AccountAccessPlan} plan
 * @param {{doc?: Document, win?: object}} [deps]
 */
export function createPageAccess(plan, { doc = document, win = window } = {}) {
  const dismissals = bannerDismissStore(() => win.sessionStorage);
  const voiceBlocked = () => showToast(doc, `${CAPABILITY_LABELS.ai}: ${LOCKED_TOOLTIP}`);
  const access = createAccessController({
    plan,
    dismissedKey: dismissals.get,
    showBanner: (model) => renderAccessBanner(doc, model, (key) => {
      dismissals.set(key);
      access.refreshBanner();
    }),
    toast: (message) => showToast(doc, message),
    effects: {
      layers: ({ handles, runtime }) => {
        if (handles.dataManager) lockDataLayers(handles.dataManager, handles.toggleList ?? null, { switchOff: runtime });
      },
      ai: () => { lockVoice({ doc, onBlockedClick: voiceBlocked }); },
      premium: ({ handles }) => lockPremium({ mapStackController: handles.mapStackController ?? null, win }),
    },
  });
  access.uninstallFetchGuard = installCapabilityFetchGuard({ lockKindOf: access.lockKindOf, onDenied: access.deny, target: win });
  return access;
}

let pageAccess = null;

/**
 * Banner, Admin/Keluar buttons and the capability fetch guard. Safe to call once per page.
 * @param {import('./accountAccessPlan.js').AccountAccessPlan} plan
 * @param {{doc?: Document, win?: object, signOut?: () => Promise<void>, navigate?: (url: string) => void}} [deps]
 */
export function mountAccountChrome(plan, { doc = document, win = window, signOut = signOutAndLeave, navigate = (url) => window.location.assign(url) } = {}) {
  pageAccess ??= createPageAccess(plan, { doc, win });
  pageAccess.refreshBanner();
  const nav = doc.getElementById('top-center-actions');
  if (!nav) return;
  if (plan.showAdmin && !doc.getElementById('account-admin-btn')) {
    nav.append(actionButton(doc, { id: 'account-admin-btn', icon: 'admin_panel_settings', label: 'Buka konsol admin', onClick: () => navigate(plan.adminHref ?? '/admin') }));
  }
  if (!doc.getElementById('account-signout-btn')) {
    nav.append(actionButton(doc, { id: 'account-signout-btn', icon: 'logout', label: 'Keluar', onClick: () => { void signOut(); } }));
  }
}

/**
 * Apply the account's locks to the running map. Call before any layer is
 * registered or restored, so no saved or shared layer of a locked account turns on.
 * @param {import('./accountAccessPlan.js').AccountAccessPlan} plan
 * @param {{dataManager: object, mapStackController?: object, toggleList?: HTMLElement | null}} handles
 */
export function applyAccountLocks(plan, handles) {
  pageAccess ??= createPageAccess(plan);
  pageAccess.attach(handles);
}
