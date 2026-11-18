// src/admin/config/ProviderTable.jsx
/** The provider table (≥md) / stacked cards (<md) of API Keys. */
import { KeyRound } from 'lucide-react';
import { DataTable } from '@/components/app/DataTable.jsx';
import { EmptyState } from '@/components/app/EmptyState.jsx';
import { PROVIDERS_COPY as T } from '@/copy/id/config';
import { KeyStatusBadge, ProviderAction, ProviderCell, TestCell } from './ProviderCells.jsx';

/** @param {{rows: object[], loading: boolean, error: unknown, onRetry: () => void, onOpen: (id: string, opener: HTMLElement) => void, busy: boolean}} props */
export function ProviderTable({ rows, loading, error, onRetry, onOpen, busy }) {
  const columns = [
    { id: 'provider', header: T.columns.provider, cell: (row) => <ProviderCell row={row} /> },
    { id: 'status', header: T.columns.status, cell: (row) => <KeyStatusBadge status={row.status} /> },
    { id: 'source', header: T.columns.source, cell: (row) => row.source.label },
    { id: 'test', header: T.columns.test, cell: (row) => <TestCell row={row} /> },
    { id: 'actions', header: T.columns.actions, srOnlyHeader: true, className: 'w-px text-right whitespace-nowrap', cell: (row) => <ProviderAction row={row} onOpen={onOpen} disabled={busy} /> },
  ];
  const card = (row) => (
    <div className="flex flex-col gap-3">
      <ProviderCell row={row} />
      <dl className="grid grid-cols-[auto_1fr] items-center gap-x-4 gap-y-1.5 text-sm">
        <dt className="text-muted-foreground">{T.columns.status}</dt><dd><KeyStatusBadge status={row.status} /></dd>
        <dt className="text-muted-foreground">{T.columns.source}</dt><dd>{row.source.label}</dd>
        <dt className="text-muted-foreground">{T.columns.test}</dt><dd><TestCell row={row} /></dd>
      </dl>
      <ProviderAction row={row} onOpen={onOpen} disabled={busy} />
    </div>
  );
  return (
    <DataTable
      caption={T.tableCaption}
      columns={columns}
      rows={rows}
      getRowId={(row) => row.id}
      loading={loading}
      error={error}
      onRetry={onRetry}
      renderCard={card}
      empty={<EmptyState icon={KeyRound} title={T.empty.title} description={T.empty.description} />}
    />
  );
}
