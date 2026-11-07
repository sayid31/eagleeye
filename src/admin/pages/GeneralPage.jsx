// src/admin/pages/GeneralPage.jsx
/**
 * AI Configuration → General: voice on/off, assistant name and personality
 * notes, the five tool permission groups and the session limits (the topic
 * restriction lives on Persona). Reads and writes the voice-settings store (`.gev-cache/voice-settings.json`).
 */
import { useEffect, useState } from 'react';
import { fetchVoiceSettings, saveVoiceSettings } from '../api/adminVoiceApi.js';
import { Field, SaveStatus, Section, Toggle } from '../components/FormControls.jsx';
import { LIMIT_FIELDS, describeEnforced, describeToolGroup, generalFormFromSettings, settingsFromGeneralForm } from './generalForm.js';

const NAME_MAX = 40;
const NOTES_MAX = 1000;

export function GeneralPage() {
  const [data, setData] = useState(null);
  const [form, setForm] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [status, setStatus] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchVoiceSettings()
      .then((payload) => { if (!cancelled) { setData(payload); setForm(generalFormFromSettings(payload.settings)); } })
      .catch((error) => { if (!cancelled) setLoadError(error.message); });
    return () => { cancelled = true; };
  }, []);

  if (loadError) return <section className="adm-card"><h1>Umum</h1><p className="adm-error" role="alert">{loadError}</p></section>;
  if (!form) return <section className="adm-card"><h1>Umum</h1><p>Memuat…</p></section>;

  const set = (patch) => setForm((prev) => ({ ...prev, ...patch }));
  const setGroup = (id, on) => setForm((prev) => ({ ...prev, toolGroups: { ...prev.toolGroups, [id]: on } }));
  const setLimit = (key, value) => setForm((prev) => ({ ...prev, limits: { ...prev.limits, [key]: value } }));

  const save = async () => {
    const next = settingsFromGeneralForm(data.settings, form, data.limitRanges);
    if (!next.ok) { setStatus({ errors: next.errors }); return; }
    if (data.settings.enabled !== false && !form.enabled
      && !window.confirm('Matikan suara? Tombol mic akan menolak memulai sesi baru.')) return;
    setSaving(true);
    setStatus(null);
    try {
      const saved = await saveVoiceSettings(next.settings);
      setData((prev) => ({ ...prev, settings: saved.settings, storedValid: true }));
      setForm(generalFormFromSettings(saved.settings));
      setStatus({ message: 'Tersimpan. Sesi suara baru memakai pengaturan ini; sesi yang sedang berjalan tetap memakai yang lama.' });
    } catch (error) {
      setStatus({ errors: [error.message] });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="adm-page">
      <header className="adm-page-header">
        <h1>Umum</h1>
        <p className="adm-muted" role="status">Yang berlaku sekarang: {describeEnforced(data.settings)}</p>
        {data.storedValid ? null : <p className="adm-error">File pengaturan tersimpan tidak bisa dibaca; default berlaku sampai Anda menyimpan.</p>}
      </header>

      <Section title="Asisten">
        <Toggle checked={form.enabled} onChange={(enabled) => set({ enabled })} title="Asisten suara aktif"
          description="Mati: tombol mic menolak memulai sesi baru." />
        <Field label="Nama asisten" hint={`Opsional, maksimal ${NAME_MAX} karakter. Kosong = nama bawaan.`}>
          <input className="adm-input" type="text" maxLength={NAME_MAX} value={form.name} onChange={(e) => set({ name: e.target.value })} />
        </Field>
        <Field label="Catatan kepribadian" hint={`Hanya nada dan gaya bahasa, ${form.instructions.length}/${NOTES_MAX} karakter. Selalu di bawah aturan inti; tidak bisa mengubah tools atau aturan.`}>
          <textarea className="adm-input" rows={4} maxLength={NOTES_MAX} value={form.instructions} onChange={(e) => set({ instructions: e.target.value })} />
        </Field>
      </Section>

      <Section title="Izin tools" description="Grup yang dimatikan sama sekali tidak ditawarkan ke model suara, jadi tools itu tidak bisa dipanggil.">
        {data.toolGroups.map((group) => {
          const text = describeToolGroup(group);
          return <Toggle key={group.id} checked={form.toolGroups[group.id] !== false} onChange={(on) => setGroup(group.id, on)} title={text.title} description={text.description} />;
        })}
      </Section>

      <Section title="Batas sesi" description="Sesi ditutup otomatis saat batas tercapai. Kosongkan kolom lalu simpan untuk mematikan batas itu.">
        <div className="adm-grid">
          {LIMIT_FIELDS.map(({ key, label, unit }) => (
            <Field key={key} label={label} hint={`${data.limitRanges[key].min}–${data.limitRanges[key].max} ${unit}`}>
              <input className="adm-input" type="text" inputMode="numeric" value={form.limits[key]} placeholder="Tanpa batas"
                onChange={(e) => setLimit(key, e.target.value)} />
            </Field>
          ))}
        </div>
      </Section>

      <div className="adm-actions">
        <button type="button" className="adm-btn adm-btn-primary" onClick={save} disabled={saving}>{saving ? 'Menyimpan…' : 'Simpan perubahan'}</button>
        <SaveStatus status={status} />
      </div>
    </div>
  );
}
