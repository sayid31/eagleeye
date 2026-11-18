// src/components/app/AppShell.jsx
/**
 * Application frame of /admin and /dev: skip link, sidebar, header with breadcrumb, and the one `<main id>` landmark.
 * Pure presentation over a nav model (navModel.js) and a signed-in user; the admin layer feeds it (AdminLayout.jsx).
 * Moves focus to <main> after in-app navigation so keyboard and screen-reader users land on the new page.
 */
import { useEffect, useRef, useState } from 'react';
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';
import { SHELL_COPY } from '@/copy/id/shell';
import { readSidebarOpen } from '@/lib/sidebarState';
import { AppHeader } from './AppHeader.jsx';
import { AppSidebar } from './AppSidebar.jsx';
import { PageTitleProvider } from './PageTitleContext.jsx';
import { breadcrumbTrail, navTitleFor } from './navModel.js';
import { documentTitle } from './pageTitle.js';

export const MAIN_ID = 'main-content';

/**
 * @param {{
 *   area: string, brand: {name: string, badge?: string}, groups: import('./navModel.js').NavGroup[], pathname: string,
 *   user?: object, areaLink?: {href: string, label: string} | null, onSignOut: () => void, children: import('react').ReactNode,
 * }} props `pathname` is the router path without basename (it selects the active item and the breadcrumb).
 */
export function AppShell({ area, brand, groups, pathname, user, areaLink = null, onSignOut, children }) {
  const [override, setOverride] = useState(null);
  const mainRef = useRef(null);
  const firstPath = useRef(pathname);
  const crumbs = breadcrumbTrail(groups, pathname);
  const title = override ?? navTitleFor(groups, pathname) ?? SHELL_COPY.notFoundTitle;

  useEffect(() => { document.title = documentTitle(title); }, [title]);
  useEffect(() => {
    if (pathname === firstPath.current) return;
    firstPath.current = pathname;
    mainRef.current?.focus({ preventScroll: true });
  }, [pathname]);

  return (
    <PageTitleProvider value={setOverride}>
      <a
        href={`#${MAIN_ID}`}
        className="sr-only z-50 rounded-md bg-background px-3 py-2 text-sm font-medium text-foreground ring-2 ring-ring focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
        onClick={(event) => { event.preventDefault(); mainRef.current?.focus(); }}
      >
        {SHELL_COPY.skipToContent}
      </a>
      <SidebarProvider defaultOpen={readSidebarOpen()}>
        <AppSidebar brand={brand} area={area} groups={groups} pathname={pathname} user={user} areaLink={areaLink} onSignOut={onSignOut} />
        <SidebarInset className="min-w-0">
          <AppHeader crumbs={crumbs} badge={brand.badge} />
          <main id={MAIN_ID} ref={mainRef} tabIndex={-1} className="mx-auto w-full max-w-6xl flex-1 p-4 outline-none md:p-6 lg:p-8">
            {children}
          </main>
        </SidebarInset>
      </SidebarProvider>
    </PageTitleProvider>
  );
}
