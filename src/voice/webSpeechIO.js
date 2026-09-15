// src/voice/webSpeechIO.js
/**
 * Thin wrapper around the browser-native Web Speech API (`SpeechRecognition`
 * for STT, `speechSynthesis`/`SpeechSynthesisUtterance` for TTS) — the $0,
 * zero-dependency speech I/O paired with the Claude voice backend
 * (`gevClaudeVoice.js`, not this module) as a stopgap for OpenAI Realtime's
 * WebRTC speech-to-speech pipeline (`gevRealtime.js`).
 *
 * Deliberately turn-based, not always-listening: `createRecognizer` always
 * builds a `continuous = false` recognizer (one utterance per `start()`).
 * `SpeechRecognition.continuous = true` degrades unpredictably across
 * tab-visibility changes and browser (see the plan's Risk #1) — push-to-talk
 * by construction avoids that whole failure class rather than working around
 * it.
 *
 * This module only knows about Web Speech API primitives — no Cesium, no app
 * state, no network. It takes the global object to read constructors from as
 * a parameter (defaulting to `window`) precisely so tests can inject fake
 * constructors instead of requiring a real browser.
 *
 * @module voice/webSpeechIO
 */

/**
 * @param {any} [globalObject] defaults to `window`; injectable for tests.
 * @returns {Function|null} the SpeechRecognition constructor, preferring the
 *   unprefixed name, falling back to the WebKit-prefixed one, or `null` if
 *   neither exists (Firefox has no default support — see the plan's Risk #2).
 */
function resolveSpeechRecognitionCtor(globalObject) {
  if (!globalObject) return null;
  return globalObject.SpeechRecognition || globalObject.webkitSpeechRecognition || null;
}

/** @param {any} [globalObject] defaults to `window`. */
export function isSpeechRecognitionSupported(globalObject = typeof window === 'undefined' ? null : window) {
  return Boolean(resolveSpeechRecognitionCtor(globalObject));
}

/** @param {any} [globalObject] defaults to `window`. */
export function isSpeechSynthesisSupported(globalObject = typeof window === 'undefined' ? null : window) {
  return Boolean(globalObject && globalObject.speechSynthesis && typeof globalObject.SpeechSynthesisUtterance === 'function');
}

/**
 * Build a push-to-talk speech recognizer: single utterance per `start()`
 * call, English interim results disabled (only final transcripts matter for
 * a tool-calling voice loop — interim text would just churn the UI for no
 * benefit here).
 *
 * @param {object} options
 * @param {(transcript: string) => void} options.onResult called once, with
 *   the final transcript of the utterance.
 * @param {(error: string) => void} [options.onError] called with the
 *   recognizer's error code (e.g. 'no-speech', 'not-allowed', 'network').
 * @param {() => void} [options.onEnd] called when the recognizer session
 *   ends, whether from a result, an error, or the user stopping early.
 * @param {string} [options.lang] BCP-47 language tag, defaults to the
 *   document's language or 'en-US'.
 * @param {any} [options.globalObject] defaults to `window`; injectable for
 *   tests.
 * @returns {{start: () => void, stop: () => void, abort: () => void}|null}
 *   `null` if the browser has no SpeechRecognition support at all.
 */
export function createRecognizer({
  onResult,
  onError,
  onEnd,
  lang,
  globalObject = typeof window === 'undefined' ? null : window,
} = {}) {
  const RecognitionCtor = resolveSpeechRecognitionCtor(globalObject);
  if (!RecognitionCtor) return null;

  const recognizer = new RecognitionCtor();
  recognizer.continuous = false; // push-to-talk: one utterance per start()
  recognizer.interimResults = false;
  recognizer.maxAlternatives = 1;
  recognizer.lang = lang || (globalObject?.document?.documentElement?.lang) || 'en-US';

  recognizer.onresult = (event) => {
    const transcript = event.results?.[0]?.[0]?.transcript;
    if (typeof transcript === 'string' && transcript.trim()) onResult?.(transcript.trim());
  };
  recognizer.onerror = (event) => onError?.(event?.error || 'unknown-error');
  recognizer.onend = () => onEnd?.();

  return {
    start: () => recognizer.start(),
    stop: () => recognizer.stop(),
    abort: () => recognizer.abort(),
  };
}

/**
 * Speak `text` aloud, cancelling any in-flight utterance first so overlapping
 * turns can never talk over each other (e.g. a fast follow-up utterance
 * arriving while the previous confirmation is still being read out).
 *
 * @param {string} text
 * @param {object} [options]
 * @param {() => void} [options.onEnd] called once speech finishes (or fails).
 * @param {number} [options.rate] speech rate, 0.1–10, defaults to 1.
 * @param {any} [options.globalObject] defaults to `window`; injectable for
 *   tests.
 * @returns {boolean} whether speech was actually started (false if the
 *   browser has no SpeechSynthesis support).
 */
export function speak(text, { onEnd, rate, globalObject = typeof window === 'undefined' ? null : window } = {}) {
  if (!isSpeechSynthesisSupported(globalObject) || !text) {
    onEnd?.();
    return false;
  }
  const synth = globalObject.speechSynthesis;
  synth.cancel(); // stop any prior utterance so turns never overlap
  const utterance = new globalObject.SpeechSynthesisUtterance(text);
  if (typeof rate === 'number' && rate > 0) utterance.rate = rate;
  utterance.onend = () => onEnd?.();
  utterance.onerror = () => onEnd?.();
  synth.speak(utterance);
  return true;
}

/** Cancel any in-flight speech synthesis immediately. */
export function cancelSpeech(globalObject = typeof window === 'undefined' ? null : window) {
  if (isSpeechSynthesisSupported(globalObject)) globalObject.speechSynthesis.cancel();
}
