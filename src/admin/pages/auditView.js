// src/admin/pages/auditView.js
/**
 * Owner-facing wording for audit-trail entries (/admin → Audit Log).
 * Entries hold only codes and env var names, so nothing here can leak a value.
 * Pure — no DOM, no network.
 *
 * @module admin/pages/auditView
 */

/** Filter chip labels, in display order (ids match the server's AUDIT_TYPES). */
export const AUDIT_FILTERS = Object.freeze([
  { id: '', label: 'All' },
  { id: 'keys', label: 'API keys' },
  { id: 'settings', label: 'Voice settings' },
  { id: 'login', label: 'Sign-in' },
  { id: 'log', label: 'Log' },
]);

const list = (names) => (names?.length ? names.join(', ') : '');

/**
 * @param {{event: string, source?: string, provider?: string, result?: string, httpStatus?: number,
 *   saved?: string[], removed?: string[], sections?: string[]}} entry
 * @returns {{title: string, detail: string, tone: 'ok' | 'warn' | 'error' | 'muted'}}
 */
export function describeAuditEntry(entry) {
  const http = entry.httpStatus ? ` (HTTP ${entry.httpStatus})` : '';
  switch (entry.event) {
    case 'keys.changed': {
      const parts = [entry.saved?.length ? `saved ${list(entry.saved)}` : '', entry.removed?.length ? `removed ${list(entry.removed)}` : ''];
      return { title: 'API key changed', detail: parts.filter(Boolean).join(' · '), tone: 'ok' };
    }
    case 'keys.change_failed': return { title: 'API key change refused', detail: `Nothing was saved${http}`, tone: 'warn' };
    case 'keys.tested': {
      const tone = { ok: 'ok', rejected: 'error', unreachable: 'warn' }[entry.result] ?? 'muted';
      return { title: 'Connection tested', detail: `${entry.provider ?? '?'} → ${entry.result ?? '?'}${http}`, tone };
    }
    case 'voice_settings.saved': return { title: 'Voice settings saved', detail: entry.sections?.length ? `Changed: ${list(entry.sections)}` : 'No section changed', tone: 'ok' };
    case 'voice_settings.save_failed': return { title: 'Voice settings save failed', detail: 'The settings file could not be written', tone: 'error' };
    case 'admin.login': return { title: 'Admin signed in', detail: 'Google sign-in', tone: 'ok' };
    case 'admin.logout': return { title: 'Admin signed out', detail: '', tone: 'muted' };
    case 'admin.login_denied': return { title: 'Sign-in refused', detail: `Reason: ${entry.result ?? 'unknown'}`, tone: 'warn' };
    case 'admin.login_failed': return { title: 'Sign-in failed', detail: `Reason: ${entry.result ?? 'unknown'}`, tone: 'error' };
    case 'log.cleared': return { title: 'Server Log cleared', detail: 'From the admin page', tone: 'muted' };
    default: return { title: entry.event, detail: [entry.provider, entry.result].filter(Boolean).join(' · '), tone: 'muted' };
  }
}
