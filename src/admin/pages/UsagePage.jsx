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
const limitLabel = (value) => (value === null ? 'off' : formatEstimate(value));

function UsageTable({ rows, total }) {
  return (
    <div className="adm-table-wrap">
      <table className="adm-table">
        <thead><tr><th>Day</th><th>Sessions</th><th>Audio</th><th>Screen reads</th><th>Estimated cost</th></tr></thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.day} className={row.sessions ? undefined : 'adm-row-empty'}>
              <td>{row.day}</td><td>{row.sessions}</td><td>{formatDuration(row.seconds)}</td>
              <td>{formatEstimate(row.extrasUsd)}</td><td>{formatEstimate(row.estimatedUsd)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot><tr><th>Total</th><th>{total.sessions}</th><th>{formatDuration(total.seconds)}</th><th /><th>{formatEstimate(total.estimatedUsd)}</th></tr></tfoot>
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

  if (loadError) return <section className="adm-card"><h1>Usage &amp; Cost</h1><p className="adm-error" role="alert">{loadError}</p></section>;
  if (!usage || !settings) return <section className="adm-card"><h1>Usage &amp; Cost</h1><p>Loading…</p></section>;

  const saveCost = async () => {
    const next = settingsFromCostForm(settings, costForm);
    if (!next.ok) { setStatus({ errors: [next.error] }); return; }
    setSaving(true);
    setStatus(null);
    try {
      await saveVoiceSettings(next.settings);
      await load(days);
      setStatus({ message: 'Saved. Applies from the next voice session.' });
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
        <h1>Usage &amp; Cost</h1>
        <p className="adm-muted">Estimates from the mic&apos;s own meter, not an OpenAI invoice.</p>
      </header>

      <Section title="Today">
        <p className="adm-stat">{formatEstimate(summary.today.estimatedUsd)}</p>
        <p className="adm-muted" role="status">{describeDailyCap(usage)}</p>
      </Section>

      <Section title="Daily usage">
        <div className="adm-segmented" role="group" aria-label="Time window">
          {usage.dayOptions.map((option) => (
            <button key={option} type="button" className={`adm-btn${option === days ? ' adm-btn-primary' : ''}`}
              aria-pressed={option === days} onClick={() => setDays(option)}>{option} days</button>
          ))}
        </div>
        <UsageTable rows={summary.rows} total={summary.total} />
      </Section>

      <Section title="Per-session cost limits" description={`Empty = built-in default (warn ${formatEstimate(costLimits.defaults.warnUsd)}, end ${formatEstimate(costLimits.defaults.capUsd)}). "off" = no limit.`}>
        <p className="adm-muted">In effect: warn at {limitLabel(costLimits.effective.warnUsd)}, end session at {limitLabel(costLimits.effective.capUsd)}.</p>
        <div className="adm-grid">
          <Field label="Warning (USD)"><input className="adm-input" type="text" inputMode="decimal" value={costForm.warn} onChange={(e) => setCostForm((f) => ({ ...f, warn: e.target.value }))} /></Field>
          <Field label="Hard cap (USD)"><input className="adm-input" type="text" inputMode="decimal" value={costForm.cap} onChange={(e) => setCostForm((f) => ({ ...f, cap: e.target.value }))} /></Field>
        </div>
        <div className="adm-actions">
          <button type="button" className="adm-btn adm-btn-primary" onClick={saveCost} disabled={saving}>{saving ? 'Saving…' : 'Save limits'}</button>
          <SaveStatus status={status} />
        </div>
      </Section>

      <Section title="Pricing used for the estimate" description={`Rates checked on ${rates.verifiedOn}; verify against OpenAI pricing at release.`}>
        <ul className="adm-list">
          <li>Live audio ({rates.liveModel}): ${rates.livePerMin.toFixed(2)} per minute, billed per second.</li>
          <li>Screen reader ({rates.readerModel}): ${rates.readerInPerMTok} / ${rates.readerOutPerMTok} per 1M input / output tokens.</li>
          <li>Not included: the delegated backend model and its tool calls (billed separately by OpenAI).</li>
          <li>Off-topic judge: not active yet (arrives with Server Log); its cost will be listed here.</li>
        </ul>
      </Section>
    </div>
  );
}
