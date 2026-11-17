// src/auth/actorResolver.mjs
/**
 * Turns an incoming request into the signed-in actor `{user, role, status}`
 * (or null), reconciling role/status against the env super-admin list on every
 * resolution and writing to the database only when something changed.
 *
 * A resolution is cached for a moment per session cookie: the map fires many
 * `/api/*` requests per second (tiles, polls), and each would otherwise be a
 * signature check plus a database read. A ban or role change therefore takes
 * effect within ACTOR_CACHE_MS.
 *
 * @module auth/actorResolver
 */

import { fromNodeHeaders } from 'better-auth/node';
import { reconcileAccount } from './authRoles.mjs';

export const ACTOR_CACHE_MS = 2000;
const ACTOR_CACHE_MAX = 500;
/** Better Auth's session cookie, plain or with the `__Secure-` prefix on https. */
const SESSION_COOKIE = /(?:^|;\s*)(?:__Secure-)?better-auth\.session_token=/;

/**
 * @param {string | undefined} cookieHeader
 * @returns {boolean} Whether the request carries a session cookie at all.
 */
export function hasSessionCookie(cookieHeader) {
  return SESSION_COOKIE.test(String(cookieHeader ?? ''));
}

/**
 * @param {object} deps
 * @param {{api: {getSession: Function}, $context: Promise<object>}} deps.auth Better Auth instance.
 * @param {string[]} deps.superAdminEmails
 * @param {() => number} [deps.now]
 * @param {number} [deps.cacheMs]
 * @returns {{resolveActor: (req: {headers: object}) => Promise<{user: object, role: string, status: string} | null>,
 *   resolveFresh: (req: {headers: object}) => Promise<{actor: object | null, setCookies: string[]}>,
 *   forget: () => void}}
 */
export function createActorResolver({ auth, superAdminEmails, now = () => Date.now(), cacheMs = ACTOR_CACHE_MS }) {
  const cache = new Map();

  async function lookup(headers) {
    const { headers: responseHeaders, response: session } = await auth.api.getSession({
      headers: fromNodeHeaders(headers),
      returnHeaders: true,
    });
    const setCookies = responseHeaders?.getSetCookie?.() ?? [];
    if (!session?.user) return { actor: null, setCookies };
    const { user } = session;
    const next = reconcileAccount(user, superAdminEmails);
    if (next.changed) {
      const ctx = await auth.$context;
      await ctx.internalAdapter.updateUser(user.id, { role: next.role, status: next.status });
    }
    return { actor: { user: { ...user, role: next.role, status: next.status }, role: next.role, status: next.status }, setCookies };
  }

  function remember(cookie, actor) {
    if (cache.size >= ACTOR_CACHE_MAX) cache.delete(cache.keys().next().value);
    cache.set(cookie, { actor, until: now() + cacheMs });
  }

  /** Cached resolution, used by the guards on every request. */
  async function resolveActor(req) {
    const cookie = req.headers?.cookie;
    if (!hasSessionCookie(cookie)) return null;
    const hit = cache.get(cookie);
    if (hit && hit.until > now()) return hit.actor;
    const { actor } = await lookup(req.headers);
    remember(cookie, actor);
    return actor;
  }

  /**
   * Uncached resolution that also returns Better Auth's refreshed session
   * cookie (sent back by `/api/me`, so an active session keeps sliding).
   */
  async function resolveFresh(req) {
    const cookie = req.headers?.cookie;
    if (!hasSessionCookie(cookie)) return { actor: null, setCookies: [] };
    const result = await lookup(req.headers);
    remember(cookie, result.actor);
    return result;
  }

  return { resolveActor, resolveFresh, forget: () => cache.clear() };
}
