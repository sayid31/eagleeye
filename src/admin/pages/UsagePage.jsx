// src/admin/pages/UsagePage.jsx
/**
 * AI Configuration → Usage & Cost: today's minutes against the daily cap, a
 * per-day table priced with the current GPT-Live rates, the per-session cost
 * warning/cap, and what the estimate leaves out.
 */
import { useCallback, useEffect, useState } from 'react';
import { fetchVoiceSettings, fetchVoiceUsage, saveVoiceSettings } from '../api/adminVoiceApi.js';
import { Field, SaveStatus, Section } from '../components/FormControls.jsx';
import { costFormFromSettings, describeDailyCap, formatDuration, formatEstimate, settingsFromCostForm } from './usageView.js';

const DEFAULT_DAYS = 30;
const limitLabel = (value) => (value === null ? 'mati' : formatEstimate(value));

function UsageTable({ rows, total }) {
  return (
    <div className="adm-table-wrap">
      <table className="adm-table">
        <thead><tr><th>Hari</th><th>Sesi</th><th>Audio</th><th>Baca layar</th><th>Panggilan judge</th><th>Perkiraan biaya</th></tr></thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.day} className={row.sessions ? undefined : 'adm-row-empty'}>
              <td>{row.day}</td><td>{row.sessions}</td><td>{formatDuration(row.seconds)}</td>
              <td>{formatEstimate(row.extrasUsd)}</td><td>{row.judgeCalls}</td><td>{formatEstimate(row.estimatedUsd)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot><tr><th>Total</th><th>{total.sessions}</th><th>{formatDuration(total.seconds)}</th><th /><th>{total.judgeCalls}</th><th>{formatEstimate(total.estimatedUsd)}</th></tr></tfoot>
      </table>
    </div>
  );
}

export function UsagePage() {
  const [days, setDays] = useState(DEFAULT_DAYS);
  const [usage, setUsage] = useState(null);
  const [settings, setSettings] = useState(null);
  const [costForm, setCostForm] = useState({ warn: '', cap: '' });
  const [loadError, setLoadError] = useState('');
  const [status, setStatus] = useState(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async (windowDays) => {
    try {
      const [u, s] = await Promise.all([fetchVoiceUsage(windowDays), fetchVoiceSettings()]);
      setUsage(u);
      setSettings(s.settings);
      setCostForm(costFormFromSettings(s.settings.costLimits));
      setLoadError('');
    } catch (error) {
      setLoadError(error.message);
    }
  }, []);

  useEffect(() => { void load(days); }, [days, load]);

  if (loadError) return <section className="adm-card"><h1>Pemakaian &amp; Biaya</h1><p className="adm-error" role="alert">{loadError}</p></section>;
  if (!usage || !settings) return <section className="adm-card"><h1>Pemakaian &amp; Biaya</h1><p>Memuat…</p></section>;

  const saveCost = async () => {
    const next = settingsFromCostForm(settings, costForm);
    if (!next.ok) { setStatus({ errors: [next.error] }); return; }
    setSaving(true);
    setStatus(null);
    try {
      await saveVoiceSettings(next.settings);
      await load(days);
      setStatus({ message: 'Tersimpan. Berlaku mulai sesi suara berikutnya.' });
    } catch (error) {
      setStatus({ errors: [error.message] });
    } finally {
      setSaving(false);
    }
  };

  const { rates, costLimits, summary } = usage;
  return (
    <div className="adm-page">
      <header className="adm-page-header">
        <h1>Pemakaian &amp; Biaya</h1>
        <p className="adm-muted">Perkiraan dari meter mic sendiri, bukan tagihan OpenAI.</p>
      </header>

      <Section title="Hari ini">
        <p className="adm-stat">{formatEstimate(summary.today.estimatedUsd)}</p>
        <p className="adm-muted" role="status">{describeDailyCap(usage)}</p>
      </Section>

      <Section title="Pemakaian harian">
        <div className="adm-segmented" role="group" aria-label="Rentang waktu">
          {usage.dayOptions.map((option) => (
            <button key={option} type="button" className={`adm-btn${option === days ? ' adm-btn-primary' : ''}`}
              aria-pressed={option === days} onClick={() => setDays(option)}>{option} hari</button>
          ))}
        </div>
        <UsageTable rows={summary.rows} total={summary.total} />
      </Section>

      <Section title="Batas biaya per sesi" description={`Kosong = default bawaan (peringatan ${formatEstimate(costLimits.defaults.warnUsd)}, berhenti ${formatEstimate(costLimits.defaults.capUsd)}). "off" = tanpa batas.`}>
        <p className="adm-muted">Berlaku: peringatan di {limitLabel(costLimits.effective.warnUsd)}, sesi berhenti di {limitLabel(costLimits.effective.capUsd)}.</p>
        <div className="adm-grid">
          <Field label="Peringatan (USD)"><input className="adm-input" type="text" inputMode="decimal" value={costForm.warn} onChange={(e) => setCostForm((f) => ({ ...f, warn: e.target.value }))} /></Field>
          <Field label="Batas keras (USD)"><input className="adm-input" type="text" inputMode="decimal" value={costForm.cap} onChange={(e) => setCostForm((f) => ({ ...f, cap: e.target.value }))} /></Field>
        </div>
        <div className="adm-actions">
          <button type="button" className="adm-btn adm-btn-primary" onClick={saveCost} disabled={saving}>{saving ? 'Menyimpan…' : 'Simpan batas'}</button>
          <SaveStatus status={status} />
        </div>
      </Section>

      <Section title="Harga yang dipakai untuk perkiraan" description={`Tarif dicek pada ${rates.verifiedOn}; cocokkan dengan harga OpenAI saat rilis.`}>
        <ul className="adm-list">
          <li>Audio live ({rates.liveModel}): ${rates.livePerMin.toFixed(2)} per menit, ditagih per detik.</li>
          <li>Pembaca layar ({rates.readerModel}): ${rates.readerInPerMTok} / ${rates.readerOutPerMTok} per 1M token input / output.</li>
          <li>Tidak termasuk: backend model yang didelegasikan dan tool call-nya (ditagih terpisah oleh OpenAI).</li>
          <li>
            Judge keluar topik ({rates.judgeModel}): ${rates.judgeInPerMTok} / ${rates.judgeOutPerMTok} per 1M token input / output, sekitar $0.0002 per jawaban yang dinilai;
            {rates.judgeEnabled ? ' termasuk di tabel atas (Panggilan judge).' : ' dimatikan (GEV_VOICE_JUDGE=off).'}
          </li>
        </ul>
      </Section>
    </div>
  );
}
