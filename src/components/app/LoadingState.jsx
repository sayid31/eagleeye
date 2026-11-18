// src/components/app/LoadingState.jsx
/** Content-shaped skeletons instead of a "Memuat…" line. The wrapper announces the busy state once. */
import { Skeleton } from '@/components/ui/skeleton';
import { COMMON_COPY, STATE_COPY } from '@/copy/id/common';

const SKELETON_ROW_KEYS = Array.from({ length: 20 }, (_, index) => `row-${index}`);

/**
 * @param {{variant?: 'rows' | 'cards' | 'form', rows?: number, label?: string, className?: string}} props
 */
export function LoadingState({ variant = 'rows', rows = 5, label = STATE_COPY.loadingLabel, className = '' }) {
  const keys = SKELETON_ROW_KEYS.slice(0, Math.max(1, Math.min(rows, SKELETON_ROW_KEYS.length)));
  return (
    <div role="status" aria-busy="true" aria-live="polite" className={className}>
      <span className="sr-only">{label || COMMON_COPY.loading}</span>
      {variant === 'cards' ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-hidden="true">
          {keys.slice(0, 6).map((key) => <Skeleton key={key} className="h-32 rounded-xl" />)}
        </div>
      ) : null}
      {variant === 'form' ? (
        <div className="flex max-w-xl flex-col gap-5" aria-hidden="true">
          {keys.slice(0, 4).map((key) => (
            <div key={key} className="flex flex-col gap-2"><Skeleton className="h-4 w-28" /><Skeleton className="h-9 w-full" /></div>
          ))}
        </div>
      ) : null}
      {variant === 'rows' ? (
        <div className="flex flex-col gap-3" aria-hidden="true">
          {keys.map((key) => (
            <div key={key} className="flex items-center gap-4"><Skeleton className="size-8 rounded-full" /><Skeleton className="h-4 flex-1" /><Skeleton className="hidden h-4 w-24 sm:block" /></div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
