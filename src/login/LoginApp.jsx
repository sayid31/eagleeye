// src/login/LoginApp.jsx
/**
 * The `/login` page shared by the map and `/admin`: one "Masuk dengan Google"
 * button, plus the not-configured, banned, session-ended and error states.
 * It only decides what to RENDER; the server guard is the real protection.
 */
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router';
import { GoogleLogo } from '../admin/GoogleLogo.jsx';
import { fetchMe, startGoogleSignIn } from '../auth/authClientApi.js';
import { loginMessage, loginPageState } from './loginView.js';

function NotConfigured({ missing, invalid }) {
  return (
    <div className="adm-error" role="alert">
      <p><b>Login belum dikonfigurasi.</b> Isi di <code>.env</code> lalu jalankan ulang server.</p>
      {missing.length ? <p>Belum diisi: {missing.join(', ')}</p> : null}
      {invalid.length ? <p>Tidak valid: {invalid.join(', ')}</p> : null}
    </div>
  );
}

export function LoginApp() {
  const [params] = useSearchParams();
  const [state, setState] = useState({ view: 'loading' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    fetchMe()
      .then((me) => {
        const next = loginPageState(me);
        if (next.view === 'redirect') window.location.replace(next.location);
        else if (!cancelled) setState(next);
      })
      .catch((failure) => {
        if (cancelled) return;
        setState({ view: 'sign-in' });
        setError(failure.message);
      });
    return () => { cancelled = true; };
  }, []);

  const signIn = () => {
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
        <p className="adm-login-lead">Masuk untuk membuka peta dan konsol.</p>
        {message ? <p className={message.tone === 'warn' ? 'login-notice' : 'adm-error'} role="alert">{message.text}</p> : null}
        {state.view === 'loading' ? <p className="adm-muted">Memeriksa sesi…</p> : null}
        {state.view === 'not-configured' ? <NotConfigured missing={state.missing} invalid={state.invalid} /> : null}
        {state.view === 'sign-in' ? (
          <button type="button" className="adm-google-btn" onClick={signIn} disabled={busy}>
            <GoogleLogo />
            <span>{busy ? 'Menghubungkan ke Google…' : 'Masuk dengan Google'}</span>
          </button>
        ) : null}
        {error ? <p className="adm-error" role="alert">Gagal memulai login: {error}</p> : null}
        <p className="adm-login-note">Akun baru menunggu persetujuan admin sebelum layer data dan suara aktif.</p>
      </section>
    </main>
  );
}
