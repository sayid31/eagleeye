// src/components/app/UserMenu.jsx
/** Account menu in the sidebar footer: initials avatar, email + role, theme, map link, other area, sign out. */
import { ChevronsUpDown, LogOut, Map as MapIcon, Palette, Shield } from 'lucide-react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuSub, DropdownMenuSubContent,
  DropdownMenuSubTrigger, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem, useSidebar } from '@/components/ui/sidebar';
import { THEME_COPY } from '@/copy/en/common';
import { SHELL_COPY } from '@/copy/en/shell';
import { ThemeRadioItems } from './ThemeToggle.jsx';
import { initialsFor } from './navModel.js';

/**
 * @param {{user?: {name?: string, email?: string, role?: string}, mapHref?: string, areaLink?: {href: string, label: string} | null,
 *   onSignOut: () => void}} props
 */
export function UserMenu({ user, mapHref = '/app', areaLink = null, onSignOut }) {
  const { isMobile } = useSidebar();
  const role = SHELL_COPY.roles[user?.role] ?? '';
  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton size="lg" data-account-menu className="data-[state=open]:bg-sidebar-accent">
              <Avatar><AvatarFallback>{initialsFor(user)}</AvatarFallback></Avatar>
              <span className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-medium" title={user?.email}><span className="sr-only">{SHELL_COPY.accountMenu}: </span>{user?.email}</span>
                <span className="truncate text-xs text-muted-foreground">{role}</span>
              </span>
              <ChevronsUpDown aria-hidden="true" className="ml-auto size-4" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent side={isMobile ? 'top' : 'right'} align="end" className="min-w-56">
            <DropdownMenuLabel className="font-normal">
              <span className="block text-xs text-muted-foreground">{SHELL_COPY.signedInAs}</span>
              <span className="block truncate text-sm font-medium">{user?.email}</span>
              {role ? <span className="block text-xs text-muted-foreground">{role}</span> : null}
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuSub>
              <DropdownMenuSubTrigger><Palette aria-hidden="true" />{THEME_COPY.toggle}</DropdownMenuSubTrigger>
              <DropdownMenuSubContent><ThemeRadioItems /></DropdownMenuSubContent>
            </DropdownMenuSub>
            <DropdownMenuItem asChild><a href={mapHref}><MapIcon aria-hidden="true" />{SHELL_COPY.openMap}</a></DropdownMenuItem>
            {areaLink ? <DropdownMenuItem asChild><a href={areaLink.href}><Shield aria-hidden="true" />{areaLink.label}</a></DropdownMenuItem> : null}
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={onSignOut}><LogOut aria-hidden="true" />{SHELL_COPY.signOut}</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
