/**
 * Pure wording and query logic of Log Login and Audit: result and account cells, audit actor / action / detail
 * text, device and IP shortening for table cells, and the filter → API query mapping. No DOM, no network.
 *
 * @module admin/users/activityView
 */
import { ROLE_SUPER_ADMIN } from '../../auth/authRoles.mjs';
import { ACTIVITY_COPY, USERS_COPY } from '../../copy/en/users.js';
import { ACTIVITY_RANGES } from './activityRange.mjs';
import { ALL, roleText } from './usersView.js';

const LOG = ACTIVITY_COPY.loginLog;
const AUDIT = ACTIVITY_COPY.audit;

/**
 * Short device label from a user agent (browser · OS); never the raw string.
 * @param {string | null | undefined} userAgent
 * @returns {string}
 */
export function describeDevice(userAgent) {
  const ua = String(userAgent ?? '');
  if (!ua) return '—';
  const browser = [[/Edg\//, 'Edge'], [/OPR\//, 'Opera'], [/Firefox\//, 'Firefox'], [/Chrome\//, 'Chrome'], [/Safari\//, 'Safari'], [/node|undici|curl/i, 'Script']]
    .find(([pattern]) => pattern.test(ua))?.[1] ?? 'Browser lain';
  const os = [[/Android/, 'Android'], [/iPhone|iPad/, 'iOS'], [/Windows/, 'Windows'], [/Mac OS X|Macintosh/, 'macOS'], [/Linux/, 'Linux']]
    .find(([pattern]) => pattern.test(ua))?.[1];
  return os ? `${browser} · ${os}` : browser;
}

/**
 * Short form of a stored IP: an expanded IPv6 address (`0000:…:0001`) is compacted (`::1`); IPv4 and anything else as stored.
 * @param {string | null | undefined} ip
 * @returns {string}
 */
export function compactIp(ip) {
  const text = String(ip ?? '');
  if (!text) return '—';
  if (!/^[0-9a-f]{1,4}(:[0-9a-f]{1,4}){7}$/i.test(text)) return text;
  const groups = text.split(':').map((group) => group.replace(/^0+(?=.)/, '').toLowerCase());
  let best = { start: -1, length: 0 };
  for (let i = 0; i < groups.length;) {
    let j = i;
    while (j < groups.length && groups[j] === '0') j += 1;
    if (j - i > best.length) best = { start: i, length: j - i };
    i = j > i ? j : i + 1;
  }
  if (best.length < 2) return groups.join(':');
  return `${groups.slice(0, best.start).join(':')}::${groups.slice(best.start + best.length).join(':')}`;
}

/** Reason text of a failed login_log row ("Email atau password salah"); "—" when the reason is missing. */
export function loginFailureText(entry) {
  return LOG.reasons[entry.reason] ?? entry.reason ?? '—';
}

/** Account cell of a login_log row. */
export function loginAccountText(entry) {
  if (!entry.userId) return LOG.unknownAccount;
  const name = entry.userName ?? entry.userId;
  return entry.userDeleted ? `${name} (${LOG.deleted})` : name;
}

/** Wording of an audit action code. @param {string} action */
export const auditActionText = (action) => AUDIT.actions[action] ?? action;

/**
 * Who acted, for an audit row (redacted actors read as their role).
 * @param {{actorId: string | null, actorName: string | null, actorRole: string | null}} entry
 * @param {{id: string}} me
 */
export function auditActorText(entry, me) {
  if (entry.actorId && entry.actorId === String(me?.id)) return USERS_COPY.self;
  if (entry.actorName) return entry.actorName;
  if (!entry.actorRole) return AUDIT.system;
  return AUDIT.otherActor(roleText(entry.actorRole), entry.actorRole === ROLE_SUPER_ADMIN);
}

/**
 * Indonesian reading of an audit summary written by the account service (`role user`, `fields name,email`,
 * `user → admin`); anything else as stored.
 * @param {string | null | undefined} summary
 * @returns {string}
 */
export function auditDetailText(summary) {
  const text = String(summary ?? '');
  const { detail } = AUDIT;
  let match = /^role (\S+)$/.exec(text);
  if (match) return `${detail.role}: ${roleText(match[1])}`;
  match = /^fields (.+)$/.exec(text);
  if (match) return `${detail.fields}: ${match[1].split(',').map((field) => detail.fieldNames[field] ?? field).join(', ')}`;
  match = /^(\S+) → (\S+)$/.exec(text);
  if (match) return `${roleText(match[1])} → ${roleText(match[2])}`;
  return text;
}

/**
 * Query of `GET /api/admin/login-log` for the filter bar state (`ALL` means no filter).
 * @param {{range: string, result: string, userId: string, limit: number, offset: number}} filter
 */
export function loginLogQuery({ range, result, userId, limit, offset }) {
  return { range: ACTIVITY_RANGES.includes(range) ? range : '', success: result === 'true' || result === 'false' ? result : '', userId, limit, offset };
}

/**
 * Query of `GET /api/admin/audit` (account source) for the filter bar state.
 * @param {{range: string, action: string, userId: string, limit: number, offset: number}} filter
 */
export function auditQuery({ range, action, userId, limit, offset }) {
  return { range: ACTIVITY_RANGES.includes(range) ? range : '', action: action === ALL ? '' : action, targetId: userId, limit, offset };
}

/**
 * Whether any filter narrows the log (drives "no match" vs "nothing logged yet" and the reset button).
 * @param {{range: string, result?: string, action?: string, userId: string}} filter
 */
export function hasActivityFilters({ range, result = ALL, action = ALL, userId }) {
  return range !== ALL || result !== ALL || action !== ALL || userId !== '';
}

/**
 * Audit actions an area may filter by: /admin only sees `user.*`, /dev everything.
 * @param {readonly string[]} all
 * @param {'admin' | 'dev'} area
 */
export function auditActionChoices(all, area) {
  return area === 'dev' ? [...all] : all.filter((code) => code.startsWith('user.'));
}
