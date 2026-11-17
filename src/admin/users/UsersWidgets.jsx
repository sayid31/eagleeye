/**
 * Building blocks of the Pengguna / Log Login / Audit pages: a modal dialog
 * (native <dialog>: focus trap + Esc for free), a busy/error wrapper for one
 * API call, the pager, and the loading / error / empty states.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { USERS_COPY } from './usersCopy.js';
import { pageInfo } from './usersView.js';

/** Modal dialog; `onClose` runs on Esc and on the close button. */
export function Dialog({ title, onClose, children, wide = false }) {
  const ref = useRef(null);
  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
    return () => { if (dialog?.open) dialog.close(); };
  }, []);
  return (
    <dialog ref={ref} className={`usr-dialog${wide ? ' usr-dialog-wide' : ''}`} aria-label={title}
      onCancel={(event) => { event.preventDefault(); onClose(); }}>
      <header className="usr-dialog-head">
        <h2>{title}</h2>
        <button type="button" className="adm-btn usr-dialog-x" aria-label={USERS_COPY.form.close} onClick={onClose}>×</button>
      </header>
      {children}
    </dialog>
  );
}

/**
 * One API call at a time with its busy flag and Indonesian error.
 * @returns {{busy: boolean, error: string, run: (call: () => Promise<any>) => Promise<any | undefined>, clear: () => void}}
 */
export function useAction() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const run = useCallback(async (call) => {
    setBusy(true);
    setError('');
    try {
      return await call();
    } catch (failure) {
      setError(failure.message);
      return undefined;
    } finally {
      setBusy(false);
    }
  }, []);
  return { busy, error, run, clear: () => setError('') };
}

/** Error line under a form. */
export function FormError({ message }) {
  return message ? <p className="adm-error" role="alert">{message}</p> : null;
}

/** Cancel + submit row of a dialog form. */
export function DialogButtons({ busy, submitLabel, onCancel, danger = false, disabled = false }) {
  return (
    <div className="adm-actions usr-dialog-actions">
      <button type="button" className="adm-btn" onClick={onCancel} disabled={busy}>{USERS_COPY.form.cancel}</button>
      <button type="submit" className={`adm-btn ${danger ? 'adm-btn-danger' : 'adm-btn-primary'}`} disabled={busy || disabled}>
        {busy ? USERS_COPY.form.saving : submitLabel}
      </button>
    </div>
  );
}

/** "21–40 dari 45" with previous/next buttons; hidden when everything fits on one page. */
export function Pager({ page, onOffset, busy }) {
  if (!page || page.total <= page.limit) return null;
  const info = pageInfo(page);
  return (
    <nav className="adm-actions usr-pager" aria-label="Halaman">
      <button type="button" className="adm-btn" disabled={busy || info.prevOffset === null} onClick={() => onOffset(info.prevOffset)}>{USERS_COPY.pager.prev}</button>
      <span className="adm-muted">{info.label}</span>
      <button type="button" className="adm-btn" disabled={busy || info.nextOffset === null} onClick={() => onOffset(info.nextOffset)}>{USERS_COPY.pager.next}</button>
    </nav>
  );
}

/** Loading / error (with retry) / empty card, or nothing once there is data to show. */
export function LoadState({ loading, error, empty, emptyText, onRetry, children }) {
  if (error) {
    return (
      <section className="adm-card usr-state" role="alert">
        <p className="adm-error">{error}</p>
        <button type="button" className="adm-btn" onClick={onRetry}>{USERS_COPY.retry}</button>
      </section>
    );
  }
  if (loading) return <section className="adm-card usr-state" aria-busy="true"><p>{USERS_COPY.loading}</p></section>;
  if (empty) return <section className="adm-card usr-state">{children ?? <p>{emptyText}</p>}</section>;
  return null;
}

/**
 * Page loader: `load(filter)` → `{data, loading, error, reload}`; reloads whenever `key` changes.
 * @param {(signal: {cancelled: boolean}) => Promise<any>} load
 * @param {string} key Serialized filter.
 */
export function usePageData(load, key) {
  const [state, setState] = useState({ data: null, loading: true, error: '' });
  const [nonce, setNonce] = useState(0);
  useEffect(() => {
    const signal = { cancelled: false };
    setState((prev) => ({ ...prev, loading: true, error: '' }));
    load(signal)
      .then((data) => { if (!signal.cancelled) setState({ data, loading: false, error: '' }); })
      .catch((failure) => { if (!signal.cancelled) setState({ data: null, loading: false, error: failure.message }); });
    return () => { signal.cancelled = true; };
    // `load` is rebuilt every render; `key` is what actually changes the request.
  }, [key, nonce]);
  return { ...state, reload: () => setNonce((n) => n + 1) };
}
