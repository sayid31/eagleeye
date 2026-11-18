// src/admin/dev/usage/usageBudgetView.js
/**
 * View-model of Pemakaian (Usage & budget): one card per provider (OpenSky credits, TomTom daily tiles,
 * OpenAI voice) with a big number, optional progress meters, facts and a reset note; plus the 7-day voice table rows.
 * Built from `GET /api/admin/usage`. Pure.
 *
 * @module admin/dev/usage/usageBudgetView
 */
import { USAGE_COPY as T } from '../../../copy/en/system.js';
import { formatCostUsd } from '../../../voice/voiceCost.js';
import { formatCountdown, formatRelative, formatUptime, nextUtcMidnight } from '../lib/timeView.js';

const SECONDS_PER_MINUTE = 60;
const number = (n) => Number(n).toLocaleString('en-US');
const wholeMinutes = (seconds) => Math.round((Number(seconds) || 0) / SECONDS_PER_MINUTE);

/**
 * Progress of `used` against `max`; the bar is clamped to 0–100 while the text keeps the true percentage.
 * @param {number} used
 * @param {number} max
 * @returns {{percent: number, barPercent: number, valueNow: number, valueMax: number}}
 */
export function meterProgress(used, max) {
  const safeMax = Number(max) > 0 ? Number(max) : 0;
  const safeUsed = Math.max(0, Number(used) || 0);
  const percent = safeMax ? Math.round((safeUsed / safeMax) * 100) : 0;
  return { percent, barPercent: Math.min(100, percent), valueNow: Math.min(safeUsed, safeMax), valueMax: safeMax };
}

/** Bar tone for a usage status (the same shares System Health uses). */
export const meterTone = (status) => ({ ok: 'success', warn: 'warning', error: 'destructive' }[status] ?? 'muted');

function meter({ id, label, used, max, text, status }) {
  return { id, label, text: text(used, max), tone: meterTone(status), ...meterProgress(used, max) };
}

function openSky(card, now) {
  const d = card.data;
  return {
    big: { value: number(d.remaining), unit: T.opensky.unit },
    meters: [],
    facts: [{ label: T.opensky.warnAt, value: number(d.warnAt) }, { label: T.opensky.ttl, value: T.opensky.ttlValue(Math.round(d.ttlMs / 1000)) }],
    note: `${T.opensky.seen(formatRelative(d.at, now))} ${T.opensky.reset}`,
  };
}

function tomTom(card, now) {
  const d = card.data;
  const percent = meterProgress(d.used, d.budget).percent;
  return {
    big: { value: number(d.used), unit: T.tomtom.unit(number(d.budget)) },
    meters: [meter({ id: 'tiles', label: T.tomtom.meterLabel, used: d.used, max: d.budget, status: card.status, text: (u, m) => T.tomtom.meterText(number(u), number(m), percent) })],
    facts: [{ label: T.tomtom.date, value: d.date }],
    note: T.tomtom.reset(formatCountdown(nextUtcMidnight(d.date), now)),
  };
}

function openAi(card) {
  const d = card.data;
  const minutes = wholeMinutes(d.todaySeconds);
  const capPercent = meterProgress(minutes, d.dailyMinutes).percent;
  const meters = [];
  if (d.dailyMinutes) meters.push(meter({ id: 'minutes', label: T.openai.meterLabel, used: minutes, max: d.dailyMinutes, status: card.status, text: (u, m) => T.openai.meterText(u, m, capPercent) }));
  if (d.judgeEnabled && d.judgeMax) {
    const judgeStatus = d.judgeCalls >= d.judgeMax ? 'warn' : 'ok';
    meters.push(meter({ id: 'judge', label: T.openai.judgeLabel, used: d.judgeCalls, max: d.judgeMax, status: judgeStatus, text: (u, m) => T.openai.judgeText(u, m) }));
  }
  return {
    big: { value: number(minutes), unit: d.dailyMinutes ? T.openai.unitCap(d.dailyMinutes) : T.openai.unitNoCap },
    meters,
    facts: [
      { label: T.openai.costToday, value: formatCostUsd(d.todayUsd) },
      { label: T.openai.cost7d, value: formatCostUsd(d.periodUsd) },
      ...(d.judgeEnabled ? [] : [{ label: T.openai.judgeLabel, value: T.openai.judgeOff }]),
    ],
    note: d.enabled ? T.openai.reset : T.openai.voiceOffNote,
  };
}

const BUILDERS = { opensky: openSky, tomtom: tomTom, openai: openAi };

/**
 * @param {{id: string, configured: boolean, status: string, data: object | null}} card
 * @param {number} now
 */
export function providerCard(card, now) {
  const copy = T[card.id] ?? { title: card.id, description: '' };
  const voiceOff = card.id === 'openai' && card.configured && card.data?.enabled === false;
  const base = {
    id: card.id,
    title: copy.title,
    description: copy.description,
    status: card.status,
    statusLabel: voiceOff ? T.openai.voiceOffStatus : T.statusWord[card.status] ?? T.statusWord.unknown,
  };
  if (!card.data) return { ...base, empty: card.configured ? 'noData' : 'notConfigured' };
  return { ...base, ...BUILDERS[card.id]?.(card, now) };
}

/** @param {{generatedAt: number, providers: object[]}} report */
export const providerCards = (report) => report.providers.map((card) => providerCard(card, report.generatedAt));

/**
 * Rows of the 7-day voice table.
 * @param {{day: string, seconds: number, sessions: number, estimatedUsd: number}[]} days
 */
export function voiceDayRows(days) {
  return days.map((row) => ({
    id: row.day,
    day: row.day,
    idle: !row.sessions,
    sessions: String(row.sessions),
    audio: formatUptime(row.seconds),
    cost: formatCostUsd(row.estimatedUsd),
  }));
}
