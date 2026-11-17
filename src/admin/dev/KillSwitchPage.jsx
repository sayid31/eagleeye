// src/admin/dev/KillSwitchPage.jsx
/**
 * /dev → Kill switch: one card per paid gate (Layer data, Voice & AI, Peta
 * premium & search). Switching one off answers 503 FEATURE_DISABLED to every
 * account — super_admin included — until it is switched back on.
 */
import { useState } from 'react';
import { fetchKillSwitches } from './devApi.js';
import { DevHeader, StatusPill } from './DevStatus.jsx';
import { GATE_TEXT, KILL_SWITCH_TEXT as T } from './devText.js';
import { formatAgo, gateLabel } from './devViews.js';
import { KillSwitchDialog } from './KillSwitchDialog.jsx';
import { useDevResource } from './useDevResource.js';

function lastChange(row) {
  if (!row.updatedAt) return T.never;
  const who = row.updatedBy?.emailMasked ?? row.updatedBy?.id ?? '—';
  return `${formatAgo(row.updatedAt, Date.now())} oleh ${who}${row.reason ? ` — “${row.reason}”` : ''}`;
}

function GateCard({ row, onToggle }) {
  return (
    <section className={`adm-card adm-section dev-gate${row.killed ? ' dev-gate-off' : ''}`} aria-label={gateLabel(row.gate)}>
      <h2>{gateLabel(row.gate)}</h2>
      <p><StatusPill status={row.killed ? 'error' : 'ok'} label={row.killed ? T.off : T.on} /></p>
      <p className="adm-muted">{GATE_TEXT[row.gate]?.stops}</p>
      <p className="dev-meta"><span className="adm-field-label">{T.lastChange}</span> {lastChange(row)}</p>
      <div className="adm-actions">
        <button type="button" className={`adm-btn ${row.killed ? 'adm-btn-primary' : 'adm-btn-danger'}`} onClick={() => onToggle({ gate: row.gate, killed: !row.killed })}>
          {row.killed ? T.turnOn : T.turnOff}
        </button>
      </div>
    </section>
  );
}

export function KillSwitchPage() {
  const { data, error, loading, reload } = useDevResource(fetchKillSwitches);
  const [change, setChange] = useState(null);
  const [notice, setNotice] = useState(null);

  const done = async (result) => {
    setChange(null);
    setNotice({ ok: result.audit === 'written', text: result.audit === 'written' ? T.saved(gateLabel(result.switch.gate), result.switch.killed) : T.auditFailed });
    await reload();
  };

  return (
    <div className="adm-page">
      <DevHeader title={T.title} lead={T.lead} busy={loading} onReload={reload} reloadLabel="Muat ulang" />
      {notice ? <p className={notice.ok ? 'adm-success' : 'adm-error'} role="status">{notice.text}</p> : null}
      {error ? <p className="adm-error" role="alert">{error}</p> : null}
      {!data && loading ? <p className="adm-muted">{T.loading}</p> : null}
      {data?.switches.map((row) => <GateCard key={row.gate} row={row} onToggle={(next) => { setNotice(null); setChange(next); }} />)}
      {change ? <KillSwitchDialog change={change} onDone={done} onCancel={() => setChange(null)} /> : null}
    </div>
  );
}
