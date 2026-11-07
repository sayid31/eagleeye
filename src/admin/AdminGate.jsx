// src/admin/AdminGate.jsx
/**
 * Asks the server who is logged in and shows the login page instead of the
 * dashboard when nobody is. This only decides what to RENDER; the real
 * protection is `requireAdminSession` on every /api/admin/* route.
 */
import { useEffect, useState } from 'react';
import { fetchSession } from './adminSessionApi.js';
import { LoginPage } from './pages/LoginPage.jsx';

export function AdminGate({ children }) {
  const [state, setState] = useState({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    fetchSession()
      .then((session) => { if (!cancelled) setState({ status: 'ready', session }); })
      .catch((error) => { if (!cancelled) setState({ status: 'error', message: error.message }); });
    return () => { cancelled = true; };
  }, []);

  if (state.status === 'loading') return <main className="adm-login"><p>Memeriksa sesi…</p></main>;
  if (state.status === 'error') return <main className="adm-login"><p className="adm-error" role="alert">{state.message}</p></main>;
  const { session } = state;
  if (!session.authenticated) return <LoginPage configured={session.configured} missing={session.missing} />;
  return children(session);
}
