// src/voice/voiceSettingsCore.mjs
/**
 * Pure model for the owner-editable voice settings (/admin → AI Configuration).
 *
 * Contract: an absent/empty/never-saved settings object is the DEFAULT, and the
 * default reproduces the pre-settings voice behavior exactly — voice enabled,
 * built-in $2/$5 cost limits, built-in persona, topic restriction OFF, every
 * tool group on, every session limit off (see voiceSettingsSections.mjs).
 *
 * Holds no secrets by design: there is no field here that could carry an API
 * key, and `validateVoiceSettings` rejects unknown fields so one cannot be
 * smuggled in. Keys stay in the server `.env` (see keySetupCore.mjs).
 *
 * Pure — no fs, no network, no DOM.
 *
 * @module voice/voiceSettingsCore
 */

import { VOICE_COST_LIMIT_OFF } from './voiceCost.js';
import { defaultToolGroups } from './voiceToolGroups.js';
import {
  SECTION_KEYS as EXTRA_SECTION_KEYS, defaultSessionLimits, readSessionLimits, readToolGroups,
} from './voiceSettingsSections.mjs';

export const VOICE_SETTINGS_VERSION = 1;
export const COST_LIMIT_MIN_USD = 0.1;
export const COST_LIMIT_MAX_USD = 1000;
export const PERSONA_NAME_MAX = 40;
export const PERSONA_INSTRUCTIONS_MAX = 1000;
export const TOPICS_MAX = 20;
export const TOPIC_MAX = 60;
export const REFUSAL_MAX = 160;

/** The settings that mean "behave exactly as before any settings existed". */
export function defaultVoiceSettings() {
  return {
    version: VOICE_SETTINGS_VERSION,
    enabled: true,
    costLimits: { warnUsd: null, capUsd: null },
    persona: { name: '', instructions: '' },
    topics: { enabled: false, allowed: [], refusal: '' },
    toolGroups: defaultToolGroups(),
    limits: defaultSessionLimits(),
  };
}

const ROOT_KEYS = ['version', 'enabled', 'costLimits', 'persona', 'topics', 'toolGroups', 'limits'];
const SECTION_KEYS = {
  costLimits: ['warnUsd', 'capUsd'],
  persona: ['name', 'instructions'],
  topics: ['enabled', 'allowed', 'refusal'],
  ...EXTRA_SECTION_KEYS,
};

const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

/** Drop C0/C1 control characters; keep `\n` only when `keepNewlines`. */
function cleanText(value, keepNewlines) {
  const pattern = keepNewlines
    ? /[\u0000-\u0009\u000B-\u001F\u007F-\u009F]/g
    : /[\u0000-\u001F\u007F-\u009F]/g;
  return value.replace(pattern, '').trim();
}

function readText(value, field, max, errors, { keepNewlines = false } = {}) {
  if (value === undefined || value === null) return '';
  if (typeof value !== 'string') {
    errors.push(`${field}: harus berupa teks`);
    return '';
  }
  const text = cleanText(value, keepNewlines);
  if (text.length > max) errors.push(`${field}: maksimal ${max} karakter`);
  return text;
}

function readLimit(value, field, errors) {
  if (value === undefined || value === null) return null;
  if (value === VOICE_COST_LIMIT_OFF) return VOICE_COST_LIMIT_OFF;
  if (typeof value !== 'number' || !Number.isFinite(value)
    || value < COST_LIMIT_MIN_USD || value > COST_LIMIT_MAX_USD) {
    errors.push(`${field}: angka ${COST_LIMIT_MIN_USD}–${COST_LIMIT_MAX_USD}, 'off', atau kosong`);
    return null;
  }
  return Math.round(value * 100) / 100;
}

function readBoolean(value, field, errors, fallback) {
  if (value === undefined) return fallback;
  if (typeof value !== 'boolean') {
    errors.push(`${field}: harus true/false`);
    return fallback;
  }
  return value;
}

function checkKeys(obj, allowed, where, errors) {
  for (const key of Object.keys(obj)) {
    if (!allowed.includes(key)) errors.push(`${where}${key}: field tidak dikenal`);
  }
}

function readTopics(section, errors) {
  const topics = { enabled: false, allowed: [], refusal: '' };
  topics.enabled = readBoolean(section.enabled, 'topics.enabled', errors, false);
  if (section.allowed !== undefined) {
    if (!Array.isArray(section.allowed) || section.allowed.length > TOPICS_MAX) {
      errors.push(`topics.allowed: daftar maksimal ${TOPICS_MAX} topik`);
    } else {
      const seen = new Set();
      section.allowed.forEach((raw, index) => {
        const text = readText(raw, `topics.allowed[${index}]`, TOPIC_MAX, errors);
        if (text && !seen.has(text.toLowerCase())) {
          seen.add(text.toLowerCase());
          topics.allowed.push(text);
        }
      });
    }
  }
  topics.refusal = readText(section.refusal, 'topics.refusal', REFUSAL_MAX, errors);
  if (/[\r\n]/.test(String(section.refusal ?? ''))) {
    errors.push('topics.refusal: harus satu kalimat tanpa baris baru');
  }
  if (topics.enabled && topics.allowed.length === 0) {
    errors.push('topics.allowed: wajib minimal satu topik saat pembatasan aktif');
  }
  return topics;
}

/**
 * Validate and normalize a full settings object (PUT replaces, never merges).
 * Never throws; never echoes input values back in error strings.
 *
 * @param {unknown} input
 * @returns {{ok: true, value: object} | {ok: false, errors: string[]}}
 */
export function validateVoiceSettings(input) {
  if (!isPlainObject(input)) return { ok: false, errors: ['body: harus berupa objek JSON'] };
  const errors = [];
  checkKeys(input, ROOT_KEYS, '', errors);
  for (const [name, keys] of Object.entries(SECTION_KEYS)) {
    if (input[name] !== undefined && !isPlainObject(input[name])) {
      errors.push(`${name}: harus berupa objek`);
    } else if (input[name] !== undefined) {
      checkKeys(input[name], keys, `${name}.`, errors);
    }
  }
  if (input.version !== undefined && input.version !== VOICE_SETTINGS_VERSION) {
    errors.push(`version: harus ${VOICE_SETTINGS_VERSION}`);
  }
  if (errors.length) return { ok: false, errors };

  const cost = input.costLimits || {};
  const persona = input.persona || {};
  const value = defaultVoiceSettings();
  value.enabled = readBoolean(input.enabled, 'enabled', errors, true);
  value.costLimits.warnUsd = readLimit(cost.warnUsd, 'costLimits.warnUsd', errors);
  value.costLimits.capUsd = readLimit(cost.capUsd, 'costLimits.capUsd', errors);
  const { warnUsd, capUsd } = value.costLimits;
  if (typeof warnUsd === 'number' && typeof capUsd === 'number' && capUsd < warnUsd) {
    errors.push('costLimits.capUsd: tidak boleh lebih kecil dari warnUsd');
  }
  value.persona.name = readText(persona.name, 'persona.name', PERSONA_NAME_MAX, errors);
  value.persona.instructions = readText(
    persona.instructions, 'persona.instructions', PERSONA_INSTRUCTIONS_MAX, errors, { keepNewlines: true },
  );
  value.topics = readTopics(input.topics || {}, errors);
  value.toolGroups = readToolGroups(input.toolGroups || {}, errors);
  value.limits = readSessionLimits(input.limits || {}, errors);
  return errors.length ? { ok: false, errors } : { ok: true, value };
}

/**
 * Coerce whatever was read from disk into valid settings; anything invalid
 * falls back to the defaults (= old behavior) instead of half-applying.
 */
export function normalizeStoredSettings(raw) {
  if (raw === null || raw === undefined) return { settings: defaultVoiceSettings(), valid: true };
  const result = validateVoiceSettings(raw);
  return result.ok
    ? { settings: result.value, valid: true }
    : { settings: defaultVoiceSettings(), valid: false };
}

/**
 * The slice the voice CLIENT needs at session start. Deliberately excludes
 * persona instructions, topic rules and tool groups (server-side session
 * material) and has no key-bearing field of any kind. `limits` lets the mic
 * close a session on length/idle; the daily cap is ALSO enforced server-side.
 */
export function publicVoiceConfig(settings) {
  return {
    enabled: settings.enabled,
    assistantName: settings.persona.name,
    costLimits: { ...settings.costLimits },
    limits: { ...settings.limits },
  };
}
