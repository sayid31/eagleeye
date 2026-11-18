// src/login/LoginApp.jsx
/**
 * The `/login` page: email + password, plus "Masuk dengan Google" only on the
 * way to `/dev` (super_admin) when Google is configured. It only decides what
 * to RENDER; the server guard and Better Auth hooks are the real protection.
 * A share link's hash (`/app#…` → `/login?next=/app#…`) is carried to `next`.
 */
import { useEffect, useState } from 'react';
import { ArrowLeft, CircleAlert } from 'lucide-react';
import { useSearchParams } from 'react-router';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { LOGIN_COPY } from '../copy/id/login.js';
import { fetchMe, signInWithPassword, startGoogleSignIn } from '../auth/authClientApi.js';
import { AuthLayout } from './AuthLayout.jsx';
import { BrandMark } from './BrandMark.jsx';
import { LoginForm } from './LoginForm.jsx';
import { afterSignInLocation, loginMessage, loginPageState, showGoogleButton, signInErrorText } from './loginView.js';

export function LoginApp() {
  const [params] = useSearchParams();
  const [state, setState] = useState({ view: 'loading', me: null });
  const [busy, setBusy] = useState(null); // 'password' | 'google' | null
  const [error, setError] = useState(null); // {code, text} of the last refusal
  const [startupError, setStartupError] = useState(null);

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
        setStartupError({ tone: 'error', text: LOGIN_COPY.sessionCheckFailed });
      });
    return () => { cancelled = true; };
  }, []);

  const submit = async ({ email, password }) => {
    setBusy('password');
    setError(null);
    let result;
    try {
      result = await signInWithPassword({ email, password });
      if (result.ok) {
        window.location.replace(afterSignInLocation(params, await fetchMe(), window.location.hash));
        return;
      }
    } catch (failure) {
      console.warn(`[login] sign-in request failed: ${failure.message}`);
      result = { ok: false, code: 'NETWORK' };
    }
    setError({ code: result.code, text: signInErrorText(result.code) });
    setBusy(null);
  };

  const google = () => {
    setBusy('google');
    setError(null);
    startGoogleSignIn().catch((failure) => {
      console.warn(`[login] ${failure.message}`);
      setBusy(null);
      setError({ code: 'GOOGLE_START', text: LOGIN_COPY.googleStartFailed });
    });
  };

  const signIn = state.view === 'sign-in';
  const withGoogle = signIn && showGoogleButton(params, state.me);
  return (
    <AuthLayout>
      <Card className="w-full max-w-sm gap-6 [--card-spacing:--spacing(6)] sm:[--card-spacing:--spacing(8)]" aria-busy={state.view === 'loading'}>
        <CardHeader className="items-center justify-items-center gap-3 text-center">
          <BrandMark className="mb-1 h-12 w-auto text-primary" />
          <h1 className="font-heading text-xl font-semibold tracking-tight">{LOGIN_COPY.title}</h1>
          {state.view !== 'not-configured' ? <p className="text-sm text-muted-foreground">{LOGIN_COPY.lead}</p> : null}
        </CardHeader>
        <CardContent>
          {state.view === 'loading' ? <FormSkeleton /> : null}
          {state.view === 'not-configured' ? <NotConfigured /> : null}
          {signIn ? <LoginForm message={loginMessage(params) ?? startupError} error={error} busy={busy} onSubmit={submit} onGoogle={withGoogle ? google : null} /> : null}
        </CardContent>
      </Card>
      <a href="/" className="inline-flex items-center gap-1.5 rounded-md text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
        <ArrowLeft aria-hidden="true" className="size-4" />{LOGIN_COPY.backHome}
      </a>
    </AuthLayout>
  );
}

/** Placeholder shaped like the form while `/api/me` answers; announces itself once. */
function FormSkeleton() {
  return (
    <div role="status" aria-live="polite" className="grid gap-4">
      <span className="sr-only">{LOGIN_COPY.checking}</span>
      <div aria-hidden="true" className="grid gap-4">
        <div className="grid gap-2"><Skeleton className="h-4 w-12" /><Skeleton className="h-10 w-full" /></div>
        <div className="grid gap-2"><Skeleton className="h-4 w-20" /><Skeleton className="h-10 w-full" /></div>
        <Skeleton className="h-10 w-full" />
      </div>
    </div>
  );
}

/** Login is switched off on this server: say why and who can fix it, with no form to fill. */
function NotConfigured() {
  return (
    <Alert variant="destructive">
      <CircleAlert aria-hidden="true" />
      <AlertTitle>{LOGIN_COPY.notConfiguredTitle}</AlertTitle>
      <AlertDescription>
        {LOGIN_COPY.notConfiguredBody} <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs text-foreground">{LOGIN_COPY.notConfiguredCommand}</code>.
      </AlertDescription>
    </Alert>
  );
}
