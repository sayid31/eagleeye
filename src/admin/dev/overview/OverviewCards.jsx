// src/admin/dev/overview/OverviewCards.jsx
/** The five status cards of Ringkasan sistem: version, uptime, login, Kill switch, errors in the log. */
import { OVERVIEW_COPY as T } from '@/copy/id/system';
import { StatusBadge } from '@/components/app/StatusBadge';
import { StatCard } from './StatCard.jsx';
import { overviewCards } from './overviewView.js';

/** @param {{summary: object}} props Payload of `GET /api/admin/system`. */
export function OverviewCards({ summary }) {
  const cards = overviewCards(summary);
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-6">
      <StatCard className="lg:col-span-2" title={T.version.title} value={cards.version.value} detail={cards.version.detail} />
      <StatCard className="lg:col-span-2" title={T.uptime.title} value={cards.uptime.value} detail={cards.uptime.detail} />
      <StatCard className="sm:col-span-2 lg:col-span-2" title={T.login.title} status={cards.login.status}>
        <ul className="flex flex-col gap-3">
          {cards.login.rows.map((row) => (
            <li key={row.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <span>{row.label}</span>
              <StatusBadge status={row.status} label={row.text} />
            </li>
          ))}
        </ul>
      </StatCard>
      <StatCard
        className="lg:col-span-3"
        title={T.gates.title}
        status={cards.gates.status}
        value={cards.gates.value}
        detail={cards.gates.detail}
        link={{ to: '/kill-switches', label: T.gates.manage }}
      />
      <StatCard
        className="lg:col-span-3"
        title={T.errors.title}
        status={cards.errors.status}
        value={cards.errors.value}
        detail={cards.errors.detail}
        link={{ to: '/server-log', label: T.errors.open }}
      />
    </div>
  );
}
