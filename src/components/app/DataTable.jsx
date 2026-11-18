// src/components/app/DataTable.jsx
/**
 * Server-paginated data table: loading / error / empty / ready states, a toolbar slot, "x–y dari z" with a page-size
 * choice, an sr-only caption and `scope="col"` headers. From the `md` breakpoint it is a table; below it each row is a
 * stacked card produced by `renderCard` (no horizontal scrolling of a 2000 px table).
 */
import { useId } from 'react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { STATE_COPY, TABLE_COPY } from '@/copy/en/common';
import { cn } from '@/lib/utils';
import { EmptyState } from './EmptyState.jsx';
import { ErrorState } from './ErrorState.jsx';
import { LoadingState } from './LoadingState.jsx';
import { PAGE_SIZES, paginationView, tableState } from './dataTableView.js';

function Pagination({ pagination, busy }) {
  const view = paginationView({ total: pagination.total, limit: pagination.limit, offset: pagination.offset, sizes: pagination.sizes ?? PAGE_SIZES });
  if (!view.visible) return null;
  const sizes = pagination.sizes ?? PAGE_SIZES;
  const labelId = `${useId()}-page-size`;
  return (
    <nav aria-label={TABLE_COPY.pagination} className="flex flex-wrap items-center justify-between gap-3 pt-3">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <span id={labelId}>{TABLE_COPY.pageSize}</span>
        <Select value={String(pagination.limit)} onValueChange={(value) => pagination.onLimitChange(Number(value))}>
          <SelectTrigger size="sm" aria-labelledby={labelId} className="w-20"><SelectValue /></SelectTrigger>
          <SelectContent>{sizes.map((size) => <SelectItem key={size} value={String(size)}>{size}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground" aria-live="polite">{view.label}</span>
        <Button variant="outline" size="sm" disabled={busy || view.prevOffset === null} onClick={() => pagination.onOffsetChange(view.prevOffset)}>{TABLE_COPY.previous}</Button>
        <Button variant="outline" size="sm" disabled={busy || view.nextOffset === null} onClick={() => pagination.onOffsetChange(view.nextOffset)}>{TABLE_COPY.next}</Button>
      </div>
    </nav>
  );
}

/**
 * @param {{
 *   caption: string,
 *   columns: Array<{id: string, header: string, cell: (row: any) => import('react').ReactNode, className?: string, srOnlyHeader?: boolean}>,
 *   rows: any[], getRowId: (row: any) => string,
 *   loading?: boolean, error?: unknown, onRetry?: () => void,
 *   toolbar?: import('react').ReactNode,
 *   empty?: import('react').ReactNode, filteredEmpty?: import('react').ReactNode, filtered?: boolean,
 *   renderCard?: (row: any) => import('react').ReactNode,
 *   pagination?: {total: number, limit: number, offset: number, sizes?: readonly number[], onOffsetChange: (offset: number) => void, onLimitChange: (limit: number) => void},
 * }} props `caption` names the table for screen readers (and heads the card list). `filtered` swaps the empty state for
 *   "no match". Changing the page size must reset the offset in the caller's `onLimitChange`.
 */
export function DataTable({ caption, columns, rows, getRowId, loading = false, error = null, onRetry, toolbar, empty, filteredEmpty, filtered = false, renderCard, pagination }) {
  const { state, refreshing } = tableState({ loading, error, rowCount: rows.length });
  let body;
  if (state === 'error') body = <ErrorState error={error} onRetry={onRetry} />;
  else if (state === 'loading') body = <LoadingState label={caption} />;
  else if (state === 'empty') {
    body = filtered
      ? (filteredEmpty ?? <EmptyState title={STATE_COPY.noMatchTitle} description={STATE_COPY.noMatchDescription} />)
      : (empty ?? <EmptyState />);
  } else {
    body = (
      <>
        <div className={cn('rounded-lg border', renderCard && 'hidden md:block', refreshing && 'opacity-70 transition-opacity')} aria-busy={refreshing || undefined}>
          <Table>
            <TableCaption className="sr-only">{caption}</TableCaption>
            <TableHeader>
              <TableRow>
                {columns.map((column) => (
                  <TableHead key={column.id} scope="col" className={column.className}>
                    {column.srOnlyHeader ? <span className="sr-only">{column.header}</span> : column.header}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={getRowId(row)}>
                  {columns.map((column) => <TableCell key={column.id} className={column.className}>{column.cell(row)}</TableCell>)}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        {renderCard ? (
          <ul className={cn('grid gap-3 md:hidden', refreshing && 'opacity-70')} aria-label={caption}>
            {rows.map((row) => <li key={getRowId(row)} className="rounded-lg border bg-card p-3 text-card-foreground">{renderCard(row)}</li>)}
          </ul>
        ) : null}
        {pagination ? <Pagination pagination={pagination} busy={refreshing} /> : null}
      </>
    );
  }
  return (
    <section className="flex flex-col gap-3" aria-label={caption}>
      {toolbar ? <div className="flex flex-wrap items-center gap-2">{toolbar}</div> : null}
      {body}
    </section>
  );
}
