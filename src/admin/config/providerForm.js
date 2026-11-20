// src/admin/config/providerForm.js
/**
 * Form model of AI Configuration → AI Provider → "Model and voice". An empty form value means "no override": the env var
 * or built-in default decides (what the API stores is unchanged). The selects, however, always show the value in use;
 * `choiceView` maps between the two. A save overwrites only `provider`, starting from the settings last loaded.
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

/** Radix Select forbids an empty item value, so the "use the default" item travels as this sentinel. */
export const USE_DEFAULT = 'default';

/** Form value for a picked select item: the default item clears the override. */
export const overrideFromItem = (item) => (item === USE_DEFAULT ? '' : item);

/**
 * What one select shows: the value in use as the selected item, the real values as the others, and the default item
 * (clears the override) first. While nothing is saved the default IS the effective value, so it reads "marin (default)";
 * once an override is saved the server does not report the default behind it (it may come from .env), so the reset
 * item says so instead of naming a value.
 * @param {{selected: string, saved: string, effective: {value: string}, options: string[]}} input
 *   `selected` = form value (override or ''); `saved` = last saved override or ''; `effective` = server "in use" entry.
 * @returns {{value: string, items: Array<{value: string, label: string}>}}
 */
export function choiceView({ selected, saved, effective, options }) {
  const defaultValue = saved ? null : effective.value;
  let defaultLabel = COPY.choice.resetUnknown;
  if (defaultValue) defaultLabel = selected ? COPY.choice.reset(defaultValue) : COPY.choice.current(defaultValue);
  const plain = options.filter((option) => option !== defaultValue);
  if (selected && !plain.includes(selected)) plain.unshift(selected);
  return {
    value: selected || USE_DEFAULT,
    items: [{ value: USE_DEFAULT, label: defaultLabel }, ...plain.map((option) => ({ value: option, label: option }))],
  };
}
