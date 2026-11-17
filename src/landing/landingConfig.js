// src/landing/landingConfig.js
/**
 * Owner-editable settings for the public landing page (`landing.html`).
 * Nothing here is a secret: this module ships in the browser bundle.
 *
 * @module landing/landingConfig
 */

/**
 * Where "Minta akses" points (a `mailto:` or `https:` URL). Empty = the
 * request-access contact is hidden everywhere on the page. Left empty until
 * the owner decides on a contact (plan/auth/08-open-questions.md #10).
 */
export const LANDING_ACCESS_CONTACT = '';

/** How long the landing waits for `GET /api/me` before showing "Masuk". */
export const ME_FETCH_TIMEOUT_MS = 2500;

const ALLOWED_CONTACT_SCHEMES = new Set(['mailto:', 'https:']);

/**
 * Validated href for the request-access contact, or `null` when it is not
 * configured or is not a `mailto:`/`https:` URL.
 * @param {string} [contact]
 * @returns {string | null}
 */
export function accessContactHref(contact = LANDING_ACCESS_CONTACT) {
  const value = typeof contact === 'string' ? contact.trim() : '';
  if (!value) return null;
  // Not an absolute URL is a misconfiguration: the contact stays hidden.
  if (!URL.canParse(value)) return null;
  return ALLOWED_CONTACT_SCHEMES.has(new URL(value).protocol) ? value : null;
}
