// src/admin/dev/lib/statusView.js
/**
 * Health state → badge presentation (tone, icon key, word) for the /dev system pages. Every state has an icon AND a
 * word, so none depends on colour. Tones are the keys of `TONE_CLASSES` (components/app/statusBadgeView.js).
 *
 * @module admin/dev/lib/statusView
 */
import { HEALTH_STATUS_COPY, PROVIDER_NAMES } from '../../../copy/id/system.js';

const PRESENTATION = Object.freeze({
  ok: { tone: 'success', icon: 'check' },
  warn: { tone: 'warning', icon: 'warning' },
  error: { tone: 'destructive', icon: 'x' },
  off: { tone: 'muted', icon: 'minus' },
  unknown: { tone: 'muted', icon: 'help' },
});

/**
 * @param {string} status ok | warn | error | off | unknown (anything else reads as unknown).
 * @param {string} [label] Overrides the default word.
 * @returns {{status: string, tone: string, icon: string, label: string}}
 */
export function healthBadge(status, label) {
  const key = Object.hasOwn(PRESENTATION, status) ? status : 'unknown';
  return { status: key, ...PRESENTATION[key], label: label ?? HEALTH_STATUS_COPY[key] };
}

/** Provider display name for a key-store id; falls back to the server title (ALL CAPS), then the id. */
export function providerName(id, title) {
  return Object.hasOwn(PROVIDER_NAMES, id) ? PROVIDER_NAMES[id] : (title ?? id);
}
