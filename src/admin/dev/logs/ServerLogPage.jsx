// src/admin/dev/logs/ServerLogPage.jsx
/**
 * /dev → Log server → Log: newest first, filter by level / source / text, repeated entries merged with a count, a
 * detail sheet for long messages, optional auto-refresh (paused while the tab is hidden) and "Kosongkan log" behind a
 * confirmation. Entries are redacted server-side (no key, token, email or conversation text).
 */
import { useCallback, useState } from 'react';
import { Eraser, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/app/ConfirmDialog.jsx';
import { DataTable } from '@/components/app/DataTable.jsx';
import { EmptyState } from '@/components/app/EmptyState.jsx';
import { PageHeader } from '@/components/app/PageHeader.jsx';
import { RouteTabNav } from '@/components/app/RouteTabs.jsx';
import { SERVER_LOG_COPY as T } from '@/copy/id/systemLogs';
import { useAutoRefresh } from '../lib/useAutoRefresh.js';
import { LogDetailSheet } from './LogDetailSheet.jsx';
import { LogToolbar } from './LogToolbar.jsx';
import { serverLogCard, serverLogColumns } from './serverLogColumns.jsx';
import { clearLog } from './logsApi.js';
import { isFiltered, logRow } from './serverLogView.js';
import { useServerLog } from './useServerLog.js';

/** Interval of the optional auto-refresh. */
export const AUTO_REFRESH_MS = 15_000;

/** Log server → Log tab. */
export function ServerLogPage() {
  const log = useServerLog();
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [detail, setDetail] = useState(null);
  const [confirmClear, setConfirmClear] = useState(false);
  useAutoRefresh(() => log.reload({ silent: true }), { enabled: autoRefresh, intervalMs: AUTO_REFRESH_MS });

  const now = Date.now();
  const rows = (log.data?.entries ?? []).map((entry) => logRow(entry, now));
  const counts = log.data?.counts;
  const clear = useCallback(async () => {
    const { removed } = await clearLog();
    toast.success(T.clear.done(removed));
    log.setOffset(0);
    await log.reload();
  }, [log]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        tabs={<RouteTabNav />}
        title={T.title}
        description={T.description}
        actions={(
          <>
            <Button variant="outline" size="sm" aria-disabled={log.loading || undefined} onClick={() => { if (!log.loading) void log.reload(); }}>
              <RefreshCw aria-hidden="true" data-icon="inline-start" className={log.loading ? 'animate-spin motion-reduce:animate-none' : undefined} />
              {T.refresh}
            </Button>
            <Button variant="outline" size="sm" onClick={() => setConfirmClear(true)}>
              <Eraser aria-hidden="true" data-icon="inline-start" />
              {T.clear.open}
            </Button>
          </>
        )}
      />
      {counts ? <p className="-mt-3 text-sm text-muted-foreground" aria-live="polite">{T.counts(counts.error, counts.warn, counts.info)}</p> : null}
      <DataTable
        caption={T.caption}
        columns={serverLogColumns(setDetail)}
        rows={rows}
        getRowId={(row) => row.id}
        loading={log.loading}
        error={log.error}
        onRetry={log.reload}
        filtered={isFiltered(log.filter)}
        empty={<EmptyState title={T.empty.title} description={T.empty.description} />}
        filteredEmpty={<EmptyState title={T.noMatch.title} description={T.noMatch.description} />}
        toolbar={<LogToolbar filter={log.filter} sources={log.data?.sources ?? []} onChange={log.updateFilter} autoRefresh={autoRefresh} onAutoRefreshChange={setAutoRefresh} />}
        renderCard={(row) => serverLogCard(row, setDetail)}
        pagination={{ total: log.data?.total ?? 0, limit: log.page.limit, offset: log.page.offset, onOffsetChange: log.setOffset, onLimitChange: log.setLimit }}
      />
      <LogDetailSheet entry={detail} now={now} onOpenChange={(open) => { if (!open) setDetail(null); }} />
      <ConfirmDialog
        open={confirmClear}
        onOpenChange={setConfirmClear}
        destructive
        title={T.clear.title}
        impact={T.clear.impact}
        actionLabel={T.clear.action}
        onConfirm={clear}
      />
    </div>
  );
}
