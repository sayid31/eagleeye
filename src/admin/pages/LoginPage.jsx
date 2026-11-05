// src/admin/pages/LoginPage.jsx
/** Sign-in screen. The button is a plain link: Google's flow starts on the server. */
import { useSearchParams } from 'react-router';
import { loginErrorMessage } from '../adminSessionApi.js';

export function LoginPage({ configured = true, missing = [] }) {
  const [params] = useSearchParams();
  const error = loginErrorMessage(params.get('error'));
  return (
    <main className="adm-login">
      <section className="adm-card">
        <h1>EagleEye Admin</h1>
        <p>Sign in with the admin Google account.</p>
        {error ? <p className="adm-error" role="alert">{error}</p> : null}
        {configured ? (
          <a className="adm-btn adm-btn-primary" href="/api/admin/auth/login">Sign in with Google</a>
        ) : (
          <p className="adm-error" role="alert">Not configured. Missing: {missing.join(', ') || 'unknown'}.</p>
        )}
      </section>
    </main>
  );
}
