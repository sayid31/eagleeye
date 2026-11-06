// src/admin/pages/generalForm.js
/**
 * Form model of AI Configuration → General: settings ⇄ form strings, plus
 * the instant client-side checks. The server validates everything again
 * (`validateVoiceSettings`); these checks only give a faster message.
 *
 * The server replaces settings wholesale on PUT, so the save starts from the
 * settings last loaded and overwrites only the fields this page owns — cost
 * limits (Usage & Cost page) and anything newer survive a save here.
 *
 * Pure — no DOM, no network.
 *
 * @module admin/pages/generalForm
 */

/** Limit fields on this page, in display order. */
export const LIMIT_FIELDS = Object.freeze([
  { key: 'dailyMinutes', label: 'Daily voice minutes', unit: 'minutes' },
  { key: 'sessionMinutes', label: 'Maximum session length', unit: 'minutes' },
  { key: 'idleSeconds', label: 'Close when idle after', unit: 'seconds' },
]);

const limitText = (n) => (n ? String(n) : '');

/** @param {object} settings Server settings snapshot. */
export function generalFormFromSettings(settings) {
  return {
    enabled: settings.enabled !== false,
    name: settings.persona?.name ?? '',
    instructions: settings.persona?.instructions ?? '',
    topicsEnabled: settings.topics?.enabled === true,
    topics: (settings.topics?.allowed ?? []).join('\n'),
    refusal: settings.topics?.refusal ?? '',
    toolGroups: { ...settings.toolGroups },
    limits: Object.fromEntries(LIMIT_FIELDS.map(({ key }) => [key, limitText(settings.limits?.[key])])),
  };
}

/**
 * '' or 0 = off; otherwise a whole number inside the server's range.
 * @returns {{ok: true, value: number} | {ok: false}}
 */
export function parseLimit(text, range) {
  const raw = String(text ?? '').trim();
  if (raw === '' || raw === '0') return { ok: true, value: 0 };
  if (!/^\d+$/.test(raw)) return { ok: false };
  const value = Number(raw);
  return value >= range.min && value <= range.max ? { ok: true, value } : { ok: false };
}

/**
 * @param {object} base Settings last loaded from the server.
 * @param {ReturnType<typeof generalFormFromSettings>} form
 * @param {Record<string, {min: number, max: number}>} ranges `limitRanges` from the server.
 * @returns {{ok: true, settings: object} | {ok: false, errors: string[]}}
 */
export function settingsFromGeneralForm(base, form, ranges) {
  const errors = [];
  const limits = {};
  for (const { key, label, unit } of LIMIT_FIELDS) {
    const parsed = parseLimit(form.limits[key], ranges[key]);
    if (parsed.ok) limits[key] = parsed.value;
    else errors.push(`${label}: whole ${unit} ${ranges[key].min}–${ranges[key].max}, or empty for no limit`);
  }
  const allowed = String(form.topics ?? '').split('\n').map((t) => t.trim()).filter(Boolean);
  if (form.topicsEnabled && allowed.length === 0) errors.push('Topic restriction is on: add at least one allowed topic (one per line).');
  if (errors.length) return { ok: false, errors };
  return {
    ok: true,
    settings: {
      ...base,
      enabled: Boolean(form.enabled),
      persona: { ...base.persona, name: String(form.name ?? '').trim(), instructions: String(form.instructions ?? '').trim() },
      topics: { enabled: Boolean(form.topicsEnabled), allowed, refusal: String(form.refusal ?? '').trim() },
      toolGroups: { ...base.toolGroups, ...form.toolGroups },
      limits,
    },
  };
}

/** One-line summary of what the server currently enforces (never form state). */
export function describeEnforced(settings) {
  const off = Object.entries(settings.toolGroups ?? {}).filter(([, on]) => on === false).length;
  const parts = [
    settings.enabled === false ? 'Voice OFF' : 'Voice ON',
    'core rules ON',
    settings.topics?.enabled ? `topic list ON (${settings.topics.allowed.length})` : 'topic list OFF',
    off ? `${off} tool group${off > 1 ? 's' : ''} off` : 'all tool groups on',
  ];
  return parts.join(' · ');
}
