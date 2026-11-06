// src/admin/api/adminVoiceRoutes.mjs
/**
 * /admin data routes for AI Configuration → General and Usage & Cost:
 *
 *  - GET/PUT /api/admin/voice/settings — the voice-settings store the session
 *    uses (PUT replaces, validated by `validateVoiceSettings`), plus the tool
 *    group catalog and limit ranges the form needs.
 *  - GET /api/admin/voice/usage?days=7|30|90 — the daily usage ledger priced
 *    with the current GPT-Live rates, today's remaining daily minutes and the
 *    effective per-session cost limits.
 *
 * Every route goes through `requireAdminSession` (signed Google-login cookie;
 * Origin + JSON content type on writes). No response carries a key.
 *
 * @module admin/api/adminVoiceRoutes
 */

import { requireAdminSession } from '../auth/requireAdminSession.mjs';
import { validateVoiceSettings } from '../../voice/voiceSettingsCore.mjs';
import {
  DAILY_MINUTES_MAX, IDLE_SECONDS_MAX, IDLE_SECONDS_MIN, SESSION_MINUTES_MAX, SESSION_MINUTES_MIN,
} from '../../voice/voiceSettingsSections.mjs';
import { VOICE_TOOL_GROUPS } from '../../voice/voiceToolGroups.js';
import { USAGE_RETENTION_DAYS, remainingDailySeconds, summarizeUsage } from '../../voice/voiceUsageCore.mjs';
import {
  LIVE_VOICE_MODEL_ID, LIVE_VOICE_RATES_VERIFIED_ON, LIVE_VOICE_RATE_PER_MIN,
  VISION_RATE_IN_PER_MTOK, VISION_RATE_OUT_PER_MTOK, VISION_READER_MODEL_ID,
} from '../../voice/liveCost.js';
import { VOICE_COST_LIMITS, normalizeCostLimits } from '../../voice/voiceCost.js';
import { JUDGE_MODEL_DEFAULT, JUDGE_RATE_IN_PER_MTOK, JUDGE_RATE_OUT_PER_MTOK } from '../../voice/answerJudge.mjs';

const MAX_BODY_BYTES = 16 * 1024;
const USAGE_DAY_OPTIONS = [7, 30, USAGE_RETENTION_DAYS];
const DEFAULT_USAGE_DAYS = 30;

const LIMIT_RANGES = Object.freeze({
  dailyMinutes: { min: 1, max: DAILY_MINUTES_MAX },
  sessionMinutes: { min: SESSION_MINUTES_MIN, max: SESSION_MINUTES_MAX },
  idleSeconds: { min: IDLE_SECONDS_MIN, max: IDLE_SECONDS_MAX },
});

const TOOL_GROUP_CATALOG = VOICE_TOOL_GROUPS.map(({ id, label, description, tools }) => ({
  id, label, description, toolCount: tools.length,
}));

function sendJson(res, status, payload) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Frame-Options', 'DENY');
  res.end(JSON.stringify(payload));
}

/** `?days=` → one of the offered windows, else the default. */
export function parseUsageDays(url) {
  const days = Number(new URLSearchParams(String(url ?? '').split('?')[1] ?? '').get('days'));
  return USAGE_DAY_OPTIONS.includes(days) ? days : DEFAULT_USAGE_DAYS;
}

/** Infinity (a disabled limit) does not survive JSON; send null instead. */
const finiteOrNull = (n) => (Number.isFinite(n) ? n : null);

function usagePayload(settings, usageStore, days) {
  const ledger = usageStore.read();
  const today = usageStore.today();
  const effective = normalizeCostLimits(settings.costLimits);
  return {
    days,
    dayOptions: USAGE_DAY_OPTIONS,
    summary: summarizeUsage(ledger, today, { days, ratePerMin: LIVE_VOICE_RATE_PER_MIN }),
    dailyMinutes: settings.limits.dailyMinutes,
    remainingSeconds: remainingDailySeconds(ledger, today, settings.limits.dailyMinutes),
    costLimits: {
      stored: settings.costLimits,
      effective: { warnUsd: finiteOrNull(effective.warnUsd), capUsd: finiteOrNull(effective.capUsd) },
      defaults: VOICE_COST_LIMITS,
    },
    rates: {
      liveModel: LIVE_VOICE_MODEL_ID,
      livePerMin: LIVE_VOICE_RATE_PER_MIN,
      readerModel: VISION_READER_MODEL_ID,
      readerInPerMTok: VISION_RATE_IN_PER_MTOK,
      readerOutPerMTok: VISION_RATE_OUT_PER_MTOK,
      verifiedOn: LIVE_VOICE_RATES_VERIFIED_ON,
      judgeModel: process.env.OPENAI_JUDGE_MODEL || JUDGE_MODEL_DEFAULT,
      judgeInPerMTok: JUDGE_RATE_IN_PER_MTOK,
      judgeOutPerMTok: JUDGE_RATE_OUT_PER_MTOK,
      judgeEnabled: String(process.env.GEV_VOICE_JUDGE ?? '').toLowerCase() !== 'off',
    },
  };
}

/**
 * @param {import('connect').Server} middlewares
 * @param {object} deps
 * @param {{read: Function, write: Function}} deps.store Voice settings store.
 * @param {{read: Function, today: () => string}} deps.usageStore Daily usage ledger.
 * @param {(req: any, maxBytes?: number) => Promise<string>} deps.readRequestBody
 * @param {(req: any) => {ok: boolean, status?: number, error?: string}} [deps.guard]
 * @param {(event: string) => void} [deps.onEvent] Lifecycle event codes (no values, no PII).
 */
export function installAdminVoiceRoutes(middlewares, {
  store, usageStore, readRequestBody, guard = (req) => requireAdminSession(req),
  onEvent = (event) => console.info(`[admin] ${event}`),
}) {
  middlewares.use('/api/admin/voice', async (req, res) => {
    const admitted = guard(req);
    if (!admitted.ok) return sendJson(res, admitted.status, { error: admitted.error });
    const route = (req.url || '/').split('?')[0];

    if (route === '/usage') {
      if (req.method !== 'GET') return sendJson(res, 405, { error: 'Method not allowed' });
      return sendJson(res, 200, usagePayload(store.read().settings, usageStore, parseUsageDays(req.url)));
    }
    if (route !== '/settings') return sendJson(res, 404, { error: 'Not found' });

    if (req.method === 'GET') {
      const { settings, valid } = store.read();
      return sendJson(res, 200, { settings, storedValid: valid, toolGroups: TOOL_GROUP_CATALOG, limitRanges: LIMIT_RANGES });
    }
    if (req.method !== 'PUT') return sendJson(res, 405, { error: 'Method not allowed' });

    let parsed;
    try {
      parsed = JSON.parse(await readRequestBody(req, MAX_BODY_BYTES));
    } catch {
      return sendJson(res, 400, { error: 'Body bukan JSON yang valid atau terlalu besar' });
    }
    const result = validateVoiceSettings(parsed);
    if (!result.ok) return sendJson(res, 422, { error: 'Pengaturan tidak valid', details: result.errors });
    try {
      store.write(result.value);
    } catch (error) {
      onEvent('voice_settings.save_failed');
      return sendJson(res, 500, { error: error.message });
    }
    onEvent('voice_settings.saved');
    return sendJson(res, 200, { settings: result.value, storedValid: true });
  });
}
