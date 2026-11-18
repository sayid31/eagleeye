// src/lib/theme.jsx
/** React side of the theme: ThemeProvider + useTheme (preference, resolved theme, setter) over src/lib/themeCore.js. */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  DARK_MEDIA_QUERY, THEME_STORAGE_KEY, applyTheme, normalizePreference, readStoredPreference, resolveTheme, writeStoredPreference,
} from './themeCore.js';

const ThemeContext = createContext(null);

const browserStorage = () => (typeof window === 'undefined' ? null : window.localStorage);
const osPrefersDark = () => typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(DARK_MEDIA_QUERY).matches;

/**
 * Provides the theme to the tree and keeps `<html class="dark">` in step with the preference and the OS setting.
 * @param {{children: import('react').ReactNode}} props
 */
export function ThemeProvider({ children }) {
  const [preference, setPreferenceState] = useState(() => readStoredPreference(browserStorage()));
  const [prefersDark, setPrefersDark] = useState(osPrefersDark);

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return undefined;
    const query = window.matchMedia(DARK_MEDIA_QUERY);
    const onChange = () => setPrefersDark(query.matches);
    onChange();
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);

  useEffect(() => {
    // Another tab changed the choice: follow it.
    const onStorage = (event) => {
      if (event.key === THEME_STORAGE_KEY || event.key === null) setPreferenceState(readStoredPreference(browserStorage()));
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const resolvedTheme = resolveTheme(preference, prefersDark);
  useEffect(() => { applyTheme(document.documentElement, resolvedTheme); }, [resolvedTheme]);

  const setTheme = useCallback((next) => {
    const normalized = normalizePreference(next);
    setPreferenceState(normalized);
    writeStoredPreference(browserStorage(), normalized);
  }, []);

  const value = useMemo(() => ({ theme: preference, resolvedTheme, setTheme }), [preference, resolvedTheme, setTheme]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

/**
 * @returns {{theme: 'light' | 'dark' | 'system', resolvedTheme: 'light' | 'dark', setTheme: (next: string) => void}}
 */
export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useTheme must be used inside <ThemeProvider>');
  return context;
}
