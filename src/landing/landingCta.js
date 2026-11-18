// src/landing/landingCta.js
/**
 * Session-aware call-to-action for the public landing page. Pure: the caller
 * fetches `/api/me` (v2) and passes the payload — or `null` when the request
 * failed or timed out — and renders whatever comes back.
 *
 * @module landing/landingCta
 */

/** Routes the landing links to (plan/auth/02-routes-pages.md). */
export const LANDING_ROUTES = Object.freeze({
  login: '/login',
  app: '/app',
  admin: '/admin',
  dev: '/dev',
  account: '/account',
  changePassword: '/account/password',
});

/**
 * @typedef {{label: string, href: string}} CtaLink
 * @typedef {{label: string, action: 'sign-out'}} CtaAction
 * @typedef {{primary: CtaLink, secondary: Array<CtaLink | CtaAction>}} LandingCta
 * @typedef {{id: string, name?: string, email?: string,
 *   role: 'user' | 'admin' | 'super_admin', mustChangePassword?: boolean}} MeUser
 * @typedef {{configured?: boolean, signedIn?: boolean, user?: MeUser, home?: string}} MePayload
 */

const SIGN_OUT = Object.freeze({ label: 'Sign out', action: 'sign-out' });
const OPEN_CONSOLE = Object.freeze({ label: 'Open Console', href: LANDING_ROUTES.app });

/** Per-role buttons, straight from the table in plan/auth/05-landing-page.md. */
const ROLE_CTA = Object.freeze({
  user: {
    primary: OPEN_CONSOLE,
    secondary: [{ label: 'Account', href: LANDING_ROUTES.account }, SIGN_OUT],
  },
  admin: {
    primary: { label: 'Admin Panel', href: LANDING_ROUTES.admin },
    secondary: [OPEN_CONSOLE, SIGN_OUT],
  },
  super_admin: {
    primary: { label: 'Developer Console', href: LANDING_ROUTES.dev },
    secondary: [
      { label: 'Admin Panel', href: LANDING_ROUTES.admin },
      { label: 'Console', href: LANDING_ROUTES.app },
      SIGN_OUT,
    ],
  },
});

/**
 * Buttons for the landing hero given the `/api/me` payload.
 * Signed out, unconfigured, failed (`null`) or an unknown role all fall back
 * to "Masuk"; `mustChangePassword` outranks the role. "Minta akses" is added
 * only for visitors who are not signed in, and only when a contact is set.
 * @param {MePayload | null | undefined} me
 * @param {{accessContact?: string | null}} [options] validated contact href
 * @returns {LandingCta}
 */
export function landingCta(me, { accessContact = null } = {}) {
  const user = me?.configured !== false && me?.signedIn === true ? me.user : null;
  if (user?.mustChangePassword === true) {
    return {
      primary: { label: 'Change Password', href: LANDING_ROUTES.changePassword },
      secondary: [{ ...SIGN_OUT }],
    };
  }
  const byRole = user && Object.hasOwn(ROLE_CTA, user.role) ? ROLE_CTA[user.role] : undefined;
  if (byRole) {
    return { primary: { ...byRole.primary }, secondary: byRole.secondary.map((item) => ({ ...item })) };
  }
  return {
    primary: { label: 'Sign in', href: LANDING_ROUTES.login },
    secondary: accessContact ? [{ label: 'Request access', href: accessContact }] : [],
  };
}
