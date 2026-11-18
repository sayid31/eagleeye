/**
 * Terminology rule for every Indonesian UI string (docs/DECISIONS.md, "Copy"): standard technical terms stay in
 * English (API key, token, log, layer, voice, password, role); words with a natural Indonesian counterpart use it.
 * The menu and page names are the dashboard's original ones and are enforced here: "Kill switch", "Server Log",
 * "Audit Log", "Kesehatan Sistem", "Pemakaian", "Pemakaian & Biaya", "Konfigurasi AI", "Penyedia AI", "API Keys",
 * "Log Login". `avoid` is matched case-insensitively and as a whole phrase, only against text shown to people (code,
 * endpoints, file names and audit action ids keep their names). Add a row when a new inconsistency shows up.
 *
 * On/off vocabulary: accounts, capabilities and settings are "aktif / nonaktif" ("nonaktifkan"); only the Kill switch
 * gates are "menyala / dimatikan" (a switch). "Mati" alone is never used.
 *
 * @module copy/en/glossary
 */

/** @type {ReadonlyArray<{avoid: string, use: string}>} */
export const GLOSSARY = Object.freeze([
  { avoid: 'Sakelar darurat', use: 'Kill switch' },
  { avoid: 'Log server', use: 'Server Log' },
  { avoid: 'Jejak audit', use: 'Audit Log' },
  { avoid: 'Anggaran provider', use: 'Pemakaian & budget' },
  { avoid: 'Penyedia & API Keys', use: 'API Keys' },
  { avoid: 'Aktivitas', use: 'Log Login / Audit' },
  { avoid: 'Pemakai', use: 'Pengguna' },
  { avoid: 'Mati', use: 'Nonaktif' },
  { avoid: 'Sign-in', use: 'Login' },
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
