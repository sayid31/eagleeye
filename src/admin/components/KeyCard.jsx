// src/admin/components/KeyCard.jsx
/**
 * One provider key: status, where it comes from, paste/replace, remove with
 * an inline confirm, and "Test connection". Used by API Keys and AI Provider.
 * Values are typed into password fields and sent once; never received back.
 */
import { useState } from 'react';
import { testKey } from '../api/adminKeysApi.js';
import { buildKeyRemoval, buildKeyUpdate, describeTestResult, isEditable, keyStatusBadge, secretPlaceholder } from '../pages/apiKeysView.js';
import { SecretInput } from './FormControls.jsx';

export function KeyCard({ keyInfo, note, busy, onSave, onRemove }) {
  const [values, setValues] = useState({});
  const [error, setError] = useState('');
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testLine, setTestLine] = useState(null);
  const badge = keyStatusBadge(keyInfo, testLine?.result);
  const editable = isEditable(keyInfo);
  const single = keyInfo.envVars.length === 1;

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
      setTestLine({ text: failure.message, tone: 'error', label: 'Gagal', result: null });
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
        {keyInfo.envVars.join(' + ')} · {keyInfo.tier === 'metered' ? 'akun berbayar' : 'free tier'}
        {keyInfo.clientExposed ? ' · sengaja dikirim ke browser: batasi key ini di penyedia' : ''}
        {' · '}<a className="adm-link" href={keyInfo.getUrl} target="_blank" rel="noreferrer noopener">Dapatkan key</a>
      </p>
      {editable ? (
        <div className="adm-key-form">
          {keyInfo.envVars.map((name) => {
            const fieldId = `key-${keyInfo.id}-${name}`;
            return (
              <div key={name} className="adm-field">
                <label className="adm-field-label" htmlFor={fieldId}>{single ? 'API Key' : name}</label>
                {keyInfo.set ? <small className="adm-field-hint">Kosongkan untuk mempertahankan key tersimpan.</small> : null}
                <SecretInput id={fieldId} label={single ? `API Key ${keyInfo.title}` : name} placeholder={secretPlaceholder(keyInfo)}
                  value={values[name] ?? ''} onChange={(text) => setValues((v) => ({ ...v, [name]: text }))} />
              </div>
            );
          })}
          <div className="adm-actions">
            <button type="button" className="adm-btn adm-btn-primary" disabled={busy} onClick={save}>{keyInfo.set ? 'Ganti' : 'Simpan'}</button>
            {keyInfo.set && !confirmRemove ? <button type="button" className="adm-btn" disabled={busy} onClick={() => setConfirmRemove(true)}>Hapus</button> : null}
            {confirmRemove ? (
              <>
                <span className="adm-error">Hapus key ini? Fitur yang membutuhkannya akan berhenti.</span>
                <button type="button" className="adm-btn adm-btn-danger" disabled={busy} onClick={() => { setConfirmRemove(false); onRemove(buildKeyRemoval(keyInfo)); }}>Ya, hapus</button>
                <button type="button" className="adm-btn" onClick={() => setConfirmRemove(false)}>Batal</button>
              </>
            ) : null}
          </div>
          {error ? <p className="adm-error" role="alert">{error}</p> : null}
        </div>
      ) : <p className="adm-muted">Key ini diatur di tempat server dijalankan (shell, Keychain, atau launcher), jadi hanya bisa diubah di sana.</p>}
      <div className="adm-actions">
        <button type="button" className="adm-btn" disabled={!keyInfo.set || testing} onClick={runTest}>{testing ? 'Mengetes…' : 'Tes koneksi'}</button>
        <small className="adm-field-hint">{note}</small>
      </div>
      {testLine ? (
        <p className={`adm-test adm-test-${testLine.tone}`} role="status">
          <span className="adm-test-label">{testLine.label}</span>{testLine.text}
        </p>
      ) : null}
    </article>
  );
}
