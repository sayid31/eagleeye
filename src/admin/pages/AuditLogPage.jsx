// src/admin/pages/AuditLogPage.jsx
/**
 * /admin → Audit Log: who changed what, newest first — key changes and
 * connection tests, voice-settings saves (which sections), admin sign-ins,
 * and Server Log clears. Names and codes only; never a key value or email.
 */
import { useCallback, useEffect, useState } from 'react';
import { fetchAudit } from '../api/adminStatusApi.js';
import { formatLogTime } from './serverLogView.js';
import { AUDIT_FILTERS, describeAuditEntry } from './auditView.js';

export function AuditLogPage() {
  const [type, setType] = useState('');
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (filterType, offset = 0) => {
    setBusy(true);
    try {
      const page = await fetchAudit({ type: filterType, offset });
      setData((prev) => (offset && prev ? { ...page, entries: [...prev.entries, ...page.entries] } : page));
      setError('');
    } catch (failure) {
      setError(failure.message);
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => { void load(type); }, [type, load]);

  return (
    <div className="adm-page adm-page-wide">
      <header className="adm-page-header">
        <h1>Audit Log</h1>
        <p className="adm-muted">Every change made from /admin: API keys, connection tests, voice settings, sign-ins and log clears. Key values and emails are never recorded.</p>
      </header>
      <div className="adm-card adm-log-filters" role="group" aria-label="Filter">
        {AUDIT_FILTERS.map((filter) => (
          <button key={filter.id || 'all'} type="button" className={`adm-btn${filter.id === type ? ' adm-btn-primary' : ''}`}
            aria-pressed={filter.id === type} onClick={() => setType(filter.id)}>{filter.label}</button>
        ))}
        <button type="button" className="adm-btn" disabled={busy} onClick={() => load(type)}>Refresh</button>
      </div>
      {error ? <p className="adm-error" role="alert">{error}</p> : null}
      {data && data.entries.length === 0 ? <section className="adm-card"><p>No entries yet.</p></section> : null}
      {data && data.entries.length ? (
        <div className="adm-table-wrap adm-log-table">
          <table className="adm-table">
            <thead><tr><th>When</th><th>Change</th><th>Details</th></tr></thead>
            <tbody>
              {data.entries.map((entry, index) => {
                const view = describeAuditEntry(entry);
                return (
                  <tr key={`${entry.at}-${index}`}>
                    <td className="adm-log-time">{formatLogTime(Date.parse(entry.at))}</td>
                    <td><span className={`adm-pill adm-pill-${view.tone}`}>{view.title}</span></td>
                    <td className="adm-log-msg">{view.detail}{entry.source ? <small className="adm-field-hint">via {entry.source}</small> : null}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}
      {data?.nextOffset ? <button type="button" className="adm-btn" disabled={busy} onClick={() => load(type, data.nextOffset)}>Load more</button> : null}
    </div>
  );
}
