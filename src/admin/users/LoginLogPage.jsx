/**
 * Log Login (/admin/activity/login, /dev/activity/login): every sign-in attempt, newest first, filterable by time
 * range, result and account, paged. The server decides which rows an admin may see (user accounts only).
 */
import { PageHeader } from '@/components/app/PageHeader.jsx';
import { DataTable } from '@/components/app/DataTable.jsx';
import { EmptyState } from '@/components/app/EmptyState.jsx';
import { StatusBadge } from '@/components/app/StatusBadge.jsx';
import { ACTIVITY_COPY } from '../../copy/id/users.js';
import { ActivityFilters } from './ActivityFilters.jsx';
import { DeviceCell, IpCell, LoginAccountCell, LoginResultCell } from './ActivityCells.jsx';
import { FilterSelect } from './FilterSelect.jsx';
import { TimeCell } from './TimeCell.jsx';
import { usersApi } from './usersApi.js';
import { useActivityFilter } from './useActivityFilter.js';
import { useResource } from './useResource.js';
import { hasActivityFilters, loginLogQuery } from './activityView.js';

const COPY = ACTIVITY_COPY.loginLog;

function LoginCard({ entry }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-start justify-between gap-2">
        <LoginAccountCell entry={entry} />
        <StatusBadge status={entry.success ? 'success' : 'failed'} />
      </div>
      {entry.success ? null : <p className="text-sm text-muted-foreground">{COPY.reasons[entry.reason] ?? entry.reason}</p>}
      <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
        <TimeCell iso={entry.createdAt} />
        <IpCell ip={entry.ip} />
        <DeviceCell userAgent={entry.userAgent} />
      </p>
    </div>
  );
}

/** @param {{area?: 'admin' | 'dev'}} props */
export function LoginLogPage({ area = 'admin' }) {
  const filter = useActivityFilter();
  const query = loginLogQuery({ range: filter.range, result: filter.extra, userId: filter.userId, limit: filter.limit, offset: filter.offset });
  const { data, loading, error, reload } = useResource(() => usersApi.loginLog(query), JSON.stringify(query));
  const filtered = hasActivityFilters({ range: filter.range, result: filter.extra, userId: filter.userId });
  const columns = [
    { id: 'time', header: COPY.columns.time, cell: (entry) => <TimeCell iso={entry.createdAt} className="text-muted-foreground" /> },
    { id: 'account', header: COPY.columns.account, cell: (entry) => <LoginAccountCell entry={entry} /> },
    { id: 'result', header: COPY.columns.result, cell: (entry) => <LoginResultCell entry={entry} /> },
    { id: 'ip', header: COPY.columns.ip, cell: (entry) => <IpCell ip={entry.ip} /> },
    { id: 'device', header: COPY.columns.device, cell: (entry) => <DeviceCell userAgent={entry.userAgent} /> },
    { id: 'method', header: COPY.columns.method, cell: (entry) => COPY.methods[entry.method] ?? entry.method },
  ];
  return (
    <>
      <PageHeader title={ACTIVITY_COPY.title} description={COPY.description[area]} />
      <DataTable
        caption={COPY.caption}
        columns={columns}
        rows={data?.entries ?? []}
        getRowId={(entry) => String(entry.id)}
        loading={loading}
        error={error}
        onRetry={reload}
        filtered={filtered}
        empty={<EmptyState title={COPY.emptyTitle} description={COPY.emptyDescription} />}
        filteredEmpty={<EmptyState title={ACTIVITY_COPY.filters.filteredEmptyTitle} description={ACTIVITY_COPY.filters.filteredEmptyDescription} />}
        renderCard={(entry) => <LoginCard entry={entry} />}
        toolbar={(
          <ActivityFilters range={filter.range} onRange={filter.setRange} userId={filter.userId} onUser={filter.setUser} filtered={filtered} onReset={filter.reset}>
            <FilterSelect label={ACTIVITY_COPY.filters.resultLabel} value={filter.extra} options={ACTIVITY_COPY.filters.resultOptions} onChange={filter.setExtra} className="w-40" />
          </ActivityFilters>
        )}
        pagination={{ total: data?.total ?? 0, limit: filter.limit, offset: filter.offset, onOffsetChange: filter.setOffset, onLimitChange: filter.setLimit }}
      />
    </>
  );
}
