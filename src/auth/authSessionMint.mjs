// src/auth/authSessionMint.mjs
/**
 * Creates a real Better Auth session for an account and returns the signed
 * session cookie — without Google. NOT used by the running app: only unit
 * tests and `scripts/track-regression.mjs` import it. Minting requires the
 * auth secret and write access to the auth database, i.e. the same power as
 * owning the server, so it adds no way in.
 *
 * @module auth/authSessionMint
 */

import { createHmac } from 'node:crypto';

/**
 * Signed-cookie value in Better Auth's format: `encodeURIComponent(token + '.' + base64(HMAC-SHA256))`.
 * @param {string} token
 * @param {string} secret
 * @returns {string}
 */
export function signSessionToken(token, secret) {
  const signature = createHmac('sha256', secret).update(token).digest('base64');
  return encodeURIComponent(`${token}.${signature}`);
}

/**
 * Find or create the account, force role/status when given, open a session.
 * Creation goes through Better Auth's hooks, so a new account starts as the
 * hook decides (pending user unless the email is an env super-admin).
 * @param {object} auth Better Auth instance.
 * @param {{email: string, name?: string, role?: string, status?: string, expiresInMs?: number}} account
 *   `expiresInMs` shortens the session (default: Better Auth's session lifetime).
 * @returns {Promise<{cookie: string, cookieName: string, cookieValue: string, userId: string, token: string}>}
 */
export async function mintSessionCookie(auth, { email, name = 'Test account', role, status, expiresInMs }) {
  const ctx = await auth.$context;
  const found = await ctx.internalAdapter.findUserByEmail(email);
  let user = found?.user ?? await ctx.internalAdapter.createUser({ email, name, emailVerified: true });
  const patch = {};
  if (role && user.role !== role) patch.role = role;
  if (status && user.status !== status) patch.status = status;
  if (Object.keys(patch).length) user = await ctx.internalAdapter.updateUser(user.id, patch);
  const override = expiresInMs > 0 ? { expiresAt: new Date(Date.now() + expiresInMs) } : undefined;
  const session = await ctx.internalAdapter.createSession(user.id, false, override);
  const cookieName = ctx.authCookies.sessionToken.name;
  const cookieValue = signSessionToken(session.token, ctx.secret);
  return { cookie: `${cookieName}=${cookieValue}`, cookieName, cookieValue, userId: user.id, token: session.token };
}
