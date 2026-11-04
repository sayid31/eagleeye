// src/voiceSettingsForm.js
/**
 * Pure form <-> settings mapping for the POWER UP "Suara" section. No DOM.
 *
 * The server replaces settings wholesale on PUT, so `settingsFromForm` starts
 * from the settings last loaded from the server and overwrites only the fields
 * this form owns — anything the form does not edit (e.g. the topic rules, which
 * have their own controls) survives a save untouched.
 *
 * The server validates everything again; client checks here only give an
 * instant message and never replace that.
 */

/** Cost-limit text <-> value: '' = built-in default, 'off' = disabled, else USD. */
export function limitToText(value) {
  if (value === null || value === undefined) return '';
  return String(value);
}

export function textToLimit(text) {
  const raw = String(text ?? '').trim().toLowerCase();
  if (raw === '') return { ok: true, value: null };
  if (raw === 'off') return { ok: true, value: 'off' };
  const n = Number(raw.replace(',', '.'));
  return Number.isFinite(n) ? { ok: true, value: n } : { ok: false };
}

/** @param {object} settings Server settings snapshot. */
export function formFromSettings(settings) {
  return {
    enabled: settings.enabled !== false,
    warn: limitToText(settings.costLimits?.warnUsd),
    cap: limitToText(settings.costLimits?.capUsd),
    name: settings.persona?.name || '',
    instructions: settings.persona?.instructions || '',
  };
}

/**
 * @param {object} base Last settings loaded from the server.
 * @param {ReturnType<typeof formFromSettings>} form
 * @returns {{ok: true, settings: object} | {ok: false, error: string}}
 */
export function settingsFromForm(base, form) {
  const warn = textToLimit(form.warn);
  const cap = textToLimit(form.cap);
  if (!warn.ok || !cap.ok) return { ok: false, error: 'Batas biaya: isi angka dolar, "off", atau kosongkan untuk bawaan.' };
  return {
    ok: true,
    settings: {
      ...base,
      enabled: Boolean(form.enabled),
      costLimits: { warnUsd: warn.value, capUsd: cap.value },
      persona: { name: String(form.name ?? '').trim(), instructions: String(form.instructions ?? '').trim() },
    },
  };
}

/** Human message for a failed save, from the server's `{error, details}` body. */
export function describeSaveError(payload, status) {
  const details = Array.isArray(payload?.details) ? payload.details.slice(0, 3).join('; ') : '';
  return `${payload?.error || `Gagal menyimpan (${status})`}${details ? ` — ${details}` : ''}`;
}
