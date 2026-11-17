// src/admin/adminGateDecision.js
/**
 * Where `/admin` sends a visitor, from the `/api/me` payload. Pure.
 * @module admin/adminGateDecision
 */

import { canAccessAdmin } from '../auth/authRoles.mjs';

/**
 * @param {{authenticated: boolean, configured?: boolean, role?: string, status?: string}} me
 * @returns {{redirect: string | null}}
 */
export function adminGateDecision(me) {
  if (!me?.authenticated) return { redirect: '/login?notice=session' };
  if (me.status === 'banned') return { redirect: '/login?notice=banned' };
  if (!canAccessAdmin(me)) return { redirect: '/' };
  return { redirect: null };
}
