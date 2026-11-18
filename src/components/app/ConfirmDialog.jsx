// src/components/app/ConfirmDialog.jsx
/**
 * Confirmation of a consequential action (AlertDialog): a title, a concrete impact sentence, a specific action label,
 * and optional guards (type the subject, a reason, the signed-in password). Destructive dialogs start focused on
 * Cancel. `onConfirm` may be async; if it throws, the sentence from errorMessage() is shown and the dialog stays open.
 */
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { Textarea } from '@/components/ui/textarea';
import { COMMON_COPY, CONFIRM_COPY } from '@/copy/en/common';
import { useReturnFocus } from '@/lib/useReturnFocus';
import { errorMessage } from '@/copy/en/errors';
import { FormField } from './FormField.jsx';
import { PasswordInput } from './PasswordInput.jsx';
import { confirmState } from './confirmDialogView.js';

/**
 * @param {{
 *   open: boolean, onOpenChange: (open: boolean) => void,
 *   title: string, impact: import('react').ReactNode, actionLabel: string, cancelLabel?: string, destructive?: boolean,
 *   typeToConfirm?: {value: string, label?: string},
 *   reason?: {label?: string, required?: boolean, minLength?: number},
 *   password?: {label?: string, description?: string, required?: boolean},
 *   onConfirm: (values: {reason: string, password: string}) => unknown,
 * }} props `impact` says what happens and whether it can be undone, in one or two concrete sentences.
 */
export function ConfirmDialog({ open, onOpenChange, title, impact, actionLabel, cancelLabel = COMMON_COPY.cancel, destructive = false, typeToConfirm, reason, password, onConfirm }) {
  const [values, setValues] = useState({ typed: '', reason: '', password: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const returnFocus = useReturnFocus(open);
  const { canConfirm } = confirmState({ typeToConfirm, reason, password, values, busy });
  const guarded = Boolean(typeToConfirm || reason || password);
  const set = (key) => (event) => setValues((current) => ({ ...current, [key]: event.target.value }));

  const handleOpenChange = (next) => {
    if (busy) return;
    if (!next) { setValues({ typed: '', reason: '', password: '' }); setError(''); }
    onOpenChange(next);
  };

  const submit = async (event) => {
    event.preventDefault();
    if (!canConfirm) return;
    setBusy(true);
    setError('');
    try {
      await onConfirm({ reason: values.reason.trim(), password: values.password });
      setValues({ typed: '', reason: '', password: '' });
      onOpenChange(false);
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <AlertDialogContent className="sm:max-w-md" onCloseAutoFocus={returnFocus}>
        <form onSubmit={submit} className="grid gap-4">
          <AlertDialogHeader>
            <AlertDialogTitle>{title}</AlertDialogTitle>
            <AlertDialogDescription>{impact}</AlertDialogDescription>
          </AlertDialogHeader>
          {guarded ? (
            <div className="grid gap-4">
              {typeToConfirm ? (
                <FormField label={typeToConfirm.label ?? CONFIRM_COPY.typeToConfirm(typeToConfirm.value)}>
                  <Input value={values.typed} onChange={set('typed')} autoComplete="off" spellCheck={false} />
                </FormField>
              ) : null}
              {reason ? (
                <FormField label={reason.label ?? CONFIRM_COPY.reason}>
                  <Textarea value={values.reason} onChange={set('reason')} rows={2} />
                </FormField>
              ) : null}
              {password ? (
                <FormField label={password.label ?? CONFIRM_COPY.password} description={password.description}>
                  <PasswordInput value={values.password} onChange={set('password')} autoComplete="current-password" />
                </FormField>
              ) : null}
            </div>
          ) : null}
          {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>{cancelLabel}</AlertDialogCancel>
            <Button type="submit" variant={destructive ? 'destructive' : 'default'} disabled={!canConfirm}>
              {busy ? <Spinner aria-hidden="true" data-icon="inline-start" /> : null}
              {actionLabel}
            </Button>
          </AlertDialogFooter>
        </form>
      </AlertDialogContent>
    </AlertDialog>
  );
}
