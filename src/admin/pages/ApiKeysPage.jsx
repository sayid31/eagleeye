// src/admin/pages/ApiKeysPage.jsx
/**
 * /admin → API Keys: one card per provider with status, where the key comes
 * from, paste/replace, remove and "Test connection". Key values are typed
 * into password fields and sent once; the page never receives one back.
 */
import { useEffect, useState } from 'react';
import { fetchKeyStatus, saveKeys, testKey } from '../api/adminKeysApi.js';
import { SaveStatus } from '../components/FormControls.jsx';
import { buildKeyRemoval, buildKeyUpdate, describeTestResult, isEditable, keyStatusBadge, storeLabel } from './apiKeysView.js';

const RESTART_MESSAGE = 'Saved. The server is restarting so every feature picks up the change; this page reloads by itself.';

function KeyCard({ keyInfo, note, busy, onSave, onRemove }) {
  const [values, setValues] = useState({});
  const [error, setError] = useState('');
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testLine, setTestLine] = useState(null);
  const badge = keyStatusBadge(keyInfo);
  const editable = isEditable(keyInfo);

  const save = () => {
    const update = buildKeyUpdate(keyInfo, values);
    if (!update.ok) { setError(update.error); return; }
    setError('');
    onSave(update.updates);
  };
  const runTest = async () => {
    setTesting(true);
    try {
      setTestLine(describeTestResult(await testKey(keyInfo.id)));
    } catch (failure) {
      setTestLine({ text: failure.message, tone: 'error' });
    } finally {
      setTesting(false);
    }
  };

  return (
    <article className="adm-card adm-key">
      <header className="adm-key-head">
        <div>
          <h2>{keyInfo.title}</h2>
          <p className="adm-muted">{keyInfo.unlocks}</p>
        </div>
        <span className={`adm-pill adm-pill-${badge.tone}`}>{badge.label}</span>
      </header>
      <p className="adm-field-hint">
        {keyInfo.envVars.join(' + ')} · {keyInfo.tier === 'metered' ? 'billing account' : 'free tier'}
        {keyInfo.clientExposed ? ' · sent to the browser by design: restrict it at the provider' : ''}
        {' · '}<a className="adm-link" href={keyInfo.getUrl} target="_blank" rel="noreferrer noopener">Get a key</a>
      </p>
      {editable ? (
        <div className="adm-key-form">
          {keyInfo.envVars.map((name) => (
            <input key={name} className="adm-input" type="password" autoComplete="off" spellCheck={false}
              aria-label={name} placeholder={keyInfo.set ? `New ${name} (replaces the current one)` : name}
              value={values[name] ?? ''} onChange={(e) => setValues((v) => ({ ...v, [name]: e.target.value }))} />
          ))}
          <div className="adm-actions">
            <button type="button" className="adm-btn adm-btn-primary" disabled={busy} onClick={save}>{keyInfo.set ? 'Replace' : 'Save'}</button>
            {keyInfo.set && !confirmRemove ? <button type="button" className="adm-btn" disabled={busy} onClick={() => setConfirmRemove(true)}>Remove</button> : null}
            {confirmRemove ? (
              <>
                <span className="adm-error">Remove this key? Features that need it stop working.</span>
                <button type="button" className="adm-btn adm-btn-danger" disabled={busy} onClick={() => { setConfirmRemove(false); onRemove(buildKeyRemoval(keyInfo)); }}>Yes, remove</button>
                <button type="button" className="adm-btn" onClick={() => setConfirmRemove(false)}>Cancel</button>
              </>
            ) : null}
          </div>
          {error ? <p className="adm-error" role="alert">{error}</p> : null}
        </div>
      ) : <p className="adm-muted">This key is set where the server was started (shell, Keychain or launcher), so it can only be changed there.</p>}
      <div className="adm-actions">
        <button type="button" className="adm-btn" disabled={!keyInfo.set || testing} onClick={runTest}>{testing ? 'Testing…' : 'Test connection'}</button>
        <small className="adm-field-hint">{note}</small>
      </div>
      {testLine ? <p className={`adm-test adm-test-${testLine.tone}`} role="status">{testLine.text}</p> : null}
    </article>
  );
}

export function ApiKeysPage() {
  const [data, setData] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchKeyStatus()
      .then((payload) => { if (!cancelled) setData(payload); })
      .catch((error) => { if (!cancelled) setLoadError(error.message); });
    return () => { cancelled = true; };
  }, []);

  if (loadError) return <section className="adm-card"><h1>API Keys</h1><p className="adm-error" role="alert">{loadError}</p></section>;
  if (!data) return <section className="adm-card"><h1>API Keys</h1><p>Loading…</p></section>;

  const submit = async (updates) => {
    setBusy(true);
    setStatus(null);
    try {
      const saved = await saveKeys(updates);
      setData(saved.status);
      setStatus({ message: RESTART_MESSAGE });
    } catch (error) {
      setStatus({ errors: [error.message] });
      setBusy(false);
    }
  };

  return (
    <div className="adm-page">
      <header className="adm-page-header">
        <h1>API Keys</h1>
        <p className="adm-muted" role="status">{data.setCount} of {data.total} configured · saved to {storeLabel(data.store)} on this computer. Key values are never shown.</p>
        <SaveStatus status={status} />
      </header>
      {data.keys.map((key) => (
        <KeyCard key={key.id} keyInfo={key} note={data.testNotes?.[key.id] ?? ''} busy={busy} onSave={submit} onRemove={submit} />
      ))}
    </div>
  );
}
