/**
 * Pengguna (/admin/users) and Pengguna & Admin (/dev/users): one component.
 * The list, filters and paging come from `/api/admin/users`; every row action
 * shown is a cell of authorizeUserAction for (signed-in account, row, area).
 */
import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { ConfirmDialog, DeleteUserDialog, ResetPasswordDialog, RoleDialog } from './UserActionDialogs.jsx';
import { CreateUserDialog, EditUserDialog } from './UserFormDialogs.jsx';
import { LoadState, Pager, usePageData } from './UsersWidgets.jsx';
import { USERS_COPY } from './usersCopy.js';
import { usersApi } from './usersApi.js';
import { accountStatus, areaRoleScope, formatDateTime, managesRoles, roleText, rowActions } from './usersView.js';
import './users.css';

const COPY = USERS_COPY;
const SEARCH_DEBOUNCE_MS = 300;
const TOGGLE_SHORT = { layers: 'Layer', ai: 'AI', premium: 'Premium' };

function closeMenu(event) {
  event.currentTarget.closest('details')?.removeAttribute('open');
}

function RowMenu({ user, actions, onOpen }) {
  if (!actions.any) return <span className="adm-muted">{COPY.readOnly}</span>;
  const item = (kind, label, danger = false) => (
    <button type="button" className={`usr-menu-item${danger ? ' usr-menu-danger' : ''}`} onClick={(event) => { closeMenu(event); onOpen(kind, user); }}>{label}</button>
  );
  return (
    <details className="usr-menu">
      <summary className="adm-btn" aria-label={`Aksi untuk ${user.name}`}>Aksi ▾</summary>
      <div className="usr-menu-list" role="menu">
        {actions.edit ? item('edit', COPY.actions.edit) : null}
        {actions.toggleActive ? item(actions.toggleActive, COPY.actions[actions.toggleActive], actions.toggleActive === 'deactivate') : null}
        {actions.resetPassword ? item('resetPassword', COPY.actions.resetPassword) : null}
        {actions.revokeSessions ? item('revokeSessions', COPY.actions.revokeSessions) : null}
        {actions.role ? item(actions.role, COPY.actions[actions.role]) : null}
        {!actions.self ? <Link className="usr-menu-item" to={`/login-log?userId=${encodeURIComponent(user.id)}`}>{COPY.actions.loginLog}</Link> : null}
        {!actions.self ? <Link className="usr-menu-item" to={`/audit?targetId=${encodeURIComponent(user.id)}`}>{COPY.actions.audit}</Link> : null}
        {actions.delete ? item('delete', COPY.actions.delete, true) : null}
      </div>
    </details>
  );
}

function UsersTable({ users, me, area, showRole, onOpen }) {
  return (
    <div className="adm-table-wrap usr-table-wrap">
      <table className="adm-table usr-table">
        <thead>
          <tr>
            <th>{COPY.columns.name}</th><th>{COPY.columns.email}</th>{showRole ? <th>{COPY.columns.role}</th> : null}
            <th>{COPY.columns.status}</th><th>{COPY.columns.toggles}</th><th>{COPY.columns.created}</th><th>{COPY.columns.actions}</th>
          </tr>
        </thead>
        <tbody>
          {users.map((user) => {
            const actions = rowActions(me, user, area);
            const status = accountStatus(user);
            return (
              <tr key={user.id}>
                <td>{user.name}{actions.self ? <span className="adm-badge usr-self">{COPY.self}</span> : null}</td>
                <td>{user.email}</td>
                {showRole ? <td>{roleText(user.role)}</td> : null}
                <td><span className={`adm-pill adm-pill-${status.tone}`}>{status.label}</span></td>
                <td className="usr-toggle-cell">
                  {user.role === 'user'
                    ? Object.entries(TOGGLE_SHORT).map(([key, label]) => <span key={key} className={`usr-chip${user.capabilities[key] ? ' usr-chip-on' : ''}`}>{label}</span>)
                    : <span className="adm-muted">Semua</span>}
                </td>
                <td>{formatDateTime(user.createdAt)}</td>
                <td><RowMenu user={user} actions={actions} onOpen={onOpen} /></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** @param {{session: {user: {id: string, role: string}}, area: 'admin' | 'dev'}} props */
export function UsersPage({ session, area = 'admin' }) {
  const me = session?.user;
  const chooseRole = managesRoles(me, area);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState({ q: '', status: '', role: '', offset: 0 });
  const [dialog, setDialog] = useState(null);
  const [notice, setNotice] = useState('');
  const query = { q: filter.q, status: filter.status, role: areaRoleScope(area) ?? filter.role, offset: filter.offset };
  const { data, loading, error, reload } = usePageData(() => usersApi.list(query), JSON.stringify(query));

  useEffect(() => {
    const timer = setTimeout(() => setFilter((prev) => (prev.q === search.trim() ? prev : { ...prev, q: search.trim(), offset: 0 })), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [search]);

  const open = (kind, target = null) => { setNotice(''); setDialog({ kind, target }); };
  const close = () => setDialog(null);
  const done = (kind, result) => {
    setNotice(result?.audit === 'failed' ? `${COPY.done[kind]} ${COPY.auditWarning}` : COPY.done[kind]);
    if (kind !== 'resetPassword' && kind !== 'create') close();
    reload();
  };
  const filtered = Boolean(filter.q || filter.status || filter.role);
  const target = dialog?.target;

  return (
    <div className="adm-page adm-page-wide">
      <header className="adm-page-header usr-header">
        <div><h1>{COPY.pageTitle[area]}</h1><p className="adm-muted">{COPY.pageLead[area]}</p></div>
        <button type="button" className="adm-btn adm-btn-primary" onClick={() => open('create')}>{COPY.create}</button>
      </header>
      <div className="adm-card adm-log-filters" role="search">
        <input className="adm-input" type="search" placeholder={COPY.searchPlaceholder} aria-label={COPY.searchPlaceholder} value={search} onChange={(e) => setSearch(e.target.value)} />
        <select className="adm-input" aria-label={COPY.columns.status} value={filter.status} onChange={(e) => setFilter({ ...filter, status: e.target.value, offset: 0 })}>
          {Object.entries(COPY.statusFilter).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
        {area === 'dev' ? (
          <select className="adm-input" aria-label={COPY.columns.role} value={filter.role} onChange={(e) => setFilter({ ...filter, role: e.target.value, offset: 0 })}>
            {Object.entries(COPY.roleFilter).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        ) : null}
        <button type="button" className="adm-btn" disabled={loading} onClick={reload}>{COPY.reload}</button>
      </div>
      {notice ? <p className="adm-success usr-notice" role="status">{notice}</p> : null}
      <LoadState loading={loading && !data} error={error} onRetry={reload} empty={data?.total === 0}>
        {filtered ? <p>{COPY.emptyFiltered}</p> : (
          <div className="usr-empty"><h2>{COPY.emptyTitle}</h2>
            <button type="button" className="adm-btn adm-btn-primary" onClick={() => open('create')}>{COPY.emptyFirst}</button></div>
        )}
      </LoadState>
      {data?.users?.length ? <UsersTable users={data.users} me={me} area={area} showRole={area === 'dev'} onOpen={open} /> : null}
      <Pager page={data} busy={loading} onOffset={(offset) => setFilter({ ...filter, offset })} />

      {dialog?.kind === 'create' ? <CreateUserDialog chooseRole={chooseRole} onCreated={(result) => done('create', result)} onClose={close} /> : null}
      {dialog?.kind === 'edit' ? <EditUserDialog target={target} edit={rowActions(me, target, area).edit} onSaved={(result) => done('update', result)} onClose={close} /> : null}
      {['deactivate', 'activate', 'revokeSessions'].includes(dialog?.kind) ? <ConfirmDialog kind={dialog.kind} target={target} onDone={done} onClose={close} /> : null}
      {dialog?.kind === 'resetPassword' ? <ResetPasswordDialog target={target} onDone={done} onClose={close} /> : null}
      {dialog?.kind === 'delete' ? <DeleteUserDialog target={target} onDone={done} onClose={close} /> : null}
      {['promote', 'demote'].includes(dialog?.kind) ? <RoleDialog direction={dialog.kind} target={target} onDone={done} onClose={close} /> : null}
    </div>
  );
}
