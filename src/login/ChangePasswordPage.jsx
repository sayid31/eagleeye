// src/login/ChangePasswordPage.jsx
/**
 * `/account/password`: change the password — required (the server pins every
 * page here) after an admin set or reset it. On success: a toast, then the
 * role's home.
 */
import { useEffect, useState } from 'react';
import { signOutAndLeave } from '../auth/authClientApi.js';
import { BRAND, LOGIN_COPY, PASSWORD_COPY } from './loginCopy.js';
import { PasswordChangeForm } from './PasswordChangeForm.jsx';
import { Toast, useMe } from './accountHooks.js';

/** How long the success toast stays before leaving for the home page. */
export const SUCCESS_REDIRECT_MS = 1400;

export function ChangePasswordPage() {
  const me = useMe();
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!done || !me.data) return undefined;
    const timer = window.setTimeout(() => window.location.replace(me.data.home || '/app'), SUCCESS_REDIRECT_MS);
    return () => window.clearTimeout(timer);
  }, [done, me.data]);

  const user = me.data?.user;
  const forced = Boolean(user?.mustChangePassword);
  return (
    <main className="adm-login">
      <section className="adm-login-card login-card">
        <img className="adm-login-logo" src="/logo.svg" alt="" width="48" height="48" />
        <h1>{PASSWORD_COPY.forcedTitle}</h1>
        {me.status === 'loading' ? <p className="adm-muted">{LOGIN_COPY.checking}</p> : null}
        {me.status === 'error' ? <p className="login-alert login-alert-error" role="alert">{LOGIN_COPY.sessionCheckFailed}</p> : null}
        {user ? (
          <>
            <p className="adm-login-lead">{forced ? PASSWORD_COPY.forcedLead : PASSWORD_COPY.voluntaryLead} {PASSWORD_COPY.otherDevices}</p>
            {done
              ? <p className="adm-muted">{PASSWORD_COPY.redirecting}</p>
              : <PasswordChangeForm identity={user} onChanged={() => setDone(true)} autoFocus />}
            <div className="login-actions">
              {forced ? null : <a className="adm-link" href="/account">{PASSWORD_COPY.backToAccount}</a>}
              <button type="button" className="adm-btn" onClick={() => { void signOutAndLeave(); }} disabled={done}>{PASSWORD_COPY.signOut}</button>
            </div>
          </>
        ) : null}
      </section>
      <p className="login-brand-foot">{BRAND.name} <span>{BRAND.accent}</span></p>
      {done ? <Toast text={PASSWORD_COPY.success} /> : null}
    </main>
  );
}
