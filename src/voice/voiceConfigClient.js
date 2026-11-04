// src/voice/voiceConfigClient.js
/**
 * Browser side of the owner's voice settings: reads the minimal public slice
 * from `/api/voice/config` (enabled flag, assistant name, cost limits).
 *
 * Fail-open by design: if the endpoint is missing or errors (prod build,
 * network blip), the app behaves exactly as it did before settings existed.
 * The owner's off switch is enforced server-side on `/api/live/session`; this
 * read only lets the UI explain why instead of failing opaquely.
 *
 * @module voice/voiceConfigClient
 */

export const VOICE_CONFIG_URL = '/api/voice/config';

/** Window event the POWER UP panel fires after a successful save. */
export const VOICE_SETTINGS_SAVED_EVENT = 'gev:voice-settings-saved';

/** What "no settings" means: enabled, and `null` limits = built-in $2/$5. */
export const DEFAULT_VOICE_CONFIG = Object.freeze({
  enabled: true,
  assistantName: '',
  costLimits: Object.freeze({ warnUsd: null, capUsd: null }),
});

/**
 * @param {{fetchImpl?: typeof fetch, url?: string}} [options]
 * @returns {Promise<{enabled: boolean, assistantName: string, costLimits: {warnUsd: any, capUsd: any}}>}
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
    };
  } catch {
    // Unreachable endpoint = no settings: keep the pre-settings behavior.
    return DEFAULT_VOICE_CONFIG;
  }
}
