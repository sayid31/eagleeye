// src/components/app/statusBadgeView.js
/**
 * Pure presentation table of StatusBadge: every status is a tone + an icon key + a word, so state never relies on
 * colour alone. Tone classes use the soft variant (10% tint, 20% in dark) that scripts/ui-contrast checks.
 *
 * @module components/app/statusBadgeView
 */
import { HEALTH_STATUS_COPY, STATUS_COPY } from '../../copy/en/common.js';

/** Tailwind classes per tone: tinted background + the semantic colour as text (4.5:1, gated by qa:contrast). */
export const TONE_CLASSES = Object.freeze({
  success: 'bg-success/10 text-success dark:bg-success/20',
  warning: 'bg-warning/10 text-warning dark:bg-warning/20',
  info: 'bg-info/10 text-info dark:bg-info/20',
  destructive: 'bg-destructive/10 text-destructive dark:bg-destructive/20',
  muted: 'bg-muted text-muted-foreground',
});

/** Known account/log/health statuses → tone, icon key, label. */
export const STATUSES = Object.freeze({
  active: { tone: 'success', icon: 'check', label: STATUS_COPY.active },
  inactive: { tone: 'muted', icon: 'minus', label: STATUS_COPY.inactive },
  throttled: { tone: 'warning', icon: 'clock', label: STATUS_COPY.throttled },
  mustChangePassword: { tone: 'warning', icon: 'key', label: STATUS_COPY.mustChangePassword },
  success: { tone: 'success', icon: 'check', label: STATUS_COPY.success },
  failed: { tone: 'destructive', icon: 'x', label: STATUS_COPY.failed },
  // Health states of the /dev system pages and provider cards (ok / warn / error / off / unknown).
  ok: { tone: 'success', icon: 'check', label: HEALTH_STATUS_COPY.ok },
  warn: { tone: 'warning', icon: 'warning', label: HEALTH_STATUS_COPY.warn },
  error: { tone: 'destructive', icon: 'x', label: HEALTH_STATUS_COPY.error },
  off: { tone: 'muted', icon: 'minus', label: HEALTH_STATUS_COPY.off },
  unknown: { tone: 'muted', icon: 'help', label: HEALTH_STATUS_COPY.unknown },
});

/**
 * @param {string} status Key of STATUSES.
 * @param {string} [label] Overrides the default word.
 * @returns {{status: string, tone: string, icon: string, label: string}} `status` is the resolved key (unrecognised → unknown).
 */
export function statusPresentation(status, label) {
  const key = Object.hasOwn(STATUSES, status) ? status : 'unknown';
  return { status: key, ...STATUSES[key], label: label ?? STATUSES[key].label };
}

/**
 * A capability chip: the capability's name is always visible; on/off is an icon plus text read by screen readers
 * (never a strike-through).
 * @param {string} name
 * @param {boolean} enabled
 * @returns {{tone: string, icon: string, label: string, srText: string}}
 */
export function capabilityPresentation(name, enabled) {
  return {
    tone: enabled ? 'success' : 'muted',
    icon: enabled ? 'check' : 'minus',
    label: name,
    srText: enabled ? STATUS_COPY.on : STATUS_COPY.off,
  };
}
