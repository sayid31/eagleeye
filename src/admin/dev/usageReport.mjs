// src/admin/dev/usageReport.mjs
/**
 * `/dev` → Usage & budget: one card per paid provider, built from the
 * counters the server already keeps (OpenSky credit governor, TomTom daily
 * tile budget, the voice usage ledger). Nothing is counted here. Pure.
 *
 * Status per provider: `off` (no key and no data), `unknown` (key, but no
 * traffic since the server started), else ok/warn/error by the same shares
 * System Health uses.
 *
 * @module admin/dev/usageReport
 */

import { QUOTA_WARN_SHARE } from '../health/systemHealthCore.mjs';

/** Days of voice history shown on the page (the ledger keeps more; AI → Usage shows it all). */
export const USAGE_VOICE_DAYS = 7;

const isConfigured = (keys, id) => keys.some((key) => key.id === id && key.set === true);
const shareStatus = (share) => (share >= 1 ? 'error' : share >= QUOTA_WARN_SHARE ? 'warn' : 'ok');

function openSkyCard({ keys, opensky, openskyWarnAt, openskyTtlMs }) {
  const configured = isConfigured(keys, 'opensky');
  if (!opensky) return { id: 'opensky', configured, status: configured ? 'unknown' : 'off', data: null };
  // Anonymous OpenSky access also reports credits, so data can exist without a key.
  return {
    id: 'opensky',
    configured,
    status: opensky.remaining <= openskyWarnAt ? 'warn' : 'ok',
    data: { remaining: opensky.remaining, at: opensky.at, warnAt: openskyWarnAt, ttlMs: openskyTtlMs },
  };
}

function tomTomCard({ keys, tomtom }) {
  const configured = isConfigured(keys, 'tomtom');
  if (!tomtom) return { id: 'tomtom', configured, status: configured ? 'unknown' : 'off', data: null };
  const share = tomtom.budget > 0 ? tomtom.used / tomtom.budget : 0;
  return { id: 'tomtom', configured, status: shareStatus(share), data: { used: tomtom.used, budget: tomtom.budget, date: tomtom.date, share } };
}

function openAiCard({ keys, voice }) {
  const configured = isConfigured(keys, 'openai');
  if (!configured) return { id: 'openai', configured, status: 'off', data: null };
  const { summary, dailyMinutes } = voice;
  const share = dailyMinutes ? summary.today.seconds / (dailyMinutes * 60) : 0;
  const judgeOver = voice.judgeEnabled && voice.judgeMax && summary.today.judgeCalls >= voice.judgeMax;
  const status = !voice.enabled ? 'off' : share >= 1 ? 'error' : share >= QUOTA_WARN_SHARE || judgeOver ? 'warn' : 'ok';
  return {
    id: 'openai',
    configured,
    status,
    data: {
      enabled: voice.enabled,
      todaySeconds: summary.today.seconds,
      todaySessions: summary.today.sessions,
      dailyMinutes,
      remainingSeconds: voice.remainingSeconds,
      todayUsd: summary.today.estimatedUsd,
      periodUsd: summary.total.estimatedUsd,
      periodDays: summary.rows.length,
      judgeEnabled: voice.judgeEnabled,
      judgeCalls: summary.today.judgeCalls,
      judgeMax: voice.judgeMax,
      days: summary.rows.map((row) => ({ day: row.day, seconds: row.seconds, sessions: row.sessions, estimatedUsd: row.estimatedUsd })),
    },
  };
}

/**
 * @param {object} facts
 * @param {number} facts.now
 * @param {{id: string, set: boolean}[]} facts.keys Key presence (never values).
 * @param {{remaining: number, at: number} | null} facts.opensky
 * @param {number} facts.openskyWarnAt
 * @param {number | null} facts.openskyTtlMs
 * @param {{date: string, used: number, budget: number} | null} facts.tomtom
 * @param {{enabled: boolean, dailyMinutes: number, remainingSeconds: number | null, judgeEnabled: boolean,
 *   judgeMax: number, summary: {today: object, rows: object[], total: object}}} facts.voice
 * @returns {{generatedAt: number, providers: {id: string, configured: boolean, status: string, data: object | null}[]}}
 */
export function buildUsageReport(facts) {
  return { generatedAt: facts.now, providers: [openSkyCard(facts), tomTomCard(facts), openAiCard(facts)] };
}
