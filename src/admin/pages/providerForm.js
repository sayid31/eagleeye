// src/admin/pages/providerForm.js
/**
 * Form model of AI Configuration → AI Provider → "Model and voice". An empty
 * choice means "not chosen here": the env var or built-in default decides.
 * A save overwrites only `provider`, starting from the settings last loaded.
 *
 * Pure — no DOM, no network.
 *
 * @module admin/pages/providerForm
 */

const SOURCE_LABELS = { admin: 'chosen here', env: 'from .env', default: 'built-in default' };

/** Human text for where an effective value comes from. */
export function describeSource(source) {
  return SOURCE_LABELS[source] ?? 'built-in default';
}

/** @param {object} settings Server settings snapshot. */
export function providerFormFromSettings(settings) {
  return { voice: settings.provider?.voice ?? '', backendModel: settings.provider?.backendModel ?? '' };
}

/**
 * @param {object} base Settings last loaded from the server.
 * @param {{voice: string, backendModel: string}} form
 * @param {{voices: string[], backendModels: string[]}} options Server allowlists.
 * @returns {{ok: true, settings: object} | {ok: false, errors: string[]}}
 */
export function settingsFromProviderForm(base, form, options) {
  const errors = [];
  if (form.voice && !options.voices.includes(form.voice)) errors.push('Voice: choose one from the list.');
  if (form.backendModel && !options.backendModels.includes(form.backendModel)) errors.push('Backend model: choose one from the list.');
  if (errors.length) return { ok: false, errors };
  return { ok: true, settings: { ...base, provider: { voice: form.voice, backendModel: form.backendModel } } };
}
