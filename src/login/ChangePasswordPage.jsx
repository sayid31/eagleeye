// src/login/ChangePasswordPage.jsx
/**
 * `/account/password`: change the password — required (the server pins every
 * page here) after an admin set or reset it. In that forced mode there is no
 * navigation, only an explanation and "Keluar". On success: a toast, then the
 * role's home.
 */
import { useEffect, useState } from 'react';
import { CircleCheck, KeyRound } from 'lucide-react';
import { toast } from 'sonner';
import { ErrorState } from '@/components/app/ErrorState.jsx';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { homeFor } from '../auth/authRoles.mjs';
import { ACCOUNT_COPY, LOGIN_COPY, PASSWORD_COPY } from '../copy/id/login.js';
import { AccountLayout } from './AccountLayout.jsx';
import { useMe } from './accountHooks.js';
import { backLinkFor } from './accountView.js';
import { PasswordChangeForm } from './PasswordChangeForm.jsx';

/** How long the success state stays before leaving for the home page. */
export const SUCCESS_REDIRECT_MS = 1400;

export function ChangePasswordPage() {
  const me = useMe();
  const [done, setDone] = useState(false);
  const user = me.data?.user;
  const forced = Boolean(user?.mustChangePassword);
  const home = me.data?.home || homeFor(user?.role);

  useEffect(() => {
    if (!done || !me.data) return undefined;
    const timer = window.setTimeout(() => window.location.replace(home), SUCCESS_REDIRECT_MS);
    return () => window.clearTimeout(timer);
  }, [done, me.data, home]);

  const changed = () => { toast.success(PASSWORD_COPY.success); setDone(true); };
  return (
    <AccountLayout title={PASSWORD_COPY.title} description={user ? (forced ? PASSWORD_COPY.forcedLead : PASSWORD_COPY.voluntaryLead) : undefined}
      back={user && !forced ? backLinkFor(home) : null}>
      {me.status === 'error' ? <ErrorState message={LOGIN_COPY.sessionCheckFailed} title={ACCOUNT_COPY.loadFailedTitle} onRetry={me.reload} /> : null}
      {me.status === 'loading' ? <FormSkeleton /> : null}
      {user ? (
        <div className="grid gap-6">
          {forced && !done ? (
            <Alert>
              <KeyRound aria-hidden="true" />
              <AlertTitle>{PASSWORD_COPY.forcedAlertTitle}</AlertTitle>
              <AlertDescription>{PASSWORD_COPY.forcedAlertBody}</AlertDescription>
            </Alert>
          ) : null}
          <Card className="[--card-spacing:--spacing(6)]">
            <CardContent>
              {done ? (
                <p role="status" className="flex items-center gap-2 text-sm font-medium">
                  <CircleCheck aria-hidden="true" className="size-5 text-success" />{PASSWORD_COPY.success} {PASSWORD_COPY.redirecting}
                </p>
              ) : <PasswordChangeForm identity={user} onChanged={changed} autoFocus />}
            </CardContent>
          </Card>
          {done ? null : <p className="text-sm text-muted-foreground">{PASSWORD_COPY.otherDevices}</p>}
        </div>
      ) : null}
    </AccountLayout>
  );
}

/** Form-shaped placeholder while the session loads; announced once. */
function FormSkeleton() {
  return (
    <div role="status" aria-busy="true" aria-live="polite" className="grid gap-6">
      <span className="sr-only">{ACCOUNT_COPY.loading}</span>
      <div aria-hidden="true" className="grid gap-5 rounded-xl p-6 ring-1 ring-foreground/10">
        {[0, 1, 2].map((key) => <div key={key} className="grid gap-2"><Skeleton className="h-4 w-28" /><Skeleton className="h-10 w-full" /></div>)}
        <Skeleton className="h-10 w-full sm:w-36" />
      </div>
    </div>
  );
}
