/**
 * Pengguna (/admin/users) and Pengguna & Admin (/dev/users): one component. The list, filters and paging come from
 * `/api/admin/users`; every row action shown is a cell of authorizeUserAction for (signed-in account, row, area).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { UserPlus } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/app/PageHeader.jsx';
import { USERS_COPY } from '../../copy/en/users.js';
import { UserDialogs } from './UserDialogs.jsx';
import { UsersTable } from './UsersTable.jsx';
import { UsersToolbar } from './UsersToolbar.jsx';
import { usersApi } from './usersApi.js';
import { useResource } from './useResource.js';
import { useUsersFilter } from './useUsersFilter.js';
import { doneToast, hasUserFilters, managesRoles, usersQuery } from './usersView.js';

/** @param {{session: {user: {id: string, role: string}}, area?: 'admin' | 'dev'}} props */
export function UsersPage({ session, area = 'admin' }) {
  const me = session?.user;
  const state = useUsersFilter();
  const { filter } = state;
  const query = usersQuery(filter, area);
  const { data, loading, error, reload } = useResource(() => usersApi.list(query), JSON.stringify(query));
  const [dialog, setDialog] = useState(null);
  const nextId = useRef(0);
  const users = data?.users ?? [];
  const filtered = hasUserFilters(filter);
  // A brand-new install has no use for filters: the empty state's own call to action is the whole page.
  const showToolbar = filtered || loading || users.length > 0 || Boolean(error);

  const open = useCallback((kind, target = null) => { nextId.current += 1; setDialog({ id: nextId.current, kind, target }); }, []);
  const close = useCallback(() => setDialog(null), []);
  const done = useCallback((kind, result) => {
    const { text, level } = doneToast(kind, result);
    toast[level](text);
    reload();
  }, [reload]);

  // The Ringkasan call to action arrives here asking for the create dialog (once: the state is cleared right away).
  const location = useLocation();
  const navigate = useNavigate();
  useEffect(() => {
    if (!location.state?.openCreate) return;
    open('create');
    navigate(location.pathname + location.search, { replace: true, state: null });
  }, [location, navigate, open]);

  // Deleting the last row of a later page leaves an empty page: step back to the previous one.
  const { setOffset } = state;
  useEffect(() => {
    if (data && data.users.length === 0 && data.total > 0 && filter.offset > 0) setOffset(Math.max(0, filter.offset - filter.limit));
  }, [data, filter.offset, filter.limit, setOffset]);

  return (
    <>
      <PageHeader
        title={USERS_COPY.page.title[area]}
        description={USERS_COPY.page.description[area]}
        actions={<Button onClick={() => open('create')}><UserPlus aria-hidden="true" data-icon="inline-start" />{USERS_COPY.page.create}</Button>}
      />
      <UsersTable
        users={users}
        loading={loading}
        error={error}
        onRetry={reload}
        me={me}
        area={area}
        filtered={filtered}
        onOpen={open}
        toolbar={showToolbar ? (
          <UsersToolbar
            input={state.input} onInput={state.setInput} status={filter.status} onStatus={state.setStatus}
            role={filter.role} onRole={state.setRole} showRole={area === 'dev'} filtered={filtered} onReset={state.reset}
          />
        ) : null}
        pagination={{ total: data?.total ?? 0, limit: filter.limit, offset: filter.offset, onOffsetChange: state.setOffset, onLimitChange: state.setLimit }}
      />
      <UserDialogs dialog={dialog} me={me} area={area} chooseRole={managesRoles(me, area)} onDone={done} onClose={close} />
    </>
  );
}
