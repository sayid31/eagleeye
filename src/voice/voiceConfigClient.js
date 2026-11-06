// src/voice/voiceConfigClient.js
/**
 * Browser side of the owner's voice settings: reads the minimal public slice
 * from `/api/voice/config` (enabled flag, assistant name, cost limits, session
 * limits, seconds left today) and reports each finished session's usage to
 * `/api/voice/usage` for the daily ledger.
 *
 * Fail-open by design: if the endpoint is missing or errors (prod build,
 * network blip), the app behaves exactly as it did before settings existed.
 * The owner's off switch is enforced server-side on `/api/live/session`; this
 * read only lets the UI explain why instead of failing opaquely.
 *
 * @module voice/voiceConfigClient
 */

export const VOICE_CONFIG_URL = '/api/voice/config';
export const VOICE_USAGE_URL = '/api/voice/usage';

/** Window event the POWER UP panel fires after a successful save. */
export const VOICE_SETTINGS_SAVED_EVENT = 'gev:voice-settings-saved';

/** What "no settings" means: enabled, `null` cost limits = built-in $2/$5, no session limits. */
export const DEFAULT_VOICE_CONFIG = Object.freeze({
  enabled: true,
  assistantName: '',
  costLimits: Object.freeze({ warnUsd: null, capUsd: null }),
  limits: Object.freeze({ dailyMinutes: 0, sessionMinutes: 0, idleSeconds: 0 }),
  today: Object.freeze({ remainingSeconds: null }),
});

const wholeOrZero = (v) => (Number.isInteger(v) && v > 0 ? v : 0);

/**
 * @param {{fetchImpl?: typeof fetch, url?: string}} [options]
 * @returns {Promise<typeof DEFAULT_VOICE_CONFIG>}
 */
export async function loadVoiceConfig({ fetchImpl, url = VOICE_CONFIG_URL } = {}) {
  const doFetch = fetchImpl || (typeof fetch === 'function' ? fetch.bind(globalThis) : null);
  if (!doFetch) return DEFAULT_VOICE_CONFIG;
  try {
    const response = await doFetch(url, { cache: 'no-store' });
    if (!response.ok) return DEFAULT_VOICE_CONFIG;
    const data = await response.json();
    return {
      enabled: data?.enabled !== false,
      assistantName: typeof data?.assistantName === 'string' ? data.assistantName : '',
      costLimits: {
        warnUsd: data?.costLimits?.warnUsd ?? null,
        capUsd: data?.costLimits?.capUsd ?? null,
      },
      limits: {
        dailyMinutes: wholeOrZero(data?.limits?.dailyMinutes),
        sessionMinutes: wholeOrZero(data?.limits?.sessionMinutes),
        idleSeconds: wholeOrZero(data?.limits?.idleSeconds),
      },
      today: {
        remainingSeconds: Number.isFinite(data?.today?.remainingSeconds) ? Math.max(0, data.today.remainingSeconds) : null,
      },
    };
  } catch {
    // Unreachable endpoint = no settings: keep the pre-settings behavior.
    return DEFAULT_VOICE_CONFIG;
  }
}

/**
 * Send one finished session's usage to the daily ledger. `keepalive` lets the
 * report survive a tab close (the session is stopped on `pagehide`).
 * Never throws: a lost report only under-counts today's minutes, so it is
 * logged and the mic keeps working.
 *
 * @param {{seconds: number, extrasUsd?: number}} usage
 * @param {{fetchImpl?: typeof fetch, url?: string}} [options]
 * @returns {Promise<boolean>} whether the server accepted the report
 */
export async function reportVoiceUsage({ seconds, extrasUsd = 0 }, { fetchImpl, url = VOICE_USAGE_URL } = {}) {
  const doFetch = fetchImpl || (typeof fetch === 'function' ? fetch.bind(globalThis) : null);
  if (!doFetch || !Number.isFinite(seconds) || seconds <= 0) return false;
  try {
    const response = await doFetch(url, {
      method: 'POST',
      keepalive: true,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ seconds: Math.round(seconds), extrasUsd: Number.isFinite(extrasUsd) ? extrasUsd : 0 }),
    });
    if (!response.ok) console.warn(`[voice] usage report rejected: HTTP ${response.status}`);
    return response.ok;
  } catch (error) {
    console.warn(`[voice] usage report failed: ${error?.message || error}`);
    return false;
  }
}
