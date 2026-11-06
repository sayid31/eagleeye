// src/voice/voiceSettingsSections.mjs
/**
 * Validation for the voice-settings sections added for the /admin dashboard
 * (AI Configuration → General): tool permission groups and session limits.
 * Split from voiceSettingsCore.mjs to keep that file within its size budget.
 *
 * Every limit uses 0 = off, and the default is all-off, so an install that
 * never saved these sections behaves exactly as before. Ranges follow the
 * `jenna-admin` limits card (planbatasanai.md, G4).
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

/** All limits off: no daily cap, no session length cap, no idle close. */
export function defaultSessionLimits() {
  return { dailyMinutes: 0, sessionMinutes: 0, idleSeconds: 0 };
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

function readWhole(value, field, { min, max }, errors) {
  if (value === undefined || value === null || value === 0) return 0;
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
    dailyMinutes: readWhole(section.dailyMinutes, 'limits.dailyMinutes', { min: 1, max: DAILY_MINUTES_MAX }, errors),
    sessionMinutes: readWhole(section.sessionMinutes, 'limits.sessionMinutes', { min: SESSION_MINUTES_MIN, max: SESSION_MINUTES_MAX }, errors),
    idleSeconds: readWhole(section.idleSeconds, 'limits.idleSeconds', { min: IDLE_SECONDS_MIN, max: IDLE_SECONDS_MAX }, errors),
  };
}
