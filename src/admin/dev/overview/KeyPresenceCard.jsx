// src/admin/dev/overview/KeyPresenceCard.jsx
/** API key presence per provider as a compact list (Terpasang / Belum). Presence only: no value ever reaches the browser. */
import { Link } from 'react-router';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { StatusBadge } from '@/components/app/StatusBadge.jsx';
import { OVERVIEW_COPY as T } from '@/copy/id/system';
import { keyPresence } from './overviewView.js';

/** @param {{keys: {id: string, title: string, set: boolean}[]}} props */
export function KeyPresenceCard({ keys }) {
  const { summary, rows } = keyPresence(keys);
  return (
    <Card>
      <CardHeader>
        <CardTitle role="heading" aria-level={2}>{T.keys.title}</CardTitle>
        <CardDescription>{T.keys.description}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <p className="text-sm font-medium tabular-nums">{summary}</p>
        <ul className="divide-y rounded-lg border">
          {rows.map((row) => (
            <li key={row.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
              <span className="min-w-0 truncate" title={row.name}>{row.name}</span>
              <StatusBadge status={row.set ? 'active' : 'inactive'} label={row.set ? T.keys.present : T.keys.absent} />
            </li>
          ))}
        </ul>
        <Link to="/providers/keys" className="text-sm font-medium text-link underline-offset-4 hover:underline">{T.keys.manage}</Link>
      </CardContent>
    </Card>
  );
}
