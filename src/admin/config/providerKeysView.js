// src/admin/config/providerKeysView.js
/**
 * View-model of API Keys: one row per provider from GET /api/admin/keys (never a key value — only presence
 * and source), the input rules of the "Ubah kunci" sheet and the wording of connection-test results. The server
 * validates every value again (`validateKeySetupUpdates`).
 *
 * Pure — no DOM, no network.
 *
 * @module admin/config/providerKeysView
 */
import {
  KEY_FIELD_LABELS, KEY_SHEET_COPY, KEY_TEST_NOTES, KEY_TEST_RESULTS, KEY_UNREACHABLE_HINTS, PROVIDERS_COPY, PROVIDER_COPY,
} from '../../copy/en/config.js';

const COPY = PROVIDERS_COPY;

/** Where saved keys go, in owner terms. */
export function storeLabel(store) {
  return store === 'pinokio-environment' ? COPY.stores.pinokio : COPY.stores.env;
}

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
  const result = Object.hasOwn(KEY_TEST_RESULTS, outcome?.result) ? outcome.result : 'unknown';
  const entry = KEY_TEST_RESULTS[result];
  const tone = { ok: 'success', rejected: 'destructive', unreachable: 'warning' }[result] ?? 'muted';
  const hint = result === 'unreachable' ? (KEY_UNREACHABLE_HINTS[id] ?? '') : '';
  return { result, label: entry.label, text: `${entry.text}${hint}`, tone };
}

/** What the connection test does for this provider, in Indonesian. */
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

/** Source of a present key: the app's own store, or somewhere outside the app (read-only here). */
export function keySource(key, store) {
  if (!key.set) return { id: 'none', label: COPY.sources.none };
  if (key.managed === 'external') return { id: 'external', label: COPY.sources.external };
  return store === 'pinokio-environment' ? { id: 'pinokio', label: COPY.sources.pinokio } : { id: 'env', label: COPY.sources.env };
}

/**
 * Rows of the provider table.
 * @param {{keys: object[], store: string}} payload GET /api/admin/keys.
 * @param {Record<string, {result: string, at: number}>} [tests] This visit's test results by provider id.
 */
export function providerRows(payload, tests = {}) {
  return payload.keys.map((key) => {
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
      source: keySource(key, payload.store),
      editable: isEditable(key),
      testable: key.set,
      lastTest: last,
    };
  });
}

/** "5 dari 8 penyedia sudah punya kunci…" */
export function providersSummary(payload) {
  const set = payload.keys.filter((key) => key.set).length;
  return COPY.summary(set, payload.keys.length, storeLabel(payload.store));
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
