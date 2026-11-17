// src/auth/actorResolver.mjs
/**
 * Turns an incoming request into the signed-in actor
 * `{user, role, capabilities, mustChangePassword, session}` (or null).
 *
 * On every resolution the role is reconciled against SUPER_ADMIN_EMAILS
 * (`reconcileAccount`: promotion needs a Google account or a CLI password).
 * A demoted super_admin loses every session at once; a blocked promotion is
 * audited once per process. A deactivated or deleted account resolves to null.
 *
 * A resolution is cached for a moment per session cookie: the map fires many
 * `/api/*` requests per second (tiles, polls), and each would otherwise be a
 * signature check plus database reads. A deactivation or role change therefore
 * takes effect within ACTOR_CACHE_MS (sessions are deleted, so the next lookup
 * finds none).
 *
 * @module auth/actorResolver
 */

import { fromNodeHeaders } from 'better-auth/node';
import { isAccountClosed } from './accountPolicy.mjs';
import { effectiveCapabilities } from './authCapabilities.mjs';
import { reconcileAccount } from './authRoles.mjs';

export const ACTOR_CACHE_MS = 2000;
const ACTOR_CACHE_MAX = 500;
/** The session cookie (`advanced.cookiePrefix: 'gev'`), plain or with the `__Secure-` prefix on https. */
const SESSION_COOKIE = /(?:^|;\s*)(?:__Secure-)?gev\.session_token=/;

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
 * @param {{write: (entry: object) => Promise<{ok: boolean}>}} deps.audit
 * @param {() => number} [deps.now]
 * @param {number} [deps.cacheMs]
 */
export function createActorResolver({ auth, superAdminEmails, audit, now = () => Date.now(), cacheMs = ACTOR_CACHE_MS }) {
  const cache = new Map();
  const blockedReported = new Set();

  async function reconcile(user) {
    const ctx = await auth.$context;
    const accounts = await ctx.internalAdapter.findAccounts(user.id);
    const facts = { hasGoogleAccount: accounts.some((account) => account.providerId === 'google'), passwordSetBy: user.passwordSetBy };
    const next = reconcileAccount(user, superAdminEmails, facts);
    if (next.changed) await ctx.internalAdapter.updateUser(user.id, { role: next.role });
    if (next.event === 'demoted') await ctx.internalAdapter.deleteUserSessions(user.id);
    if (next.event === 'promoted' || next.event === 'demoted') {
      await audit.write({ action: 'role.reconcile', targetId: user.id, targetEmail: user.email, summary: `${user.role} → ${next.role}` });
    }
    if (next.event === 'blocked' && !blockedReported.has(user.id)) {
      blockedReported.add(user.id);
      await audit.write({ action: 'role.reconcile.blocked', targetId: user.id, targetEmail: user.email, summary: 'env email without Google or CLI password' });
    }
    return next;
  }

  async function lookup(headers) {
    const { headers: responseHeaders, response: session } = await auth.api.getSession({ headers: fromNodeHeaders(headers), returnHeaders: true });
    const setCookies = responseHeaders?.getSetCookie?.() ?? [];
    if (!session?.user || isAccountClosed(session.user)) return { actor: null, setCookies };
    const next = await reconcile(session.user);
    if (next.event === 'demoted') return { actor: null, setCookies };
    const user = { ...session.user, role: next.role };
    const mustChangePassword = user.mustChangePassword === true || user.mustChangePassword === 1;
    return { actor: { user, role: next.role, capabilities: effectiveCapabilities(user), mustChangePassword, session: session.session }, setCookies };
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

  /** Uncached resolution plus Better Auth's refreshed session cookie (sent back by `/api/me`). */
  async function resolveFresh(req) {
    const cookie = req.headers?.cookie;
    if (!hasSessionCookie(cookie)) return { actor: null, setCookies: [] };
    const result = await lookup(req.headers);
    remember(cookie, result.actor);
    return result;
  }

  return { resolveActor, resolveFresh, forget: () => cache.clear() };
}
