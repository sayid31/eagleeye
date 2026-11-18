// src/admin/dev/lib/timeView.js
/**
 * Time wording shared by the /dev system pages: relative ("5 menit lalu"), absolute ("06 Nov 14.05.09"), uptime and
 * countdown. Pure: `now` is always passed in so output is deterministic.
 *
 * @module admin/dev/lib/timeView
 */
import { SYSTEM_TIME_COPY as T } from '../../../copy/en/system.js';

const MINUTE = 60;
const HOUR = 3600;
const DAY = 86_400;
/** Under this many seconds a time is "just now" (the pages refresh slower than that). */
const JUST_NOW_SECONDS = 45;
/** Beyond this many days a relative phrase stops helping; show the date. */
const RELATIVE_MAX_DAYS = 30;
const LOCALE = 'id-ID';

/**
 * "06 Nov 14.05.09" in the viewer's time zone; the year is added when it is not the current one.
 * @param {number} ms
 * @param {{now?: number, locale?: string, seconds?: boolean}} [options]
 * @returns {string} "—" for a missing or invalid time.
 */
export function formatAbsolute(ms, { now = Date.now(), locale = LOCALE, seconds = true } = {}) {
  const date = new Date(ms);
  if (!Number.isFinite(ms) || Number.isNaN(date.getTime())) return '—';
  const sameYear = date.getFullYear() === new Date(now).getFullYear();
  return date.toLocaleString(locale, {
    day: '2-digit', month: 'short', ...(sameYear ? {} : { year: 'numeric' }),
    hour: '2-digit', minute: '2-digit', ...(seconds ? { second: '2-digit' } : {}), hour12: false,
  });
}

/**
 * "baru saja" / "5 menit lalu" / "3 jam lalu" / "2 hari lalu"; the date past 30 days; "—" without a time.
 * @param {number | null | undefined} at
 * @param {number} now
 */
export function formatRelative(at, now) {
  if (!Number.isFinite(at)) return '—';
  const seconds = Math.max(0, Math.round((now - at) / 1000));
  if (seconds < JUST_NOW_SECONDS) return T.justNow;
  if (seconds < HOUR) return T.minutesAgo(Math.max(1, Math.round(seconds / MINUTE)));
  if (seconds < DAY) return T.hoursAgo(Math.round(seconds / HOUR));
  const days = Math.round(seconds / DAY);
  return days <= RELATIVE_MAX_DAYS ? T.daysAgo(days) : formatAbsolute(at, { now, seconds: false });
}

/** 45 → "45 dtk", 3900 → "1 j 05 mnt", 190000 → "2 hari 4 j". */
export function formatUptime(totalSeconds) {
  const s = Math.max(0, Math.floor(Number(totalSeconds) || 0));
  if (s < MINUTE) return T.seconds(s);
  if (s < HOUR) return T.minutes(Math.floor(s / MINUTE));
  if (s < DAY) return T.hoursMinutes(Math.floor(s / HOUR), Math.floor((s % HOUR) / MINUTE));
  return T.daysHours(Math.floor(s / DAY), Math.floor((s % DAY) / HOUR));
}

/**
 * Milliseconds of the next UTC midnight after the UTC calendar day `yyyy-mm-dd` (when TomTom's daily budget resets).
 * @param {string} day
 * @returns {number} NaN for a malformed day.
 */
export function nextUtcMidnight(day) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(day ?? ''));
  if (!match) return Number.NaN;
  return Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]) + 1);
}

/** Time left until `at`, as uptime-style text ("5 j 12 mnt"); "0 dtk" once it has passed. */
export function formatCountdown(at, now) {
  return formatUptime(Number.isFinite(at) ? Math.max(0, (at - now) / 1000) : 0);
}
