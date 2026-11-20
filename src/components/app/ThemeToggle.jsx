// src/components/app/ThemeToggle.jsx
/**
 * Light / dark chooser (dropdown with two radio items); the icon and the checked item show the theme currently painted.
 * No "System" item: first visit follows the OS on its own, and the first pick is stored and wins (see lib/themeCore.js).
 */
import { Moon, Sun } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { THEME_COPY } from '@/copy/en/common';
import { useTheme } from '@/lib/theme';
import { THEME_CHOICES } from '@/lib/themeCore';

const CHOICE_ICONS = { light: Sun, dark: Moon };

/** @param {{variant?: 'ghost' | 'outline', className?: string}} props */
export function ThemeToggle({ variant = 'ghost', className }) {
  const { resolvedTheme, setTheme } = useTheme();
  const Icon = resolvedTheme === 'dark' ? Moon : Sun;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant={variant} size="icon" className={className} aria-label={THEME_COPY.toggle}>
          <Icon aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {/* Checked item = what is painted, so an OS-derived first visit still shows its current theme as selected. */}
        <DropdownMenuRadioGroup value={resolvedTheme} onValueChange={setTheme}>
          {THEME_CHOICES.map((choice) => {
            const ChoiceIcon = CHOICE_ICONS[choice];
            return <DropdownMenuRadioItem key={choice} value={choice}><ChoiceIcon aria-hidden="true" />{THEME_COPY[choice]}</DropdownMenuRadioItem>;
          })}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
