// src/login/PasswordChangeForm.jsx
/**
 * Current + new + confirm password form, shared by the forced change
 * (`/account/password`) and the `/account` page. The server forces
 * `revokeOtherSessions` and re-applies the password policy; this form shows
 * the live requirements and puts each refusal next to the field it is about.
 */
import { useEffect, useId, useRef, useState } from 'react';
import { CircleAlert } from 'lucide-react';
import { FormField } from '@/components/app/FormField.jsx';
import { PasswordInput } from '@/components/app/PasswordInput.jsx';
import { Alert, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { changePassword } from '../auth/authClientApi.js';
import { PASSWORD_MAX } from '../auth/passwordPolicy.mjs';
import { PASSWORD_COPY, PASSWORD_ERRORS } from '../copy/id/login.js';
import { changePasswordFailure, changePasswordIssue, passwordRequirements } from './changePasswordView.js';
import { PasswordRequirements } from './PasswordRequirements.jsx';

const EMPTY = Object.freeze({ current: '', next: '', confirm: '' });
const CONTROL_HEIGHT = 'h-10';

/**
 * @param {{identity: {email?: string, name?: string, role?: string}, onChanged: () => void, autoFocus?: boolean}} props
 */
export function PasswordChangeForm({ identity, onChanged, autoFocus = false }) {
  const [values, setValues] = useState(EMPTY);
  const [issue, setIssue] = useState(null); // {field: 'current' | 'next' | 'confirm' | null, message}
  const [busy, setBusy] = useState(false);
  const refs = { current: useRef(null), next: useRef(null), confirm: useRef(null) };
  const alertRef = useRef(null);
  const requirementsId = useId();
  const input = { currentPassword: values.current, newPassword: values.next, confirm: values.confirm };

  // A refusal moves focus to its field, or to the banner when it belongs to the whole form.
  useEffect(() => {
    if (!issue) return;
    (issue.field ? refs[issue.field].current : alertRef.current)?.focus();
    // `refs` only holds stable ref objects: just a new issue should move focus.
  }, [issue]);

  const set = (field) => (event) => {
    setValues((current) => ({ ...current, [field]: event.target.value }));
    if (issue?.field === field) setIssue(null);
  };
  const fieldError = (field) => (issue?.field === field ? issue.message : undefined);

  const submit = async (event) => {
    event.preventDefault();
    if (busy) return;
    const found = changePasswordIssue(input, identity);
    if (found) { setIssue(found); return; }
    setBusy(true);
    setIssue(null);
    let result;
    try {
      result = await changePassword(input);
    } catch (failure) {
      console.warn(`[account] change-password request failed: ${failure.message}`);
      result = null;
    }
    setBusy(false);
    if (!result) { setIssue({ field: null, message: PASSWORD_ERRORS.NETWORK }); return; }
    if (!result.ok) { setIssue(changePasswordFailure(result)); return; }
    setValues(EMPTY);
    onChanged();
  };

  return (
    <form onSubmit={submit} noValidate className="grid gap-5" aria-busy={busy}>
      {issue && !issue.field ? (
        <Alert ref={alertRef} tabIndex={-1} variant="destructive" className="outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
          <CircleAlert aria-hidden="true" />
          <AlertTitle>{issue.message}</AlertTitle>
        </Alert>
      ) : null}
      <FormField label={PASSWORD_COPY.current} error={fieldError('current')}>
        {(control) => (
          <PasswordInput {...control} ref={refs.current} name="current" value={values.current} onChange={set('current')} autoComplete="current-password"
            required readOnly={busy} autoFocus={autoFocus} maxLength={PASSWORD_MAX} className={CONTROL_HEIGHT} />
        )}
      </FormField>
      <div className="grid gap-3">
        <FormField label={PASSWORD_COPY.next} description={PASSWORD_COPY.nextDescription} error={fieldError('next')}>
          {(control) => (
            <PasswordInput {...control} ref={refs.next} name="next" value={values.next} onChange={set('next')} autoComplete="new-password"
              required readOnly={busy} maxLength={PASSWORD_MAX} className={CONTROL_HEIGHT}
              aria-describedby={[control['aria-describedby'], requirementsId].filter(Boolean).join(' ')} />
          )}
        </FormField>
        <PasswordRequirements id={requirementsId} items={passwordRequirements(input, identity)} />
      </div>
      <FormField label={PASSWORD_COPY.confirm} error={fieldError('confirm')}>
        {(control) => (
          <PasswordInput {...control} ref={refs.confirm} name="confirm" value={values.confirm} onChange={set('confirm')} autoComplete="new-password"
            required readOnly={busy} maxLength={PASSWORD_MAX} className={CONTROL_HEIGHT} />
        )}
      </FormField>
      <Button type="submit" size="lg" className={`${CONTROL_HEIGHT} w-full sm:w-fit sm:justify-self-start`} disabled={busy} aria-busy={busy}>
        {busy ? <Spinner aria-hidden="true" data-icon="inline-start" /> : null}
        {PASSWORD_COPY.submit}
      </Button>
      <p role="status" className="sr-only">{busy ? PASSWORD_COPY.submitting : ''}</p>
    </form>
  );
}
