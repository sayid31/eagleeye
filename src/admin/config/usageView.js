// src/admin/config/usageView.js
/**
 * Presentation helpers for Konfigurasi AI → Pemakaian & Biaya: duration and
 * money formatting, the daily-cap status line, and the per-session cost-limit
 * form (empty = built-in default, "off" = none, else USD).
 *
 * Pure — no DOM, no network.
 *
 * @module admin/config/usageView
 */

import { USAGE_AI_COPY } from '../../copy/id/configForms.js';
import { formatCostUsd } from '../../voice/voiceCost.js';
import { meterProgress } from '../dev/usage/usageBudgetView.js';

const COPY = USAGE_AI_COPY;
/** Share of the daily minutes from which the meter turns to a warning. */
const WARN_PERCENT = 80;

/** Cost-limit value → field text: '' = built-in default, 'off' = disabled, else USD. */
export function limitToText(value) {
  if (value === null || value === undefined) return '';
  return String(value);
}

/** Field text → cost-limit value; a comma decimal is accepted ("1,5"). */
export function textToLimit(text) {
  const raw = String(text ?? '').trim().toLowerCase();
  if (raw === '') return { ok: true, value: null };
  if (raw === 'off') return { ok: true, value: 'off' };
  const n = Number(raw.replace(',', '.'));
  return Number.isFinite(n) ? { ok: true, value: n } : { ok: false };
}

/** "0 min", "4 min 05 s", "2 h 03 min" — rounded down to whole seconds. */
export function formatDuration(seconds) {
  const s = Math.max(0, Math.floor(Number(seconds) || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const rest = s % 60;
  if (h) return `${h} j ${String(m).padStart(2, '0')} min`;
  if (!m && !rest) return '0 min';
  return rest ? `${m} min ${String(rest).padStart(2, '0')} dtk` : `${m} min`;
}

/** Estimated money, always marked as an estimate ("~$0.42"). */
export const formatEstimate = formatCostUsd;

/**
 * The "Hari ini" card: estimated cost, audio used and — with a daily cap — a progress meter against it.
 * @param {{dailyMinutes: number, remainingSeconds: number | null, summary: {today: {seconds: number, estimatedUsd: number}}}} usage
 * @returns {{cost: string, audio: string, line: string, reached: boolean, meter: object | null}}
 */
export function todayView(usage) {
  const { seconds, estimatedUsd } = usage.summary.today;
  const used = formatDuration(seconds);
  const base = { cost: formatEstimate(estimatedUsd), audio: used, reached: false, meter: null };
  if (!usage.dailyMinutes) return { ...base, line: COPY.today.noLimit(used) };
  const reached = usage.remainingSeconds === 0;
  const progress = meterProgress(seconds / 60, usage.dailyMinutes);
  const tone = reached ? 'destructive' : (progress.percent >= WARN_PERCENT ? 'warning' : 'success');
  const line = `${COPY.today.used(used, usage.dailyMinutes)}. ${reached ? COPY.today.reached : COPY.today.left(formatDuration(usage.remainingSeconds))}`;
  return { ...base, line, reached, meter: { label: COPY.today.meterLabel, text: `${progress.percent}%`, tone, ...progress } };
}

/** @param {{costLimits: {effective: {warnUsd: any, capUsd: any}}}} usage Text of the limits in force. */
export function effectiveLimitsLine({ costLimits }) {
  const show = (value) => (value === null ? COPY.limits.off : formatEstimate(value));
  return COPY.limits.effective(show(costLimits.effective.warnUsd), show(costLimits.effective.capUsd));
}

/** @param {{warnUsd: any, capUsd: any}} costLimits Stored values. */
export function costFormFromSettings(costLimits = {}) {
  return { warn: limitToText(costLimits.warnUsd), cap: limitToText(costLimits.capUsd) };
}

/**
 * @param {object} base Settings last loaded from the server.
 * @param {{warn: string, cap: string}} form
 * @returns {{ok: true, settings: object} | {ok: false, errors: {warn?: string, cap?: string}}}
 */
export function settingsFromCostForm(base, form) {
  const warn = textToLimit(form.warn);
  const cap = textToLimit(form.cap);
  if (!warn.ok || !cap.ok) return { ok: false, errors: { ...(warn.ok ? {} : { warn: COPY.limits.invalid }), ...(cap.ok ? {} : { cap: COPY.limits.invalid }) } };
  return { ok: true, settings: { ...base, costLimits: { warnUsd: warn.value, capUsd: cap.value } } };
}
