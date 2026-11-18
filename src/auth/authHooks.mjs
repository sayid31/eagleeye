// src/auth/authHooks.mjs
/**
 * Better Auth hooks of the email+password login (plan/auth/03).
 *
 * Endpoint hooks (`hooks.before/after`, run around every endpoint call):
 *  - `sign-in/social`: Google only; callbackURL / errorCallbackURL are forced
 *    server-side (Better Auth reads them from the body in `generateState`, after
 *    this hook replaced them); id-token sign-in and any extra field refused.
 *  - `sign-in/email`: throttled account/email → generic failure before the
 *    password is checked (a dummy hash keeps the timing); after a wrong
 *    password the per-account counter is incremented atomically.
 *  - `change-password`: `validatePassword` + `revokeOtherSessions` forced on.
 *  - `update-user`: body may hold `name` only (≤ 80 characters).
 *
 * Database hooks (run for every write, HTTP or internal):
 *  - `user.create.before`: over HTTP only the Google callback may create an
 *    account, and only for a verified SUPER_ADMIN_EMAILS address.
 *  - `session.create.before`: refuses closed (deactivated/deleted) accounts;
 *    a Google session only for a verified env email; a password session for an
 *    env email only when its password was set by the CLI.
 *  - `session.create.after`: success rows in login_log, throttle reset.
 *  - `account.create.before`: a Google account row only per googleLinkDecision
 *    (fresh env-email account, or a CLI-bootstrapped super_admin); every other
 *    same-email link is refused with `account_not_linked`.
 *
 * The endpoint context Better Auth passes to database hooks carries the
 * endpoint TEMPLATE path (`ctx.path`, e.g. `/callback/:id`) and its params —
 * that is how a session is known to come from the Google callback.
 *
 * @module auth/authHooks
 */

import { APIError, createAuthMiddleware, getSessionFromCtx, isAPIError } from 'better-auth/api';
import { isAccountClosed } from './accountPolicy.mjs';
import { PASSWORD_SET_BY, ROLE_SUPER_ADMIN, isReservedSuperAdminEmail, normalizeEmail } from './authRoles.mjs';
import { hashEmail } from './loginLog.mjs';
import { validatePassword } from './passwordPolicy.mjs';
import { GOOGLE_LINK_REFUSED_CODE, GOOGLE_PROVIDER_ID, googleLinkDecision } from './googleLinkPolicy.mjs';

export const GOOGLE_CALLBACK_URL = '/dev';
export const GOOGLE_ERROR_URL = '/login?next=/dev&notice=google';
export const MAX_NAME_LENGTH = 80;
/** Request header the auth plugin sets from the resolved client IP. */
export const CLIENT_IP_HEADER = 'x-gev-client-ip';

const SOCIAL_BODY_KEYS = new Set(['provider', 'callbackURL', 'errorCallbackURL', 'newUserCallbackURL', 'disableRedirect']);
const GENERIC_SIGN_IN_FAILURE = { code: 'INVALID_EMAIL_OR_PASSWORD', message: 'Invalid email or password' };

const isGooglePath = (ctx) => (ctx?.path === '/callback/:id' && ctx?.params?.id === 'google') || ctx?.path === '/sign-in/social';
const requestMeta = (ctx) => {
  const headers = ctx?.request?.headers ?? ctx?.headers;
  return { ip: headers?.get?.(CLIENT_IP_HEADER) || null, userAgent: headers?.get?.('user-agent') || null };
};
const refuse = (status, code, message) => new APIError(status, { code, message });

/**
 * @param {object} deps
 * @param {{superAdminEmails: string[], secret: string}} deps.config
 * @param {(attempt: object) => Promise<boolean>} deps.recordLogin From createLoginRecorder.
 * @param {ReturnType<import('./loginThrottle.mjs').createLoginThrottle>} deps.throttle
 * @param {() => Promise<object>} deps.getContext Resolves Better Auth's `$context`.
 * @returns {{hooks: {before: Function, after: Function}, databaseHooks: object}}
 */
export function createAuthHooks({ config, recordLogin, throttle, getContext }) {
  const reserved = (email) => isReservedSuperAdminEmail(email, config.superAdminEmails);

  async function beforeSignInEmail(ctx) {
    const email = normalizeEmail(ctx.body?.email);
    if (!email) return undefined;
    const state = await throttle.check(email);
    if (!state.throttled) return undefined;
    await ctx.context.password.hash(String(ctx.body?.password ?? ''));
    await recordLogin({ userId: state.userId, emailHash: state.emailHash, success: false, reason: 'throttled', method: 'password', ...requestMeta(ctx) });
    throw refuse('UNAUTHORIZED', GENERIC_SIGN_IN_FAILURE.code, GENERIC_SIGN_IN_FAILURE.message);
  }

  function beforeSignInSocial(ctx) {
    const body = ctx.body ?? {};
    if (body.provider !== 'google' || Object.keys(body).some((key) => !SOCIAL_BODY_KEYS.has(key))) {
      throw refuse('BAD_REQUEST', 'SOCIAL_SIGN_IN_REFUSED', 'Only the Google redirect sign-in is available');
    }
    return { context: { body: { ...body, callbackURL: GOOGLE_CALLBACK_URL, errorCallbackURL: GOOGLE_ERROR_URL, newUserCallbackURL: GOOGLE_CALLBACK_URL } } };
  }

  async function beforeChangePassword(ctx) {
    const session = await getSessionFromCtx(ctx);
    if (!session?.user) return undefined; // Better Auth answers 401 itself.
    const { user } = session;
    const verdict = validatePassword(ctx.body?.newPassword, { email: user.email, name: user.name, role: user.role });
    if (!verdict.ok) throw refuse('BAD_REQUEST', verdict.code, `Password must be ${verdict.min}–128 characters and not your email or name (${verdict.reason})`);
    return { context: { body: { ...ctx.body, revokeOtherSessions: true } } };
  }

  function beforeUpdateUser(ctx) {
    const body = ctx.body ?? {};
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    if (Object.keys(body).some((key) => key !== 'name') || !name || name.length > MAX_NAME_LENGTH) {
      throw refuse('BAD_REQUEST', 'FIELD_NOT_ALLOWED', `Only a name of 1–${MAX_NAME_LENGTH} characters can be changed here`);
    }
    return { context: { body: { name } } };
  }

  const before = createAuthMiddleware(async (ctx) => {
    switch (ctx.path) {
      case '/sign-in/email': return beforeSignInEmail(ctx);
      case '/sign-in/social': return beforeSignInSocial(ctx);
      case '/change-password': return beforeChangePassword(ctx);
      case '/update-user': return beforeUpdateUser(ctx);
      default: return undefined;
    }
  });

  const after = createAuthMiddleware(async (ctx) => {
    const returned = ctx.context.returned;
    if (ctx.path === '/sign-in/email' && isAPIError(returned) && returned.body?.code === GENERIC_SIGN_IN_FAILURE.code) {
      const email = normalizeEmail(ctx.body?.email);
      const counted = await throttle.recordFailure(email);
      await recordLogin({ userId: counted.userId, emailHash: counted.emailHash, success: false, reason: 'bad_credentials', method: 'password', ...requestMeta(ctx) });
    }
    if (ctx.path === '/callback/:id' && isAPIError(returned) && /[?&]error=account_not_linked\b/.test(String(returned.headers?.get?.('location') ?? ''))) {
      // Google attaches to an existing password account only for a CLI-bootstrapped super_admin (googleLinkPolicy).
      await recordLogin({ success: false, reason: 'google_denied', method: 'google', ...requestMeta(ctx) });
    }
    const changedBy = ctx.context.session?.user;
    if (ctx.path === '/change-password' && changedBy && !isAPIError(returned)) {
      // The forced change is done. A CLI-set super_admin password stays `cli` (the owner proved the old one);
      // anyone else's password is now their own.
      const passwordSetBy = changedBy.passwordSetBy === PASSWORD_SET_BY.cli ? PASSWORD_SET_BY.cli : PASSWORD_SET_BY.self;
      await (await getContext()).internalAdapter.updateUser(changedBy.id, { mustChangePassword: false, passwordSetBy });
    }
  });

  async function userCreateBefore(user, ctx) {
    if (!ctx) return undefined; // Internal creation (account service, CLI) sets its own fields.
    if (!isGooglePath(ctx)) throw refuse('FORBIDDEN', 'SIGN_UP_DISABLED', 'Accounts are created by an admin');
    if (!reserved(user.email) || user.emailVerified !== true) {
      // NOT awaited: this hook runs inside Better Auth's user+account transaction, which holds the single
      // SQLite connection; recordLogin writes through the plain adapter and would wait on it forever
      // (deadlocking every auth request). It runs once the refusal has rolled the transaction back.
      // recordLogin never rejects (createLoginRecorder catches and warns).
      void recordLogin({ emailHash: hashEmail(user.email, config.secret), success: false, reason: 'google_denied', method: 'google', ...requestMeta(ctx) });
      throw refuse('FORBIDDEN', 'GOOGLE_NOT_ALLOWED', 'Google sign-in is for the developer accounts only');
    }
    return { data: { ...user, role: ROLE_SUPER_ADMIN, banned: false, mustChangePassword: false } };
  }

  async function sessionCreateBefore(session, ctx) {
    const authContext = ctx?.context ?? await getContext();
    const user = await authContext.internalAdapter.findUserById(session.userId);
    const fail = async (reason, method, error) => {
      await recordLogin({ userId: session.userId, success: false, reason, method, ...requestMeta(ctx) });
      throw error;
    };
    const method = isGooglePath(ctx) ? 'google' : 'password';
    if (!user || isAccountClosed(user)) return fail('disabled', method, refuse('FORBIDDEN', 'ACCOUNT_DISABLED', 'Account deactivated, contact an admin'));
    if (method === 'google' && (!reserved(user.email) || user.emailVerified !== true)) {
      return fail('google_denied', method, refuse('FORBIDDEN', 'GOOGLE_NOT_ALLOWED', 'Google sign-in is for the developer accounts only'));
    }
    if (ctx?.path === '/sign-in/email' && reserved(user.email) && user.passwordSetBy !== PASSWORD_SET_BY.cli) {
      return fail('google_only', method, refuse('FORBIDDEN', 'GOOGLE_SIGN_IN_REQUIRED', 'This account signs in with Google'));
    }
    return undefined;
  }

  async function accountCreateBefore(account, ctx) {
    if (account?.providerId !== GOOGLE_PROVIDER_ID) return undefined;
    // internalAdapter reads go through the open transaction (fresh Google user + account), so no lock wait.
    const { internalAdapter } = ctx?.context ?? await getContext();
    const user = await internalAdapter.findUserById(account.userId);
    const accounts = user ? await internalAdapter.findAccounts(user.id) : [];
    const verdict = googleLinkDecision({ user, accounts, superAdminEmails: config.superAdminEmails });
    if (verdict.allow) return undefined;
    // The callback turns this into `errorCallbackURL?error=account_not_linked` (the reason stays out of the
    // URL: it would reveal whether the email has a password); the after-hook logs google_denied.
    throw refuse('FORBIDDEN', GOOGLE_LINK_REFUSED_CODE, 'Google account not linked');
  }

  async function sessionCreateAfter(session, ctx) {
    const google = isGooglePath(ctx);
    if (!google && ctx?.path !== '/sign-in/email') return;
    if (!google) await throttle.clearUser(session.userId);
    await recordLogin({ userId: session.userId, success: true, method: google ? 'google' : 'password', ip: session.ipAddress, userAgent: session.userAgent });
  }

  return {
    hooks: { before, after },
    databaseHooks: {
      user: { create: { before: userCreateBefore } },
      session: { create: { before: sessionCreateBefore, after: sessionCreateAfter } },
      account: { create: { before: accountCreateBefore } },
    },
  };
}
