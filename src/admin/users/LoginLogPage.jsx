/**
 * Log Login (/admin/login-log, /dev/login-log): every sign-in attempt, newest
 * first, filterable by result and by account (`?userId=` from the Pengguna
 * row menu), paged. The server decides which rows an admin may see.
 */
import { useState } from 'react';
import { useSearchParams } from 'react-router';
import { LoadState, Pager, usePageData } from './UsersWidgets.jsx';
import { LOGIN_LOG_COPY } from './usersCopy.js';
import { usersApi } from './usersApi.js';
import { describeDevice, formatDateTime, loginAccountText, loginResultText } from './usersView.js';
import './users.css';

const COPY = LOGIN_LOG_COPY;

/** @param {{area: 'admin' | 'dev'}} props */
export function LoginLogPage({ area = 'admin' }) {
  const [params, setParams] = useSearchParams();
  const userId = params.get('userId') ?? '';
  const [success, setSuccess] = useState('');
  const [offset, setOffset] = useState(0);
  const query = { userId, success, offset };
  const { data, loading, error, reload } = usePageData(() => usersApi.loginLog(query), JSON.stringify(query));
  const filteredName = userId ? (data?.entries?.[0] ? loginAccountText(data.entries[0]) : userId) : '';

  return (
    <div className="adm-page adm-page-wide">
      <header className="adm-page-header">
        <h1>{COPY.title}</h1>
        <p className="adm-muted">{COPY.lead[area]}</p>
      </header>
      <div className="adm-card adm-log-filters" role="group" aria-label="Filter">
        <select className="adm-input" aria-label={COPY.columns.result} value={success} onChange={(e) => { setSuccess(e.target.value); setOffset(0); }}>
          {Object.entries(COPY.result).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
        {userId ? (
          <span className="usr-filter-chip">{COPY.filteredBy} {filteredName}
            <button type="button" className="adm-btn" onClick={() => { setParams({}); setOffset(0); }}>{COPY.clearFilter}</button>
          </span>
        ) : null}
        <button type="button" className="adm-btn" disabled={loading} onClick={reload}>Muat ulang</button>
      </div>
      <LoadState loading={loading && !data} error={error} onRetry={reload} empty={data?.total === 0} emptyText={COPY.empty} />
      {data?.entries?.length ? (
        <div className="adm-table-wrap usr-table-wrap">
          <table className="adm-table usr-table">
            <thead>
              <tr><th>{COPY.columns.time}</th><th>{COPY.columns.who}</th><th>{COPY.columns.result}</th><th>{COPY.columns.ip}</th><th>{COPY.columns.device}</th><th>{COPY.columns.method}</th></tr>
            </thead>
            <tbody>
              {data.entries.map((entry) => (
                <tr key={entry.id}>
                  <td>{formatDateTime(entry.createdAt)}</td>
                  <td>{loginAccountText(entry)}{entry.userEmail && !entry.userDeleted ? <small className="adm-field-hint usr-sub">{entry.userEmail}</small> : null}</td>
                  <td><span className={`adm-pill adm-pill-${entry.success ? 'ok' : 'error'}`}>{loginResultText(entry)}</span></td>
                  <td className="usr-mono">{entry.ip ?? '—'}</td>
                  <td title={entry.userAgent ?? ''}>{describeDevice(entry.userAgent)}</td>
                  <td>{COPY.methods[entry.method] ?? entry.method}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      <Pager page={data} busy={loading} onOffset={setOffset} />
    </div>
  );
}
