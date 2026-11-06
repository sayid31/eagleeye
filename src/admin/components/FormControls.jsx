// src/admin/components/FormControls.jsx
/** Small form building blocks shared by the AI Configuration pages. */

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
