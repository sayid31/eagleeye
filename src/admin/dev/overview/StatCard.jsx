// src/admin/dev/overview/StatCard.jsx
/** A status card: title, optional health badge, one large value with a sub-label, and an optional quick link. */
import { Link } from 'react-router';
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { StatusBadge } from '@/components/app/StatusBadge';

/**
 * @param {{title: string, status?: string, statusLabel?: string, value?: string, detail?: string, link?: {to: string, label: string},
 *   className?: string, children?: import('react').ReactNode}} props `children` replaces the big value (e.g. two status rows).
 */
export function StatCard({ title, status, statusLabel, value, detail, link, className, children }) {
  return (
    <Card className={cn('h-full', className)}>
      <CardHeader>
        <CardTitle role="heading" aria-level={2}>{title}</CardTitle>
        {status ? <CardAction><StatusBadge status={status} label={statusLabel} /></CardAction> : null}
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-1">
        {children ?? (
          <>
            <p className="text-3xl font-semibold tracking-tight tabular-nums">{value}</p>
            {detail ? <CardDescription className="break-words">{detail}</CardDescription> : null}
          </>
        )}
        {link ? <Link to={link.to} className="mt-auto pt-3 text-sm font-medium text-link underline-offset-4 hover:underline">{link.label}</Link> : null}
      </CardContent>
    </Card>
  );
}
