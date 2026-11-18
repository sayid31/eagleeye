/**
 * Audit (/admin/activity/audit, /dev/activity/audit): the `audit_log` table, newest first, filterable by time range,
 * action and account, paged. An admin sees `user.*` actions on user accounts with other actors shown only by role; a
 * super_admin sees every action.
 */
import { PageHeader } from '@/components/app/PageHeader.jsx';
import { DataTable } from '@/components/app/DataTable.jsx';
import { EmptyState } from '@/components/app/EmptyState.jsx';
import { Badge } from '@/components/ui/badge';
import { AUDIT_ACTIONS } from '../../auth/auditLog.mjs';
import { ACTIVITY_COPY } from '../../copy/id/users.js';
import { ActivityFilters } from './ActivityFilters.jsx';
import { TwoLine } from './ActivityCells.jsx';
import { FilterSelect } from './FilterSelect.jsx';
import { TimeCell } from './TimeCell.jsx';
import { usersApi } from './usersApi.js';
import { useActivityFilter } from './useActivityFilter.js';
import { useResource } from './useResource.js';
import { ALL } from './usersView.js';
import { auditActionChoices, auditActionText, auditActorText, auditDetailText, auditQuery, hasActivityFilters } from './activityView.js';

const COPY = ACTIVITY_COPY.audit;
const FILTERS = ACTIVITY_COPY.filters;

function AuditCard({ entry, actor }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-start justify-between gap-2">
        <Badge variant="outline">{auditActionText(entry.action)}</Badge>
        <span className="text-xs text-muted-foreground"><TimeCell iso={entry.createdAt} /></span>
      </div>
      <TwoLine main={entry.targetName ?? '—'} sub={entry.targetEmailMasked} />
      <p className="text-sm text-muted-foreground">{actor}{auditDetailText(entry.summary) ? ` · ${auditDetailText(entry.summary)}` : ''}</p>
    </div>
  );
}

/** @param {{session: {user: {id: string}}, area?: 'admin' | 'dev'}} props */
export function AccountAuditPage({ session, area = 'admin' }) {
  const filter = useActivityFilter();
  const me = session?.user;
  const query = auditQuery({ range: filter.range, action: filter.extra, userId: filter.userId, limit: filter.limit, offset: filter.offset });
  const { data, loading, error, reload } = useResource(() => usersApi.audit(query), JSON.stringify(query));
  const filtered = hasActivityFilters({ range: filter.range, action: filter.extra, userId: filter.userId });
  const actions = { [ALL]: FILTERS.allActions, ...Object.fromEntries(auditActionChoices(AUDIT_ACTIONS, area).map((code) => [code, auditActionText(code)])) };
  const columns = [
    { id: 'time', header: COPY.columns.time, cell: (entry) => <TimeCell iso={entry.createdAt} className="text-muted-foreground" /> },
    { id: 'actor', header: COPY.columns.actor, cell: (entry) => auditActorText(entry, me) },
    { id: 'action', header: COPY.columns.action, cell: (entry) => <Badge variant="outline">{auditActionText(entry.action)}</Badge> },
    { id: 'target', header: COPY.columns.target, cell: (entry) => <TwoLine main={entry.targetName ?? '—'} sub={entry.targetEmailMasked} /> },
    { id: 'detail', header: COPY.columns.detail, cell: (entry) => <span className="text-muted-foreground">{auditDetailText(entry.summary)}</span> },
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
        filteredEmpty={<EmptyState title={FILTERS.filteredEmptyTitle} description={FILTERS.filteredEmptyDescription} />}
        renderCard={(entry) => <AuditCard entry={entry} actor={auditActorText(entry, me)} />}
        toolbar={(
          <ActivityFilters range={filter.range} onRange={filter.setRange} userId={filter.userId} onUser={filter.setUser} filtered={filtered} onReset={filter.reset}>
            <FilterSelect label={FILTERS.actionLabel} value={filter.extra} options={actions} onChange={filter.setExtra} className="w-56" />
          </ActivityFilters>
        )}
        pagination={{ total: data?.total ?? 0, limit: filter.limit, offset: filter.offset, onOffsetChange: filter.setOffset, onLimitChange: filter.setLimit }}
      />
    </>
  );
}
