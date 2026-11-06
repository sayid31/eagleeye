// src/voice/voiceSettingsRoutes.mjs
/**
 * Public HTTP surface for voice settings (the owner edits them in /admin →
 * AI Configuration, `src/admin/api/adminVoiceRoutes.mjs`).
 *
 *  - GET /api/voice/config — the minimal slice the voice client needs
 *    (`publicVoiceConfig`: enabled flag, assistant name, cost limits, session
 *    limits) plus `today.remainingSeconds` of the daily cap. No persona
 *    instructions, no topic rules, and no key-bearing field exists in any
 *    response here.
 *  - POST /api/voice/usage — the mic's end-of-session report (seconds +
 *    reader extras) into the daily ledger. Same-origin JSON only.
 *
 * Injected deps keep the routes testable without a Vite server.
 *
 * @module voice/voiceSettingsRoutes
 */

import { publicVoiceConfig } from './voiceSettingsCore.mjs';
import { remainingDailySeconds, validateUsageReport } from './voiceUsageCore.mjs';
import { isSameOriginJson } from '../server/sameOrigin.mjs';

const MAX_USAGE_BODY_BYTES = 1024;

function sendJson(res, status, payload) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Content-Security-Policy', "frame-ancestors 'none'");
  res.end(JSON.stringify(payload));
}

/**
 * @param {import('connect').Server} middlewares
 * @param {object} deps
 * @param {{read: Function}} deps.store
 * @param {{read: Function, record: Function, today: () => string}} [deps.usageStore]
 * @param {(req: any, maxBytes?: number) => Promise<string>} deps.readRequestBody
 */
export function installVoiceSettingsRoutes(middlewares, { store, usageStore, readRequestBody }) {
  middlewares.use('/api/voice/config', (req, res) => {
    if (req.method !== 'GET') return sendJson(res, 405, { error: 'Method not allowed' });
    const { settings } = store.read();
    const remainingSeconds = usageStore
      ? remainingDailySeconds(usageStore.read(), usageStore.today(), settings.limits.dailyMinutes)
      : null;
    return sendJson(res, 200, { ...publicVoiceConfig(settings), today: { remainingSeconds } });
  });

  if (usageStore) {
    middlewares.use('/api/voice/usage', async (req, res) => {
      if (req.method !== 'POST') return sendJson(res, 405, { error: 'Method not allowed' });
      if (!isSameOriginJson(req)) return sendJson(res, 403, { error: 'Origin tidak diizinkan' });
      let parsed;
      try {
        parsed = JSON.parse(await readRequestBody(req, MAX_USAGE_BODY_BYTES));
      } catch {
        return sendJson(res, 400, { error: 'Body bukan JSON yang valid atau terlalu besar' });
      }
      const report = validateUsageReport(parsed);
      if (!report.ok) return sendJson(res, 422, { error: report.error });
      try {
        usageStore.record(report.value);
      } catch (error) {
        return sendJson(res, 500, { error: error.message });
      }
      return sendJson(res, 200, { ok: true });
    });
  }
}
