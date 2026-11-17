// src/auth/requireActor.mjs
/**
 * Route-level check for `/api/admin/*` handlers: the actor the auth guard
 * (`authPlugin.mjs`) attached to the request must hold the permission. The
 * guard already refused everyone else; this is defence in depth so a handler
 * mounted outside the guard can never serve an anonymous request.
 *
 * @module auth/requireActor
 */

import { canAccessAdmin, canManageKeys } from './authRoles.mjs';

const CHECKS = { admin: canAccessAdmin, keys: canManageKeys };

/**
 * @param {{gevActor?: {user: {id: string}, role: string, status: string}}} req
 * @param {'admin' | 'keys'} permission
 * @returns {{ok: true, actorId: string} | {ok: false, status: number, error: string}}
 */
export function requireActor(req, permission) {
  const actor = req?.gevActor;
  if (!actor) return { ok: false, status: 401, error: 'Login diperlukan' };
  const check = CHECKS[permission];
  if (!check) throw new Error(`requireActor: unknown permission "${permission}"`);
  if (!check(actor)) return { ok: false, status: 403, error: 'Akses ditolak' };
  return { ok: true, actorId: String(actor.user.id) };
}
