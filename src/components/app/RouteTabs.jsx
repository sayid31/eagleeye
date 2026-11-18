// src/components/app/RouteTabs.jsx
/**
 * Tabs whose panels are sub-routes (`/activity/login`, `/activity/audit`): the URL is the state, back/forward work.
 * `RouteTabs` (the parent route) only provides the tab model and the child route; the strip itself is rendered by the
 * page's `PageHeader` (`tabs={<RouteTabNav />}`) so it sits under the page title, not above the `<h1>`.
 */
import { createContext, useContext } from 'react';
import { Link, Outlet, useLocation } from 'react-router';
import { cn } from '@/lib/utils';
import { pathMatches } from './navModel.js';

const RouteTabsContext = createContext(null);

/**
 * @param {{label: string, tabs: Array<{id: string, label: string, path: string}>}} props `label` names the strip.
 */
export function RouteTabs({ label, tabs }) {
  return (
    <RouteTabsContext.Provider value={{ label, tabs }}>
      <Outlet />
    </RouteTabsContext.Provider>
  );
}

/**
 * The tab strip of the enclosing `RouteTabs`, rendered as a nav of links (role-less, `aria-current`), which is the
 * right semantics when each "tab" is its own page; arrow-key tab semantics are for in-page panels. Renders nothing
 * outside a `RouteTabs` route, so a page can pass it to `PageHeader` unconditionally.
 */
export function RouteTabNav() {
  const model = useContext(RouteTabsContext);
  const { pathname } = useLocation();
  if (!model) return null;
  return (
    <nav aria-label={model.label} className="-mb-px flex gap-1 overflow-x-auto border-b">
      {model.tabs.map((tab) => {
        const active = pathMatches(pathname, tab.path);
        return (
          <Link
            key={tab.id}
            to={tab.path}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'inline-flex min-h-9 items-center border-b-2 px-3 text-sm font-medium whitespace-nowrap transition-colors',
              active ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
