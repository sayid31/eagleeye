// src/admin/components/FormControls.jsx
/** Small form building blocks shared by the AI Configuration pages. */
import { useState } from 'react';

/**
 * Password field with an eye button. The eye only reveals what is being typed
 * here; a saved key is never sent to the browser, so there is nothing else to show.
 */
export function SecretInput({ id, value, placeholder, onChange, label, disabled = false }) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="adm-secret">
      <input id={id} className="adm-input" type={visible ? 'text' : 'password'} autoComplete="off" spellCheck={false}
        aria-label={label} placeholder={placeholder} value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)} />
      <button type="button" className="adm-secret-eye" aria-controls={id} aria-pressed={visible} disabled={disabled || !value}
        aria-label={visible ? 'Sembunyikan key yang diketik' : 'Tampilkan key yang diketik'} onClick={() => setVisible((v) => !v)}>
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" />
          {visible ? <path d="M3 3l18 18" /> : null}
        </svg>
      </button>
    </div>
  );
}

/** Labelled control with an optional hint line under it. */
export function Field({ label, hint, children }) {
  return (
    <label className="adm-field">
      <span className="adm-field-label">{label}</span>
      {children}
      {hint ? <small className="adm-field-hint">{hint}</small> : null}
    </label>
  );
}

/** Checkbox styled as a switch, with a title and a description. */
export function Toggle({ checked, onChange, title, description, disabled = false }) {
  return (
    <label className="adm-toggle">
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(event) => onChange(event.target.checked)} />
      <span className="adm-toggle-track" aria-hidden="true" />
      <span className="adm-toggle-text">
        <span className="adm-toggle-title">{title}</span>
        {description ? <small className="adm-field-hint">{description}</small> : null}
      </span>
    </label>
  );
}

/** Card with a heading, used to group one settings section. */
export function Section({ title, description, children }) {
  return (
    <section className="adm-card adm-section">
      <h2>{title}</h2>
      {description ? <p className="adm-section-lead">{description}</p> : null}
      <div className="adm-section-body">{children}</div>
    </section>
  );
}

/** Save result line: errors as a list, success as one sentence. */
export function SaveStatus({ status }) {
  if (!status) return null;
  if (status.errors?.length) {
    return (
      <ul className="adm-error adm-error-list" role="alert">
        {status.errors.map((message) => <li key={message}>{message}</li>)}
      </ul>
    );
  }
  return <p className="adm-success" role="status">{status.message}</p>;
}
