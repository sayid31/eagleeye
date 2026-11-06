// src/admin/pages/LoginPage.jsx
/** Sign-in screen. The button is a plain link: Google's flow starts on the server. */
import { useSearchParams } from 'react-router';
import { GoogleLogo } from '../GoogleLogo.jsx';
import { loginErrorMessage } from '../adminSessionApi.js';

export function LoginPage({ configured = true, missing = [] }) {
  const [params] = useSearchParams();
  const error = loginErrorMessage(params.get('error'));
  return (
    <main className="adm-login">
      <section className="adm-login-card">
        <img className="adm-login-logo" src="/logo.svg" alt="" width="56" height="56" />
        <h1>EagleEye <span>Admin</span></h1>
        <p className="adm-login-lead">Sign in to manage logs, AI settings and API keys.</p>
        {error ? <p className="adm-error" role="alert">{error}</p> : null}
        {configured ? (
          <a className="adm-google-btn" href="/api/admin/auth/login">
            <GoogleLogo />
            <span>Sign in with Google</span>
          </a>
        ) : (
          <p className="adm-error" role="alert">Not configured. Missing: {missing.join(', ') || 'unknown'}.</p>
        )}
        <p className="adm-login-note">Only the administrator account can sign in.</p>
      </section>
    </main>
  );
}
