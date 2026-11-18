// src/admin/config/CharCounter.jsx
/** "420/1000 karakter"; turns to the warning colour in the last tenth so the limit never surprises. */
import { cn } from '@/lib/utils';
import { PERSONA_COPY } from '@/copy/id/configForms';

/** @param {{used: number, max: number, className?: string}} props */
export function CharCounter({ used, max, className }) {
  return <p className={cn('text-right text-xs tabular-nums', used >= max * 0.9 ? 'text-warning' : 'text-muted-foreground', className)}>{PERSONA_COPY.extra.counter(used, max)}</p>;
}
