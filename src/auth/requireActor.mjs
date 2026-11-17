// src/auth/requireActor.mjs
/**
 * Route-level check for `/api/admin/*` handlers: the actor the login guard
 * (`authPlugin.mjs`) attached to the request must pass the gate. The guard
 * already refused everyone else by the route's registered gate; this is
 * defence in depth so a handler mounted outside the guard can never serve an
 * anonymous request.
 *
 * @module auth/requireActor
 */

import { hasGate } from './apiGates.mjs';

const PERMISSIONS = new Set(['admin', 'super']);

/**
 * @param {{gevActor?: {user: {id: string}, role: string}}} req
 * @param {'admin' | 'super'} permission
 * @returns {{ok: true, actorId: string} | {ok: false, status: number, error: string}}
 */
export function requireActor(req, permission) {
  if (!PERMISSIONS.has(permission)) throw new Error(`requireActor: unknown permission "${permission}"`);
  const actor = req?.gevActor;
  if (!actor) return { ok: false, status: 401, error: 'Login diperlukan' };
  if (!hasGate(actor, permission)) return { ok: false, status: 403, error: 'Akses ditolak' };
  return { ok: true, actorId: String(actor.user.id) };
}
