// src/admin/pages/apiKeysView.js
/**
 * Presentation + input rules for /admin → API Keys. Pure — no DOM, no network.
 * The server validates every value again (`validateKeySetupUpdates`).
 *
 * @module admin/pages/apiKeysView
 */

/** Status pill for one registry entry from GET /api/admin/keys. */
export function keyStatusBadge(key) {
  if (!key.set) return { label: 'Missing', tone: 'muted' };
  if (key.managed === 'external') return { label: 'Set outside this app (read-only)', tone: 'info' };
  return { label: 'Configured', tone: 'ok' };
}

/** Only keys this app's own store holds can be replaced or removed here. */
export const isEditable = (key) => !key.set || key.managed === 'file';

/** Where saved keys go, in owner terms. */
export function storeLabel(store) {
  return store === 'pinokio-environment' ? 'the Pinokio ENVIRONMENT file' : 'the project .env file';
}

/**
 * Build the PUT body for one provider from its input fields. Multi-variable
 * providers (OpenSky id + secret) must be saved together.
 * @param {{envVars: string[], title: string}} key
 * @param {Record<string, string>} values Raw field text per env var.
 * @returns {{ok: true, updates: Record<string, string>} | {ok: false, error: string}}
 */
export function buildKeyUpdate(key, values) {
  const updates = {};
  for (const name of key.envVars) {
    const value = String(values?.[name] ?? '').trim();
    if (!value) {
      return { ok: false, error: key.envVars.length > 1 ? `Fill in every field for ${key.title} (${key.envVars.join(', ')}).` : `Paste the ${key.title} key first.` };
    }
    if (/\s/.test(value)) return { ok: false, error: `${name} must not contain spaces.` };
    updates[name] = value;
  }
  return { ok: true, updates };
}

/** PUT body that removes every variable of one provider. */
export function buildKeyRemoval(key) {
  return Object.fromEntries(key.envVars.map((name) => [name, null]));
}

const TEST_TONES = { ok: 'ok', rejected: 'error', unreachable: 'warn', untestable: 'muted', not_set: 'muted' };

/** Line shown under a provider after "Test connection". */
export function describeTestResult(outcome) {
  const http = outcome.httpStatus ? ` (HTTP ${outcome.httpStatus})` : '';
  return { text: `${outcome.message}${http}`, tone: TEST_TONES[outcome.result] ?? 'muted' };
}
