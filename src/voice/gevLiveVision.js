// src/voice/gevLiveVision.js
/**
 * GPT-Live viewport reader (browser side of Fase 5).
 *
 * `gpt-live-1` cannot see images, so when the delegated backend model wants to
 * answer a "what am I looking at" turn it emits a `read_screen` function_call.
 * The live controller routes that one tool name here instead of to the shared
 * gevActions runner: we capture the current Cesium viewport and POST it to the
 * `/api/live/vision` one-shot reader (a separate `gpt-5.6-luna` call), then
 * return its text as the tool result the voice turn speaks.
 *
 * Capture + fetch are injected (defaulting to the real ones) so the round-trip
 * is unit-testable without a browser or the network. No DOM/network access at
 * module scope.
 *
 * @module voice/gevLiveVision
 */

import { estimateVisionCostUsd, VISION_READ_FALLBACK_USD } from './liveCost.js';

/** The live-only tool name the backend calls to read the screen. */
export const READ_SCREEN_TOOL_NAME = 'read_screen';

/** Default reader endpoint (see openAiLiveVisionProxy.mjs). */
export const LIVE_VISION_URL = '/api/live/vision';

/**
 * Build a screenshot reader bound to a capture function and a fetch impl.
 *
 * `readScreen` NEVER throws: every failure resolves to `{ ok:false, ... }` with
 * a spoken `text` fallback, because the result is JSON-stringified straight
 * into the `function_call_output` — a throw here would strand the voice turn.
 *
 * @param {object} params
 * @param {() => Promise<string|null>} params.captureImage Returns a data-URL capture or null.
 * @param {typeof fetch} [params.fetchImpl]
 * @param {string} [params.visionUrl]
 */
export function createViewportReader({ captureImage, fetchImpl, visionUrl = LIVE_VISION_URL } = {}) {
  const doFetch = fetchImpl || (typeof fetch === 'function' ? fetch.bind(globalThis) : null);

  async function readScreen({ question } = {}) {
    if (typeof captureImage !== 'function' || !doFetch) {
      return { ok: false, error: 'unavailable', text: 'Screen reading is not available in this environment.' };
    }
    let image = null;
    try {
      image = await captureImage();
    } catch (error) {
      return { ok: false, error: error?.message || String(error), text: 'I could not capture the current view.' };
    }
    if (!image) {
      return { ok: false, error: 'no_viewport', text: 'The 3D view is not rendering a fresh frame right now, so I cannot read the screen.' };
    }

    try {
      const res = await doFetch(visionUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image, question: question || '' }),
      });
      if (!res.ok) {
        return { ok: false, error: `HTTP ${res.status}`, text: `The screen reader failed (HTTP ${res.status}).` };
      }
      const data = await res.json().catch(() => null);
      const text = typeof data?.text === 'string' ? data.text.trim() : '';
      if (!text) {
        return { ok: false, error: 'empty', text: 'The screen reader returned no description.' };
      }
      // Report this call's cost so the controller can fold it into the live
      // meter. Prefer the real token usage; fall back to a documented per-read
      // estimate so a read is never counted as free.
      const costUsd = estimateVisionCostUsd(data?.usage) || VISION_READ_FALLBACK_USD;
      return { ok: true, text, costUsd };
    } catch (error) {
      return { ok: false, error: error?.message || String(error), text: 'The screen reader could not be reached.' };
    }
  }

  return { readScreen };
}
