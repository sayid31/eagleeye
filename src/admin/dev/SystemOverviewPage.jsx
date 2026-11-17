// src/admin/dev/SystemOverviewPage.jsx
/**
 * /dev → Ringkasan sistem: version, runtime, uptime, login configuration, key
 * presence per provider (never a value), kill-switch states, recent Server
 * Log errors and the doctor's login warnings. Read-only.
 */
import { Link } from 'react-router';
import { fetchSystemSummary } from './devApi.js';
import { DevFacts, DevHeader, StatusPill } from './DevStatus.jsx';
import { OVERVIEW_TEXT as T } from './devText.js';
import { doctorLines, formatUptime, killSwitchHeadline } from './devViews.js';
import { useDevResource } from './useDevResource.js';
import { formatLogTime } from '../pages/serverLogView.js';

const yesNo = (value) => <StatusPill status={value ? 'ok' : 'off'} label={value ? T.yes : T.no} />;

function OverviewBody({ summary }) {
  const killed = summary.killSwitches.some((row) => row.killed);
  const doctor = doctorLines(summary.doctor);
  return (
    <>
      <section className="adm-card adm-section">
        <h2>{T.app}</h2>
        <DevFacts rows={[
          { label: T.version, value: `v${summary.app.version}` },
          { label: T.runtime, value: `${summary.app.runtime.name} ${summary.app.runtime.version}` },
          { label: T.uptime, value: `${formatUptime(summary.app.uptimeSeconds)} · sejak ${formatLogTime(summary.app.startedAt)}` },
        ]} />
      </section>
      <section className="adm-card adm-section">
        <h2>{T.auth}</h2>
        <DevFacts rows={[{ label: T.authConfigured, value: yesNo(summary.auth.configured) }, { label: T.google, value: yesNo(summary.auth.googleSignIn) }]} />
      </section>
      <section className="adm-card adm-section">
        <h2>{T.killSwitches}</h2>
        <p><StatusPill status={killed ? 'warn' : 'ok'} label={killSwitchHeadline(summary.killSwitches)} /></p>
        <p><Link className="adm-link" to="/kill-switches">{T.openPage} {T.killSwitches} →</Link></p>
      </section>
      <section className="adm-card adm-section">
        <h2>{T.serverLog}</h2>
        <p><StatusPill status={summary.serverLog.recentErrors ? 'error' : 'ok'} label={T.recentErrors(summary.serverLog.recentErrors, summary.serverLog.windowHours)} /></p>
        <p><Link className="adm-link" to="/server-log">{T.openPage} {T.serverLog} →</Link></p>
      </section>
      <section className="adm-card adm-section dev-wide">
        <h2>{T.keys}</h2>
        <p className="adm-section-lead">{T.keysLead}</p>
        <ul className="dev-keys">
          {summary.keys.map((key) => (
            <li key={key.id}><StatusPill status={key.set ? 'ok' : 'off'} label={key.set ? T.keyPresent : T.keyAbsent} /> <span>{key.title}</span></li>
          ))}
        </ul>
      </section>
      <section className="adm-card adm-section dev-wide">
        <h2>{T.doctor}</h2>
        <p className="adm-section-lead">{T.doctorLead}</p>
        {doctor.length ? (
          <ul className="adm-health">
            {doctor.map((line) => <li key={line.id} className="adm-health-item"><StatusPill status={line.level} /><span className="adm-health-detail">{line.text}</span></li>)}
          </ul>
        ) : <p>{T.doctorNone}</p>}
      </section>
    </>
  );
}

export function SystemOverviewPage() {
  const { data, error, loading, reload } = useDevResource(fetchSystemSummary);
  return (
    <div className="adm-page">
      <DevHeader title={T.title} lead={data ? `Diperbarui ${formatLogTime(data.generatedAt)}` : T.loading} busy={loading} onReload={reload} reloadLabel={T.reload} />
      {error ? <p className="adm-error" role="alert">{error}</p> : null}
      {data ? <OverviewBody summary={data} /> : null}
    </div>
  );
}
