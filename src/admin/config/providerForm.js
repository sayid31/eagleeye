// src/admin/config/providerForm.js
/**
 * Form model of Konfigurasi → AI Provider → "Model dan suara". An empty choice means "not chosen here": the env var or
 * built-in default decides. A save overwrites only `provider`, starting from the settings last loaded.
 *
 * Pure — no DOM, no network.
 *
 * @module admin/config/providerForm
 */
import { AI_PROVIDER_COPY as COPY } from '../../copy/en/config.js';

/** Human text for where an effective value comes from. */
export function describeSource(source) {
  return COPY.sources[source] ?? COPY.sources.default;
}

/** @param {object} settings Server settings snapshot. */
export function providerFormFromSettings(settings) {
  return { voice: settings.provider?.voice ?? '', backendModel: settings.provider?.backendModel ?? '' };
}

/**
 * @param {object} base Settings last loaded from the server.
 * @param {{voice: string, backendModel: string}} form
 * @param {{voices: string[], backendModels: string[]}} options Server allowlists.
 * @returns {{ok: true, settings: object} | {ok: false, errors: {voice?: string, backendModel?: string}}} `errors` is keyed by field.
 */
export function settingsFromProviderForm(base, form, options) {
  const errors = {};
  if (form.voice && !options.voices.includes(form.voice)) errors.voice = COPY.errors.voice;
  if (form.backendModel && !options.backendModels.includes(form.backendModel)) errors.backendModel = COPY.errors.backend;
  if (Object.keys(errors).length) return { ok: false, errors };
  return { ok: true, settings: { ...base, provider: { voice: form.voice, backendModel: form.backendModel } } };
}
