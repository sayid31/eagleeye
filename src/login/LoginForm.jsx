// src/login/LoginForm.jsx
/**
 * The sign-in form: email, password, submit, the gated Google button and the "Lupa password?" help. It only renders
 * and moves focus; the request and the redirect belong to LoginApp. After a refusal focus goes back to the password
 * field when retrying it is the fix, otherwise to the error banner (see signInFocusTarget).
 */
import { useEffect, useRef, useState } from 'react';
import { CircleAlert, Info } from 'lucide-react';
import { FormField } from '@/components/app/FormField.jsx';
import { PasswordInput } from '@/components/app/PasswordInput.jsx';
import { Alert, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverDescription, PopoverHeader, PopoverTitle, PopoverTrigger } from '@/components/ui/popover';
import { Separator } from '@/components/ui/separator';
import { Spinner } from '@/components/ui/spinner';
import { PASSWORD_MAX } from '../auth/passwordPolicy.mjs';
import { LOGIN_COPY } from '../copy/en/login.js';
import { GoogleMark } from './GoogleMark.jsx';
import { loginFieldProblems, signInFocusTarget } from './loginView.js';

const ALERT_ID = 'login-alert';
const CONTROL_HEIGHT = 'h-10';

/**
 * @param {{
 *   message: {tone: 'error' | 'warn', text: string} | null,
 *   error: {code: string, text: string} | null,
 *   busy: 'password' | 'google' | null,
 *   onSubmit: (values: {email: string, password: string}) => void,
 *   onGoogle: (() => void) | null,
 * }} props `message` is the notice from the URL; `error` is a refused submit (a new object per refusal, which is what
 *   moves focus); `onGoogle` is null unless the Google button may show.
 */
export function LoginForm({ message, error, busy, onSubmit, onGoogle }) {
  const [problems, setProblems] = useState({});
  const emailRef = useRef(null);
  const passwordRef = useRef(null);
  const alertRef = useRef(null);
  const pending = busy !== null;
  const shown = error ? { tone: 'error', text: error.text } : message;
  const retryPassword = Boolean(error) && signInFocusTarget(error.code) === 'password';

  useEffect(() => {
    if (!error) return;
    if (signInFocusTarget(error.code) === 'password') {
      passwordRef.current?.focus();
      passwordRef.current?.select();
    } else {
      alertRef.current?.focus();
    }
  }, [error]);

  const submit = (event) => {
    event.preventDefault();
    if (pending) return;
    const form = new FormData(event.currentTarget);
    const values = { email: String(form.get('email') ?? '').trim(), password: String(form.get('password') ?? '') };
    const found = loginFieldProblems(values);
    setProblems(found);
    if (found.email) emailRef.current?.focus();
    else if (found.password) passwordRef.current?.focus();
    else onSubmit(values);
  };
  const clear = (field) => () => setProblems((current) => (current[field] ? { ...current, [field]: undefined } : current));

  return (
    <div className="grid gap-4">
      {shown ? (
        <Alert ref={alertRef} id={ALERT_ID} tabIndex={-1} variant={shown.tone === 'error' ? 'destructive' : 'default'} className="outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
          {shown.tone === 'error' ? <CircleAlert aria-hidden="true" /> : <Info aria-hidden="true" />}
          <AlertTitle>{shown.text}</AlertTitle>
        </Alert>
      ) : null}
      <form onSubmit={submit} noValidate className="grid gap-4" aria-busy={busy === 'password'}>
        <FormField label={LOGIN_COPY.email} error={problems.email}>
          {(control) => (
            <Input {...control} ref={emailRef} name="email" type="email" autoComplete="username" inputMode="email" autoCapitalize="off"
              spellCheck={false} required autoFocus readOnly={pending} className={CONTROL_HEIGHT} onChange={clear('email')} />
          )}
        </FormField>
        <div className="grid gap-1">
          <FormField label={LOGIN_COPY.password} error={problems.password}>
            {(control) => (
              <PasswordInput {...control} ref={passwordRef} name="password" autoComplete="current-password" maxLength={PASSWORD_MAX}
                required readOnly={pending} className={CONTROL_HEIGHT} onChange={clear('password')}
                aria-invalid={control['aria-invalid'] || retryPassword || undefined}
                aria-describedby={[control['aria-describedby'], retryPassword ? ALERT_ID : null].filter(Boolean).join(' ') || undefined} />
            )}
          </FormField>
          <div className="flex justify-end">
            <ForgotPassword />
          </div>
        </div>
        <Button type="submit" size="lg" className={`${CONTROL_HEIGHT} w-full`} disabled={pending} aria-busy={busy === 'password'}>
          {busy === 'password' ? <Spinner aria-hidden="true" data-icon="inline-start" /> : null}
          {LOGIN_COPY.submit}
        </Button>
        <p role="status" className="sr-only">{busy === 'password' ? LOGIN_COPY.submitting : ''}</p>
      </form>
      {onGoogle ? (
        <>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <Separator className="flex-1" />
            <span>{LOGIN_COPY.divider}</span>
            <Separator className="flex-1" />
          </div>
          <Button type="button" variant="outline" size="lg" className={`${CONTROL_HEIGHT} w-full`} onClick={onGoogle} disabled={pending} aria-busy={busy === 'google'}>
            {busy === 'google' ? <Spinner aria-hidden="true" data-icon="inline-start" /> : <GoogleMark className="size-4" />}
            {busy === 'google' ? LOGIN_COPY.googleStarting : LOGIN_COPY.google}
          </Button>
        </>
      ) : null}
    </div>
  );
}

/** "Lupa password?" is help text, not a dead link: a popover that tells the visitor who resets passwords. */
function ForgotPassword() {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button type="button" variant="link" size="sm" className="h-6 px-0">{LOGIN_COPY.forgot}</Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64">
        <PopoverHeader>
          <PopoverTitle>{LOGIN_COPY.forgotTitle}</PopoverTitle>
          <PopoverDescription>{LOGIN_COPY.forgotAnswer}</PopoverDescription>
        </PopoverHeader>
      </PopoverContent>
    </Popover>
  );
}
