// src/admin/dev/logs/serverLogColumns.jsx
/** Table columns and the mobile card of the server log. Monospace only where the text is log content. */
import { PanelRight } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { SERVER_LOG_COPY as T } from '@/copy/en/systemLogs';
import { LogLevelBadge } from './LogLevelBadge.jsx';
import { LogTime } from './LogTime.jsx';

function EventCell({ row }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <div className="flex flex-wrap items-center gap-2">
        <code className="font-mono text-xs font-medium break-all">{row.code}</code>
        {row.repeat ? <Badge variant="secondary">{row.repeat}</Badge> : null}
      </div>
      {row.message ? <p className="line-clamp-2 font-mono text-xs break-words text-muted-foreground" title={row.message}>{row.message}</p> : null}
      {row.context ? <p className="line-clamp-1 font-mono text-xs break-all text-muted-foreground" title={row.context}>{row.context}</p> : null}
    </div>
  );
}

function DetailButton({ row, onOpen }) {
  return (
    <Button variant="ghost" size="icon-sm" aria-label={T.openDetailFor(row.code)} title={T.openDetail} onClick={() => onOpen(row.entry)}>
      <PanelRight aria-hidden="true" />
    </Button>
  );
}

/** @param {(entry: object) => void} onOpen Opens the detail sheet. */
export function serverLogColumns(onOpen) {
  return [
    { id: 'time', header: T.columns.time, cell: (row) => <LogTime time={row.time} /> },
    { id: 'level', header: T.columns.level, cell: (row) => <LogLevelBadge badge={row.badge} /> },
    { id: 'source', header: T.columns.source, cell: (row) => <span className="text-sm">{row.source}</span> },
    { id: 'event', header: T.columns.event, className: 'min-w-72 max-w-xl whitespace-normal', cell: (row) => <EventCell row={row} /> },
    { id: 'detail', header: T.columns.detail, srOnlyHeader: true, className: 'w-12', cell: (row) => <DetailButton row={row} onOpen={onOpen} /> },
  ];
}

/** Stacked card of a row below the `md` breakpoint. */
export function serverLogCard(row, onOpen) {
  return (
    <div className="flex items-start justify-between gap-2">
      <div className="flex min-w-0 flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2"><LogLevelBadge badge={row.badge} /><span className="text-sm text-muted-foreground">{row.source}</span></div>
        <EventCell row={row} />
        <LogTime time={row.time} />
      </div>
      <DetailButton row={row} onOpen={onOpen} />
    </div>
  );
}
