// src/admin/config/ProviderCells.jsx
/** Cells of the provider table (and its mobile card): name + purpose, key status, source, last connection test, action. */
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/app/StatusBadge.jsx';
import { PROVIDERS_COPY as T } from '@/copy/en/config';
import { formatAbsolute } from '../dev/lib/timeView.js';
import { describeTestResult } from './providerKeysView.js';

const STATUS_BADGE = { set: 'active', unset: 'inactive', rejected: 'failed' };

/** Name, purpose and billing tier. */
export function ProviderCell({ row }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <span className="flex flex-wrap items-center gap-2 font-medium">{row.name}<Badge variant="outline" className="font-normal">{row.tier}</Badge></span>
      <span className="text-sm text-muted-foreground">{row.purpose}</span>
    </div>
  );
}

/** Terpasang / Belum / Ditolak with icon and word. */
export function KeyStatusBadge({ status }) {
  return <StatusBadge status={STATUS_BADGE[status.id]} label={status.label} />;
}

/** The last test of this visit ("Berhasil • 14.02") or "Belum dites"; keys that cannot be tested say so. */
export function TestCell({ row }) {
  if (!row.key.set) return <span className="text-muted-foreground">{T.sources.none}</span>;
  if (!row.lastTest) return <span className="text-muted-foreground">{T.test.never}</span>;
  const { label } = describeTestResult(row.lastTest, row.id);
  const time = formatAbsolute(row.lastTest.at, { seconds: false });
  return <span title={time}>{T.test.at(label, time.split(' ').pop())}</span>;
}

/** "Ubah kunci" / "Pasang kunci"; the accessible name carries the provider. */
export function ProviderAction({ row, onOpen, disabled }) {
  const label = row.key.set ? T.actions.change : T.actions.install;
  const name = row.key.set ? T.actions.changeLabel(row.name) : T.actions.installLabel(row.name);
  return <Button variant="outline" size="sm" aria-label={name} disabled={disabled} onClick={(event) => onOpen(row.id, event.currentTarget)}>{label}</Button>;
}
