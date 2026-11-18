// src/components/app/AppProviders.jsx
/** Providers every React entry mounts once: theme, tooltips, and the global toast outlet (sonner). */
import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { ThemeProvider } from '@/lib/theme';

/** @param {{children: import('react').ReactNode}} props */
export function AppProviders({ children }) {
  return (
    <ThemeProvider>
      <TooltipProvider delayDuration={300}>
        {children}
        <Toaster position="bottom-right" />
      </TooltipProvider>
    </ThemeProvider>
  );
}
