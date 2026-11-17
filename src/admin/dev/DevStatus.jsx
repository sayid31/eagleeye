// src/admin/dev/DevStatus.jsx
/** Shared bits of the `/dev` system pages: status pill, page header, label/value list. */
import { HEALTH_TONES } from '../pages/healthView.js';
import { STATUS_TEXT } from './devText.js';

/** Colour + word (never colour alone). `label` overrides the default word. */
export function StatusPill({ status, label }) {
  return <span className={`adm-pill adm-pill-${HEALTH_TONES[status] ?? 'muted'}`}>{label ?? STATUS_TEXT[status] ?? status}</span>;
}

/** Page title, lead line and a reload button. */
export function DevHeader({ title, lead, busy, onReload, reloadLabel }) {
  return (
    <header className="adm-page-header">
      <h1>{title}</h1>
      {lead ? <p className="adm-muted">{lead}</p> : null}
      {onReload ? <div className="adm-actions"><button type="button" className="adm-btn" disabled={busy} onClick={onReload}>{reloadLabel}</button></div> : null}
    </header>
  );
}

/** `<dl>` of label/value rows. */
export function DevFacts({ rows }) {
  return (
    <dl className="dev-facts">
      {rows.map((row) => (
        <div key={row.label} className="dev-fact"><dt>{row.label}</dt><dd>{row.value}</dd></div>
      ))}
    </dl>
  );
}
