// src/admin/pages/PersonaPage.jsx
/**
 * AI Configuration → Persona: the locked core rules (read-only, always in
 * force) and the owner's extra Forbidden → Instead rules, which can only add
 * restrictions. One fixed speaking style; there is no style picker (P7).
 */
import { useEffect, useState } from 'react';
import { fetchVoiceSettings, saveVoiceSettings } from '../api/adminVoiceApi.js';
import { SaveStatus, Section } from '../components/FormControls.jsx';
import {
  EXTRA_RULES_MAX, EXTRA_RULE_TEXT_MAX, extraRuleRows, groupCoreRules, guardLabel, settingsFromPersonaForm,
} from './personaForm.js';

export function PersonaPage() {
  const [data, setData] = useState(null);
  const [rows, setRows] = useState([]);
  const [loadError, setLoadError] = useState('');
  const [status, setStatus] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchVoiceSettings()
      .then((payload) => { if (!cancelled) { setData(payload); setRows(extraRuleRows(payload.settings)); } })
      .catch((error) => { if (!cancelled) setLoadError(error.message); });
    return () => { cancelled = true; };
  }, []);

  if (loadError) return <section className="adm-card"><h1>Persona</h1><p className="adm-error" role="alert">{loadError}</p></section>;
  if (!data) return <section className="adm-card"><h1>Persona</h1><p>Loading…</p></section>;

  const setRow = (index, patch) => setRows((prev) => prev.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  const save = async () => {
    const next = settingsFromPersonaForm(data.settings, rows);
    if (!next.ok) { setStatus({ errors: next.errors }); return; }
    setSaving(true);
    setStatus(null);
    try {
      const saved = await saveVoiceSettings(next.settings);
      setData((prev) => ({ ...prev, settings: saved.settings, storedValid: true }));
      setRows(extraRuleRows(saved.settings));
      setStatus({ message: 'Saved. New voice sessions use these rules; a session already running keeps its old ones.' });
    } catch (error) {
      setStatus({ errors: [error.message] });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="adm-page adm-page-wide">
      <header className="adm-page-header">
        <h1>Persona</h1>
        <p className="adm-muted">One fixed speaking style. Name and personality notes are on the General page; they always rank below these rules.</p>
      </header>

      <Section title="Core rules (always in force)" description="Locked. Sent with every voice session. “Prompt” rules are instructions to the model only and can slip; the Server Log judge records answers that go off-topic.">
        {groupCoreRules(data.coreRules.groups, data.coreRules.rules).map((group) => (
          <div key={group.id} className="adm-table-wrap">
            <h3>{group.label}</h3>
            <table className="adm-table">
              <thead><tr><th>#</th><th>Forbidden</th><th>Instead</th><th>Guarded by</th></tr></thead>
              <tbody>
                {group.rules.map((rule) => (
                  <tr key={rule.id}>
                    <td>{rule.id}</td><td>{rule.forbid}</td><td>{rule.instead}</td>
                    <td><span className={rule.guard === 'prompt' ? 'adm-pill adm-pill-muted' : 'adm-pill adm-pill-info'}>{guardLabel(rule.guard)}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </Section>

      <Section title="Extra rules" description={`Add up to ${EXTRA_RULES_MAX}. They can only add restrictions; one that tries to loosen a core rule is ignored by the assistant.`}>
        {rows.length === 0 ? <p className="adm-muted">No extra rules.</p> : null}
        {rows.map((row, index) => (
          <div key={index} className="adm-grid">
            <input className="adm-input" type="text" maxLength={EXTRA_RULE_TEXT_MAX} placeholder="Forbidden" aria-label={`Extra rule ${index + 1} forbidden`}
              value={row.forbid} onChange={(e) => setRow(index, { forbid: e.target.value })} />
            <input className="adm-input" type="text" maxLength={EXTRA_RULE_TEXT_MAX} placeholder="Instead" aria-label={`Extra rule ${index + 1} instead`}
              value={row.instead} onChange={(e) => setRow(index, { instead: e.target.value })} />
            <button type="button" className="adm-btn adm-btn-danger" onClick={() => setRows((prev) => prev.filter((_, i) => i !== index))}>Remove</button>
          </div>
        ))}
        <button type="button" className="adm-btn" disabled={rows.length >= EXTRA_RULES_MAX}
          onClick={() => setRows((prev) => [...prev, { forbid: '', instead: '' }])}>Add rule</button>
      </Section>

      <div className="adm-actions">
        <button type="button" className="adm-btn adm-btn-primary" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save changes'}</button>
        <SaveStatus status={status} />
      </div>
    </div>
  );
}
