// src/components/app/useCopyToClipboard.js
/** Hook behind CopyField: `copy(text)` → status `copied` for a moment, or `failed`. Never logs the text. */
import { useCallback, useEffect, useRef, useState } from 'react';
import { copyToClipboard } from '../../lib/clipboard.js';

/** How long the "Tersalin" confirmation stays before the button returns to "Salin". */
export const COPIED_RESET_MS = 2000;

/** @returns {{status: 'idle' | 'copied' | 'failed', copy: (text: string) => Promise<boolean>}} */
export function useCopyToClipboard() {
  const [status, setStatus] = useState('idle');
  const timer = useRef(null);
  useEffect(() => () => clearTimeout(timer.current), []);
  const copy = useCallback(async (text) => {
    const ok = await copyToClipboard(text);
    setStatus(ok ? 'copied' : 'failed');
    clearTimeout(timer.current);
    if (ok) timer.current = setTimeout(() => setStatus('idle'), COPIED_RESET_MS);
    return ok;
  }, []);
  return { status, copy };
}
