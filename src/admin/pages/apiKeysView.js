// src/admin/pages/apiKeysView.js
/**
 * Presentation + input rules for /admin → API Keys. Pure — no DOM, no network.
 * The server validates every value again (`validateKeySetupUpdates`).
 *
 * @module admin/pages/apiKeysView
 */

/**
 * Keys that belong to the AI model provider. They are managed on
 * AI Configuration → AI Provider, not on the API Keys page (owner request).
 */
export const AI_PROVIDER_KEY_IDS = Object.freeze(['openai']);

/**
 * Split GET /api/admin/keys into the AI-provider keys and the data-source keys,
 * each with its own configured count.
 * @param {Array<{id: string, set: boolean}>} keys
 */
export function partitionKeys(keys) {
  const pick = (inAi) => {
    const list = keys.filter((key) => AI_PROVIDER_KEY_IDS.includes(key.id) === inAi);
    return { keys: list, setCount: list.filter((key) => key.set).length, total: list.length };
  };
  return { ai: pick(true), data: pick(false) };
}

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

/** Result code → tone (colour) and a word that says the status without colour. */
const TEST_RESULTS = Object.freeze({
  ok: { tone: 'ok', label: 'OK' },
  rejected: { tone: 'error', label: 'Rejected' },
  unreachable: { tone: 'warn', label: 'Not checked' },
  untestable: { tone: 'muted', label: 'Not testable' },
  not_set: { tone: 'muted', label: 'No key' },
});

/** Line shown under a provider after "Test connection". */
export function describeTestResult(outcome) {
  const http = outcome.httpStatus ? ` (HTTP ${outcome.httpStatus})` : '';
  const { tone, label } = TEST_RESULTS[outcome.result] ?? { tone: 'muted', label: 'Unknown' };
  return { text: `${outcome.message}${http}`, tone, label };
}
