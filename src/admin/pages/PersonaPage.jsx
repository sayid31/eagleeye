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
  EXTRA_RULES_MAX, EXTRA_RULE_TEXT_MAX, describeRuleGroup, extraRuleRows, groupCoreRules, guardLabel,
  settingsFromPersonaForm, summarizeCoreRules,
} from './personaForm.js';

/** One read-only rule: number, Forbidden over Instead (text wraps), and what enforces it. */
function CoreRule({ rule }) {
  return (
    <li className="adm-rule">
      <span className="adm-rule-num">{rule.id}</span>
      <div className="adm-rule-body">
        <p><span className="adm-rule-tag">Dilarang</span>{rule.forbid}</p>
        <p><span className="adm-rule-tag adm-rule-tag-instead">Gantinya</span>{rule.instead}</p>
      </div>
      <span className={rule.guard === 'prompt' ? 'adm-pill adm-pill-muted' : 'adm-pill adm-pill-info'}>{guardLabel(rule.guard)}</span>
    </li>
  );
}

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
  if (!data) return <section className="adm-card"><h1>Persona</h1><p>Memuat…</p></section>;

  const coreGroups = groupCoreRules(data.coreRules.groups, data.coreRules.rules);
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
      setStatus({ message: 'Tersimpan. Sesi suara baru memakai aturan ini; sesi yang sedang berjalan tetap memakai yang lama.' });
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
        <p className="adm-muted">Satu gaya bicara tetap. Nama dan catatan kepribadian ada di halaman Umum; keduanya selalu di bawah aturan ini.</p>
      </header>

      <Section title="Aturan inti (selalu berlaku)" description="Terkunci. Dikirim di setiap sesi suara. Aturan “Prompt” hanya instruksi ke model dan bisa meleset; judge di Server Log mencatat jawaban yang keluar topik.">
        <p className="adm-muted">{summarizeCoreRules(coreGroups)}</p>
        {coreGroups.map((group, index) => (
          <details key={group.id} className="adm-rule-group" open={index === 0}>
            <summary><span className="adm-rule-group-title">{group.label}</span><span className="adm-field-hint">{describeRuleGroup(group)}</span></summary>
            <ol className="adm-rules">{group.rules.map((rule) => <CoreRule key={rule.id} rule={rule} />)}</ol>
          </details>
        ))}
      </Section>

      <Section title="Aturan tambahan" description={`Tambahkan maksimal ${EXTRA_RULES_MAX}. Hanya bisa menambah larangan; aturan yang mencoba melonggarkan aturan inti diabaikan asisten.`}>
        {rows.length === 0 ? <p className="adm-muted">Belum ada aturan tambahan.</p> : null}
        {rows.length ? (
          <ol className="adm-rules">
            {rows.map((row, index) => (
              <li key={index} className="adm-rule">
                <span className="adm-rule-num">+{index + 1}</span>
                <div className="adm-rule-body">
                  <label className="adm-rule-field"><span className="adm-rule-tag">Dilarang</span>
                    <input className="adm-input" type="text" maxLength={EXTRA_RULE_TEXT_MAX} placeholder="mis. Membahas skor sepak bola"
                      value={row.forbid} onChange={(e) => setRow(index, { forbid: e.target.value })} />
                  </label>
                  <label className="adm-rule-field"><span className="adm-rule-tag adm-rule-tag-instead">Gantinya</span>
                    <input className="adm-input" type="text" maxLength={EXTRA_RULE_TEXT_MAX} placeholder="mis. Tolak dalam satu kalimat dan tawarkan bantuan peta"
                      value={row.instead} onChange={(e) => setRow(index, { instead: e.target.value })} />
                  </label>
                </div>
                <button type="button" className="adm-btn adm-btn-danger" onClick={() => setRows((prev) => prev.filter((_, i) => i !== index))}>Hapus</button>
              </li>
            ))}
          </ol>
        ) : null}
        <button type="button" className="adm-btn" disabled={rows.length >= EXTRA_RULES_MAX}
          onClick={() => setRows((prev) => [...prev, { forbid: '', instead: '' }])}>Tambah aturan</button>
      </Section>

      <div className="adm-actions">
        <button type="button" className="adm-btn adm-btn-primary" onClick={save} disabled={saving}>{saving ? 'Menyimpan…' : 'Simpan perubahan'}</button>
        <SaveStatus status={status} />
      </div>
    </div>
  );
}
