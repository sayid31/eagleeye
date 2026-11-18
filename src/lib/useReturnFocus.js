// src/components/app/useReturnFocus.js
/**
 * Radix returns focus to a dialog's own <Trigger> on close and to nothing (the <body>) when the dialog is opened from
 * code, which is how every dialog here is opened (state in the page, no Trigger). This hook remembers what had focus
 * when the dialog opened and puts it back on close, falling back to <main> if that element is gone (e.g. its row was
 * deleted). Pass the result to `onCloseAutoFocus` of the dialog's Content.
 */
import { useCallback, useLayoutEffect, useRef } from 'react';

const MAIN_ID = 'main-content';

/**
 * @param {boolean} open Whether the dialog is open.
 * @returns {(event: Event) => void} `onCloseAutoFocus` handler.
 */
export function useReturnFocus(open) {
  const opener = useRef(null);
  // Layout effects run before Radix moves focus into the dialog (that happens in a passive effect), so the opener is still active.
  useLayoutEffect(() => {
    if (open) opener.current = document.activeElement;
  }, [open]);
  return useCallback((event) => {
    event.preventDefault();
    const target = opener.current;
    (target?.isConnected && target !== document.body ? target : document.getElementById(MAIN_ID))?.focus();
  }, []);
}
