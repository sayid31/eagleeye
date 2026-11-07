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
  { key: 'dailyMinutes', label: 'Menit suara per hari', unit: 'menit' },
  { key: 'sessionMinutes', label: 'Durasi sesi maksimal', unit: 'menit' },
  { key: 'idleSeconds', label: 'Tutup saat diam setelah', unit: 'detik' },
]);

/**
 * Indonesian display text per tool group. The server's English label and
 * description also go into the voice prompt, so they are translated here only.
 */
export const TOOL_GROUP_TEXT = Object.freeze({
  readOnly: { label: 'Hanya baca', description: 'Melihat isi layar dan menjawab pertanyaan tentangnya.' },
  camera: { label: 'Kamera & navigasi', description: 'Terbang, zoom, menggerakkan kamera, dan melacak pesawat atau kapal.' },
  display: { label: 'Tampilan & layer', description: 'Menyalakan atau mematikan layer, panel, HUD, gaya visual, basemap, dan skenario.' },
  media: { label: 'Media (CCTV & radio)', description: 'Membuka video CCTV pihak ketiga dan streaming radio internet.' },
  annotate: { label: 'Menggambar di peta', description: 'Menggambar tanda, area, dan rute di peta, lalu menghapusnya.' },
});

/** Title + description for one tool group from GET /api/admin/voice/settings. */
export function describeToolGroup(group) {
  const text = TOOL_GROUP_TEXT[group.id];
  return {
    title: `${text?.label ?? group.label} (${group.toolCount} tools)`,
    description: text?.description ?? group.description,
  };
}

const limitText = (n) => (n ? String(n) : '');

/** @param {object} settings Server settings snapshot. */
export function generalFormFromSettings(settings) {
  return {
    enabled: settings.enabled !== false,
    name: settings.persona?.name ?? '',
    instructions: settings.persona?.instructions ?? '',
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
    else errors.push(`${label}: bilangan bulat ${ranges[key].min}–${ranges[key].max} ${unit}, atau kosong untuk tanpa batas`);
  }
  if (errors.length) return { ok: false, errors };
  return {
    ok: true,
    settings: {
      ...base,
      enabled: Boolean(form.enabled),
      persona: { ...base.persona, name: String(form.name ?? '').trim(), instructions: String(form.instructions ?? '').trim() },
      toolGroups: { ...base.toolGroups, ...form.toolGroups },
      limits,
    },
  };
}

/** One-line summary of what the server currently enforces (never form state). */
export function describeEnforced(settings) {
  const off = Object.entries(settings.toolGroups ?? {}).filter(([, on]) => on === false).length;
  const parts = [
    settings.enabled === false ? 'Suara MATI' : 'Suara AKTIF',
    'aturan inti AKTIF',
    settings.topics?.enabled ? `daftar topik AKTIF (${settings.topics.allowed.length})` : 'daftar topik MATI',
    off ? `${off} grup tools mati` : 'semua grup tools aktif',
  ];
  return parts.join(' · ');
}
