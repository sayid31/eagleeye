/**
 * Date wording of the user-management tables: an absolute `en-US` date-time and a relative form ("5 minutes ago")
 * for the cell text, the absolute one going to the tooltip.
 *
 * @module admin/users/usersFormat
 */
import { USERS_COPY } from '../../copy/en/users.js';

const MINUTE_S = 60;
const HOUR_S = 60 * MINUTE_S;
const DAY_S = 24 * HOUR_S;
/** Under this many seconds a timestamp reads "just now". */
const JUST_NOW_S = 45;
/** From this many days on, a relative phrase is less useful than the date itself. */
const RELATIVE_MAX_DAYS = 30;

const relative = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
const absolute = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short', hourCycle: 'h23' });
const dateOnly = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium' });

/**
 * Local date-time for a stored ISO string (`en-US`, 24-hour); "—" when unreadable.
 * @param {string | null | undefined} iso
 * @returns {string}
 */
export function formatDateTime(iso) {
  const time = Date.parse(iso ?? '');
  return Number.isFinite(time) ? absolute.format(time) : USERS_COPY.time.unknown;
}

/**
 * "just now", "5 minutes ago", "yesterday", or the date for anything older than a month.
 * @param {string | null | undefined} iso
 * @param {number} [now] Epoch ms (tests pass a fixed clock).
 * @returns {string}
 */
export function formatRelative(iso, now = Date.now()) {
  const time = Date.parse(iso ?? '');
  if (!Number.isFinite(time)) return USERS_COPY.time.unknown;
  const seconds = Math.round((now - time) / 1000);
  if (seconds < JUST_NOW_S) return USERS_COPY.time.now;
  if (seconds < HOUR_S) return relative.format(-Math.round(seconds / MINUTE_S), 'minute');
  if (seconds < DAY_S) return relative.format(-Math.round(seconds / HOUR_S), 'hour');
  const days = Math.round(seconds / DAY_S);
  return days <= RELATIVE_MAX_DAYS ? relative.format(-days, 'day') : dateOnly.format(time);
}
