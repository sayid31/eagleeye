// src/login/AuthLayout.jsx
/**
 * Page frame of the sign-in and forced-password pages: a top bar with only the theme toggle, and one centred
 * `<main>` (the focus fallback of every dialog, see useReturnFocus). No navigation: these pages are entered signed out
 * or pinned by the server.
 */
import { ThemeToggle } from '@/components/app/ThemeToggle.jsx';

/** @param {{children: import('react').ReactNode}} props */
export function AuthLayout({ children }) {
  return (
    <div className="flex min-h-svh flex-col bg-background">
      <header className="flex h-14 shrink-0 items-center justify-end px-4 sm:px-6">
        <ThemeToggle />
      </header>
      <main id="main-content" tabIndex={-1} className="flex flex-1 flex-col items-center justify-center gap-6 px-4 pt-4 pb-16 outline-none">
        {children}
      </main>
    </div>
  );
}
