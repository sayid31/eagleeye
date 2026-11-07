// src/admin/pages/SystemHealthPage.jsx
/**
 * /admin → System Health: one status per thing that can break — API keys
 * (last connection test), the live AIS feed, external services seen in
 * traffic, quotas, voice limits and the log files. Read-only; nothing here
 * calls a provider. Use "Test connection" on API Keys to re-check a key.
 */
import { useCallback, useEffect, useState } from 'react';
import { fetchHealth } from '../api/adminStatusApi.js';
import { formatLogTime } from './serverLogView.js';
import { HEALTH_LABELS, HEALTH_TONES, describeOverall } from './healthView.js';

export function SystemHealthPage() {
  const [report, setReport] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setBusy(true);
    try {
      setReport(await fetchHealth());
      setError('');
    } catch (failure) {
      setError(failure.message);
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  return (
    <div className="adm-page adm-page-wide">
      <header className="adm-page-header">
        <h1>System Health</h1>
        <p className="adm-muted">
          {report ? <><span className={`adm-pill adm-pill-${HEALTH_TONES[report.status]}`}>{HEALTH_LABELS[report.status]}</span> {describeOverall(report)} · checked {formatLogTime(report.generatedAt)}</> : 'Checking…'}
        </p>
        <div className="adm-actions"><button type="button" className="adm-btn" disabled={busy} onClick={load}>Refresh</button></div>
      </header>
      {error ? <p className="adm-error" role="alert">{error}</p> : null}
      {report?.sections.map((section) => (
        <section key={section.id} className="adm-card adm-section">
          <h2>{section.title}</h2>
          <ul className="adm-health">
            {section.items.map((item) => (
              <li key={item.id} className="adm-health-item">
                <span className={`adm-pill adm-pill-${HEALTH_TONES[item.status]}`}>{HEALTH_LABELS[item.status]}</span>
                <span className="adm-health-label">{item.label}</span>
                <span className="adm-health-detail">{item.detail}</span>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
