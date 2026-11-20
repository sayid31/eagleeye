// src/admin/config/providerKeysView.js
/**
 * View-model of API Keys: one row per provider from GET /api/admin/keys (never a key value — only presence), the input
 * rules of the "Change key" sheet and the wording of connection-test results. The server validates every value
 * again (`validateKeySetupUpdates`).
 *
 * Pure — no DOM, no network.
 *
 * @module admin/config/providerKeysView
 */
import {
  KEY_FIELD_LABELS, KEY_SHEET_COPY, KEY_TEST_NOTES, KEY_TEST_RESULTS, KEY_UNREACHABLE_HINTS, PROVIDERS_COPY, PROVIDER_COPY,
} from '../../copy/en/config.js';

const COPY = PROVIDERS_COPY;

/**
 * Which page manages a provider's key. Default `api-keys`; OpenAI is `ai-provider` (its key sits next to the voice
 * and model choices). Status-only lists elsewhere (system overview, kill switch) still show every provider.
 */
export const KEY_OWNER_PAGES = Object.freeze({ openai: 'ai-provider' });
export const KEYS_PAGE_OWNER = 'api-keys';
export const AI_PROVIDER_PAGE_OWNER = 'ai-provider';

/** Page that manages this provider's key. */
export const keyOwner = (id) => KEY_OWNER_PAGES[id] ?? KEYS_PAGE_OWNER;

const ownedBy = (payload, owner) => payload.keys.filter((key) => keyOwner(key.id) === owner);

/** Only keys this app's own store holds can be replaced or removed here. */
export const isEditable = (key) => !key.set || key.managed === 'file';

/** Name and purpose of a provider; an id the copy does not know falls back to the server's title. */
export function providerText(key) {
  return PROVIDER_COPY[key.id] ?? { name: key.title ?? key.id, purpose: key.unlocks ?? '' };
}

/** Field label: "API key" for a single-variable provider, the part's own name otherwise. */
export function fieldLabel(key, envVar) {
  if (KEY_FIELD_LABELS[envVar]) return KEY_FIELD_LABELS[envVar];
  return key.envVars.length === 1 ? KEY_SHEET_COPY.singleField : envVar;
}

/**
 * Wording of one connection-test outcome.
 * @param {{result?: string, message?: string}} outcome Reply of POST /api/admin/keys/test.
 * @param {string} id Provider id (for provider-specific hints).
 * @returns {{result: string, label: string, text: string, tone: 'success' | 'destructive' | 'warning' | 'muted'}}
 */
export function describeTestResult(outcome, id) {
  if (outcome?.result === 'error') return { result: 'error', label: KEY_SHEET_COPY.testFailed, text: outcome.message ?? '', tone: 'destructive' };
  const result = Object.hasOwn(KEY_TEST_RESULTS, outcome?.result) ? outcome.result : 'unknown';
  const entry = KEY_TEST_RESULTS[result];
  const tone = { ok: 'success', rejected: 'destructive', unreachable: 'warning' }[result] ?? 'muted';
  const hint = result === 'unreachable' ? (KEY_UNREACHABLE_HINTS[id] ?? '') : '';
  return { result, label: entry.label, text: `${entry.text}${hint}`, tone };
}

/** What the connection test does for this provider, in English. */
export const testNote = (id) => KEY_TEST_NOTES[id] ?? '';

/**
 * Status of a key: "Ditolak" only after this visit's test was refused; otherwise present/absent.
 * @param {{set: boolean}} key
 * @param {string | null} [lastResult] `result` of this visit's last test.
 * @returns {{id: 'set' | 'unset' | 'rejected', label: string, tone: 'success' | 'muted' | 'destructive'}}
 */
export function keyStatus(key, lastResult = null) {
  if (!key.set) return { id: 'unset', label: COPY.status.unset, tone: 'muted' };
  if (lastResult === 'rejected') return { id: 'rejected', label: COPY.status.rejected, tone: 'destructive' };
  return { id: 'set', label: COPY.status.set, tone: 'success' };
}

/**
 * Rows of the provider table of one page (API Keys by default; `ai-provider` gives the OpenAI row).
 * @param {{keys: object[], store: string}} payload GET /api/admin/keys.
 * @param {Record<string, {result: string, at: number}>} [tests] This visit's test results by provider id.
 * @param {string} [owner] Page that manages the rows (see keyOwner).
 */
export function providerRows(payload, tests = {}, owner = KEYS_PAGE_OWNER) {
  return ownedBy(payload, owner).map((key) => {
    const text = providerText(key);
    const last = tests[key.id] ?? null;
    return {
      id: key.id,
      key,
      name: text.name,
      purpose: text.purpose,
      tier: COPY.tier[key.tier] ?? '',
      envVars: key.envVars,
      status: keyStatus(key, last?.result),
      editable: isEditable(key),
      testable: key.set,
      lastTest: last,
    };
  });
}

/** "5 of 7 providers have a key…" — counts only the providers the API Keys page manages. */
export function providersSummary(payload) {
  const owned = ownedBy(payload, KEYS_PAGE_OWNER);
  return COPY.summary(owned.filter((key) => key.set).length, owned.length);
}

/**
 * Build the PUT body for one provider from its input fields. Multi-variable providers (OpenSky id + secret) must be
 * saved together.
 * @param {{envVars: string[], id: string}} key
 * @param {Record<string, string>} values Raw field text per env var.
 * @returns {{ok: true, updates: Record<string, string>} | {ok: false, errors: Record<string, string>}} `errors` is keyed by env var.
 */
export function buildKeyUpdate(key, values) {
  const updates = {};
  const errors = {};
  for (const name of key.envVars) {
    const value = String(values?.[name] ?? '').trim();
    const label = fieldLabel(key, name);
    if (!value) errors[name] = key.envVars.length > 1 ? KEY_SHEET_COPY.errors.allFields : KEY_SHEET_COPY.errors.fieldEmpty(label);
    else if (/\s/.test(value)) errors[name] = KEY_SHEET_COPY.errors.fieldSpace(label);
    else updates[name] = value;
  }
  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, updates };
}

/** PUT body that removes every variable of one provider. */
export function buildKeyRemoval(key) {
  return Object.fromEntries(key.envVars.map((name) => [name, null]));
}
