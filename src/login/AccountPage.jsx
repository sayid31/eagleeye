// src/login/AccountPage.jsx
/**
 * `/account`: display name, change password (or a note when Google manages
 * the account), sign out the other devices, sign out. Email and role are
 * read-only here.
 */
import { useEffect, useState } from 'react';
import { signOutAndLeave } from '../auth/authClientApi.js';
import { fetchSessionUser, revokeOtherSessions, updateDisplayName, MAX_NAME_LENGTH_CLIENT } from './accountApi.js';
import { Toast, useMe } from './accountHooks.js';
import { accountPageState, nameProblem, roleLabel } from './accountView.js';
import { ACCOUNT_COPY, LOGIN_COPY, PASSWORD_COPY } from './loginCopy.js';
import { PasswordChangeForm } from './PasswordChangeForm.jsx';

const TOAST_MS = 3200;
/** A request that never got an answer: logged, then shown as the action's own failure message. */
const asFailure = (action) => (failure) => {
  console.warn(`[account] ${action} request failed: ${failure.message}`);
  return { ok: false, code: 'NETWORK' };
};

export function AccountPage() {
  const me = useMe({ extra: fetchSessionUser });
  const [toast, setToast] = useState(null);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(null); // 'name' | 'revoke' | null
  const [nameError, setNameError] = useState(null);

  const state = me.status === 'ready' ? accountPageState(me.data, me.extra) : null;
  useEffect(() => { if (state?.view === 'redirect') window.location.replace(state.location); }, [state?.view, state?.location]);
  useEffect(() => { if (me.data?.user) setName(me.data.user.name ?? ''); }, [me.data]);
  useEffect(() => {
    if (!toast) return undefined;
    const timer = window.setTimeout(() => setToast(null), TOAST_MS);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const saveName = async (event) => {
    event.preventDefault();
    const problem = nameProblem(name);
    if (problem) { setNameError(problem); return; }
    setBusy('name');
    setNameError(null);
    const result = await updateDisplayName(name).catch(asFailure('update-user'));
    setBusy(null);
    if (result.ok) setToast({ text: ACCOUNT_COPY.nameSaved, tone: 'ok' });
    else setNameError(ACCOUNT_COPY.nameFailed);
  };

  const revoke = async () => {
    setBusy('revoke');
    const result = await revokeOtherSessions().catch(asFailure('revoke-other-sessions'));
    setBusy(null);
    setToast(result.ok ? { text: ACCOUNT_COPY.revoked, tone: 'ok' } : { text: ACCOUNT_COPY.revokeFailed, tone: 'error' });
  };

  const user = me.data?.user;
  return (
    <main className="adm-login account-page">
      <section className="adm-login-card login-card account-card">
        <header className="account-head">
          <img src="/logo.svg" alt="" width="36" height="36" />
          <h1>{ACCOUNT_COPY.title}</h1>
          {state?.view === 'account' ? <a className="adm-link account-back" href={state.home}>{ACCOUNT_COPY.back}</a> : null}
        </header>
        {me.status === 'loading' ? <p className="adm-muted">{ACCOUNT_COPY.loading}</p> : null}
        {me.status === 'error' ? <p className="login-alert login-alert-error" role="alert">{ACCOUNT_COPY.loadFailed}</p> : null}
        {state?.view === 'account' && user ? (
          <>
            <section className="account-section" aria-labelledby="account-profile">
              <h2 id="account-profile">{ACCOUNT_COPY.profile}</h2>
              <dl className="account-facts">
                <dt>{ACCOUNT_COPY.email}</dt><dd>{user.email}</dd>
                <dt>{ACCOUNT_COPY.role}</dt><dd>{roleLabel(user.role)}</dd>
              </dl>
              <p className="login-hint">{ACCOUNT_COPY.emailNote}</p>
              <form className="login-form" onSubmit={saveName} noValidate>
                <label className="login-field">
                  <span>{ACCOUNT_COPY.name}</span>
                  <input name="name" value={name} onChange={(event) => setName(event.target.value)} maxLength={MAX_NAME_LENGTH_CLIENT} autoComplete="name" disabled={busy === 'name'} required />
                </label>
                {nameError ? <p className="login-alert login-alert-error" role="alert">{nameError}</p> : null}
                <button type="submit" className="adm-btn" disabled={busy === 'name'} aria-busy={busy === 'name'}>{busy === 'name' ? ACCOUNT_COPY.savingName : ACCOUNT_COPY.saveName}</button>
              </form>
            </section>
            <section className="account-section" aria-labelledby="account-password">
              <h2 id="account-password">{ACCOUNT_COPY.passwordSection}</h2>
              {state.showPassword ? (
                <>
                  <p className="login-hint">{PASSWORD_COPY.otherDevices}</p>
                  <PasswordChangeForm identity={user} onChanged={() => setToast({ text: PASSWORD_COPY.success, tone: 'ok' })} />
                </>
              ) : <p className="adm-muted">{ACCOUNT_COPY.googleManaged}</p>}
            </section>
            <section className="account-section" aria-labelledby="account-sessions">
              <h2 id="account-sessions">{ACCOUNT_COPY.sessions}</h2>
              <p className="login-hint">{ACCOUNT_COPY.sessionsLead}</p>
              <div className="login-actions">
                <button type="button" className="adm-btn" onClick={revoke} disabled={busy === 'revoke'} aria-busy={busy === 'revoke'}>{busy === 'revoke' ? ACCOUNT_COPY.revoking : ACCOUNT_COPY.revokeOthers}</button>
                <button type="button" className="adm-btn" onClick={() => { void signOutAndLeave(); }}>{ACCOUNT_COPY.signOut}</button>
              </div>
            </section>
          </>
        ) : null}
        {state?.view === 'redirect' ? <p className="adm-muted">{LOGIN_COPY.checking}</p> : null}
      </section>
      {toast ? <Toast text={toast.text} tone={toast.tone} /> : null}
    </main>
  );
}
