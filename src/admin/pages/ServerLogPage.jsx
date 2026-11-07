// src/admin/pages/ServerLogPage.jsx
/**
 * /admin → Server Log: newest first, filter by level/source/text, repeated
 * entries merged with a count, "Load more", and Clear (with confirm).
 * Entries never hold conversation text, keys or emails (redacted server-side).
 */
import { useCallback, useEffect, useState } from 'react';
import { clearLog, fetchLog } from '../api/adminLogApi.js';
import { SOURCE_LABELS, describeContext, describeRepeat, formatLogTime } from './serverLogView.js';

const EMPTY_FILTER = { level: '', source: '', q: '' };

function LogRow({ entry }) {
  const repeat = describeRepeat(entry);
  const context = describeContext(entry);
  return (
    <tr className={`adm-log-row adm-log-${entry.level}`}>
      <td className="adm-log-time">{formatLogTime(entry.lastAt)}</td>
      <td><span className={`adm-pill adm-pill-level-${entry.level}`}>{entry.level}</span></td>
      <td>{SOURCE_LABELS[entry.source] ?? entry.source}</td>
      <td className="adm-log-msg">
        <code>{entry.code}</code> {entry.message}
        {repeat || context ? <small className="adm-field-hint">{[repeat, context].filter(Boolean).join(' · ')}</small> : null}
      </td>
    </tr>
  );
}

export function ServerLogPage() {
  const [filter, setFilter] = useState(EMPTY_FILTER);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [confirmClear, setConfirmClear] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (f, offset = 0) => {
    setBusy(true);
    try {
      const page = await fetchLog({ ...f, offset });
      setData((prev) => (offset && prev ? { ...page, entries: [...prev.entries, ...page.entries] } : page));
      setError('');
    } catch (failure) {
      setError(failure.message);
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => { void load(filter); }, [filter, load]);

  const clear = async () => {
    setConfirmClear(false);
    try { await clearLog(); } catch (failure) { setError(failure.message); }
    await load(filter);
  };

  const set = (patch) => setFilter((f) => ({ ...f, ...patch }));
  return (
    <div className="adm-page adm-page-wide">
      <header className="adm-page-header">
        <h1>Server Log</h1>
        <p className="adm-muted">
          Error, peringatan, dan event sesi dari server dan setiap browser yang memakai peta. Disimpan 30 hari; yang berulang digabung.
          {data ? ` ${data.counts.error} error · ${data.counts.warn} peringatan · ${data.counts.info} info.` : ''}
        </p>
      </header>

      <div className="adm-card adm-log-filters">
        <select className="adm-input" aria-label="Level" value={filter.level} onChange={(e) => set({ level: e.target.value })}>
          <option value="">Semua level</option>
          {(data?.levels ?? ['error', 'warn', 'info']).map((lvl) => <option key={lvl} value={lvl}>{lvl}</option>)}
        </select>
        <select className="adm-input" aria-label="Sumber" value={filter.source} onChange={(e) => set({ source: e.target.value })}>
          <option value="">Semua sumber</option>
          {(data?.sources ?? []).map((src) => <option key={src} value={src}>{SOURCE_LABELS[src] ?? src}</option>)}
        </select>
        <input className="adm-input" type="search" placeholder="Cari kode atau pesan" value={filter.q} onChange={(e) => set({ q: e.target.value })} />
        <button type="button" className="adm-btn" disabled={busy} onClick={() => load(filter)}>Muat ulang</button>
        {confirmClear ? (
          <>
            <span className="adm-error">Hapus semua entri?</span>
            <button type="button" className="adm-btn adm-btn-danger" onClick={clear}>Ya, kosongkan</button>
            <button type="button" className="adm-btn" onClick={() => setConfirmClear(false)}>Batal</button>
          </>
        ) : <button type="button" className="adm-btn" onClick={() => setConfirmClear(true)}>Kosongkan log</button>}
      </div>

      {error ? <p className="adm-error" role="alert">{error}</p> : null}
      {data && data.entries.length === 0 ? <section className="adm-card"><p>Tidak ada entri yang cocok.</p></section> : null}
      {data && data.entries.length ? (
        <div className="adm-table-wrap adm-log-table">
          <table className="adm-table">
            <thead><tr><th>Terakhir terlihat</th><th>Level</th><th>Sumber</th><th>Event</th></tr></thead>
            <tbody>{data.entries.map((entry) => <LogRow key={entry.id} entry={entry} />)}</tbody>
          </table>
        </div>
      ) : null}
      {data?.nextOffset ? (
        <button type="button" className="adm-btn" disabled={busy} onClick={() => load(filter, data.nextOffset)}>
          Muat lagi (sisa {data.total - data.entries.length})
        </button>
      ) : null}
    </div>
  );
}
