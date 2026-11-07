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

/**
 * Status badge for one registry entry from GET /api/admin/keys. A key the
 * provider just refused on "Test connection" shows as rejected until reload.
 * @param {{set: boolean, managed?: string|null}} key
 * @param {string|null} [lastTestResult] `result` code of this visit's last test.
 */
export function keyStatusBadge(key, lastTestResult = null) {
  if (!key.set) return { label: 'Kosong', tone: 'muted' };
  if (lastTestResult === 'rejected') return { label: 'Ditolak', tone: 'error' };
  if (key.managed === 'external') return { label: 'Terisi di luar aplikasi (hanya baca)', tone: 'info' };
  return { label: 'Terisi', tone: 'ok' };
}

/**
 * Placeholder of a key field: says whether a value is saved without carrying
 * any of its characters (the server never sends one).
 */
export function secretPlaceholder(key) {
  return key.set ? '•••••••••••• tersimpan' : 'Belum diisi';
}

/** Only keys this app's own store holds can be replaced or removed here. */
export const isEditable = (key) => !key.set || key.managed === 'file';

/** Where saved keys go, in owner terms. */
export function storeLabel(store) {
  return store === 'pinokio-environment' ? 'file ENVIRONMENT Pinokio' : 'file .env proyek';
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
      return { ok: false, error: key.envVars.length > 1 ? `Isi semua kolom untuk ${key.title} (${key.envVars.join(', ')}).` : `Tempel key ${key.title} dulu.` };
    }
    if (/\s/.test(value)) return { ok: false, error: `${name} tidak boleh berisi spasi.` };
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
  rejected: { tone: 'error', label: 'Ditolak' },
  unreachable: { tone: 'warn', label: 'Belum dicek' },
  untestable: { tone: 'muted', label: 'Tidak bisa dites' },
  not_set: { tone: 'muted', label: 'Tanpa key' },
});

/** Line shown under a provider after "Test connection". */
export function describeTestResult(outcome) {
  const http = outcome.httpStatus ? ` (HTTP ${outcome.httpStatus})` : '';
  const { tone, label } = TEST_RESULTS[outcome.result] ?? { tone: 'muted', label: 'Tidak diketahui' };
  return { text: `${outcome.message}${http}`, tone, label, result: outcome.result ?? null };
}
