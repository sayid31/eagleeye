// src/admin/dev/logs/LogTime.jsx
/** Relative time with the absolute stamp beneath it (and as `title`); never wraps. */
export function LogTime({ time }) {
  return (
    <time dateTime={time.iso} title={time.absolute} className="block whitespace-nowrap">
      <span className="block text-sm">{time.relative}</span>
      <span className="block text-xs text-muted-foreground tabular-nums">{time.absolute}</span>
    </time>
  );
}
