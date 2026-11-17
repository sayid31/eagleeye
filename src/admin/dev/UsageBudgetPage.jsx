// src/admin/dev/UsageBudgetPage.jsx
/**
 * /dev → Pemakaian & budget: OpenSky credits (governor), TomTom daily tile
 * budget and OpenAI voice usage, read-only, from the server's own counters.
 * A provider without a key shows an empty state instead of zeros.
 */
import { Link } from 'react-router';
import { formatCostUsd } from '../../voice/voiceCost.js';
import { formatDuration } from '../pages/usageView.js';
import { formatLogTime } from '../pages/serverLogView.js';
import { fetchUsage } from './devApi.js';
import { DevFacts, DevHeader, StatusPill } from './DevStatus.jsx';
import { USAGE_TEXT as T } from './devText.js';
import { providerTitle, usageRows } from './devViews.js';
import { useDevResource } from './useDevResource.js';

function VoiceDays({ days }) {
  return (
    <div className="adm-table-wrap">
      <table className="adm-table">
        <thead><tr><th>Hari</th><th>Sesi</th><th>Audio</th><th>Perkiraan biaya</th></tr></thead>
        <tbody>
          {days.map((row) => (
            <tr key={row.day} className={row.sessions ? undefined : 'adm-row-empty'}>
              <td>{row.day}</td><td>{row.sessions}</td><td>{formatDuration(row.seconds)}</td><td>{formatCostUsd(row.estimatedUsd)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ProviderCard({ card, now }) {
  const view = usageRows(card, now);
  return (
    <section className={`adm-card adm-section${card.id === 'openai' && card.data ? ' dev-wide' : ''}`} aria-label={providerTitle(card.id)}>
      <h2>{providerTitle(card.id)}</h2>
      <p><StatusPill status={card.status} /></p>
      {view.empty ? <p className="dev-empty">{view.empty}</p> : <DevFacts rows={view.rows} />}
      {card.id === 'openai' && card.data ? (
        <>
          <h3 className="dev-subhead">{T.details}</h3>
          <VoiceDays days={card.data.days} />
          <p><Link className="adm-link" to="/ai/usage">Rincian & batas biaya di Konfigurasi AI →</Link></p>
        </>
      ) : null}
    </section>
  );
}

export function UsageBudgetPage() {
  const { data, error, loading, reload } = useDevResource(fetchUsage);
  return (
    <div className="adm-page">
      <DevHeader title={T.title} lead={data ? `${T.lead} ${T.updatedAt} ${formatLogTime(data.generatedAt)}.` : T.loading} busy={loading} onReload={reload} reloadLabel={T.reload} />
      {error ? <p className="adm-error" role="alert">{error}</p> : null}
      {data?.providers.map((card) => <ProviderCard key={card.id} card={card} now={data.generatedAt} />)}
    </div>
  );
}
