// src/components/app/AppHeader.jsx
/** Top bar of the shell: sidebar trigger and breadcrumb (a labelled <nav>). Sticky, 56 px tall. */
import { Fragment } from 'react';
import { Link } from 'react-router';
import {
  Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { Separator } from '@/components/ui/separator';
import { SidebarTrigger } from '@/components/ui/sidebar';

/** @param {{crumbs: import('./navModel.js').Crumb[], badge?: string}} props */
export function AppHeader({ crumbs, badge }) {
  return (
    <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center gap-2 border-b bg-background px-4">
      <SidebarTrigger className="-ml-1" />
      <Separator orientation="vertical" className="mr-2 data-vertical:h-4 data-vertical:self-center" />
      <Breadcrumb className="min-w-0 flex-1">
        <BreadcrumbList className="flex-nowrap">
          {crumbs.map((crumb, index) => {
            const last = index === crumbs.length - 1;
            return (
              <Fragment key={`${crumb.label}-${index}`}>
                {index > 0 ? <BreadcrumbSeparator className="hidden sm:block" /> : null}
                <BreadcrumbItem className={last ? 'min-w-0' : 'hidden sm:inline-flex'}>
                  {last ? <BreadcrumbPage className="truncate">{crumb.label}</BreadcrumbPage>
                    : crumb.href ? <BreadcrumbLink asChild><Link to={crumb.href}>{crumb.label}</Link></BreadcrumbLink>
                      : <span className="text-muted-foreground">{crumb.label}</span>}
                </BreadcrumbItem>
              </Fragment>
            );
          })}
        </BreadcrumbList>
      </Breadcrumb>
      {badge ? <span className="hidden rounded-md bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground sm:inline">{badge}</span> : null}
    </header>
  );
}
