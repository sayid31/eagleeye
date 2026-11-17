// src/login/PasswordChangeForm.jsx
/**
 * Current + new + confirm password form, shared by the forced change
 * (`/account/password`) and the `/account` page. The server forces
 * `revokeOtherSessions` and re-applies the password policy.
 */
import { useState } from 'react';
import { changePassword } from '../auth/authClientApi.js';
import { PASSWORD_MAX, minPasswordLength } from '../auth/passwordPolicy.mjs';
import { changePasswordErrorText, changePasswordProblem, passwordHint } from './changePasswordView.js';
import { PASSWORD_COPY, PASSWORD_ERRORS } from './loginCopy.js';
import { PasswordInput } from './PasswordInput.jsx';

/**
 * @param {{identity: {email?: string, name?: string, role?: string}, onChanged: () => void, autoFocus?: boolean}} props
 */
export function PasswordChangeForm({ identity, onChanged, autoFocus = false }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const submit = async (event) => {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const input = { currentPassword: String(form.get('current') ?? ''), newPassword: String(form.get('next') ?? ''), confirm: String(form.get('confirm') ?? '') };
    const problem = changePasswordProblem(input, identity);
    if (problem) { setError(problem); return; }
    setBusy(true);
    setError(null);
    let result;
    try {
      result = await changePassword(input);
    } catch (failure) {
      console.warn(`[account] change-password request failed: ${failure.message}`);
      result = { ok: false, code: 'NETWORK' };
    }
    setBusy(false);
    if (!result.ok) { setError(result.code === 'NETWORK' ? PASSWORD_ERRORS.NETWORK : changePasswordErrorText(result)); return; }
    formElement.reset();
    onChanged();
  };

  return (
    <form className="login-form" onSubmit={submit} noValidate>
      <PasswordInput label={PASSWORD_COPY.current} name="current" autoComplete="current-password" disabled={busy} autoFocus={autoFocus} />
      <PasswordInput label={PASSWORD_COPY.next} name="next" autoComplete="new-password" disabled={busy}
        hint={passwordHint(identity.role)} minLength={minPasswordLength(identity.role)} maxLength={PASSWORD_MAX} />
      <PasswordInput label={PASSWORD_COPY.confirm} name="confirm" autoComplete="new-password" disabled={busy} maxLength={PASSWORD_MAX} />
      {error ? <p className="login-alert login-alert-error" role="alert">{error}</p> : null}
      <button type="submit" className="adm-btn adm-btn-primary login-submit" disabled={busy} aria-busy={busy}>
        {busy ? PASSWORD_COPY.submitting : PASSWORD_COPY.submit}
      </button>
    </form>
  );
}
