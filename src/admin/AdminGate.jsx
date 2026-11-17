// src/admin/AdminGate.jsx
/**
 * Asks the server who is signed in (`/api/me`, the shared login) and leaves
 * for `/login` or the map when this visitor may not see `/admin`. This only
 * decides what to RENDER; the real protection is the login guard in front of
 * every /api/admin/* route (src/auth/authPlugin.mjs).
 */
import { useEffect, useState } from 'react';
import { fetchMe } from '../auth/authClientApi.js';
import { adminGateDecision } from './adminGateDecision.js';

export function AdminGate({ children }) {
  const [state, setState] = useState({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    fetchMe()
      .then((me) => {
        const decision = adminGateDecision(me);
        if (decision.redirect) window.location.replace(decision.redirect);
        else if (!cancelled) setState({ status: 'ready', session: me });
      })
      .catch((error) => { if (!cancelled) setState({ status: 'error', message: error.message }); });
    return () => { cancelled = true; };
  }, []);

  if (state.status === 'loading') return <main className="adm-login"><p>Memeriksa sesi…</p></main>;
  if (state.status === 'error') return <main className="adm-login"><p className="adm-error" role="alert">{state.message}</p></main>;
  return children(state.session);
}
