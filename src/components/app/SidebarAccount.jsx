// src/components/app/SidebarAccount.jsx
/**
 * Foot of the sidebar, as visible items in the order the dashboard has always had: "Kembali ke peta", the link to the
 * other area (super_admin only), the signed-in account (email and role), then the theme control and "Keluar". Collapsed
 * to icons on desktop, the account text hides and the controls stack.
 */
import { ArrowLeft, LogOut, Shield } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem, useSidebar } from '@/components/ui/sidebar';
import { SHELL_COPY } from '@/copy/id/shell';
import { ThemeToggle } from './ThemeToggle.jsx';

function FootLink({ href, icon: Icon, children }) {
  const { isMobile, state } = useSidebar();
  // Same rule as the menu items: a tooltip only while collapsed to icons on desktop.
  const tooltip = !isMobile && state === 'collapsed' ? children : undefined;
  return (
    <SidebarMenuItem>
      <SidebarMenuButton asChild tooltip={tooltip}>
        <a href={href}><Icon aria-hidden="true" /><span>{children}</span></a>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

/**
 * @param {{user?: {email?: string, role?: string}, mapHref?: string, areaLink?: {href: string, label: string} | null,
 *   onSignOut: () => void}} props
 */
export function SidebarAccount({ user, mapHref = '/app', areaLink = null, onSignOut }) {
  const role = SHELL_COPY.roles[user?.role] ?? '';
  return (
    <>
      <SidebarMenu>
        <FootLink href={mapHref} icon={ArrowLeft}>{SHELL_COPY.openMap}</FootLink>
        {areaLink ? <FootLink href={areaLink.href} icon={Shield}>{areaLink.label}</FootLink> : null}
      </SidebarMenu>
      <div className="flex flex-col px-2 text-xs leading-tight group-data-[collapsible=icon]:hidden" data-account>
        <span className="text-muted-foreground">{SHELL_COPY.signedInAs}</span>
        <span className="truncate text-sm font-medium" title={user?.email}>{user?.email}</span>
        {role ? <span className="text-muted-foreground">{role}</span> : null}
      </div>
      <div className="flex items-center gap-2 px-2 group-data-[collapsible=icon]:flex-col group-data-[collapsible=icon]:px-0">
        <ThemeToggle variant="outline" />
        <Button variant="outline" size="sm" className="flex-1 group-data-[collapsible=icon]:size-8 group-data-[collapsible=icon]:flex-none group-data-[collapsible=icon]:p-0" onClick={onSignOut} aria-label={SHELL_COPY.signOut}>
          <LogOut aria-hidden="true" data-icon="inline-start" />
          <span className="group-data-[collapsible=icon]:hidden">{SHELL_COPY.signOut}</span>
        </Button>
      </div>
    </>
  );
}
