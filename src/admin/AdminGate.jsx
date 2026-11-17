// src/admin/AdminGate.jsx
/**
 * Asks the server who is signed in (`/api/me` v2) and leaves for `/login`,
 * the password change, or the visitor's own home when this area (`/admin` or
 * `/dev`) is not theirs. This only decides what to RENDER; the real protection
 * is the server guard in front of every page and /api/admin/* route.
 */
import { useEffect, useState } from 'react';
import { fetchMe } from '../auth/authClientApi.js';
import { adminGateDecision } from './adminGateDecision.js';

/** Renders `children(session)` once the signed-in visitor may see this area. */
export function AdminGate({ children }) {
  const [state, setState] = useState({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    fetchMe()
      .then((me) => {
        const decision = adminGateDecision(me, { pathname: window.location.pathname, search: window.location.search });
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
