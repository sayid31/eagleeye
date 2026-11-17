// src/admin/dev/KillSwitchDialog.jsx
/**
 * Confirm dialog of one kill-switch change: reason (required to switch off)
 * and the actor's current password (re-auth). Native `<dialog>` so focus,
 * Esc and the backdrop behave like any modal.
 */
import { useEffect, useRef, useState } from 'react';
import { updateKillSwitch } from './devApi.js';
import { GATE_TEXT, KILL_SWITCH_TEXT as T } from './devText.js';
import { gateLabel, killFormError } from './devViews.js';

/**
 * @param {{change: {gate: string, killed: boolean}, onDone: (result: object) => void, onCancel: () => void}} props
 *   `change.killed` is the state being requested.
 */
export function KillSwitchDialog({ change, onDone, onCancel }) {
  const ref = useRef(null);
  const [reason, setReason] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const label = gateLabel(change.gate);

  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
    return () => { if (dialog?.open) dialog.close(); };
  }, []);

  const submit = async (event) => {
    event.preventDefault();
    const problem = killFormError({ killed: change.killed, reason });
    if (problem) { setError(problem); return; }
    setBusy(true);
    try {
      onDone(await updateKillSwitch({ gate: change.gate, killed: change.killed, reason: reason.trim(), currentPassword: password }));
    } catch (failure) {
      setError(failure.message);
      setBusy(false);
    }
  };

  return (
    <dialog ref={ref} className="dev-dialog" aria-labelledby="dev-dialog-title" onCancel={(event) => { event.preventDefault(); if (!busy) onCancel(); }}>
      <form className="dev-dialog-body" onSubmit={submit}>
        <h2 id="dev-dialog-title">{change.killed ? T.confirmOffTitle(label) : T.confirmOnTitle(label)}</h2>
        {change.killed ? <p className="adm-muted">{GATE_TEXT[change.gate]?.stops}</p> : null}
        <label className="adm-field">
          <span className="adm-field-label">{T.reasonLabel}</span>
          <textarea className="adm-input" value={reason} maxLength={200} aria-required={change.killed} disabled={busy} onChange={(e) => setReason(e.target.value)} />
          <small className="adm-field-hint">{change.killed ? T.reasonHintOff : T.reasonHintOn}</small>
        </label>
        <label className="adm-field">
          <span className="adm-field-label">{T.passwordLabel}</span>
          <input className="adm-input" type="password" autoComplete="current-password" value={password} disabled={busy} onChange={(e) => setPassword(e.target.value)} />
          <small className="adm-field-hint">{T.passwordHint}</small>
        </label>
        {error ? <p className="adm-error" role="alert">{error}</p> : null}
        <div className="adm-actions">
          <button type="submit" className={`adm-btn ${change.killed ? 'adm-btn-danger' : 'adm-btn-primary'}`} disabled={busy}>
            {busy ? T.saving : change.killed ? T.turnOff : T.turnOn}
          </button>
          <button type="button" className="adm-btn" disabled={busy} onClick={onCancel}>{T.cancel}</button>
        </div>
      </form>
    </dialog>
  );
}
