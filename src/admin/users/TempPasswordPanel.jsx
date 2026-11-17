/**
 * One-time view of a temporary password after create / reset, with the
 * "Salin pesan" button: an Indonesian message (login URL from this page's
 * origin, email, password, must-change note) ready to paste into a chat.
 * The password lives only in this component's props; closing it drops it.
 */
import { useState } from 'react';
import { USERS_COPY } from './usersCopy.js';
import { handoverMessage } from './usersView.js';

export function TempPasswordPanel({ email, password, reset = false, onDone }) {
  const [copyState, setCopyState] = useState('');
  const message = handoverMessage({ origin: window.location.origin, email, password, reset });
  const copy = USERS_COPY.tempPassword;

  const copyMessage = async () => {
    try {
      await navigator.clipboard.writeText(message);
      setCopyState('ok');
    } catch (error) {
      // Clipboard can be blocked (permissions, http origin): the text stays selectable below.
      console.warn(`[admin-users] clipboard write refused: ${error?.name || 'unknown'}`);
      setCopyState('failed');
    }
  };

  return (
    <div className="usr-temp">
      <p className="adm-muted">{copy.lead}</p>
      <dl className="usr-temp-facts">
        <dt>{USERS_COPY.form.email}</dt><dd>{email}</dd>
        <dt>{copy.title}</dt><dd><code className="usr-temp-password" data-testid="temp-password">{password}</code></dd>
      </dl>
      <textarea className="adm-input usr-temp-message" readOnly rows={7} value={message} aria-label="Pesan untuk pemilik akun"
        onFocus={(event) => event.target.select()} />
      <div className="adm-actions">
        <button type="button" className="adm-btn adm-btn-primary" onClick={copyMessage}>{copy.copy}</button>
        <button type="button" className="adm-btn" onClick={onDone}>{copy.done}</button>
        {copyState === 'ok' ? <span className="adm-success" role="status">{copy.copied}</span> : null}
        {copyState === 'failed' ? <span className="adm-error" role="alert">{copy.copyFailed}</span> : null}
      </div>
    </div>
  );
}
