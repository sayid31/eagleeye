// src/login/AccountPage.jsx
/**
 * `/account`: Profil (display name; email and role read-only) and Keamanan (change
 * password, or a note when Google manages the account; sign out the other devices)
 * as tabs; sign out is in the header. A forced password change is redirected away.
 */
import { useEffect } from 'react';
import { useSearchParams } from 'react-router';
import { ErrorState } from '@/components/app/ErrorState.jsx';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ACCOUNT_COPY } from '../copy/id/login.js';
import { AccountLayout } from './AccountLayout.jsx';
import { fetchSessionUser } from './accountApi.js';
import { useMe } from './accountHooks.js';
import { accountPageState, accountTab, backLinkFor } from './accountView.js';
import { ProfileCard } from './ProfileCard.jsx';
import { SecurityPanel } from './SecurityPanel.jsx';

export function AccountPage() {
  const me = useMe({ extra: fetchSessionUser });
  const [params, setParams] = useSearchParams();
  const state = me.status === 'ready' ? accountPageState(me.data, me.extra) : null;
  useEffect(() => { if (state?.view === 'redirect') window.location.replace(state.location); }, [state?.view, state?.location]);

  const user = me.data?.user;
  const ready = state?.view === 'account' && user;
  return (
    <AccountLayout title={ACCOUNT_COPY.title} description={ACCOUNT_COPY.description} back={ready ? backLinkFor(state.home) : null}>
      {me.status === 'error' ? <ErrorState title={ACCOUNT_COPY.loadFailedTitle} message={ACCOUNT_COPY.loadFailed} onRetry={me.reload} /> : null}
      {me.status === 'loading' || state?.view === 'redirect' ? <AccountSkeleton /> : null}
      {ready ? (
        <Tabs value={accountTab(params)} onValueChange={(tab) => setParams({ tab }, { replace: true })} className="gap-6">
          <TabsList aria-label={ACCOUNT_COPY.tabsLabel} className="w-full sm:w-fit">
            <TabsTrigger value="profile" className="sm:px-4">{ACCOUNT_COPY.tabProfile}</TabsTrigger>
            <TabsTrigger value="security" className="sm:px-4">{ACCOUNT_COPY.tabSecurity}</TabsTrigger>
          </TabsList>
          <TabsContent value="profile"><ProfileCard user={user} /></TabsContent>
          <TabsContent value="security"><SecurityPanel user={user} showPassword={state.showPassword} /></TabsContent>
        </Tabs>
      ) : null}
    </AccountLayout>
  );
}

/** Tabs and a profile card in outline while the account loads; announced once. */
function AccountSkeleton() {
  return (
    <div role="status" aria-busy="true" aria-live="polite" className="grid gap-6">
      <span className="sr-only">{ACCOUNT_COPY.loading}</span>
      <div aria-hidden="true" className="grid gap-6">
        <Skeleton className="h-8 w-full sm:w-52" />
        <div className="grid gap-6 rounded-xl p-6 ring-1 ring-foreground/10">
          <div className="grid gap-2"><Skeleton className="h-5 w-24" /><Skeleton className="h-4 w-56 max-w-full" /></div>
          <div className="flex items-center gap-4"><Skeleton className="size-12 rounded-full" /><div className="grid flex-1 gap-2"><Skeleton className="h-4 w-40" /><Skeleton className="h-4 w-52 max-w-full" /></div></div>
          <div className="grid gap-2"><Skeleton className="h-4 w-28" /><Skeleton className="h-10 w-full" /></div>
          <div className="grid gap-2"><Skeleton className="h-4 w-16" /><Skeleton className="h-10 w-full" /></div>
        </div>
      </div>
    </div>
  );
}
