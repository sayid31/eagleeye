// src/admin/config/ProviderCells.jsx
/** Cells of the provider table (and its mobile card): name + purpose, key status, last connection test, actions. */
import { Badge } from '@/components/ui/badge';
import { CircleCheck, CircleX, Info, TriangleAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { StatusBadge } from '@/components/app/StatusBadge.jsx';
import { PROVIDERS_COPY as T } from '@/copy/en/config';
import { formatAbsolute } from '../dev/lib/timeView.js';
import { describeTestResult } from './providerKeysView.js';

const TONES = {
  success: { Icon: CircleCheck, className: 'text-success' },
  destructive: { Icon: CircleX, className: 'text-destructive' },
  warning: { Icon: TriangleAlert, className: 'text-warning' },
  muted: { Icon: Info, className: 'text-muted-foreground' },
};
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

/** Key set / Not set / Rejected with icon and word. */
export function KeyStatusBadge({ status }) {
  return <StatusBadge status={STATUS_BADGE[status.id]} label={status.label} />;
}

/** The last test of this visit ("Success • 14:02", "Test failed: …") or "Not tested"; a polite live region, icon + words. */
export function TestCell({ row }) {
  let body = <span className="text-muted-foreground">{row.key.set ? T.test.never : T.test.none}</span>;
  if (row.key.set && row.lastTest) {
    const { label, text, tone } = describeTestResult(row.lastTest, row.id);
    const { Icon, className } = TONES[tone];
    const time = formatAbsolute(row.lastTest.at, { seconds: false });
    body = (
      <span className={`inline-flex items-start gap-1.5 ${className}`} title={time}>
        <Icon aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
        <span className="text-foreground">{row.lastTest.result === 'error' ? T.test.failed(text) : T.test.at(label, time.split(' ').pop())}</span>
      </span>
    );
  }
  return <span role="status" aria-live="polite" className="text-sm">{body}</span>;
}

/** "Test connection for <provider>": only for a key that is set. aria-disabled (not disabled) while running keeps focus on the button. */
function TestButton({ row, onTest, running, disabled }) {
  const name = T.test.buttonLabel(row.name);
  return (
    <Button
      type="button" variant="outline" size="sm" aria-label={name} disabled={disabled}
      aria-disabled={running ? 'true' : undefined} className={running ? 'opacity-70' : undefined}
      onClick={() => { if (!running) void onTest(row.id); }}
    >
      {running ? <Spinner aria-hidden="true" data-icon="inline-start" /> : null}
      {running ? T.test.running : T.test.button}
    </Button>
  );
}

/** "Test connection" (key set) next to "Change key" / "Add key"; both accessible names carry the provider. */
export function ProviderActions({ row, onOpen, onTest, testing = {}, disabled }) {
  const label = row.key.set ? T.actions.change : T.actions.install;
  const name = row.key.set ? T.actions.changeLabel(row.name) : T.actions.installLabel(row.name);
  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      {row.key.set ? <TestButton row={row} onTest={onTest} running={Boolean(testing[row.id])} disabled={disabled} /> : null}
      <Button variant="outline" size="sm" aria-label={name} disabled={disabled} onClick={(event) => onOpen(row.id, event.currentTarget)}>{label}</Button>
    </div>
  );
}
