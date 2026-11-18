// src/components/app/RouteTabs.jsx
/** Tabs whose panels are sub-routes (`/activity/login`, `/activity/audit`): the URL is the state, back/forward work. */
import { Link, Outlet, useLocation } from 'react-router';
import { cn } from '@/lib/utils';
import { pathMatches } from './navModel.js';

/**
 * Tab strip + the matching child route. Rendered as a nav of links (role-less, `aria-current`), which is the right
 * semantics when each "tab" is its own page; arrow-key tab semantics are for in-page panels.
 * @param {{label: string, tabs: Array<{id: string, label: string, path: string}>}} props `label` names the strip.
 */
export function RouteTabs({ label, tabs }) {
  const { pathname } = useLocation();
  return (
    <div className="flex flex-col gap-4">
      <nav aria-label={label} className="-mb-px flex gap-1 overflow-x-auto border-b">
        {tabs.map((tab) => {
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
      <Outlet />
    </div>
  );
}
