// src/admin/pages/GeneralPage.jsx
/**
 * AI Configuration → General: voice on/off, assistant name and personality
 * notes, topic restriction, the five tool permission groups and the session
 * limits. Reads and writes the voice-settings store (`.gev-cache/voice-settings.json`).
 */
import { useEffect, useState } from 'react';
import { fetchVoiceSettings, saveVoiceSettings } from '../api/adminVoiceApi.js';
import { Field, SaveStatus, Section, Toggle } from '../components/FormControls.jsx';
import { LIMIT_FIELDS, describeEnforced, generalFormFromSettings, settingsFromGeneralForm } from './generalForm.js';

const NAME_MAX = 40;
const NOTES_MAX = 1000;
const REFUSAL_MAX = 160;

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

  if (loadError) return <section className="adm-card"><h1>General</h1><p className="adm-error" role="alert">{loadError}</p></section>;
  if (!form) return <section className="adm-card"><h1>General</h1><p>Loading…</p></section>;

  const set = (patch) => setForm((prev) => ({ ...prev, ...patch }));
  const setGroup = (id, on) => setForm((prev) => ({ ...prev, toolGroups: { ...prev.toolGroups, [id]: on } }));
  const setLimit = (key, value) => setForm((prev) => ({ ...prev, limits: { ...prev.limits, [key]: value } }));

  const save = async () => {
    const next = settingsFromGeneralForm(data.settings, form, data.limitRanges);
    if (!next.ok) { setStatus({ errors: next.errors }); return; }
    if (data.settings.enabled !== false && !form.enabled
      && !window.confirm('Turn voice off? The mic button will refuse to start new sessions.')) return;
    setSaving(true);
    setStatus(null);
    try {
      const saved = await saveVoiceSettings(next.settings);
      setData((prev) => ({ ...prev, settings: saved.settings, storedValid: true }));
      setForm(generalFormFromSettings(saved.settings));
      setStatus({ message: 'Saved. New voice sessions use these settings; a session already running keeps its old ones.' });
    } catch (error) {
      setStatus({ errors: [error.message] });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="adm-page">
      <header className="adm-page-header">
        <h1>General</h1>
        <p className="adm-muted" role="status">Currently enforced: {describeEnforced(data.settings)}</p>
        {data.storedValid ? null : <p className="adm-error">The saved settings file was unreadable; defaults are in effect until you save.</p>}
      </header>

      <Section title="Assistant">
        <Toggle checked={form.enabled} onChange={(enabled) => set({ enabled })} title="Voice assistant enabled"
          description="Off: the mic button refuses to start new sessions." />
        <Field label="Assistant name" hint={`Optional, up to ${NAME_MAX} characters. Empty = built-in name.`}>
          <input className="adm-input" type="text" maxLength={NAME_MAX} value={form.name} onChange={(e) => set({ name: e.target.value })} />
        </Field>
        <Field label="Personality notes" hint={`Tone and phrasing only, ${form.instructions.length}/${NOTES_MAX} characters. Always below the core rules; cannot change tools or rules.`}>
          <textarea className="adm-input" rows={4} maxLength={NOTES_MAX} value={form.instructions} onChange={(e) => set({ instructions: e.target.value })} />
        </Field>
      </Section>

      <Section title="Topic restriction" description="The Persona core rules always keep the assistant on this console. This optional list narrows conversation further. Prompt-based best effort; app commands and “where is this” questions are never refused.">
        <Toggle checked={form.topicsEnabled} onChange={(topicsEnabled) => set({ topicsEnabled })} title="Restrict to these topics only" />
        <Field label="Allowed topics" hint="One per line, up to 20.">
          <textarea className="adm-input" rows={4} value={form.topics} onChange={(e) => set({ topics: e.target.value })} />
        </Field>
        <Field label="Refusal sentence" hint={`One sentence, up to ${REFUSAL_MAX} characters. Empty = built-in sentence.`}>
          <input className="adm-input" type="text" maxLength={REFUSAL_MAX} value={form.refusal} onChange={(e) => set({ refusal: e.target.value })} />
        </Field>
      </Section>

      <Section title="Tool permissions" description="A switched-off group is not offered to the voice model at all, so it cannot call those tools.">
        {data.toolGroups.map((group) => (
          <Toggle key={group.id} checked={form.toolGroups[group.id] !== false} onChange={(on) => setGroup(group.id, on)}
            title={`${group.label} (${group.toolCount} tools)`} description={group.description} />
        ))}
      </Section>

      <Section title="Session limits" description="Empty = no limit. The session closes automatically when a limit is reached.">
        <div className="adm-grid">
          {LIMIT_FIELDS.map(({ key, label, unit }) => (
            <Field key={key} label={label} hint={`${data.limitRanges[key].min}–${data.limitRanges[key].max} ${unit}`}>
              <input className="adm-input" type="text" inputMode="numeric" value={form.limits[key]} placeholder="No limit"
                onChange={(e) => setLimit(key, e.target.value)} />
            </Field>
          ))}
        </div>
      </Section>

      <div className="adm-actions">
        <button type="button" className="adm-btn adm-btn-primary" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save changes'}</button>
        <SaveStatus status={status} />
      </div>
    </div>
  );
}
