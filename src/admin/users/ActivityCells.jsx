/** Cell building blocks shared by the Login Log and Audit tables. */
import { StatusBadge } from '@/components/app/StatusBadge.jsx';
import { ACTIVITY_COPY } from '../../copy/en/users.js';
import { compactIp, describeDevice, loginAccountText, loginFailureText } from './activityView.js';

/** Two-line cell: a main line and a muted sub line, both truncating with the full text in `title`. */
export function TwoLine({ main, sub, className }) {
  return (
    <div className={`min-w-0 max-w-64 ${className ?? ''}`}>
      <p className="truncate font-medium" title={main}>{main}</p>
      {sub ? <p className="truncate text-muted-foreground" title={sub}>{sub}</p> : null}
    </div>
  );
}

/** Account of a login row (name, email under it; unknown emails are only named as such). */
export function LoginAccountCell({ entry }) {
  const name = loginAccountText(entry);
  return <TwoLine main={name} sub={entry.userId && !entry.userDeleted ? entry.userEmail : null} />;
}

/** Success / fail badge with the failure reason under it. */
export function LoginResultCell({ entry }) {
  return (
    <div className="grid gap-1">
      <StatusBadge status={entry.success ? 'success' : 'failed'} className="w-fit" />
      {entry.success ? null : <span className="text-xs text-muted-foreground">{loginFailureText(entry)}</span>}
    </div>
  );
}

/** Compact IP; the stored (full) address is in the tooltip and readable by screen readers. */
export function IpCell({ ip }) {
  const compact = compactIp(ip);
  return (
    <span className="font-mono text-xs whitespace-nowrap" title={ip ? ACTIVITY_COPY.fullIp(ip) : undefined}>
      {compact}
      {ip && ip !== compact ? <span className="sr-only"> ({ip})</span> : null}
    </span>
  );
}

/** "Chrome · macOS" with the raw user agent as tooltip. */
export function DeviceCell({ userAgent }) {
  return <span className="whitespace-nowrap" title={userAgent || undefined}>{describeDevice(userAgent)}</span>;
}
