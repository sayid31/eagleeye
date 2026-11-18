// src/admin/dev/usage/ProviderCard.jsx
/** One provider's budget: status, a big number with its unit, progress meters, facts and a reset note — or an empty state. */
import { KeyRound } from 'lucide-react';
import { Link } from 'react-router';
import { Button } from '@/components/ui/button';
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/app/EmptyState.jsx';
import { USAGE_COPY as T } from '@/copy/id/system';
import { StatusBadge } from '@/components/app/StatusBadge';
import { UsageMeter } from './UsageMeter.jsx';

function Body({ card }) {
  if (card.empty === 'notConfigured') {
    return (
      <EmptyState
        icon={KeyRound}
        title={T.emptyNotConfigured.title}
        description={T.emptyNotConfigured.description}
        className="border-0 p-2"
        action={<Button asChild variant="outline" size="sm"><Link to="/providers/keys">{T.emptyNotConfigured.action}</Link></Button>}
      />
    );
  }
  if (card.empty) return <EmptyState title={T.emptyNoData.title} description={T.emptyNoData.description} className="border-0 p-2" />;
  return (
    <>
      <div className="flex flex-col gap-0.5">
        <p className="text-3xl font-semibold tracking-tight tabular-nums">{card.big.value}</p>
        <p className="text-sm text-muted-foreground">{card.big.unit}</p>
      </div>
      {card.meters.map((meter) => <UsageMeter key={meter.id} meter={meter} />)}
      <dl className="grid gap-1 text-sm">
        {card.facts.map((fact) => (
          <div key={fact.label} className="flex flex-wrap justify-between gap-x-3">
            <dt className="text-muted-foreground">{fact.label}</dt>
            <dd className="font-medium tabular-nums">{fact.value}</dd>
          </div>
        ))}
      </dl>
      <p className="text-sm text-muted-foreground">{card.note}</p>
    </>
  );
}

/** @param {{card: ReturnType<typeof import('./usageBudgetView.js').providerCard>, footer?: import('react').ReactNode}} props */
export function ProviderCard({ card, footer }) {
  return (
    <Card data-provider={card.id}>
      <CardHeader>
        <CardTitle role="heading" aria-level={2}>{card.title}</CardTitle>
        <CardDescription>{card.description}</CardDescription>
        <CardAction><StatusBadge status={card.status} label={card.statusLabel} /></CardAction>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-4">
        <Body card={card} />
        {footer ? <div className="mt-auto">{footer}</div> : null}
      </CardContent>
    </Card>
  );
}
