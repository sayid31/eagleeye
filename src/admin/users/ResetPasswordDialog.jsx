/** "Reset password": generate or type one, then the same one-time panel as account creation. */
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Spinner } from '@/components/ui/spinner';
import { USERS_COPY } from '../../copy/id/users.js';
import { DiscardPasswordDialog, OneTimePasswordPanel, useOneTimeGuard } from './OneTimePasswordPanel.jsx';
import { UserDialog } from './UserDialog.jsx';
import { PasswordChoice } from './UserFormFields.jsx';
import { usersApi } from './usersApi.js';
import { useAsyncAction } from './useAsyncAction.js';
import { errorField } from './usersView.js';
import { passwordRequirements } from './userFormView.js';

const COPY = USERS_COPY;

function ResetForm({ target, onReset, onCancel }) {
  const [mode, setMode] = useState('generate');
  const [password, setPassword] = useState('');
  const { busy, error, failure, run } = useAsyncAction();
  const fieldError = errorField(failure, ['password']);
  const ready = mode === 'generate' || passwordRequirements({ password, role: target.role, email: target.email, name: target.name }).every((item) => item.met);

  const submit = async (event) => {
    event.preventDefault();
    const body = mode === 'generate' ? { generate: true } : { password };
    const result = await run(() => usersApi.resetPassword(target.id, body));
    if (result) onReset({ result, password: result.tempPassword ?? password });
  };

  return (
    <form onSubmit={submit} className="grid gap-5" noValidate>
      <DialogHeader className="pr-8">
        <DialogTitle>{COPY.reset.title}</DialogTitle>
        <DialogDescription>{COPY.reset.impact(target.name)}</DialogDescription>
      </DialogHeader>
      <PasswordChoice mode={mode} password={password} role={target.role} email={target.email} name={target.name}
        error={fieldError ? error : null} onMode={setMode} onPassword={setPassword} />
      {error && !fieldError ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel} disabled={busy}>{COPY.form.cancel}</Button>
        <Button type="submit" variant="destructive" disabled={busy || !ready}>
          {busy ? <Spinner aria-hidden="true" data-icon="inline-start" /> : null}
          {COPY.reset.submit}
        </Button>
      </DialogFooter>
    </form>
  );
}

/**
 * @param {{open: boolean, target: {id: string, name: string, email: string, role: string}, onReset: (result: object) => void, onClose: () => void}} props
 *   Mounted fresh for every opening (the page keys it).
 */
export function ResetPasswordDialog({ open, target, onReset, onClose }) {
  const [issued, setIssued] = useState(null);
  const [acknowledged, setAcknowledged] = useState(false);
  const guard = useOneTimeGuard({ locked: Boolean(issued) && !acknowledged, onClose });
  return (
    <>
      <UserDialog open={open} onOpenChange={guard.onOpenChange}>
        {issued ? (
          <OneTimePasswordPanel heading={COPY.oneTime.resetHeading} email={target.email} password={issued.password} reset
            acknowledged={acknowledged} onAcknowledged={setAcknowledged} onDone={onClose} />
        ) : (
          <ResetForm target={target} onCancel={onClose} onReset={(value) => { setIssued(value); onReset(value.result); }} />
        )}
      </UserDialog>
      <DiscardPasswordDialog open={guard.warning} onOpenChange={guard.setWarning} onDiscard={onClose} />
    </>
  );
}
