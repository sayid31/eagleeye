/**
 * What the map may switch on for the signed-in account, decided once at boot
 * from `/api/me` v2. Pure. The server guard is the real enforcement (each
 * `/api/*` route answers 403 CAPABILITY_REQUIRED without its toggle); this
 * only keeps the page from asking for what it would be refused, and says why.
 *
 *  - `layers`  ← capability `layers` (Layer data)
 *  - `voice`   ← capability `ai` (Voice & AI)
 *  - `keyedBasemaps` ← capability `premium` (Google 3D / Cesium ion basemaps, Google search)
 *
 * @module auth/accountAccessPlan
 */

import { homeFor, isAdminRole } from './authRoles.mjs';
import { loginUrlFor } from './nextPath.mjs';
import { PASSWORD_CHANGE_PATH } from './pageRoutes.mjs';

export const UNKNOWN_BANNER = 'Status akun tidak bisa diperiksa. Peta dasar tetap bisa dilihat; muat ulang halaman untuk mencoba lagi.';
export const LIMITED_BANNER = 'Sebagian fitur belum diaktifkan admin.';
/** Reason the data-layer manager reports when an account without `layers` tries to enable a layer. */
export const LAYER_LOCK_REASON = 'Fitur belum diaktifkan admin.';

/**
 * @typedef {{mode: 'full' | 'limited' | 'unknown' | 'leave', redirect: string | null,
 *   keyedBasemaps: boolean, layers: boolean, voice: boolean, showAdmin: boolean, adminHref: string | null,
 *   banner: string | null}} AccountAccessPlan
 */

const restricted = (mode, banner, redirect = null) => ({
  mode, redirect, keyedBasemaps: false, layers: false, voice: false, showAdmin: false, adminHref: null, banner,
});

/**
 * @param {import('./authClientApi.js').MePayload | null} me `/api/me`, or null when it could not be read.
 * @returns {AccountAccessPlan}
 */
export function planAccountAccess(me) {
  // Fail closed but usable: without a readable status the keyless basemap still works.
  if (!me || typeof me !== 'object') return restricted('unknown', UNKNOWN_BANNER);
  if (!me.signedIn || !me.user) return restricted('leave', null, loginUrlFor('/app', '', 'session'));
  if (me.user.mustChangePassword) return restricted('leave', null, PASSWORD_CHANGE_PATH);
  const caps = me.user.capabilities ?? {};
  const layers = caps.layers === true;
  const voice = caps.ai === true;
  const keyedBasemaps = caps.premium === true;
  const admin = isAdminRole(me.user.role);
  return {
    mode: layers && voice && keyedBasemaps ? 'full' : 'limited',
    redirect: null,
    keyedBasemaps,
    layers,
    voice,
    showAdmin: admin,
    adminHref: admin ? homeFor(me.user.role) : null,
    banner: layers && voice && keyedBasemaps ? null : LIMITED_BANNER,
  };
}
