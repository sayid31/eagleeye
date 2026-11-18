/**
 * English UI strings of `/login`, `/account` and `/account/password` (one place to review or translate).
 * Technical terms (email, password, Google) stay in English, as in the rest of the console.
 *
 * @module copy/en/login
 */

import { PASSWORD_MAX } from '../../auth/passwordPolicy.mjs';
import { APP_NAME } from './common.js';

export const LOGIN_COPY = Object.freeze({
  title: `Sign in to ${APP_NAME}`,
  lead: 'Sign in with the account an admin created for you.',
  pageTitle: 'Sign in',
  checking: 'Checking session…',
  notConfiguredTitle: 'Login not configured',
  notConfiguredBody: 'The server has not set up login yet. The server owner can run',
  notConfiguredCommand: 'npm run doctor',
  sessionCheckFailed: 'The session could not be checked. Reload this page.',
  email: 'Email',
  emailRequired: 'Enter your email.',
  password: 'Password',
  passwordRequired: 'Enter your password.',
  submit: 'Sign in',
  submitting: 'Processing…',
  google: 'Sign in with Google',
  googleStarting: 'Opening Google…',
  googleStartFailed: 'Google could not be opened. Try again.',
  divider: 'or',
  forgot: 'Forgot password?',
  forgotTitle: 'Forgot password?',
  forgotAnswer: 'Contact your admin to reset your password.',
  backHome: 'Back to home',
});

/** Sign-in refusals by server code. Wrong password and throttled share the generic text on purpose. */
export const SIGN_IN_ERRORS = Object.freeze({
  INVALID_EMAIL_OR_PASSWORD: 'Incorrect email or password.',
  INVALID_EMAIL: 'Incorrect email or password.',
  ACCOUNT_DISABLED: 'Account deactivated, contact an admin.',
  GOOGLE_SIGN_IN_REQUIRED: 'This account signs in with Google.',
  RATE_LIMITED: 'Too many attempts from this network. Wait a moment and try again.',
  NETWORK: 'Could not reach the server. Check your connection and try again.',
});
export const SIGN_IN_GENERIC_ERROR = 'Login failed. Please try again.';

/** `?notice=` set by the server guard (`session`) or the forced Google error URL (`google`). */
export const LOGIN_NOTICES = Object.freeze({
  session: { tone: 'warn', text: 'Session ended. Please sign in again.' },
  // Generic for every Google refusal: which check failed is not shown.
  google: { tone: 'error', text: 'Google login did not work. Only registered developer accounts can use Google.' },
});

export const PASSWORD_COPY = Object.freeze({
  title: 'Change password',
  forcedLead: 'Your password was set by an admin. Choose a new password before continuing.',
  voluntaryLead: 'Choose a new password for your account.',
  forcedAlertTitle: 'Change your password to continue',
  forcedAlertBody: 'You cannot use EagleEye View until you choose your own password.',
  otherDevices: 'After the change, other devices are signed out automatically.',
  current: 'Current password',
  next: 'New password',
  nextDescription: 'A long phrase is stronger than a mix of symbols.',
  confirm: 'Repeat new password',
  requirementsLabel: 'New password requirements',
  /** @param {number} min */
  requirementLength: (min) => `At least ${min} characters`,
  requirementIdentity: 'Not your email or name',
  requirementDifferent: 'Different from your current password',
  requirementMatch: 'Both new passwords match',
  requirementMet: 'met',
  requirementUnmet: 'not met yet',
  submit: 'Save password',
  submitting: 'Saving…',
  success: 'Password changed.',
  redirecting: 'Redirecting…',
  signOut: 'Sign out',
});

/** Form checks (client) and server refusals of change-password. */
export const PASSWORD_ERRORS = Object.freeze({
  CURRENT_REQUIRED: 'Enter your current password.',
  MISMATCH: 'The two new passwords do not match.',
  SAME_AS_CURRENT: 'The new password must be different from your current password.',
  /** @param {number} min */
  TOO_SHORT: (min) => `The new password must be at least ${min} characters.`,
  TOO_LONG: `The new password must be at most ${PASSWORD_MAX} characters.`,
  MATCHES_IDENTITY: 'The new password cannot be the same as your email or name.',
  INVALID_PASSWORD: 'Current password is incorrect.',
  PASSWORD_WEAK: 'The new password does not meet the requirements (length, not your email or name).',
  CREDENTIAL_ACCOUNT_NOT_FOUND: 'This account does not use a password (it signs in with Google).',
  SESSION_EXPIRED: 'Session ended. Please sign in again.',
  RATE_LIMITED: 'Too many attempts. Wait a moment and try again.',
  NETWORK: 'Could not reach the server. Try again.',
  GENERIC: 'The password could not be changed. Try again.',
});

export const ACCOUNT_COPY = Object.freeze({
  title: 'My account',
  description: 'Manage your profile and account security.',
  tabsLabel: 'Account sections',
  tabProfile: 'Profile',
  tabSecurity: 'Security',
  back: 'Back',
  backToMap: 'Back to map',
  backToAdmin: 'Back to Admin',
  backToDev: 'Back to Developer',
  loading: 'Loading account',
  loadFailedTitle: 'The account could not be loaded',
  loadFailed: 'Check your connection and try again.',
  profileTitle: 'Profile',
  profileDescription: 'Your display name in EagleEye View.',
  email: 'Email',
  emailNote: 'You cannot change your email yourself. Contact an admin if needed.',
  name: 'Display name',
  saveName: 'Save changes',
  nameSaved: 'Name saved.',
  nameRequired: 'Name cannot be empty.',
  /** @param {number} max */
  nameTooLong: (max) => `Name can be at most ${max} characters.`,
  nameFailed: 'The name could not be saved. Try again.',
  passwordTitle: 'Password',
  googleManagedTitle: 'Password managed by Google',
  googleManaged: 'This account signs in with Google. Password and 2-step verification are managed in your Google account.',
  sessionsTitle: 'Other devices',
  sessionsLead: 'Sign this account out of all other devices. This device stays signed in.',
  revokeOthers: 'Sign out of other devices',
  revokeTitle: 'Sign out of other devices?',
  revokeImpact: 'Every other device using this account will be signed out and must sign in again. This device stays signed in. You can sign in on those devices again at any time.',
  revoked: 'Other devices have been signed out.',
  signOut: 'Sign out',
  signingOut: 'Signing out…',
});

/** Role names as shown to the account holder. */
export const ROLE_LABELS = Object.freeze({ user: 'User', admin: 'Admin', super_admin: 'Developer (super admin)' });
