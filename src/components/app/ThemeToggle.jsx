// src/components/app/ThemeToggle.jsx
/** Light / dark / system chooser (dropdown with radio items); the icon shows the theme currently painted. */
import { Monitor, Moon, Sun } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { THEME_COPY } from '@/copy/id/common';
import { useTheme } from '@/lib/theme';

/** The three radio items, reused by the account menu. */
export function ThemeRadioItems() {
  const { theme, setTheme } = useTheme();
  return (
    <DropdownMenuRadioGroup value={theme} onValueChange={setTheme}>
      <DropdownMenuRadioItem value="light"><Sun aria-hidden="true" />{THEME_COPY.light}</DropdownMenuRadioItem>
      <DropdownMenuRadioItem value="dark"><Moon aria-hidden="true" />{THEME_COPY.dark}</DropdownMenuRadioItem>
      <DropdownMenuRadioItem value="system"><Monitor aria-hidden="true" />{THEME_COPY.system}</DropdownMenuRadioItem>
    </DropdownMenuRadioGroup>
  );
}

/** @param {{variant?: 'ghost' | 'outline', className?: string}} props */
export function ThemeToggle({ variant = 'ghost', className }) {
  const { resolvedTheme } = useTheme();
  const Icon = resolvedTheme === 'dark' ? Moon : Sun;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant={variant} size="icon" className={className} aria-label={THEME_COPY.toggle}>
          <Icon aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end"><ThemeRadioItems /></DropdownMenuContent>
    </DropdownMenu>
  );
}
