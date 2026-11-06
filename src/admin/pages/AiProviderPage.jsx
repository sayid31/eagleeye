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

  if (!form) return <Section title="Model and voice"><SaveStatus status={status} />{status ? null : <p>Loading…</p>}</Section>;
  const { effective, voices, backendModels } = data.provider;
  const save = async () => {
    const next = settingsFromProviderForm(data.settings, form, data.provider);
    if (!next.ok) { setStatus({ errors: next.errors }); return; }
    setSaving(true);
    try {
      await saveVoiceSettings(next.settings);
      await load();
      setStatus({ message: 'Saved. New voice sessions use this voice and model.' });
    } catch (error) {
      setStatus({ errors: [error.message] });
    } finally {
      setSaving(false);
    }
  };
  const option = (value) => <option key={value} value={value}>{value}</option>;
  return (
    <Section title="Model and voice" description={`Voice model: ${effective.model.value} (${describeSource(effective.model.source)}). The voice cannot change during a running session.`}>
      <div className="adm-grid">
        <Field label="Voice" hint={`In use: ${effective.voice.value} (${describeSource(effective.voice.source)})`}>
          <select className="adm-input" value={form.voice} onChange={(e) => setForm({ ...form, voice: e.target.value })}>
            <option value="">Default (.env or built-in)</option>{voices.map(option)}
          </select>
        </Field>
        <Field label="Backend model (tools and reasoning)" hint={`In use: ${effective.backendModel.value} (${describeSource(effective.backendModel.source)}). Billed separately; not in the cost meter.`}>
          <select className="adm-input" value={form.backendModel} onChange={(e) => setForm({ ...form, backendModel: e.target.value })}>
            <option value="">Default (.env or built-in)</option>{backendModels.map(option)}
          </select>
        </Field>
      </div>
      <div className="adm-actions">
        <button type="button" className="adm-btn adm-btn-primary" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save model and voice'}</button>
        <SaveStatus status={status} />
      </div>
    </Section>
  );
}

export function AiProviderPage() {
  const { data, loadError, status, busy, submit } = useProviderKeys();

  if (loadError) return <section className="adm-card"><h1>AI Provider</h1><p className="adm-error" role="alert">{loadError}</p></section>;
  if (!data) return <section className="adm-card"><h1>AI Provider</h1><p>Loading…</p></section>;

  const { ai } = partitionKeys(data.keys);
  return (
    <div className="adm-page">
      <header className="adm-page-header">
        <h1>AI Provider</h1>
        <p className="adm-muted">OpenAI powers the voice assistant, the screen reader and the HUD summary. The key is saved to {storeLabel(data.store)} on this computer and never shown.</p>
        <SaveStatus status={status} />
      </header>
      {ai.keys.map((key) => (
        <KeyCard key={key.id} keyInfo={key} note={data.testNotes?.[key.id] ?? ''} busy={busy} onSave={submit} onRemove={submit} />
      ))}
      <ModelVoiceSection />
    </div>
  );
}
