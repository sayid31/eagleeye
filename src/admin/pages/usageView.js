// src/admin/pages/usageView.js
/**
 * Presentation helpers for AI Configuration → Usage & Cost: duration and
 * money formatting, the daily-cap status line, and the per-session cost-limit
 * form (empty = built-in default, "off" = none, else USD).
 *
 * Pure — no DOM, no network.
 *
 * @module admin/pages/usageView
 */

import { formatCostUsd } from '../../voice/voiceCost.js';

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
 * @param {{dailyMinutes: number, remainingSeconds: number | null, summary: {today: {seconds: number}}}} usage
 * @returns {string}
 */
export function describeDailyCap(usage) {
  const used = formatDuration(usage.summary.today.seconds);
  if (!usage.dailyMinutes) return `${used} terpakai hari ini · tanpa batas harian`;
  if (usage.remainingSeconds === 0) return `${used} dari ${usage.dailyMinutes} min terpakai hari ini · batas tercapai, sesi baru ditolak sampai tengah malam`;
  return `${used} dari ${usage.dailyMinutes} min terpakai hari ini · sisa ${formatDuration(usage.remainingSeconds)}`;
}

/** @param {{warnUsd: any, capUsd: any}} costLimits Stored values. */
export function costFormFromSettings(costLimits = {}) {
  return { warn: limitToText(costLimits.warnUsd), cap: limitToText(costLimits.capUsd) };
}

/**
 * @param {object} base Settings last loaded from the server.
 * @param {{warn: string, cap: string}} form
 * @returns {{ok: true, settings: object} | {ok: false, error: string}}
 */
export function settingsFromCostForm(base, form) {
  const warn = textToLimit(form.warn);
  const cap = textToLimit(form.cap);
  if (!warn.ok || !cap.ok) return { ok: false, error: 'Batas biaya: isi jumlah dolar, "off", atau kosongkan untuk default bawaan.' };
  return { ok: true, settings: { ...base, costLimits: { warnUsd: warn.value, capUsd: cap.value } } };
}
