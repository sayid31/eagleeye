// src/admin/dev/killSwitchRoutes.mjs
/**
 * `GET/PUT /api/admin/kill-switches` (super_admin). GET lists the per-gate
 * switches; PUT switches one gate after re-auth (current password, or a
 * Google sign-in < 10 min old — same rule as role changes), then writes the
 * `killswitch.update` audit row. Enforcement itself is the login guard's
 * `isKilled` hook (authPlugin → killSwitchStore).
 *
 * @module admin/dev/killSwitchRoutes
 */

import { sendJson } from '../../auth/authReplies.mjs';
import { registerApiRoute } from '../../auth/apiRouteRegistry.mjs';
import { requireActor } from '../../auth/requireActor.mjs';
import { resolveClientIp } from '../../auth/clientIp.mjs';
import { KILL_SWITCH_CACHE_MS } from '../../auth/killSwitchStore.mjs';
import { killSwitchAuditSummary, parseKillSwitchUpdate } from './killSwitchCore.mjs';
import { bootedState, guarded, readJsonBody, sendError, subPath } from './devHttp.mjs';

export const KILL_SWITCHES_ROUTE = '/api/admin/kill-switches';

async function update(req, res, state) {
  const body = await readJsonBody(req);
  if (body.error) return sendError(res, body.error === 'BODY_TOO_LARGE' ? 413 : 400, body.error);
  const parsed = parseKillSwitchUpdate(body.value);
  if (!parsed.ok) return sendError(res, 400, parsed.code, parsed);
  const { gate, killed, reason, currentPassword } = parsed.value;
  const actor = req.gevActor;
  const reauth = await state.services.accounts.confirmIdentity(actor, currentPassword);
  if (reauth) return sendError(res, reauth.status ?? 403, reauth.code);
  const row = state.killSwitches.set(gate, killed, { actor: { id: actor.user.id, role: actor.role, email: actor.user.email }, reason });
  console.info(`[kill-switch] gate ${gate} ${killed ? 'OFF' : 'ON'} by actor ${actor.user.id}`);
  const audit = await state.services.audit.write({
    action: 'killswitch.update',
    actor: { id: actor.user.id, role: actor.role },
    targetType: 'gate',
    targetId: gate,
    summary: killSwitchAuditSummary({ gate, killed, reason }),
    meta: { gate, killed },
    ip: resolveClientIp(req.socket?.remoteAddress, req.headers['x-forwarded-for'], state.config.trustedProxies),
  });
  return sendJson(res, 200, { switch: row, audit: audit.ok ? 'written' : 'failed' });
}

/**
 * @param {any} middlewares Connect app (or Vite server).
 * @param {{getState: () => Promise<object>}} deps `getState` resolves to the booted auth state.
 */
export function installKillSwitchRoutes(middlewares, { getState }) {
  registerApiRoute(middlewares, KILL_SWITCHES_ROUTE, 'super', guarded('kill-switches', async (req, res) => {
    const admitted = requireActor(req, 'super');
    if (!admitted.ok) return sendError(res, admitted.status, admitted.status === 401 ? 'AUTH_REQUIRED' : 'SUPER_ADMIN_REQUIRED');
    if (subPath(req) !== '/') return sendError(res, 404, 'NOT_FOUND');
    const state = await bootedState(getState);
    if (req.method === 'GET') return sendJson(res, 200, { switches: state.killSwitches.list(), cacheMs: KILL_SWITCH_CACHE_MS });
    if (req.method === 'PUT') return update(req, res, state);
    res.setHeader('Allow', 'GET, PUT');
    return sendError(res, 405, 'METHOD_NOT_ALLOWED');
  }));
}
