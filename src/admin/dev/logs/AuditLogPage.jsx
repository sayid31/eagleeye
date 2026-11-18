// src/admin/dev/logs/AuditLogPage.jsx
/**
 * /dev → Server Log → Audit Log: who changed what — API key changes and connection tests, voice-settings
 * saves, admin sign-ins and log clears. Names and codes only; never a key value or an email.
 */
import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DataTable } from '@/components/app/DataTable.jsx';
import { EmptyState } from '@/components/app/EmptyState.jsx';
import { PageHeader } from '@/components/app/PageHeader.jsx';
import { AUDIT_COPY as T, AUDIT_FILTER_COPY } from '@/copy/en/systemLogs';
import { StatusBadge } from '@/components/app/StatusBadge';
import { LogTime } from './LogTime.jsx';
import { ALL_TYPES, auditRows } from './auditView.js';
import { useAuditLog } from './useAuditLog.js';

const COLUMNS = [
  { id: 'time', header: T.columns.time, cell: (row) => <LogTime time={row.time} /> },
  { id: 'change', header: T.columns.change, cell: (row) => <StatusBadge status={row.status} label={row.title} /> },
  { id: 'detail', header: T.columns.detail, className: 'min-w-64 whitespace-normal', cell: (row) => <span className="text-sm break-words">{row.detail || '—'}</span> },
  { id: 'via', header: T.columns.via, cell: (row) => <span className="text-sm text-muted-foreground">{row.via || '—'}</span> },
];

/** Server Log → Audit Log page. */
export function AuditLogPage() {
  const audit = useAuditLog();
  const rows = auditRows(audit.entries, Date.now());
  const typeOptions = AUDIT_FILTER_COPY.map((option) => ({ ...option, value: option.id || ALL_TYPES }));
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={T.title}
        description={T.description}
        actions={(
          <Button variant="outline" size="sm" aria-disabled={audit.loading || undefined} onClick={() => { if (!audit.loading) void audit.reload(); }}>
            <RefreshCw aria-hidden="true" data-icon="inline-start" className={audit.loading ? 'animate-spin motion-reduce:animate-none' : undefined} />
            {T.refresh}
          </Button>
        )}
      />
      <DataTable
        caption={T.caption}
        columns={COLUMNS}
        rows={rows}
        getRowId={(row) => row.id}
        loading={audit.loading}
        error={audit.error}
        onRetry={audit.reload}
        filtered={audit.type !== ALL_TYPES}
        empty={<EmptyState title={T.empty.title} description={T.empty.description} />}
        filteredEmpty={<EmptyState title={T.noMatch.title} description={T.noMatch.description} />}
        toolbar={(
          <Select value={audit.type} onValueChange={audit.setType}>
            <SelectTrigger aria-label={T.typeLabel} className="w-full sm:w-52"><SelectValue /></SelectTrigger>
            <SelectContent>{typeOptions.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent>
          </Select>
        )}
        renderCard={(row) => (
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center justify-between gap-2"><StatusBadge status={row.status} label={row.title} /><LogTime time={row.time} /></div>
            {row.detail ? <p className="text-sm break-words">{row.detail}</p> : null}
            {row.via ? <p className="text-sm text-muted-foreground">{row.via}</p> : null}
          </div>
        )}
      />
      {rows.length ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground" aria-live="polite">{T.loaded(rows.length)}</p>
          {audit.nextOffset ? (
            <Button variant="outline" size="sm" aria-disabled={audit.loadingMore || undefined} onClick={() => { if (!audit.loadingMore) void audit.loadMore(); }}>{T.loadMore}</Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
