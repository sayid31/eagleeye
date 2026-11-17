// src/admin/adminGateDecision.js
/**
 * Where the admin bundle sends a visitor, from the `/api/me` v2 payload and
 * the page being opened. Pure. `/admin/*` needs an admin role, `/dev/*` needs
 * super_admin; a wrong-area visitor goes to its own home (`homeFor`).
 * @module admin/adminGateDecision
 */

import { homeFor, isAdminRole, isSuperAdminRole } from '../auth/authRoles.mjs';
import { loginUrlFor } from '../auth/nextPath.mjs';
import { pathIsUnder } from './adminNav.js';

export const CHANGE_PASSWORD_PATH = '/account/password';

/**
 * Redirect target for this visitor, or null when the page may render.
 * @param {{configured?: boolean, signedIn?: boolean, user?: {role?: string, mustChangePassword?: boolean}} | null} me
 * @param {{pathname: string, search?: string}} location Full browser path (with the area prefix).
 * @returns {{redirect: string | null}}
 */
export function adminGateDecision(me, { pathname, search = '' }) {
  if (!me?.configured || !me.signedIn || !me.user) return { redirect: loginUrlFor(pathname, search, 'session') };
  const { role, mustChangePassword } = me.user;
  if (mustChangePassword) return { redirect: CHANGE_PASSWORD_PATH };
  if (pathIsUnder(pathname, '/dev') && !isSuperAdminRole(role)) return { redirect: homeFor(role) };
  if (pathIsUnder(pathname, '/admin') && !isAdminRole(role)) return { redirect: homeFor(role) };
  return { redirect: null };
}
