// src/admin/dev/devViews.js
/**
 * Presentation helpers of the `/dev` system pages: durations, relative time,
 * doctor lines, the kill-switch form check and the usage card rows. Pure —
 * no DOM, no network.
 *
 * @module admin/dev/devViews
 */

import { formatCostUsd } from '../../voice/voiceCost.js';
import { MIN_KILL_REASON_LENGTH } from './killSwitchCore.mjs';
import { DOCTOR_TEXT, GATE_TEXT, OVERVIEW_TEXT, USAGE_TEXT } from './devText.js';

const MINUTE = 60;
const HOUR = 3600;
const DAY = 86_400;
const pad = (n) => String(n).padStart(2, '0');

/** 45 → "45 dtk", 3900 → "1 j 05 mnt", 190000 → "2 hari 4 j". */
export function formatUptime(seconds) {
  const s = Math.max(0, Math.floor(Number(seconds) || 0));
  if (s < MINUTE) return `${s} dtk`;
  if (s < HOUR) return `${Math.floor(s / MINUTE)} mnt`;
  if (s < DAY) return `${Math.floor(s / HOUR)} j ${pad(Math.floor((s % HOUR) / MINUTE))} mnt`;
  return `${Math.floor(s / DAY)} hari ${Math.floor((s % DAY) / HOUR)} j`;
}

/** "baru saja" / "5 menit lalu" / "3 jam lalu" / "2 hari lalu"; "—" without a time. */
export function formatAgo(at, now) {
  if (!Number.isFinite(at)) return '—';
  const s = Math.max(0, Math.round((now - at) / 1000));
  if (s < 90) return 'baru saja';
  if (s < 90 * MINUTE) return `${Math.round(s / MINUTE)} menit lalu`;
  if (s < 2 * DAY) return `${Math.round(s / HOUR)} jam lalu`;
  return `${Math.round(s / DAY)} hari lalu`;
}

/**
 * @param {{id: string, level: string, params: object}[]} checks Doctor warnings from /api/admin/system.
 * @returns {{id: string, level: string, text: string}[]}
 */
export function doctorLines(checks) {
  return checks.map((item) => ({ id: item.id, level: item.level, text: DOCTOR_TEXT[item.id]?.(item.params ?? {}) ?? item.id }));
}

/** Gate label (falls back to the key). */
export const gateLabel = (gate) => GATE_TEXT[gate]?.label ?? gate;

/** "Semua gate aktif" or "Dimatikan: Voice & AI, Layer data". */
export function killSwitchHeadline(switches) {
  const off = switches.filter((row) => row.killed).map((row) => gateLabel(row.gate));
  return off.length ? `Dimatikan: ${off.join(', ')}` : OVERVIEW_TEXT.allGatesOn;
}

/**
 * Client-side check before the PUT (the server checks the same rule).
 * @param {{killed: boolean, reason: string}} form `killed` = the state being requested.
 * @returns {string | null} Error text, or null when the form may be sent.
 */
export function killFormError({ killed, reason }) {
  if (killed && String(reason ?? '').trim().length < MIN_KILL_REASON_LENGTH) return `Alasan wajib diisi (minimal ${MIN_KILL_REASON_LENGTH} karakter).`;
  return null;
}

const PROVIDER_TITLES = { opensky: USAGE_TEXT.opensky, tomtom: USAGE_TEXT.tomtom, openai: USAGE_TEXT.openai };
const number = (n) => Number(n).toLocaleString('id-ID');
const minutes = (seconds) => `${Math.round((Number(seconds) || 0) / MINUTE)} mnt`;

/** Card title of a usage provider. */
export const providerTitle = (id) => PROVIDER_TITLES[id] ?? id;

/**
 * Label/value rows of one usage card, or the empty-state sentence.
 * @param {{id: string, configured: boolean, status: string, data: object | null}} card
 * @param {number} now
 * @returns {{empty: string} | {rows: {label: string, value: string}[]}}
 */
export function usageRows(card, now) {
  if (!card.data) return { empty: card.configured ? USAGE_TEXT.noData : USAGE_TEXT.notConfigured };
  const d = card.data;
  if (card.id === 'opensky') {
    return { rows: [
      { label: USAGE_TEXT.openskyRemaining, value: `${number(d.remaining)} · ${formatAgo(d.at, now)}` },
      { label: USAGE_TEXT.openskyTtl, value: `${Math.round(d.ttlMs / 1000)} dtk` },
      { label: USAGE_TEXT.openskyWarnAt, value: number(d.warnAt) },
    ] };
  }
  if (card.id === 'tomtom') {
    return { rows: [
      { label: USAGE_TEXT.tomtomUsed, value: `${number(d.used)} dari ${number(d.budget)} (${Math.round(d.share * 100)}%)` },
      { label: USAGE_TEXT.tomtomDate, value: d.date },
    ] };
  }
  return { rows: [
    { label: USAGE_TEXT.voiceEnabled, value: d.enabled ? 'Aktif' : 'Dimatikan di Umum' },
    { label: USAGE_TEXT.voiceToday, value: d.dailyMinutes ? `${minutes(d.todaySeconds)} dari ${d.dailyMinutes} mnt` : `${minutes(d.todaySeconds)} · tanpa batas harian` },
    { label: USAGE_TEXT.voiceCostToday, value: formatCostUsd(d.todayUsd) },
    { label: USAGE_TEXT.voiceCost7d, value: formatCostUsd(d.periodUsd) },
    { label: USAGE_TEXT.judgeCalls, value: d.judgeEnabled ? `${d.judgeCalls} dari ${d.judgeMax}` : 'Judge dimatikan' },
  ] };
}
