/** The Pengguna DataTable: columns, the mobile card, per-row action menu and the empty / filtered-empty states. */
import { History, KeyRound, LogIn, LogOut, Pencil, ShieldCheck, ShieldOff, Trash2, UserCheck, UserPlus, UserX } from 'lucide-react';
import { useNavigate } from 'react-router';
import { DataTable } from '@/components/app/DataTable.jsx';
import { EmptyState } from '@/components/app/EmptyState.jsx';
import { RowActions } from '@/components/app/RowActions.jsx';
import { Button } from '@/components/ui/button';
import { USERS_COPY } from '../../copy/id/users.js';
import { CapabilityCell, RoleCell, StatusCell, UserCard, UserCell } from './UserCells.jsx';
import { afterMenuCloses } from './afterMenuCloses.js';
import { TimeCell } from './TimeCell.jsx';
import { rowActions, rowMenuEntries } from './usersView.js';

const COPY = USERS_COPY;
const ICONS = {
  edit: Pencil, resetPassword: KeyRound, promote: ShieldCheck, demote: ShieldOff, revokeSessions: LogOut,
  deactivate: UserX, activate: UserCheck, delete: Trash2, loginLog: LogIn, audit: History,
};
/** Menu entries that open another page instead of a dialog: id → path (router-relative). */
const LINKS = { loginLog: (user) => `/login-log?userId=${encodeURIComponent(user.id)}`, audit: (user) => `/audit?userId=${encodeURIComponent(user.id)}` };

/** Menu of one row, or the read-only note when the actor may do nothing to it. */
function RowMenu({ user, me, area, onOpen }) {
  const navigate = useNavigate();
  const actions = rowActions(me, user, area);
  const items = rowMenuEntries(actions).map(({ id, destructive }) => ({
    id, label: COPY.actions[id], icon: ICONS[id], destructive,
    onSelect: () => (LINKS[id] ? navigate(LINKS[id](user)) : afterMenuCloses(() => onOpen(id, user))),
  }));
  // Every row has at least the sign-out (own row) or the log links (anyone else's), so `items` is never empty.
  return <RowActions label={COPY.rowActionsLabel(user.email)} items={items} />;
}

/**
 * @param {{users: object[], total: number, loading: boolean, error: unknown, onRetry: () => void, me: object, area: 'admin' | 'dev',
 *   toolbar: import('react').ReactNode, filtered: boolean, pagination: object, onOpen: (kind: string, user?: object) => void}} props
 */
export function UsersTable({ users, loading, error, onRetry, me, area, toolbar, filtered, pagination, onOpen }) {
  const showRole = area === 'dev';
  const menu = (user) => <RowMenu user={user} me={me} area={area} onOpen={onOpen} />;
  const self = (user) => String(user.id) === String(me?.id);
  const columns = [
    { id: 'user', header: COPY.columns.user, cell: (user) => <UserCell user={user} self={self(user)} /> },
    ...(showRole ? [{ id: 'role', header: COPY.columns.role, cell: (user) => <RoleCell role={user.role} /> }] : []),
    { id: 'status', header: COPY.columns.status, cell: (user) => <StatusCell user={user} /> },
    { id: 'access', header: COPY.columns.access, cell: (user) => <CapabilityCell user={user} /> },
    { id: 'created', header: COPY.columns.created, cell: (user) => <TimeCell iso={user.createdAt} className="text-muted-foreground" /> },
    { id: 'actions', header: COPY.columns.actions, srOnlyHeader: true, className: 'w-12 text-right', cell: menu },
  ];
  return (
    <DataTable
      caption={COPY.page.caption}
      columns={columns}
      rows={users}
      getRowId={(user) => user.id}
      loading={loading}
      error={error}
      onRetry={onRetry}
      toolbar={toolbar}
      filtered={filtered}
      empty={<EmptyState icon={UserPlus} title={COPY.empty.title} description={COPY.empty.description} action={<Button onClick={() => onOpen('create')}>{COPY.empty.cta}</Button>} />}
      filteredEmpty={<EmptyState title={COPY.empty.filteredTitle} description={COPY.empty.filteredDescription} />}
      renderCard={(user) => <UserCard user={user} self={self(user)} showRole={showRole} menu={menu(user)} />}
      pagination={pagination}
    />
  );
}
