// src/admin/dev/usage/VoiceDaysCard.jsx
/** Voice usage of the last 7 days: a table from md up, stacked cards below. */
import { Link } from 'react-router';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DataTable } from '@/components/app/DataTable.jsx';
import { USAGE_COPY as T } from '@/copy/id/system';
import { voiceDayRows } from './usageBudgetView.js';

const COLUMNS = [
  { id: 'day', header: T.days.day, cell: (row) => <span className="tabular-nums">{row.day}</span> },
  { id: 'sessions', header: T.days.sessions, cell: (row) => <span className="tabular-nums">{row.sessions}</span> },
  { id: 'audio', header: T.days.audio, cell: (row) => <span className="tabular-nums">{row.audio}</span> },
  { id: 'cost', header: T.days.cost, className: 'text-right', cell: (row) => <span className="tabular-nums">{row.cost}</span> },
];

/** @param {{days: {day: string, seconds: number, sessions: number, estimatedUsd: number}[]}} props */
export function VoiceDaysCard({ days }) {
  const rows = voiceDayRows(days);
  return (
    <Card>
      <CardHeader><CardTitle role="heading" aria-level={2}>{T.days.title}</CardTitle></CardHeader>
      <CardContent className="flex flex-col gap-3">
        <DataTable
          caption={T.days.caption}
          columns={COLUMNS}
          rows={rows}
          getRowId={(row) => row.id}
          renderCard={(row) => (
            <div className="flex items-center justify-between gap-3 text-sm">
              <div><p className="font-medium tabular-nums">{row.day}</p><p className="text-muted-foreground">{T.days.sessionCount(row.sessions)} · {row.audio}</p></div>
              <p className="font-medium tabular-nums">{row.cost}</p>
            </div>
          )}
        />
        <Link to="/usage/ai" className="text-sm font-medium text-link underline-offset-4 hover:underline">{T.openai.detailsLink}</Link>
      </CardContent>
    </Card>
  );
}
