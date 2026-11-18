// src/components/app/PageTitleContext.jsx
/**
 * Lets PageHeader set the document title without fighting AppShell, which sets a default from the menu on every route
 * change (a child's effect runs before its parent's, so a plain `document.title =` in both would be overwritten).
 */
import { createContext, useContext } from 'react';

const noop = () => {};
const PageTitleContext = createContext(noop);

export const PageTitleProvider = PageTitleContext.Provider;

/** @returns {(title: string | null) => void} Setter of the page title override (null clears it). */
export function usePageTitleSetter() {
  return useContext(PageTitleContext);
}
