// src/voiceSettingsPanel.js
/**
 * POWER UP → "Suara" section: owner on/off switch, cost limits, assistant name
 * and style notes. Mounted by keySetup.js into `[data-voice-settings]`.
 *
 * Talks only to /api/setup/voice (owner-only; guarded server-side by
 * requireAdmin). It never reads or sends an API key: keys have their own rows
 * above and live in the server .env.
 */

import { VOICE_SETTINGS_SAVED_EVENT } from './voice/voiceConfigClient.js';
import { describeSaveError, formFromSettings, settingsFromForm } from './voiceSettingsForm.js';

const SETTINGS_URL = '/api/setup/voice';

function el(doc, tag, props = {}, ...children) {
  const node = doc.createElement(tag);
  Object.assign(node, props);
  node.append(...children);
  return node;
}

function field(doc, label, control, hint) {
  const wrap = el(doc, 'label', { className: 'voice-settings-field' }, el(doc, 'span', { textContent: label }), control);
  if (hint) wrap.append(el(doc, 'small', { textContent: hint }));
  return wrap;
}

/**
 * @param {object} params
 * @param {Element} params.host `[data-voice-settings]` container.
 * @param {Document} [params.documentRef]
 * @param {typeof fetch} [params.fetchImpl]
 * @returns {Promise<{reload: () => Promise<void>}|null>} null when the endpoint is unavailable.
 */
export async function mountVoiceSettings({ host, documentRef = globalThis.document, fetchImpl } = {}) {
  if (!host) return null;
  const doFetch = fetchImpl || globalThis.fetch?.bind(globalThis);
  let base;
  try {
    const response = await doFetch(SETTINGS_URL, { cache: 'no-store' });
    if (!response.ok) throw new Error(String(response.status));
    base = (await response.json()).settings;
  } catch {
    host.remove();
    return null;
  }

  const doc = documentRef;
  const enabled = el(doc, 'input', { type: 'checkbox' });
  const warn = el(doc, 'input', { type: 'text', inputMode: 'decimal', placeholder: '2 (bawaan)', autocomplete: 'off' });
  const cap = el(doc, 'input', { type: 'text', inputMode: 'decimal', placeholder: '5 (bawaan)', autocomplete: 'off' });
  const name = el(doc, 'input', { type: 'text', maxLength: 40, placeholder: 'EagleEye Voice Control (bawaan)', autocomplete: 'off' });
  const instructions = el(doc, 'textarea', { rows: 3, maxLength: 1000, placeholder: 'Catatan gaya bicara (opsional, maks 1000 karakter)' });
  const status = el(doc, 'p', { className: 'key-setup-note', role: 'status' });
  const save = el(doc, 'button', { type: 'button', className: 'key-setup-apply', textContent: 'SIMPAN PENGATURAN SUARA' });
  status.setAttribute('aria-live', 'polite');

  const fill = () => {
    const form = formFromSettings(base);
    enabled.checked = form.enabled;
    warn.value = form.warn;
    cap.value = form.cap;
    name.value = form.name;
    instructions.value = form.instructions;
  };

  host.textContent = '';
  host.append(
    el(doc, 'strong', { className: 'voice-settings-title', textContent: 'SUARA' }),
    el(doc, 'p', { className: 'key-setup-unlocks', textContent: 'Pengaturan ini disimpan di komputer ini, terpisah dari kunci API. Kunci tidak pernah ditampilkan di sini.' }),
    field(doc, 'Fitur suara aktif', enabled, 'Dimatikan: tombol mic menolak memulai sesi baru.'),
    field(doc, 'Peringatan biaya (USD)', warn, 'Kosong = bawaan. "off" = tanpa peringatan.'),
    field(doc, 'Batas keras biaya (USD)', cap, 'Sesi diakhiri saat tercapai. "off" = tanpa batas.'),
    field(doc, 'Nama asisten', name),
    field(doc, 'Catatan gaya', instructions, 'Hanya nada & gaya; tidak mengubah aturan atau tool.'),
    el(doc, 'div', { className: 'key-setup-footer' }, save),
    status,
  );
  fill();

  let busy = false;
  save.addEventListener('click', async () => {
    if (busy) return;
    const form = {
      enabled: enabled.checked, warn: warn.value, cap: cap.value, name: name.value, instructions: instructions.value,
    };
    const next = settingsFromForm(base, form);
    if (!next.ok) { status.textContent = next.error; return; }
    if (base.enabled !== false && !form.enabled) {
      const ok = typeof globalThis.confirm !== 'function'
        || globalThis.confirm('Nonaktifkan fitur suara? Tombol mic tidak akan bisa memulai sesi.');
      if (!ok) return;
    }
    busy = true;
    save.setAttribute('aria-disabled', 'true');
    status.textContent = 'Menyimpan…';
    try {
      const response = await doFetch(SETTINGS_URL, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(next.settings),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) { status.textContent = describeSaveError(payload, response.status); return; }
      base = payload.settings;
      fill();
      status.textContent = 'Tersimpan. Berlaku untuk sesi suara berikutnya.';
      globalThis.dispatchEvent?.(new globalThis.CustomEvent(VOICE_SETTINGS_SAVED_EVENT));
    } catch (error) {
      status.textContent = `Gagal menyimpan: ${error?.message || error}`;
    } finally {
      busy = false;
      save.setAttribute('aria-disabled', 'false');
    }
  });

  return { reload: async () => { fill(); } };
}
