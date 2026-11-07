// src/admin/pages/serverLogView.js
/**
 * Presentation helpers for /admin → Server Log. Pure — no DOM, no network.
 * @module admin/pages/serverLogView
 */

/** Owner-facing names for log sources. */
export const SOURCE_LABELS = Object.freeze({
  browser: 'Browser', voice: 'Suara', judge: 'Judge keluar topik', map: 'Peta', cctv: 'CCTV', radio: 'Radio',
  proxy: 'Layanan eksternal', keys: 'API key', admin: 'Akses admin', audit: 'Perubahan (audit)', log: 'Log',
});

/** "06 Nov 14:05:09" in the viewer's local time. */
export function formatLogTime(ms, locale = undefined) {
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString(locale, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
}

/** "×12 since 06 Nov 13:01:00" for merged rows; '' for a single occurrence. */
export function describeRepeat(entry, locale = undefined) {
  return entry.count > 1 ? `×${entry.count} sejak ${formatLogTime(entry.firstAt, locale)}` : '';
}

/** Detail + client info as one short line ("tool=fly_to_location · Chrome 141 · v0.1.1"). */
export function describeContext(entry) {
  const parts = Object.entries(entry.detail ?? {}).map(([k, v]) => `${k}=${v}`);
  if (entry.client?.browser) parts.push(entry.client.browser);
  if (entry.client?.version) parts.push(`v${entry.client.version}`);
  return parts.join(' · ');
}
