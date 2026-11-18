// src/login/AccountLayout.jsx
/**
 * Focused frame of `/account` and `/account/password`: a slim header (mark, way back, theme, sign out) instead of the
 * admin sidebar, then the page's single <h1> (PageHeader) and its content. With no `back` (the forced password
 * change) there is no way out except signing out: the server pins every other page here anyway.
 */
import { useCallback, useState } from 'react';
import { ArrowLeft, LogOut } from 'lucide-react';
import { PageHeader } from '@/components/app/PageHeader.jsx';
import { PageTitleProvider } from '@/components/app/PageTitleContext.jsx';
import { documentTitle } from '@/components/app/pageTitle.js';
import { ThemeToggle } from '@/components/app/ThemeToggle.jsx';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { APP_NAME } from '@/copy/en/common.js';
import { ACCOUNT_COPY } from '../copy/en/login.js';
import { signOutAndLeave } from '../auth/authClientApi.js';
import { BrandMark } from './BrandMark.jsx';

/**
 * @param {{title: string, description?: string, back?: {href: string, label: string} | null,
 *   children: import('react').ReactNode}} props
 */
export function AccountLayout({ title, description, back = null, children }) {
  const [leaving, setLeaving] = useState(false);
  // PageHeader reports the title through the context; null (unmount) falls back to the page's own title.
  const setTitle = useCallback((page) => { document.title = documentTitle(page ?? title); }, [title]);
  const signOut = () => { setLeaving(true); void signOutAndLeave(); };
  return (
    <PageTitleProvider value={setTitle}>
      <div className="flex min-h-svh flex-col bg-background">
        <header className="sticky top-0 z-20 border-b bg-background">
          <div className="mx-auto flex h-14 w-full max-w-3xl items-center gap-2 px-4 sm:px-6">
            <span className="flex items-center gap-2">
              <BrandMark className="h-7 w-auto text-primary" />
              <span className="hidden text-sm font-semibold sm:inline">{APP_NAME}</span>
            </span>
            <div className="ml-auto flex items-center gap-1">
              {back ? (
                <Button variant="ghost" size="sm" asChild>
                  <a href={back.href}>
                    <ArrowLeft aria-hidden="true" />
                    <span className="sm:hidden">{ACCOUNT_COPY.back}</span>
                    <span className="hidden sm:inline">{back.label}</span>
                  </a>
                </Button>
              ) : null}
              <ThemeToggle />
              <Button variant="ghost" size="sm" onClick={signOut} disabled={leaving}>
                {leaving ? <Spinner aria-hidden="true" data-icon="inline-start" /> : <LogOut aria-hidden="true" />}
                <span className="sr-only sm:not-sr-only">{leaving ? ACCOUNT_COPY.signingOut : ACCOUNT_COPY.signOut}</span>
              </Button>
            </div>
          </div>
        </header>
        <main id="main-content" tabIndex={-1} className="mx-auto w-full max-w-3xl flex-1 px-4 py-8 outline-none sm:px-6 sm:py-10">
          <PageHeader title={title} description={description} />
          {children}
        </main>
      </div>
    </PageTitleProvider>
  );
}
