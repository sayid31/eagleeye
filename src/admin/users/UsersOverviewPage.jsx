/**
 * /admin → Ringkasan: account and sign-in counters from `/api/admin/users/stats`
 * (an admin's numbers cover `user` accounts only; a super_admin's cover all).
 */
import { Link } from 'react-router';
import { LoadState, usePageData } from './UsersWidgets.jsx';
import { OVERVIEW_COPY } from './usersCopy.js';
import { usersApi } from './usersApi.js';
import './users.css';

const CARDS = [
  ['active', 'ok'], ['inactive', 'muted'], ['throttled', 'warn'], ['mustChangePassword', 'info'], ['logins24h', 'ok'], ['failed24h', 'error'],
];

export function UsersOverviewPage() {
  const { data, loading, error, reload } = usePageData(() => usersApi.stats(), 'stats');
  const stats = data?.stats;
  return (
    <div className="adm-page adm-page-wide">
      <header className="adm-page-header">
        <h1>{OVERVIEW_COPY.title}</h1>
        <p className="adm-muted">{OVERVIEW_COPY.lead}</p>
      </header>
      <LoadState loading={loading && !stats} error={error} onRetry={reload} />
      {stats ? (
        <div className="usr-stats">
          {CARDS.map(([key, tone]) => (
            <section key={key} className={`adm-card usr-stat usr-stat-${tone}`}>
              <span className="adm-field-label">{OVERVIEW_COPY.cards[key]}</span>
              <span className="adm-stat" data-testid={`stat-${key}`}>{stats[key]}</span>
            </section>
          ))}
        </div>
      ) : null}
      <div className="adm-actions">
        <Link className="adm-btn" to="/users">{OVERVIEW_COPY.links.users}</Link>
        <Link className="adm-btn" to="/login-log">{OVERVIEW_COPY.links.loginLog}</Link>
      </div>
    </div>
  );
}
