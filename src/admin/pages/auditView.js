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
  { id: '', label: 'Semua' },
  { id: 'keys', label: 'API key' },
  { id: 'settings', label: 'Pengaturan suara' },
  { id: 'login', label: 'Login' },
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
      const parts = [entry.saved?.length ? `disimpan ${list(entry.saved)}` : '', entry.removed?.length ? `dihapus ${list(entry.removed)}` : ''];
      return { title: 'API key diubah', detail: parts.filter(Boolean).join(' · '), tone: 'ok' };
    }
    case 'keys.change_failed': return { title: 'Perubahan API key ditolak', detail: `Tidak ada yang disimpan${http}`, tone: 'warn' };
    case 'keys.tested': {
      const tone = { ok: 'ok', rejected: 'error', unreachable: 'warn' }[entry.result] ?? 'muted';
      return { title: 'Koneksi dites', detail: `${entry.provider ?? '?'} → ${entry.result ?? '?'}${http}`, tone };
    }
    case 'voice_settings.saved': return { title: 'Pengaturan suara disimpan', detail: entry.sections?.length ? `Diubah: ${list(entry.sections)}` : 'Tidak ada bagian yang diubah', tone: 'ok' };
    case 'voice_settings.save_failed': return { title: 'Gagal menyimpan pengaturan suara', detail: 'File pengaturan tidak bisa ditulis', tone: 'error' };
    case 'admin.login': return { title: 'Admin masuk', detail: 'Login Google', tone: 'ok' };
    case 'admin.logout': return { title: 'Admin keluar', detail: '', tone: 'muted' };
    case 'admin.login_denied': return { title: 'Login ditolak', detail: `Alasan: ${entry.result ?? 'tidak diketahui'}`, tone: 'warn' };
    case 'admin.login_failed': return { title: 'Login gagal', detail: `Alasan: ${entry.result ?? 'tidak diketahui'}`, tone: 'error' };
    case 'log.cleared': return { title: 'Server Log dikosongkan', detail: 'Dari halaman admin', tone: 'muted' };
    default: return { title: entry.event, detail: [entry.provider, entry.result].filter(Boolean).join(' · '), tone: 'muted' };
  }
}
