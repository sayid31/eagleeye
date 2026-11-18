// src/admin/dev/lib/RefreshBar.jsx
/** "Diperbarui 14.02" plus a refresh button, for a PageHeader `actions` slot. */
import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SYSTEM_TIME_COPY } from '@/copy/id/system';
import { formatAbsolute } from './timeView.js';

/**
 * @param {{label: string, updatedAt?: number | null, loading?: boolean, onRefresh: () => void}} props
 *   The button stays focusable while loading (`aria-disabled`), so a click never drops keyboard focus to the page.
 */
export function RefreshBar({ label, updatedAt = null, loading = false, onRefresh }) {
  return (
    <div className="flex items-center gap-3">
      {updatedAt ? (
        <span className="text-sm text-muted-foreground" aria-live="polite">
          {SYSTEM_TIME_COPY.updatedAt(formatAbsolute(updatedAt, { seconds: false }))}
        </span>
      ) : null}
      <Button variant="outline" size="sm" aria-disabled={loading || undefined} aria-busy={loading || undefined} onClick={() => { if (!loading) onRefresh(); }}>
        <RefreshCw aria-hidden="true" data-icon="inline-start" className={loading ? 'animate-spin motion-reduce:animate-none' : undefined} />
        {label}
      </Button>
    </div>
  );
}
