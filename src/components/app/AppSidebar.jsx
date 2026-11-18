// src/components/app/AppSidebar.jsx
/** Sidebar of the shell: brand, menu (titled groups are labelled sub-lists; collapsible to icons on desktop, a Sheet with every item on mobile), account foot. */
import { Link } from 'react-router';
import { Badge } from '@/components/ui/badge';
import {
  Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent, SidebarGroupLabel, SidebarHeader, SidebarMenu, SidebarMenuButton,
  SidebarMenuItem, SidebarRail, useSidebar,
} from '@/components/ui/sidebar';
import { SHELL_COPY } from '@/copy/id/shell';
import { SidebarAccount } from './SidebarAccount.jsx';
import { navIcon } from './navIcons.js';
import { pathMatches } from './navModel.js';

function MenuItem({ item, pathname }) {
  const { isMobile, setOpenMobile, state } = useSidebar();
  // A tooltip exists only while the desktop sidebar is collapsed to icons: a hidden-but-open tooltip would swallow the first Esc inside the mobile sheet.
  const tooltip = !isMobile && state === 'collapsed' ? item.label : undefined;
  const Icon = navIcon(item.icon ?? item.id);
  const active = pathMatches(pathname, item.path);
  return (
    <SidebarMenuItem>
      <SidebarMenuButton asChild isActive={active} tooltip={tooltip}>
        <Link to={item.path} aria-current={active ? 'page' : undefined} onClick={() => { if (isMobile) setOpenMobile(false); }}>
          <Icon aria-hidden="true" />
          <span>{item.label}</span>
        </Link>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

/**
 * @param {{brand: {name: string, badge?: string}, area: string, groups: import('./navModel.js').NavGroup[], pathname: string,
 *   user?: object, areaLink?: {href: string, label: string} | null, onSignOut: () => void}} props
 */
export function AppSidebar({ brand, area, groups, pathname, user, areaLink, onSignOut }) {
  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <div className="flex items-center gap-2 p-2">
          <img src="/logo.svg" alt="" width="20" height="36" className="h-8 w-auto shrink-0" />
          <span className="grid flex-1 text-left leading-tight group-data-[collapsible=icon]:hidden">
            <span className="truncate font-semibold">{brand.name}</span>
            {brand.badge ? <Badge variant="secondary" className="mt-0.5 w-fit">{brand.badge}</Badge> : null}
          </span>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <nav aria-label={SHELL_COPY.sidebarLabel(SHELL_COPY.areas[area] ?? area)} className="flex flex-col gap-2">
          {groups.map((group) => (
            <SidebarGroup key={group.id}>
              {group.title ? <SidebarGroupLabel>{group.title}</SidebarGroupLabel> : null}
              <SidebarGroupContent>
                <SidebarMenu>{group.items.filter((item) => !item.hidden).map((item) => <MenuItem key={item.id} item={item} pathname={pathname} />)}</SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          ))}
        </nav>
      </SidebarContent>
      <SidebarFooter><SidebarAccount user={user} areaLink={areaLink} onSignOut={onSignOut} /></SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
