/**
 * /admin → Ringkasan: account and sign-in counters from `/api/admin/users/stats` (an admin's numbers cover `user`
 * accounts only; a super_admin's cover all), a first-run call to action and shortcuts to the other pages.
 */
import { AlertTriangle, Clock, History, KeyRound, LogIn, UserPlus, UserX, Users } from 'lucide-react';
import { Link, useNavigate } from 'react-router';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/app/EmptyState.jsx';
import { ErrorState } from '@/components/app/ErrorState.jsx';
import { LoadingState } from '@/components/app/LoadingState.jsx';
import { PageHeader } from '@/components/app/PageHeader.jsx';
import { OVERVIEW_COPY } from '../../copy/en/users.js';
import { overviewCards, overviewIsEmpty } from './overviewView.js';
import { usersApi } from './usersApi.js';
import { useResource } from './useResource.js';

const ICONS = { users: Users, userX: UserX, clock: Clock, key: KeyRound, login: LogIn, alert: AlertTriangle };
const LINKS = [
  { id: 'users', to: '/users', icon: Users },
  { id: 'loginLog', to: '/login-log', icon: LogIn },
  { id: 'audit', to: '/audit', icon: History },
];

function StatCard({ card }) {
  const copy = OVERVIEW_COPY.cards[card.key];
  const Icon = ICONS[card.icon];
  return (
    <Card>
      <CardHeader>
        <CardDescription className="flex items-center gap-2"><Icon aria-hidden="true" className="size-4" />{copy.title}</CardDescription>
        <CardTitle className="text-3xl font-semibold tabular-nums" data-testid={`stat-${card.key}`}>{card.value.toLocaleString('id-ID')}</CardTitle>
      </CardHeader>
      <CardContent className="text-sm text-muted-foreground">{copy.hint}</CardContent>
    </Card>
  );
}

function QuickLinks() {
  return (
    <section aria-labelledby="overview-links" className="mt-8">
      <h2 id="overview-links" className="mb-3 text-base font-medium">{OVERVIEW_COPY.links.title}</h2>
      <ul className="grid gap-3 sm:grid-cols-3">
        {LINKS.map(({ id, to, icon: Icon }) => (
          <li key={id}>
            <Link to={to} className="flex h-full items-start gap-3 rounded-xl border bg-card p-4 text-card-foreground transition-colors hover:bg-muted/50 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none">
              <Icon aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
              <span className="grid gap-1">
                <span className="font-medium">{OVERVIEW_COPY.links[id].title}</span>
                <span className="text-sm text-muted-foreground">{OVERVIEW_COPY.links[id].description}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function UsersOverviewPage() {
  const navigate = useNavigate();
  const { data, loading, error, reload } = useResource(() => usersApi.stats(), 'stats');
  const stats = data?.stats;
  let body;
  if (error) body = <ErrorState error={error} onRetry={reload} />;
  else if (!stats || loading) body = <LoadingState variant="cards" label={OVERVIEW_COPY.cardsLabel} />;
  else if (overviewIsEmpty(stats)) {
    body = (
      <EmptyState
        icon={UserPlus}
        title={OVERVIEW_COPY.empty.title}
        description={OVERVIEW_COPY.empty.description}
        action={<Button onClick={() => navigate('/users', { state: { openCreate: true } })}>{OVERVIEW_COPY.empty.cta}</Button>}
      />
    );
  } else {
    body = (
      <ul aria-label={OVERVIEW_COPY.cardsLabel} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {overviewCards(stats).map((card) => <li key={card.key}><StatCard card={card} /></li>)}
      </ul>
    );
  }
  return (
    <>
      <PageHeader title={OVERVIEW_COPY.title} description={OVERVIEW_COPY.description} />
      {body}
      <QuickLinks />
    </>
  );
}
