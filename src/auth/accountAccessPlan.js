// src/auth/accountAccessPlan.js
/**
 * What the map may switch on for the signed-in account, decided once at boot
 * from `/api/me`. Pure. The server guard is the real enforcement (pending
 * accounts get `403 ACCOUNT_PENDING` from every data proxy); this only keeps
 * the page from asking for what it would be refused, and says why.
 *
 * @module auth/accountAccessPlan
 */

import { canAccessAdmin } from './authRoles.mjs';

export const PENDING_BANNER = 'Akunmu menunggu persetujuan admin. Peta dasar bisa dilihat; layer data dan voice aktif setelah disetujui.';
export const UNKNOWN_BANNER = 'Status akun tidak bisa diperiksa. Peta dasar tetap bisa dilihat; muat ulang halaman untuk mencoba lagi.';
/** Reason the data-layer manager reports when a pending account tries to enable a layer. */
export const LAYER_LOCK_REASON = 'Layer data aktif setelah akunmu disetujui admin.';

/**
 * @typedef {{mode: 'full' | 'pending' | 'unknown' | 'leave', redirect: string | null,
 *   keyedBasemaps: boolean, layers: boolean, voice: boolean, showAdmin: boolean, banner: string | null}} AccountAccessPlan
 */

const restricted = (mode, banner) => ({
  mode, redirect: null, keyedBasemaps: false, layers: false, voice: false, showAdmin: false, banner,
});

/**
 * @param {{authenticated: boolean, role?: string, status?: string} | null} me `/api/me`
 *   payload, or null when it could not be read.
 * @returns {AccountAccessPlan}
 */
export function planAccountAccess(me) {
  // Fail closed but usable: without a readable status the keyless basemap still works.
  if (!me || typeof me !== 'object') return restricted('unknown', UNKNOWN_BANNER);
  if (!me.authenticated) return { ...restricted('leave', null), redirect: '/login?notice=session' };
  if (me.status === 'banned') return { ...restricted('leave', null), redirect: '/login?notice=banned' };
  if (me.status !== 'active') return restricted('pending', PENDING_BANNER);
  return {
    mode: 'full', redirect: null, keyedBasemaps: true, layers: true, voice: true, showAdmin: canAccessAdmin(me), banner: null,
  };
}
