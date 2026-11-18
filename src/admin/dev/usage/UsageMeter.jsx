// src/admin/dev/usage/UsageMeter.jsx
/** Accessible progress bar: a labelled `role="progressbar"` with a text value, so the number never depends on the bar. */
import { useId } from 'react';
import { cn } from '@/lib/utils';

const FILL = Object.freeze({ success: 'bg-success', warning: 'bg-warning', destructive: 'bg-destructive', muted: 'bg-muted-foreground' });

/**
 * @param {{meter: ReturnType<typeof import('./usageBudgetView.js').providerCard>['meters'][number]}} props
 */
export function UsageMeter({ meter }) {
  const labelId = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 text-sm">
        <span id={labelId} className="text-muted-foreground">{meter.label}</span>
        <span className="font-medium tabular-nums">{meter.text}</span>
      </div>
      <div
        role="progressbar"
        aria-labelledby={labelId}
        aria-valuemin={0}
        aria-valuemax={meter.valueMax}
        aria-valuenow={meter.valueNow}
        aria-valuetext={meter.text}
        className="h-2 w-full overflow-hidden rounded-full bg-muted"
      >
        <div className={cn('h-full rounded-full motion-safe:transition-[width]', FILL[meter.tone])} style={{ width: `${meter.barPercent}%` }} />
      </div>
    </div>
  );
}
