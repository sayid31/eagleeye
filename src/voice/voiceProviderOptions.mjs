// src/voice/voiceProviderOptions.mjs
/**
 * Owner-selectable OpenAI voice and backend model for GPT-Live sessions
 * (/admin → AI Configuration → AI Provider). The provider stays OpenAI and
 * the frontend model stays `gpt-live-1` (plan decision 6).
 *
 * Precedence per field: saved setting → env var → built-in default. An empty
 * saved value means "not chosen in /admin", so an install that never saved
 * this section keeps exactly the env/default behavior it had before.
 *
 * Allowlists, checked against OpenAI's API reference on 2026-11-06
 * (developers.openai.com/api/reference/resources/live/primary-websocket.md and
 * docs/guides/live-delegation.md):
 *  - VOICE_OPTIONS = the 31 built-in `audio.output.voice` names.
 *  - BACKEND_MODEL_OPTIONS = the delegation backend in use today plus the two
 *    the delegation guide names (`gpt-6-luna` to start, `gpt-6-sol` for
 *    harder tasks).
 *
 * Pure — no fs, no network, no DOM. Error strings never echo input values.
 *
 * @module voice/voiceProviderOptions
 */

import {
  LIVE_VOICE_DEFAULT, OPENAI_LIVE_BACKEND_MODEL_DEFAULT, OPENAI_LIVE_MODEL_DEFAULT,
} from './openAiLiveProxy.mjs';

export const VOICE_OPTIONS = Object.freeze([
  'alloy', 'ash', 'ballad', 'beacon', 'bossa', 'brise', 'cedar', 'cinder', 'coral', 'delta', 'echo',
  'flitz', 'gleam', 'harema', 'juni', 'marin', 'meridian', 'nira', 'noeul', 'nuri', 'quartz', 'ripple',
  'sage', 'shida', 'shimmer', 'sillage', 'stone', 'tempo', 'verse', 'vesper', 'willow',
]);

export const BACKEND_MODEL_OPTIONS = Object.freeze([OPENAI_LIVE_BACKEND_MODEL_DEFAULT, 'gpt-6-luna', 'gpt-6-sol']);

export const PROVIDER_KEYS = Object.freeze(['voice', 'backendModel']);

/** Nothing chosen in /admin: env vars and built-in defaults decide. */
export function defaultProviderSettings() {
  return { voice: '', backendModel: '' };
}

function readChoice(value, field, options, errors) {
  if (value === undefined || value === null || value === '') return '';
  if (typeof value !== 'string' || !options.includes(value)) {
    errors.push(`${field}: pilih salah satu dari daftar, atau kosong untuk default`);
    return '';
  }
  return value;
}

/**
 * @param {object} section `provider` from the request (already key-checked).
 * @param {string[]} errors
 * @returns {{voice: string, backendModel: string}}
 */
export function readProviderSettings(section, errors) {
  return {
    voice: readChoice(section.voice, 'provider.voice', VOICE_OPTIONS, errors),
    backendModel: readChoice(section.backendModel, 'provider.backendModel', BACKEND_MODEL_OPTIONS, errors),
  };
}

function pick(saved, envValue, fallback) {
  if (saved) return { value: saved, source: 'admin' };
  if (envValue) return { value: envValue, source: 'env' };
  return { value: fallback, source: 'default' };
}

/**
 * What a new live session will use, and where each value came from.
 * @param {{voice?: string, backendModel?: string}} [provider] Saved settings.
 * @param {Record<string, string|undefined>} [env]
 */
export function resolveLiveProvider(provider = {}, env = {}) {
  return {
    model: pick('', env.OPENAI_LIVE_MODEL, OPENAI_LIVE_MODEL_DEFAULT),
    backendModel: pick(provider.backendModel, env.OPENAI_LIVE_BACKEND_MODEL, OPENAI_LIVE_BACKEND_MODEL_DEFAULT),
    voice: pick(provider.voice, env.OPENAI_LIVE_VOICE, LIVE_VOICE_DEFAULT),
  };
}
