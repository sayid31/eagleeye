// Module constants moved out of gevRealtime.js.

export const TOKEN_URL = '/api/realtime/token';

export const REALTIME_CALLS_URL = 'https://api.openai.com/v1/realtime/calls';

export const STATUS = {
  idle: 'OFF',
  connecting: 'CONNECTING',
  listening: 'LISTENING',
  executing: 'EXECUTING',
  error: 'ERROR',
};

export const CALL_DEDUPE_MS = 2500;

// WebRTC 'disconnected' is frequently momentary (a brief network blip that ICE
// recovers on its own). Give it this long to return to 'connected' before we
// treat it as a real drop (H8).
export const DISCONNECT_GRACE_MS = 6000;

export const ERROR_LOG_LIMIT = 30;

export const ERROR_STORAGE_KEY = 'gev-realtime-errors';

export const DEBUG_LOG_URL = '/api/realtime/debug-log';

// Voice cost control (repo-wide `gev:<feature>:<version>` convention;
// the neighbouring ERROR_STORAGE_KEY predates it).
export const VOICE_TIER_STORAGE_KEY = 'gev:voice-cost:tier';

export const VOICE_LIMITS_STORAGE_KEY = 'gev:voice-cost:limits';

// The input meter is intentionally stricter than the assistant-output meter:
// microphones carry room tone even after browser noise suppression, whereas the
// incoming Realtime stream is already clean speech audio.
export const MICROPHONE_VISUALIZER_GATE = 0.12;

export const ASSISTANT_VISUALIZER_GATE = 0.04;

/**
 * How many recently superseded responses to remember. Only a response that was
 * still active moments ago can have calls arriving late, so this stays tiny.
 */
export const SUPERSEDED_RESPONSE_MEMORY = 8;
