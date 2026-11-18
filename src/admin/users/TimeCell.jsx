/**
 * A timestamp as relative text ("5 menit yang lalu") that never wraps, with the absolute date-time in the tooltip
 * (`title`) and for screen readers (a native title adds no tab stop to every table row).
 */
import { formatDateTime, formatRelative } from './usersFormat.js';

/** @param {{iso: string | null | undefined, className?: string}} props */
export function TimeCell({ iso, className }) {
  const absolute = formatDateTime(iso);
  return (
    <time dateTime={iso ?? undefined} title={absolute} className={['whitespace-nowrap', className].filter(Boolean).join(' ')}>
      {formatRelative(iso)}
      <span className="sr-only"> ({absolute})</span>
    </time>
  );
}
