// src/login/LoginApp.jsx
/**
 * The `/login` page: email + password, plus "Masuk dengan Google" only on the
 * way to `/dev` (super_admin) when Google is configured. It only decides what
 * to RENDER; the server guard and Better Auth hooks are the real protection.
 * A share link's hash (`/app#…` → `/login?next=/app#…`) is carried to `next`.
 */
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router';
import { GoogleLogo } from '../admin/GoogleLogo.jsx';
import { fetchMe, signInWithPassword, startGoogleSignIn } from '../auth/authClientApi.js';
import { PASSWORD_MAX } from '../auth/passwordPolicy.mjs';
import { BRAND, LOGIN_COPY } from './loginCopy.js';
import { afterSignInLocation, loginMessage, loginPageState, showGoogleButton, signInErrorText } from './loginView.js';
import { PasswordInput } from './PasswordInput.jsx';

export function LoginApp() {
  const [params] = useSearchParams();
  const [state, setState] = useState({ view: 'loading', me: null });
  const [busy, setBusy] = useState(null); // 'password' | 'google' | null
  const [error, setError] = useState(null);
  const [forgotOpen, setForgotOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchMe()
      .then((me) => {
        const decided = loginPageState(me);
        if (decided.view === 'redirect') window.location.replace(decided.location);
        else if (!cancelled) setState({ ...decided, me });
      })
      .catch((failure) => {
        console.warn(`[login] /api/me failed: ${failure.message}`);
        if (cancelled) return;
        setState({ view: 'sign-in', me: null });
        setError(LOGIN_COPY.sessionCheckFailed);
      });
    return () => { cancelled = true; };
  }, []);

  const submit = async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy('password');
    setError(null);
    let result;
    try {
      result = await signInWithPassword({ email: String(form.get('email') ?? '').trim(), password: String(form.get('password') ?? '') });
      if (result.ok) {
        window.location.replace(afterSignInLocation(params, await fetchMe(), window.location.hash));
        return;
      }
    } catch (failure) {
      console.warn(`[login] sign-in request failed: ${failure.message}`);
      result = { ok: false, code: 'NETWORK' };
    }
    setError(signInErrorText(result.code));
    setBusy(null);
  };

  const google = () => {
    setBusy('google');
    setError(null);
    startGoogleSignIn().catch((failure) => {
      console.warn(`[login] ${failure.message}`);
      setBusy(null);
      setError(LOGIN_COPY.googleStartFailed);
    });
  };

  const message = loginMessage(params);
  const signIn = state.view === 'sign-in';
  const withGoogle = signIn && showGoogleButton(params, state.me);
  return (
    <main className="adm-login">
      <section className="adm-login-card login-card" aria-busy={state.view === 'loading'}>
        <img className="adm-login-logo" src="/logo.svg" alt="" width="56" height="56" />
        <h1>{BRAND.name} <span>{BRAND.accent}</span></h1>
        {state.view === 'not-configured' ? (
          <div className="login-alert login-alert-error" role="alert">
            <strong>{LOGIN_COPY.notConfiguredTitle}</strong>
            <p>{LOGIN_COPY.notConfiguredBody} <code>{LOGIN_COPY.notConfiguredCommand}</code>.</p>
          </div>
        ) : <p className="adm-login-lead">{LOGIN_COPY.lead}</p>}
        {message && state.view !== 'not-configured' ? <p className={`login-alert login-alert-${message.tone}`} role="alert">{message.text}</p> : null}
        {state.view === 'loading' ? <p className="adm-muted">{LOGIN_COPY.checking}</p> : null}
        {signIn ? (
          <form className="login-form" onSubmit={submit}>
            <label className="login-field">
              <span>{LOGIN_COPY.email}</span>
              <input name="email" type="email" autoComplete="username" inputMode="email" required autoFocus disabled={busy !== null} spellCheck={false} autoCapitalize="off" />
            </label>
            <PasswordInput label={LOGIN_COPY.password} name="password" autoComplete="current-password" disabled={busy !== null} maxLength={PASSWORD_MAX} />
            {error ? <p className="login-alert login-alert-error" role="alert">{error}</p> : null}
            <button type="submit" className="adm-btn adm-btn-primary login-submit" disabled={busy !== null} aria-busy={busy === 'password'}>
              {busy === 'password' ? LOGIN_COPY.submitting : LOGIN_COPY.submit}
            </button>
          </form>
        ) : null}
        {withGoogle ? (
          <>
            <p className="login-divider"><span>{LOGIN_COPY.divider}</span></p>
            <button type="button" className="adm-google-btn" onClick={google} disabled={busy !== null} aria-busy={busy === 'google'}>
              <GoogleLogo />
              <span>{busy === 'google' ? LOGIN_COPY.googleStarting : LOGIN_COPY.google}</span>
            </button>
          </>
        ) : null}
        {signIn ? (
          <div className="adm-login-note">
            <button type="button" className="login-linkish" aria-expanded={forgotOpen} aria-controls="login-forgot" onClick={() => setForgotOpen((open) => !open)}>
              {LOGIN_COPY.forgot}
            </button>
            {forgotOpen ? <p id="login-forgot" className="login-forgot" role="note">{LOGIN_COPY.forgotAnswer}</p> : null}
          </div>
        ) : null}
      </section>
    </main>
  );
}
