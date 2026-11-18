// src/admin/config/generalForm.js
/**
 * Form model of Konfigurasi → Umum: settings ⇄ form strings, plus the instant client-side checks. The server
 * validates everything again (`validateVoiceSettings`); these checks only give a faster message.
 *
 * The server replaces settings wholesale on PUT, so the save starts from the settings last loaded and overwrites only
 * the fields this page owns — cost limits (Usage & Cost), persona rules and anything newer survive a save here.
 *
 * Pure — no DOM, no network.
 *
 * @module admin/config/generalForm
 */
import { GENERAL_COPY } from '../../copy/en/configForms.js';
import { MAX_LIVE_SESSION_MINUTES } from '../../voice/liveSessionLimits.js';
import { PERSONA_INSTRUCTIONS_MAX, PERSONA_NAME_MAX, defaultVoiceSettings } from '../../voice/voiceSettingsCore.mjs';

const COPY = GENERAL_COPY;
export { PERSONA_INSTRUCTIONS_MAX, PERSONA_NAME_MAX };

/** Limit fields on this page, in display order. */
export const LIMIT_FIELDS = Object.freeze(
  Object.entries(COPY.limits.fields).map(([key, { label, unit }]) => Object.freeze({ key, label, unit })),
);

/** English display text per tool group (the server's English label also goes into the voice prompt). */
export const TOOL_GROUP_TEXT = COPY.toolGroups;

/** Title + description for one tool group from GET /api/admin/voice/settings. */
export function describeToolGroup(group) {
  const text = TOOL_GROUP_TEXT[group.id];
  return {
    title: COPY.tools.group(text?.label ?? group.label, group.toolCount),
    description: text?.description ?? group.description,
  };
}

const limitText = (n) => (n ? String(n) : '');

/** @param {object} settings Server settings snapshot. */
export function generalFormFromSettings(settings) {
  return {
    enabled: settings.enabled !== false,
    name: settings.persona?.name ?? '',
    instructions: settings.persona?.instructions ?? '',
    toolGroups: { ...settings.toolGroups },
    limits: Object.fromEntries(LIMIT_FIELDS.map(({ key }) => [key, limitText(settings.limits?.[key])])),
  };
}

/**
 * '' or 0 = off; otherwise a whole number inside the server's range.
 * @returns {{ok: true, value: number} | {ok: false}}
 */
export function parseLimit(text, range) {
  const raw = String(text ?? '').trim();
  if (raw === '' || raw === '0') return { ok: true, value: 0 };
  if (!/^\d+$/.test(raw)) return { ok: false };
  const value = Number(raw);
  return value >= range.min && value <= range.max ? { ok: true, value } : { ok: false };
}

/**
 * Per-field errors of the limits (key → sentence); empty when every limit is valid.
 * @param {Record<string, string>} limits Field text per key.
 * @param {Record<string, {min: number, max: number}>} ranges `limitRanges` from the server.
 */
export function limitErrors(limits, ranges) {
  const errors = {};
  for (const { key, label, unit } of LIMIT_FIELDS) {
    if (!parseLimit(limits[key], ranges[key]).ok) errors[key] = COPY.limits.invalid(label, ranges[key].min, ranges[key].max, unit);
  }
  return errors;
}

/**
 * Warning for a session length above the hard cap (the cap wins at runtime), or null.
 * @param {string} text The session-minutes field.
 */
export function sessionCapWarning(text) {
  const value = Number(String(text ?? '').trim());
  return Number.isInteger(value) && value > MAX_LIVE_SESSION_MINUTES ? COPY.limits.aboveCap(value, MAX_LIVE_SESSION_MINUTES) : null;
}

/** The hard-cap sentence shown next to the session-length field. */
export const hardCapNote = () => COPY.limits.hardCap(MAX_LIVE_SESSION_MINUTES);

/**
 * @param {object} base Settings last loaded from the server.
 * @param {ReturnType<typeof generalFormFromSettings>} form
 * @param {Record<string, {min: number, max: number}>} ranges `limitRanges` from the server.
 * @returns {{ok: true, settings: object} | {ok: false, errors: Record<string, string>}} `errors` is keyed by limit field.
 */
export function settingsFromGeneralForm(base, form, ranges) {
  const errors = limitErrors(form.limits, ranges);
  if (Object.keys(errors).length) return { ok: false, errors };
  const limits = Object.fromEntries(LIMIT_FIELDS.map(({ key }) => [key, parseLimit(form.limits[key], ranges[key]).value]));
  return {
    ok: true,
    settings: {
      ...base,
      enabled: Boolean(form.enabled),
      persona: { ...base.persona, name: String(form.name ?? '').trim(), instructions: String(form.instructions ?? '').trim() },
      toolGroups: { ...base.toolGroups, ...form.toolGroups },
      limits,
    },
  };
}

/** The form with the three session limits back at the application defaults (everything else untouched). */
export function withDefaultLimits(form) {
  return { ...form, limits: generalFormFromSettings(defaultVoiceSettings()).limits };
}

/**
 * What the server currently enforces, as capability chips (never form state).
 * @param {object} settings Saved settings.
 * @param {Array<{id: string}>} toolGroups Catalog from the server.
 * @returns {Array<{name: string, enabled: boolean}>}
 */
export function enforcedChips(settings, toolGroups = []) {
  const on = toolGroups.filter((group) => settings.toolGroups?.[group.id] !== false).length;
  const topics = settings.topics?.enabled === true;
  return [
    { name: COPY.enforced.voice, enabled: settings.enabled !== false },
    { name: COPY.enforced.coreRules, enabled: true },
    { name: topics ? COPY.enforced.topicsCount(settings.topics.allowed.length) : COPY.enforced.topics, enabled: topics },
    { name: COPY.enforced.tools(on, toolGroups.length), enabled: on > 0 },
  ];
}
