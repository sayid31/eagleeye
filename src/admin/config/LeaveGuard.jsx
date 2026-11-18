// src/admin/config/LeaveGuard.jsx
/**
 * Warns before unsaved changes are lost. The admin router is not a data router (no `useBlocker`), so in-page link
 * clicks are caught in the capture phase and answered with a ConfirmDialog; closing or reloading the tab uses the
 * browser's own `beforeunload` prompt. The browser Back button is not intercepted.
 */
import { useEffect, useState } from 'react';
import { useHref, useNavigate } from 'react-router';
import { ConfirmDialog } from '@/components/app/ConfirmDialog.jsx';
import { SAVE_COPY } from '@/copy/id/config';
import { isLeavingClick } from './dirtyState.js';

/** @param {{dirty: boolean}} props */
export function LeaveGuard({ dirty }) {
  const navigate = useNavigate();
  const base = useHref('/').replace(/\/$/, '');
  const [target, setTarget] = useState(null);

  useEffect(() => {
    if (!dirty) return undefined;
    const onClick = (event) => {
      const anchor = event.target instanceof Element ? event.target.closest('a[href]') : null;
      if (!isLeavingClick(event, anchor, window.location.origin)) return;
      const url = new URL(anchor.getAttribute('href'), window.location.origin);
      if (url.pathname === window.location.pathname && url.search === window.location.search) return;
      event.preventDefault();
      event.stopPropagation();
      setTarget(url);
    };
    const onBeforeUnload = (event) => { event.preventDefault(); event.returnValue = ''; };
    document.addEventListener('click', onClick, true);
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => {
      document.removeEventListener('click', onClick, true);
      window.removeEventListener('beforeunload', onBeforeUnload);
    };
  }, [dirty]);

  const leave = () => {
    const url = target;
    setTarget(null);
    // Router paths exclude the basename (/dev); anything outside this area is a full navigation.
    if (url.pathname.startsWith(`${base}/`) || url.pathname === base) navigate({ pathname: url.pathname.slice(base.length) || '/', search: url.search, hash: url.hash });
    else window.location.assign(url.href);
  };

  return (
    <ConfirmDialog
      open={target !== null}
      onOpenChange={(open) => { if (!open) setTarget(null); }}
      title={SAVE_COPY.leave.title}
      impact={SAVE_COPY.leave.impact}
      actionLabel={SAVE_COPY.leave.action}
      cancelLabel={SAVE_COPY.leave.stay}
      destructive
      onConfirm={leave}
    />
  );
}
