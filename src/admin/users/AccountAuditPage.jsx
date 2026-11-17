/**
 * Audit (/admin/audit, /dev/audit): the `audit_log` table, newest first,
 * filterable by action and by account (`?targetId=` from the Pengguna row
 * menu), paged. An admin sees `user.*` actions on user accounts, other actors
 * shown only by role; a super_admin sees every action.
 */
import { useState } from 'react';
import { useSearchParams } from 'react-router';
import { AUDIT_ACTIONS } from '../../auth/auditLog.mjs';
import { LoadState, Pager, usePageData } from './UsersWidgets.jsx';
import { AUDIT_COPY } from './usersCopy.js';
import { usersApi } from './usersApi.js';
import { auditActionText, auditActorText, auditDetailText, formatDateTime } from './usersView.js';
import './users.css';

const COPY = AUDIT_COPY;

/** @param {{session: {user: {id: string}}, area: 'admin' | 'dev'}} props */
export function AccountAuditPage({ session, area = 'admin' }) {
  const [params, setParams] = useSearchParams();
  const targetId = params.get('targetId') ?? '';
  const [action, setAction] = useState('');
  const [offset, setOffset] = useState(0);
  const query = { action, targetId, offset };
  const { data, loading, error, reload } = usePageData(() => usersApi.audit(query), JSON.stringify(query));
  const choices = area === 'dev' ? AUDIT_ACTIONS : AUDIT_ACTIONS.filter((code) => code.startsWith('user.'));
  const targetName = targetId ? (data?.entries?.[0]?.targetName ?? targetId) : '';

  return (
    <div className="adm-page adm-page-wide">
      <header className="adm-page-header">
        <h1>{COPY.title}</h1>
        <p className="adm-muted">{COPY.lead[area]}</p>
      </header>
      <div className="adm-card adm-log-filters" role="group" aria-label="Filter">
        <select className="adm-input" aria-label={COPY.columns.action} value={action} onChange={(e) => { setAction(e.target.value); setOffset(0); }}>
          <option value="">{COPY.allActions}</option>
          {choices.map((code) => <option key={code} value={code}>{auditActionText(code)}</option>)}
        </select>
        {targetId ? (
          <span className="usr-filter-chip">{COPY.filteredBy} {targetName}
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
              <tr><th>{COPY.columns.time}</th><th>{COPY.columns.actor}</th><th>{COPY.columns.action}</th><th>{COPY.columns.target}</th><th>{COPY.columns.detail}</th></tr>
            </thead>
            <tbody>
              {data.entries.map((entry) => (
                <tr key={entry.id}>
                  <td>{formatDateTime(entry.createdAt)}</td>
                  <td>{auditActorText(entry, session?.user)}</td>
                  <td><span className="adm-pill adm-pill-info">{auditActionText(entry.action)}</span></td>
                  <td>{entry.targetName ?? '—'}{entry.targetEmailMasked ? <small className="adm-field-hint usr-sub">{entry.targetEmailMasked}</small> : null}</td>
                  <td className="adm-log-msg">{auditDetailText(entry.summary)}</td>
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
