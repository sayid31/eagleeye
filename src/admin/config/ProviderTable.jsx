// src/admin/config/ProviderTable.jsx
/** The provider table (≥md) / stacked cards (<md) of API Keys. */
import { KeyRound } from 'lucide-react';
import { DataTable } from '@/components/app/DataTable.jsx';
import { EmptyState } from '@/components/app/EmptyState.jsx';
import { PROVIDERS_COPY as T } from '@/copy/en/config';
import { KeyStatusBadge, ProviderActions, ProviderCell, TestCell } from './ProviderCells.jsx';

/** @param {{rows: object[], loading: boolean, error: unknown, onRetry: () => void, onOpen: (id: string, opener: HTMLElement) => void, onTest: (id: string) => Promise<void>, testing: Record<string, boolean>, busy: boolean}} props */
export function ProviderTable({ rows, loading, error, onRetry, onOpen, onTest, testing, busy }) {
  const columns = [
    { id: 'provider', header: T.columns.provider, cell: (row) => <ProviderCell row={row} /> },
    { id: 'status', header: T.columns.status, cell: (row) => <KeyStatusBadge status={row.status} /> },
    { id: 'test', header: T.columns.test, cell: (row) => <TestCell row={row} /> },
    { id: 'actions', header: T.columns.actions, srOnlyHeader: true, className: 'text-right', cell: (row) => <ProviderActions row={row} onOpen={onOpen} onTest={onTest} testing={testing} disabled={busy} /> },
  ];
  const card = (row) => (
    <div className="flex flex-col gap-3">
      <ProviderCell row={row} />
      <dl className="grid grid-cols-[auto_1fr] items-center gap-x-4 gap-y-1.5 text-sm">
        <dt className="text-muted-foreground">{T.columns.status}</dt><dd><KeyStatusBadge status={row.status} /></dd>
        <dt className="text-muted-foreground">{T.columns.test}</dt><dd><TestCell row={row} /></dd>
      </dl>
      <ProviderActions row={row} onOpen={onOpen} onTest={onTest} testing={testing} disabled={busy} />
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
