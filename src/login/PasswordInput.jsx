// src/login/PasswordInput.jsx
/** A labelled password field with a show/hide toggle (the toggle never submits the form). */
import { useState } from 'react';
import { LOGIN_COPY } from './loginCopy.js';

/**
 * @param {{label: string, name: string, autoComplete: string, disabled?: boolean, hint?: string,
 *   minLength?: number, maxLength?: number, autoFocus?: boolean}} props
 */
export function PasswordInput({ label, name, autoComplete, disabled = false, hint, minLength, maxLength, autoFocus = false }) {
  const [visible, setVisible] = useState(false);
  const hintId = hint ? `${name}-hint` : undefined;
  return (
    <label className="login-field">
      <span>{label}</span>
      <span className="login-password">
        <input
          name={name}
          type={visible ? 'text' : 'password'}
          autoComplete={autoComplete}
          required
          disabled={disabled}
          minLength={minLength}
          maxLength={maxLength}
          autoFocus={autoFocus}
          aria-describedby={hintId}
          spellCheck={false}
          autoCapitalize="off"
        />
        <button
          type="button"
          className="login-reveal"
          onClick={() => setVisible((shown) => !shown)}
          aria-pressed={visible}
          aria-label={visible ? LOGIN_COPY.hidePassword : LOGIN_COPY.showPassword}
          title={visible ? LOGIN_COPY.hidePassword : LOGIN_COPY.showPassword}
          disabled={disabled}
        >
          <EyeIcon crossed={visible} />
        </button>
      </span>
      {hint ? <small id={hintId} className="login-hint">{hint}</small> : null}
    </label>
  );
}

function EyeIcon({ crossed }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" />
      <circle cx="12" cy="12" r="3" />
      {crossed ? <path d="M3 3l18 18" /> : null}
    </svg>
  );
}
