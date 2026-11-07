// src/admin/pages/healthView.js
/**
 * Labels for /admin → System Health statuses. Pure.
 * @module admin/pages/healthView
 */

/** Status → word shown next to the colour (status never depends on colour alone). */
export const HEALTH_LABELS = Object.freeze({ ok: 'OK', warn: 'Warning', error: 'Problem', off: 'Off', unknown: 'No data' });

/** Pill tone class suffix per status. */
export const HEALTH_TONES = Object.freeze({ ok: 'ok', warn: 'warn', error: 'error', off: 'muted', unknown: 'muted' });

/** "2 problems · 1 warning" / "All checks OK" for the page header. */
export function describeOverall(report) {
  const items = report.sections.flatMap((s) => s.items);
  const errors = items.filter((i) => i.status === 'error').length;
  const warnings = items.filter((i) => i.status === 'warn').length;
  if (!errors && !warnings) return 'All checks OK';
  const parts = [];
  if (errors) parts.push(`${errors} problem${errors > 1 ? 's' : ''}`);
  if (warnings) parts.push(`${warnings} warning${warnings > 1 ? 's' : ''}`);
  return parts.join(' · ');
}
