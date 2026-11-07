// src/voice/voiceSettingsSections.mjs
/**
 * Validation for the voice-settings sections added for the /admin dashboard
 * (AI Configuration → General): tool permission groups and session limits.
 * Split from voiceSettingsCore.mjs to keep that file within its size budget.
 *
 * Every limit uses 0 = off. The defaults are on (owner ruling 2026-11-07, see
 * docs/DECISIONS.md) so a fresh install does not run unbounded voice spend;
 * a limit saved as 0 stays off. Ranges follow the `jenna-admin` limits card
 * (planbatasanai.md, G4).
 *
 * Pure — no fs, no network, no DOM. Error strings never echo input values.
 *
 * @module voice/voiceSettingsSections
 */

import { VOICE_TOOL_GROUP_IDS, defaultToolGroups } from './voiceToolGroups.js';

export const DAILY_MINUTES_MAX = 1440;
export const SESSION_MINUTES_MIN = 1;
export const SESSION_MINUTES_MAX = 120;
export const IDLE_SECONDS_MIN = 10;
export const IDLE_SECONDS_MAX = 3600;

/** Built-in limits: 60 voice minutes a day, 30-minute sessions, close after 300 s idle. */
export const DEFAULT_SESSION_LIMITS = Object.freeze({ dailyMinutes: 60, sessionMinutes: 30, idleSeconds: 300 });

/** Fresh copy of the built-in limits. */
export function defaultSessionLimits() {
  return { ...DEFAULT_SESSION_LIMITS };
}

export const SECTION_KEYS = Object.freeze({
  toolGroups: VOICE_TOOL_GROUP_IDS,
  limits: Object.keys(defaultSessionLimits()),
});

/**
 * @param {object} section `toolGroups` from the request (already key-checked).
 * @param {string[]} errors
 * @returns {Record<string, boolean>}
 */
export function readToolGroups(section, errors) {
  const groups = defaultToolGroups();
  for (const id of VOICE_TOOL_GROUP_IDS) {
    if (section[id] === undefined) continue;
    if (typeof section[id] !== 'boolean') errors.push(`toolGroups.${id}: harus true/false`);
    else groups[id] = section[id];
  }
  return groups;
}

function readWhole(value, field, { min, max, fallback }, errors) {
  // Absent = built-in default; an explicit null/0 is the owner switching the limit off.
  if (value === undefined) return fallback;
  if (value === null || value === 0) return 0;
  if (!Number.isInteger(value) || value < min || value > max) {
    errors.push(`${field}: bilangan bulat ${min}–${max}, atau 0 untuk mati`);
    return 0;
  }
  return value;
}

/**
 * @param {object} section `limits` from the request (already key-checked).
 * @param {string[]} errors
 * @returns {{dailyMinutes: number, sessionMinutes: number, idleSeconds: number}}
 */
export function readSessionLimits(section, errors) {
  return {
    dailyMinutes: readWhole(section.dailyMinutes, 'limits.dailyMinutes', { min: 1, max: DAILY_MINUTES_MAX, fallback: DEFAULT_SESSION_LIMITS.dailyMinutes }, errors),
    sessionMinutes: readWhole(section.sessionMinutes, 'limits.sessionMinutes', { min: SESSION_MINUTES_MIN, max: SESSION_MINUTES_MAX, fallback: DEFAULT_SESSION_LIMITS.sessionMinutes }, errors),
    idleSeconds: readWhole(section.idleSeconds, 'limits.idleSeconds', { min: IDLE_SECONDS_MIN, max: IDLE_SECONDS_MAX, fallback: DEFAULT_SESSION_LIMITS.idleSeconds }, errors),
  };
}

export const EXTRA_RULES_MAX = 20;
export const EXTRA_RULE_TEXT_MAX = 200;

/**
 * Owner-added Persona rules (Forbidden → Instead). Both halves required, one
 * line each; they can only add restrictions (see voiceCoreRules.js).
 * @param {unknown} value `persona.extraRules` from the request.
 * @param {string[]} errors
 * @returns {Array<{forbid: string, instead: string}>}
 */
export function readExtraRules(value, errors) {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.length > EXTRA_RULES_MAX) {
    errors.push(`persona.extraRules: daftar maksimal ${EXTRA_RULES_MAX} aturan`);
    return [];
  }
  const rules = [];
  value.forEach((item, index) => {
    const where = `persona.extraRules[${index}]`;
    if (item === null || typeof item !== 'object' || Array.isArray(item)
      || Object.keys(item).some((key) => key !== 'forbid' && key !== 'instead')) {
      errors.push(`${where}: harus berisi forbid dan instead saja`);
      return;
    }
    const [forbid, instead] = ['forbid', 'instead'].map((key) => {
      const raw = item[key];
      if (typeof raw !== 'string') return null;
      return raw.replace(/[\u0000-\u001F\u007F-\u009F]/g, ' ').replace(/\s+/g, ' ').trim();
    });
    if (!forbid || !instead) errors.push(`${where}: larangan dan gantinya wajib diisi`);
    else if (forbid.length > EXTRA_RULE_TEXT_MAX || instead.length > EXTRA_RULE_TEXT_MAX) {
      errors.push(`${where}: maksimal ${EXTRA_RULE_TEXT_MAX} karakter per kolom`);
    } else rules.push({ forbid, instead });
  });
  return rules;
}
