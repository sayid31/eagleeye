// src/voice/voiceUsageCore.mjs
/**
 * Daily voice-usage ledger: how many live-audio seconds (and screenshot-reader
 * dollars) were used per local calendar day. Feeds the daily-minutes cap
 * (enforced server-side on /api/live/session) and the /admin Usage & Cost page.
 *
 * Seconds come from the mic client's own meter when a session ends, so this is
 * the same ESTIMATE the cost readout shows, not an OpenAI invoice. One install
 * = one ledger; there are no per-user accounts in this app.
 *
 * Pure — no fs, no network, no DOM.
 *
 * @module voice/voiceUsageCore
 */

import { estimateLiveCostUsd } from './liveCost.js';

export const USAGE_LEDGER_VERSION = 1;
/** Days kept in the ledger; older days are pruned on every write. */
export const USAGE_RETENTION_DAYS = 90;
/** Upper bound for one reported session: a full day of audio. */
export const MAX_REPORT_SECONDS = 86_400;
/** Upper bound for one reported session's per-token extras. */
export const MAX_REPORT_EXTRAS_USD = 100;

const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/;
const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
/** One day with nothing recorded. */
const EMPTY_DAY = Object.freeze({ seconds: 0, sessions: 0, extrasUsd: 0, judgeCalls: 0, judgeUsd: 0 });
const nonNegative = (v) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : 0);

/** @returns {{version: number, days: Record<string, {seconds: number, sessions: number, extrasUsd: number}>}} */
export function emptyLedger() {
  return { version: USAGE_LEDGER_VERSION, days: {} };
}

/**
 * Local-time calendar day, `YYYY-MM-DD`. "Today" for the daily cap is the
 * server's local day, so the cap resets at the owner's midnight.
 * @param {Date} [date]
 */
export function localDayKey(date = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** The day key `offset` days before `dayKey` (local calendar arithmetic). */
export function shiftDayKey(dayKey, offset) {
  const [y, m, d] = dayKey.split('-').map(Number);
  return localDayKey(new Date(y, m - 1, d - offset));
}

/** Coerce whatever was read from disk; junk entries are dropped, never thrown. */
export function normalizeLedger(raw) {
  const ledger = emptyLedger();
  if (!isPlainObject(raw) || !isPlainObject(raw.days)) return ledger;
  for (const [day, entry] of Object.entries(raw.days)) {
    if (!DAY_KEY.test(day) || !isPlainObject(entry)) continue;
    ledger.days[day] = {
      seconds: nonNegative(entry.seconds),
      sessions: Math.floor(nonNegative(entry.sessions)),
      extrasUsd: nonNegative(entry.extrasUsd),
      judgeCalls: Math.floor(nonNegative(entry.judgeCalls)),
      judgeUsd: nonNegative(entry.judgeUsd),
    };
  }
  return ledger;
}

/**
 * Validate one end-of-session report from the mic client.
 * @param {unknown} input
 * @returns {{ok: true, value: {seconds: number, extrasUsd: number}} | {ok: false, error: string}}
 */
export function validateUsageReport(input) {
  if (!isPlainObject(input)) return { ok: false, error: 'body: harus berupa objek JSON' };
  const unknown = Object.keys(input).filter((key) => key !== 'seconds' && key !== 'extrasUsd');
  if (unknown.length) return { ok: false, error: 'body: field tidak dikenal' };
  const { seconds, extrasUsd = 0 } = input;
  if (typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds < 0 || seconds > MAX_REPORT_SECONDS) {
    return { ok: false, error: `seconds: angka 0–${MAX_REPORT_SECONDS}` };
  }
  if (typeof extrasUsd !== 'number' || !Number.isFinite(extrasUsd) || extrasUsd < 0 || extrasUsd > MAX_REPORT_EXTRAS_USD) {
    return { ok: false, error: `extrasUsd: angka 0–${MAX_REPORT_EXTRAS_USD}` };
  }
  return { ok: true, value: { seconds, extrasUsd } };
}

/** Drop days older than the retention window (relative to `todayKey`). */
export function pruneLedger(ledger, todayKey, retentionDays = USAGE_RETENTION_DAYS) {
  const oldest = shiftDayKey(todayKey, retentionDays - 1);
  const days = Object.fromEntries(Object.entries(ledger.days).filter(([day]) => day >= oldest));
  return { ...ledger, days };
}

/**
 * Add one validated session report to `dayKey`. Returns a NEW ledger.
 * @param {ReturnType<typeof emptyLedger>} ledger
 * @param {string} dayKey
 * @param {{seconds: number, extrasUsd: number}} report
 */
export function addUsage(ledger, dayKey, report) {
  const prev = { ...EMPTY_DAY, ...ledger.days[dayKey] };
  const next = {
    ...prev,
    seconds: prev.seconds + report.seconds,
    sessions: prev.sessions + 1,
    extrasUsd: prev.extrasUsd + report.extrasUsd,
  };
  return pruneLedger({ ...ledger, days: { ...ledger.days, [dayKey]: next } }, dayKey);
}

/**
 * Add one off-topic judge call (answerJudge.mjs) to `dayKey`. Returns a NEW ledger.
 * @param {ReturnType<typeof emptyLedger>} ledger
 * @param {string} dayKey
 * @param {number} usd Estimated cost of the call.
 */
export function addJudgeUsage(ledger, dayKey, usd) {
  const prev = { ...EMPTY_DAY, ...ledger.days[dayKey] };
  const next = { ...prev, judgeCalls: prev.judgeCalls + 1, judgeUsd: prev.judgeUsd + nonNegative(usd) };
  return pruneLedger({ ...ledger, days: { ...ledger.days, [dayKey]: next } }, dayKey);
}

/** Judge calls already made on `dayKey`. */
export function judgeCallsOn(ledger, dayKey) {
  return ledger.days[dayKey]?.judgeCalls ?? 0;
}

/**
 * Seconds of live audio still allowed today, or null when the cap is off.
 * @param {ReturnType<typeof emptyLedger>} ledger
 * @param {string} dayKey
 * @param {number} dailyMinutes 0 = no cap.
 * @returns {number | null}
 */
export function remainingDailySeconds(ledger, dayKey, dailyMinutes) {
  if (!dailyMinutes) return null;
  const used = ledger.days[dayKey]?.seconds ?? 0;
  return Math.max(0, dailyMinutes * 60 - used);
}

/**
 * Server gate for a new live session: refuse once today's minutes are used up.
 * @param {ReturnType<typeof emptyLedger>} ledger
 * @param {string} dayKey
 * @param {number} dailyMinutes 0 = no cap.
 * @returns {{status: number, error: string} | null}
 */
export function dailyLimitRefusal(ledger, dayKey, dailyMinutes) {
  return remainingDailySeconds(ledger, dayKey, dailyMinutes) === 0
    ? { status: 429, error: 'voice_daily_limit' }
    : null;
}

/**
 * Per-day rows for the Usage & Cost page, newest first, with empty days filled
 * so the table has no gaps. USD = audio minutes × rate + reader extras + judge calls.
 * @param {ReturnType<typeof emptyLedger>} ledger
 * @param {string} todayKey
 * @param {{days?: number, ratePerMin?: number}} [options]
 */
export function summarizeUsage(ledger, todayKey, { days = 30, ratePerMin } = {}) {
  const rows = Array.from({ length: days }, (_, offset) => {
    const day = shiftDayKey(todayKey, offset);
    const entry = { ...EMPTY_DAY, ...ledger.days[day] };
    return { day, ...entry, estimatedUsd: estimateLiveCostUsd(entry.seconds, ratePerMin) + entry.extrasUsd + entry.judgeUsd };
  });
  const total = rows.reduce((sum, row) => ({
    seconds: sum.seconds + row.seconds,
    sessions: sum.sessions + row.sessions,
    judgeCalls: sum.judgeCalls + row.judgeCalls,
    judgeUsd: sum.judgeUsd + row.judgeUsd,
    estimatedUsd: sum.estimatedUsd + row.estimatedUsd,
  }), { seconds: 0, sessions: 0, judgeCalls: 0, judgeUsd: 0, estimatedUsd: 0 });
  return { today: rows[0], rows, total };
}
