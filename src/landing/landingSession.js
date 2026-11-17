// src/landing/landingSession.js
/**
 * The landing page's only server call: `GET /api/me`, bounded by a timeout.
 * Auth trouble must never break the landing, so every failure resolves to
 * `null` (which `landingCta` renders as "Masuk") after a console warning.
 *
 * @module landing/landingSession
 */

import { ME_FETCH_TIMEOUT_MS } from './landingConfig.js';

export const ME_ENDPOINT = '/api/me';

/**
 * Fetch the current session summary, or `null` on any failure or timeout.
 * @param {{fetchFn?: typeof fetch, timeoutMs?: number, warn?: (message: string) => void}} [deps]
 * @returns {Promise<import('./landingCta.js').MePayload | null>}
 */
export async function fetchMe({
  fetchFn = globalThis.fetch,
  timeoutMs = ME_FETCH_TIMEOUT_MS,
  warn = (message) => console.warn(message),
} = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchFn(ME_ENDPOINT, {
      credentials: 'same-origin',
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = await response.json();
    if (!payload || typeof payload !== 'object') throw new Error('response is not a JSON object');
    return payload;
  } catch (error) {
    const reason = controller.signal.aborted ? `timed out after ${timeoutMs} ms` : error.message;
    warn(`[landing] ${ME_ENDPOINT} unavailable, showing the sign-in button: ${reason}`);
    return null;
  } finally {
    clearTimeout(timer);
  }
}
