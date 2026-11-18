// src/copy/id/glossary.js
/**
 * Terminology rule for every Indonesian UI string (docs/DECISIONS.md, "Copy"): standard technical terms stay in
 * English (API key, token, log, layer, voice, password, role); words with a natural Indonesian counterpart use it.
 * `avoid` is matched case-insensitively and as a whole phrase, only against text shown to people (code, endpoints,
 * file names and audit action ids keep their names). Add a row when a new inconsistency shows up.
 *
 * @module copy/id/glossary
 */

/** @type {ReadonlyArray<{avoid: string, use: string}>} */
export const GLOSSARY = Object.freeze([
  { avoid: 'Kill switch', use: 'Sakelar darurat' },
  { avoid: 'Server Log', use: 'Log server' },
  { avoid: 'Audit Log', use: 'Jejak audit' },
  { avoid: 'Kesehatan Sistem', use: 'Kesehatan' },
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
