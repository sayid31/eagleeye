// src/auth/authSessionMint.mjs
/**
 * Creates a real Better Auth session for an account and returns the signed
 * session cookie — without Google. NOT used by the running app: only unit
 * tests and the `test:track` harness (scripts/authCheckout.mjs) import it. Minting requires the
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
 * Find or create the account, force the given fields, open a session. The
 * account is created through the internal adapter (no endpoint context), so
 * the HTTP sign-up refusal does not apply; fields not given keep the schema
 * defaults (role `user`, default capabilities).
 * @param {object} auth Better Auth instance.
 * @param {{email: string, name?: string, role?: string, capabilities?: object, passwordSetBy?: string,
 *   mustChangePassword?: boolean, banned?: boolean}} account
 * @returns {Promise<{cookie: string, cookieName: string, cookieValue: string, userId: string, token: string}>}
 */
export async function mintSessionCookie(auth, { email, name = 'Test account', ...fields }) {
  const ctx = await auth.$context;
  const found = await ctx.internalAdapter.findUserByEmail(email);
  let user = found?.user ?? await ctx.internalAdapter.createUser({ email, name, emailVerified: true });
  const patch = Object.fromEntries(Object.entries(fields).filter(([, value]) => value !== undefined)
    .map(([key, value]) => [key, key === 'capabilities' ? JSON.stringify(value) : value]));
  if (Object.keys(patch).length) user = await ctx.internalAdapter.updateUser(user.id, patch);
  const session = await ctx.internalAdapter.createSession(user.id);
  const cookieName = ctx.authCookies.sessionToken.name;
  const cookieValue = signSessionToken(session.token, ctx.secret);
  return { cookie: `${cookieName}=${cookieValue}`, cookieName, cookieValue, userId: user.id, token: session.token };
}
