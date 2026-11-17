// src/login/LoginApp.jsx
/**
 * The `/login` page: email + password, plus "Masuk dengan Google" only on the
 * way to `/dev` (super_admin). It only decides what to RENDER; the server
 * guard and Better Auth hooks are the real protection. Phase 2 (W-B) polishes
 * it (share-link hash → next, forgot-password copy, states).
 */
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router';
import { GoogleLogo } from '../admin/GoogleLogo.jsx';
import { fetchMe, signInWithPassword, startGoogleSignIn } from '../auth/authClientApi.js';
import { afterSignInLocation, loginMessage, loginPageState, showGoogleButton, signInErrorText } from './loginView.js';

export function LoginApp() {
  const [params] = useSearchParams();
  const [state, setState] = useState({ view: 'loading', me: null });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    fetchMe()
      .then((me) => {
        const next = loginPageState(me, params);
        if (next.view === 'redirect') window.location.replace(next.location);
        else if (!cancelled) setState({ ...next, me });
      })
      .catch((failure) => {
        if (cancelled) return;
        setState({ view: 'sign-in', me: null });
        setError(`Sesi tidak bisa diperiksa: ${failure.message}`);
      });
    return () => { cancelled = true; };
  }, [params]);

  const submit = async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError(null);
    try {
      const result = await signInWithPassword({ email: String(form.get('email') ?? ''), password: String(form.get('password') ?? '') });
      if (!result.ok) { setError(signInErrorText(result.code)); setBusy(false); return; }
      window.location.replace(afterSignInLocation(params, await fetchMe()));
    } catch (failure) {
      setError(`Gagal masuk: ${failure.message}`);
      setBusy(false);
    }
  };

  const google = () => {
    setBusy(true);
    setError(null);
    startGoogleSignIn().catch((failure) => { setBusy(false); setError(failure.message); });
  };

  const message = loginMessage(params);
  return (
    <main className="adm-login">
      <section className="adm-login-card">
        <img className="adm-login-logo" src="/logo.svg" alt="" width="56" height="56" />
        <h1>EagleEye <span>View</span></h1>
        <p className="adm-login-lead">Masuk dengan akun yang dibuat admin.</p>
        {message ? <p className={message.tone === 'warn' ? 'login-notice' : 'adm-error'} role="alert">{message.text}</p> : null}
        {state.view === 'loading' ? <p className="adm-muted">Memeriksa sesi…</p> : null}
        {state.view === 'not-configured' ? <p className="adm-error" role="alert">Login belum dikonfigurasi. Jalankan <code>npm run doctor</code> di server.</p> : null}
        {state.view === 'sign-in' ? (
          <form className="login-form" onSubmit={submit}>
            <label>Email<input name="email" type="email" autoComplete="username" required disabled={busy} /></label>
            <label>Password<input name="password" type="password" autoComplete="current-password" required disabled={busy} /></label>
            <button type="submit" className="adm-btn adm-btn-primary" disabled={busy}>{busy ? 'Memproses…' : 'Masuk'}</button>
          </form>
        ) : null}
        {state.view === 'sign-in' && showGoogleButton(params, state.me) ? (
          <button type="button" className="adm-google-btn" onClick={google} disabled={busy}>
            <GoogleLogo />
            <span>Masuk dengan Google</span>
          </button>
        ) : null}
        {error ? <p className="adm-error" role="alert">{error}</p> : null}
        <p className="adm-login-note">Lupa password? Hubungi admin Anda.</p>
      </section>
    </main>
  );
}
