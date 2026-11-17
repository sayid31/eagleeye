// src/admin/users/usersRoutes.mjs
/**
 * `/api/admin/users` (plan/auth/04 §Kontrak API), gate `admin`:
 *
 *   GET    /                      list `{users, total, limit, offset}` (?q&status&role&limit&offset)
 *   GET    /stats                 Ringkasan counters
 *   POST   /                      create → 201 `{user, tempPassword?}`
 *   GET    /:id                   one account
 *   PATCH  /:id                   `{name?, email?, capabilities?}`
 *   DELETE /:id                   `{confirmEmail}` → tombstone
 *   POST   /:id/deactivate · /activate · /password · /sessions/revoke
 *   POST   /:id/role              super_admin + re-auth: `{role, currentPassword?}`
 *
 * Bodies are validated here (usersBoundary); who may do what to whom is
 * decided only by the account service (`authorizeUserAction`). A temporary
 * password leaves the server once, in the create/reset response.
 *
 * @module admin/users/usersRoutes
 */

import { registerApiRoute } from '../../auth/apiRouteRegistry.mjs';
import { ROLES, ROLE_SUPER_ADMIN, ROLE_USER } from '../../auth/authRoles.mjs';
import { requireActor } from '../../auth/requireActor.mjs';
import { createAdminLogQueries } from './adminLogQueries.mjs';
import {
  parseUserListQuery, parseUsersRoute, validateCreateBody, validateDeleteBody, validatePasswordBody, validateRoleBody, validateUpdateBody,
} from './usersBoundary.mjs';
import { bootedState, guarded, readJsonBody, sendError, sendInvalid, sendResult } from './usersHttp.mjs';

export const USERS_ROUTE = '/api/admin/users';

const queriesByDb = new WeakMap();

/**
 * Log/stat queries for a booted state's database (one instance per database).
 * @param {{db: object}} state
 * @returns {ReturnType<typeof createAdminLogQueries>}
 */
export function logQueriesFor(state) {
  if (!queriesByDb.has(state.db)) queriesByDb.set(state.db, createAdminLogQueries(state.db));
  return queriesByDb.get(state.db);
}

/** Roles whose accounts (and logs) an actor may see. */
export const visibleRoles = (actor) => (actor?.role === ROLE_SUPER_ADMIN ? [...ROLES] : [ROLE_USER]);

/** `validate(body)` → service call, for every route that takes a JSON body. */
const WITH_BODY = {
  create: [validateCreateBody, (accounts, actor, _id, input) => accounts.createUser(actor, input), 201],
  update: [validateUpdateBody, (accounts, actor, id, input) => accounts.updateUser(actor, id, input)],
  password: [validatePasswordBody, (accounts, actor, id, input) => accounts.setPassword(actor, id, input)],
  role: [validateRoleBody, (accounts, actor, id, input) => accounts.setRole(actor, id, input)],
  delete: [validateDeleteBody, (accounts, actor, id, input) => accounts.deleteUser(actor, id, input)],
};

/** Routes that only name the target. */
const WITHOUT_BODY = {
  get: (accounts, actor, id) => accounts.getUser(actor, id),
  deactivate: (accounts, actor, id) => accounts.deactivate(actor, id),
  activate: (accounts, actor, id) => accounts.activate(actor, id),
  revokeSessions: (accounts, actor, id) => accounts.revokeSessions(actor, id),
};

async function handleUsers(req, res, getState) {
  const admitted = requireActor(req, 'admin');
  if (!admitted.ok) return sendError(res, admitted.status, admitted.status === 401 ? 'AUTH_REQUIRED' : 'ADMIN_REQUIRED');
  const parsed = parseUsersRoute(req.method, req.url);
  if (parsed.error) return sendError(res, parsed.error.status, parsed.error.code);
  // Role changes are /dev business: say so plainly instead of a per-target refusal.
  if (parsed.route === 'role' && !requireActor(req, 'super').ok) return sendError(res, 403, 'SUPER_ADMIN_REQUIRED');
  const state = await bootedState(getState);
  const { accounts } = state.services;
  const actor = req.gevActor;

  if (parsed.route === 'list') {
    const query = parseUserListQuery(req.url);
    return query.error ? sendInvalid(res, query.error) : sendResult(res, await accounts.listUsers(actor, query));
  }
  if (parsed.route === 'stats') {
    const counts = logQueriesFor(state).stats({ roles: visibleRoles(actor), includeUnknown: actor.role === ROLE_SUPER_ADMIN });
    return sendResult(res, { ok: true, stats: counts });
  }
  if (WITHOUT_BODY[parsed.route]) return sendResult(res, await WITHOUT_BODY[parsed.route](accounts, actor, parsed.id));

  const [validate, call, successStatus] = WITH_BODY[parsed.route];
  const body = await readJsonBody(req);
  if (body.error) return sendInvalid(res, body.error);
  const input = validate(body.value);
  if (input.error) return sendInvalid(res, input.error);
  return sendResult(res, await call(accounts, actor, parsed.id, input.value), successStatus);
}

/**
 * @param {any} middlewares Connect app (or Vite server).
 * @param {{getState: () => Promise<object>}} deps Booted auth state (authStateFor).
 */
export function installAdminUsersRoutes(middlewares, { getState }) {
  registerApiRoute(middlewares, USERS_ROUTE, 'admin', guarded('users', (req, res) => handleUsers(req, res, getState)));
}
