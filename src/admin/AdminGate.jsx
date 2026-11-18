// src/admin/AdminGate.jsx
/**
 * Asks the server who is signed in (`/api/me` v2) and leaves for `/login`,
 * the password change, or the visitor's own home when this area (`/admin` or
 * `/dev`) is not theirs. This only decides what to RENDER; the real protection
 * is the server guard in front of every page and /api/admin/* route.
 */
import { useCallback, useEffect, useState } from 'react';
import { ErrorState } from '@/components/app/ErrorState.jsx';
import { LoadingState } from '@/components/app/LoadingState.jsx';
import { SHELL_COPY } from '@/copy/en/shell';
import { fetchMe } from '../auth/authClientApi.js';
import { adminGateDecision } from './adminGateDecision.js';

/** Renders `children(session)` once the signed-in visitor may see this area. */
export function AdminGate({ children }) {
  const [state, setState] = useState({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => { setState({ status: 'loading' }); setAttempt((n) => n + 1); }, []);

  useEffect(() => {
    let cancelled = false;
    fetchMe()
      .then((me) => {
        const decision = adminGateDecision(me, { pathname: window.location.pathname, search: window.location.search });
        if (decision.redirect) window.location.replace(decision.redirect);
        else if (!cancelled) setState({ status: 'ready', session: me });
      })
      .catch((error) => { if (!cancelled) setState({ status: 'error', error }); });
    return () => { cancelled = true; };
  }, [attempt]);

  if (state.status === 'loading') return <main className="mx-auto max-w-md p-8"><LoadingState variant="form" label={SHELL_COPY.checkingSession} /></main>;
  if (state.status === 'error') return <main className="mx-auto max-w-md p-8"><ErrorState title={SHELL_COPY.sessionFailedTitle} error={state.error} onRetry={retry} /></main>;
  return children(state.session);
}
