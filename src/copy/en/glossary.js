/**
 * Terminology rule for every English UI string (docs/DECISIONS.md, "Copy"): the menu and page names below are the
 * dashboard's original ones and are enforced here ("Overview", "System Overview", "Users", "Users & Admins",
 * "Login Log", "Audit", "Kill switch", "Usage", "API Keys", "AI Configuration", "General", "AI Provider", "Persona",
 * "Usage & Cost", "Server Log", "Audit Log", "System Health"; the verbs are "Sign in" / "Sign out"; the noun is
 * "Login"). `avoid` is matched case-insensitively and as a whole phrase, only against text shown to people (code,
 * endpoints, file names and audit action ids keep their names). Add a row when a new inconsistency shows up.
 *
 * On/off vocabulary: accounts, capabilities and settings are "active / inactive" ("deactivate"); only the Kill switch
 * gates are "on / off" (a switch).
 *
 * @module copy/en/glossary
 */

/** @type {ReadonlyArray<{avoid: string, use: string}>} */
export const GLOSSARY = Object.freeze([
  { avoid: 'Emergency switch', use: 'Kill switch' },
  { avoid: 'Server logs', use: 'Server Log' },
  { avoid: 'Audit trail', use: 'Audit Log' },
  { avoid: 'Provider budget', use: 'Usage & budget' },
  { avoid: 'Providers & API Keys', use: 'API Keys' },
  { avoid: 'End user', use: 'User' },
  { avoid: 'Log in', use: 'Sign in' },
  { avoid: 'Log out', use: 'Sign out' },
  { avoid: 'Sign-in', use: 'Login' },
  { avoid: 'Dashboard', use: 'Overview' },
]);

/** The menu and page names that must read exactly like this wherever they are shown. */
export const REQUIRED_TERMS = Object.freeze([
  'Overview', 'System Overview', 'Users', 'Users & Admins', 'Login Log', 'Audit', 'Kill switch', 'Usage', 'API Keys',
  'AI Configuration', 'General', 'AI Provider', 'Persona', 'Usage & Cost', 'Server Log', 'Audit Log', 'System Health',
  'Sign in', 'Sign out',
]);

const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Glossary rows whose discouraged term appears in `text`.
 * @param {string} text
 * @returns {Array<{avoid: string, use: string}>}
 */
export function findGlossaryViolations(text) {
  return GLOSSARY.filter(({ avoid }) => new RegExp(`(^|[^\\p{L}])${escapeRegExp(avoid)}(?![\\p{L}])`, 'iu').test(String(text)));
}
