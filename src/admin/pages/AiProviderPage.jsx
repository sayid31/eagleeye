// src/admin/pages/AiProviderPage.jsx
/**
 * AI Configuration → AI Provider: the OpenAI key that powers the voice
 * assistant (status, replace, remove, test), plus the GPT-Live voice and
 * delegation backend model. The provider stays OpenAI (plan decision 6).
 */
import { useEffect, useState } from 'react';
import { fetchVoiceSettings, saveVoiceSettings } from '../api/adminVoiceApi.js';
import { KeyCard } from '../components/KeyCard.jsx';
import { Field, SaveStatus, Section } from '../components/FormControls.jsx';
import { partitionKeys, storeLabel } from './apiKeysView.js';
import { describeSource, providerFormFromSettings, settingsFromProviderForm } from './providerForm.js';
import { useProviderKeys } from './useProviderKeys.js';

/** Voice + backend model picker; empty = env var or built-in default. */
function ModelVoiceSection() {
  const [data, setData] = useState(null);
  const [form, setForm] = useState(null);
  const [status, setStatus] = useState(null);
  const [saving, setSaving] = useState(false);
  const load = () => fetchVoiceSettings()
    .then((payload) => { setData(payload); setForm(providerFormFromSettings(payload.settings)); })
    .catch((error) => setStatus({ errors: [error.message] }));
  useEffect(() => { load(); }, []);

  if (!form) return <Section title="Model dan suara"><SaveStatus status={status} />{status ? null : <p>Memuat…</p>}</Section>;
  const { effective, voices, backendModels } = data.provider;
  const save = async () => {
    const next = settingsFromProviderForm(data.settings, form, data.provider);
    if (!next.ok) { setStatus({ errors: next.errors }); return; }
    setSaving(true);
    try {
      await saveVoiceSettings(next.settings);
      await load();
      setStatus({ message: 'Tersimpan. Sesi suara baru memakai suara dan model ini.' });
    } catch (error) {
      setStatus({ errors: [error.message] });
    } finally {
      setSaving(false);
    }
  };
  const option = (value) => <option key={value} value={value}>{value}</option>;
  return (
    <Section title="Model dan suara" description={`Model suara: ${effective.model.value} (${describeSource(effective.model.source)}). Suara tidak bisa berganti selama sesi berjalan.`}>
      <div className="adm-grid">
        <Field label="Suara" hint={`Dipakai: ${effective.voice.value} (${describeSource(effective.voice.source)})`}>
          <select className="adm-input" value={form.voice} onChange={(e) => setForm({ ...form, voice: e.target.value })}>
            <option value="">Default (.env atau bawaan)</option>{voices.map(option)}
          </select>
        </Field>
        <Field label="Backend model (tools dan penalaran)" hint={`Dipakai: ${effective.backendModel.value} (${describeSource(effective.backendModel.source)}). Ditagih terpisah; tidak masuk meter biaya.`}>
          <select className="adm-input" value={form.backendModel} onChange={(e) => setForm({ ...form, backendModel: e.target.value })}>
            <option value="">Default (.env atau bawaan)</option>{backendModels.map(option)}
          </select>
        </Field>
      </div>
      <div className="adm-actions">
        <button type="button" className="adm-btn adm-btn-primary" onClick={save} disabled={saving}>{saving ? 'Menyimpan…' : 'Simpan model dan suara'}</button>
        <SaveStatus status={status} />
      </div>
    </Section>
  );
}

export function AiProviderPage() {
  const { data, loadError, status, busy, submit } = useProviderKeys();

  if (loadError) return <section className="adm-card"><h1>Penyedia AI</h1><p className="adm-error" role="alert">{loadError}</p></section>;
  if (!data) return <section className="adm-card"><h1>Penyedia AI</h1><p>Memuat…</p></section>;

  const { ai } = partitionKeys(data.keys);
  return (
    <div className="adm-page">
      <header className="adm-page-header">
        <h1>Penyedia AI</h1>
        <p className="adm-muted">OpenAI menjalankan asisten suara, pembaca layar, dan ringkasan HUD. Key disimpan di {storeLabel(data.store)} di komputer ini dan tidak pernah ditampilkan.</p>
        <SaveStatus status={status} />
      </header>
      {ai.keys.map((key) => (
        <KeyCard key={key.id} keyInfo={key} note={data.testNotes?.[key.id] ?? ''} busy={busy} onSave={submit} onRemove={submit} />
      ))}
      <ModelVoiceSection />
    </div>
  );
}
