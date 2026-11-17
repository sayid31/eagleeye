// src/auth/googleLinkPolicy.mjs
/**
 * When a Google account may be attached to a user row (plan/auth/03 §Google
 * super_admin). Better Auth's implicit linking is switched on
 * (`GOOGLE_ACCOUNT_LINKING`) only so that a super_admin bootstrapped by the CLI
 * can later sign in with Google; the `account.create.before` database hook
 * (authHooks.mjs) runs `googleLinkDecision` for every Google account row and
 * refuses all other cases — in particular an admin-created password account
 * with the same email, whose password an admin may know. Pure.
 *
 * @module auth/googleLinkPolicy
 */

import { isAccountClosed } from './accountPolicy.mjs';
import { PASSWORD_SET_BY, isReservedSuperAdminEmail } from './authRoles.mjs';

export const GOOGLE_PROVIDER_ID = 'google';
export const CREDENTIAL_PROVIDER_ID = 'credential';
/** Error code of a refused link; the Google callback redirects with `error=<code>`. */
export const GOOGLE_LINK_REFUSED_CODE = 'account_not_linked';

/**
 * Better Auth `account.accountLinking`. Linking is on, but the database hook is
 * the gate. No `trustedProviders`: Google must report the email as verified.
 * `requireLocalEmailVerified: false` because the CLI creates the super_admin
 * with `emailVerified: false` (Better Auth marks it verified after the link).
 * `/link-social` stays unreachable (not in the endpoint allowlist).
 */
export const GOOGLE_ACCOUNT_LINKING = Object.freeze({
  enabled: true,
  disableImplicitLinking: false,
  requireLocalEmailVerified: false,
  allowDifferentEmails: false,
  updateUserInfoOnLink: false,
});

/**
 * @param {object} input
 * @param {{email?: string, passwordSetBy?: string | null, banned?: unknown, deletedAt?: unknown} | null} input.user
 *   The row the Google account would belong to.
 * @param {{providerId: string}[]} input.accounts That user's existing account rows.
 * @param {string[]} input.superAdminEmails
 * @returns {{allow: true, reason: 'google_only' | 'cli_password'}
 *   | {allow: false, reason: 'no_user' | 'not_reserved' | 'closed' | 'password_not_cli'}}
 */
export function googleLinkDecision({ user, accounts, superAdminEmails }) {
  if (!user) return { allow: false, reason: 'no_user' };
  if (!isReservedSuperAdminEmail(user.email, superAdminEmails)) return { allow: false, reason: 'not_reserved' };
  if (isAccountClosed(user)) return { allow: false, reason: 'closed' };
  // No password at all: the row Google itself just created (or an earlier Google-only account).
  if (!(accounts ?? []).some((account) => account.providerId === CREDENTIAL_PROVIDER_ID)) return { allow: true, reason: 'google_only' };
  // A password chosen through the CLI proves control of the server, as the env email list does.
  if (user.passwordSetBy === PASSWORD_SET_BY.cli) return { allow: true, reason: 'cli_password' };
  return { allow: false, reason: 'password_not_cli' };
}
